import { transaction } from './database.ts';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { db, type Student } from './backend.ts';

export const COURSE_PRICE = 30000;
export const COURSE_CURRENCY = 'NGN';
type Mode = 'test' | 'live';
export type Payment = { reference:string; user_id:string; mode:Mode; amount:number; currency:string; status:string; checkout_url:string|null; transaction_id:string|null; created_at:number; verified_at:number|null };
export type Enrollment = { starts_at:number; expires_at:number };
export function paymentMode():Mode {
 const mode=process.env.PAYMENTS_MODE || 'test';
 if(mode!=='test'&&mode!=='live')throw new Error('Invalid payment configuration.');
 return mode;
}
function secretKey(){
 const key=process.env.FLUTTERWAVE_SECRET_KEY?.trim();
 const correctMode=paymentMode()==='test'?key?.startsWith('FLWSECK_TEST-'):key?.startsWith('FLWSECK-');
 if(!key||!correctMode)throw new Error('Checkout is not configured for this payment mode. Please contact Amona.');
 return key;
}
export function appOrigin(){
 const url=new URL(process.env.APP_URL || 'http://127.0.0.1:3000');
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid site address.');
 if(paymentMode()==='live'&&(url.protocol!=='https:'||!process.env.FLUTTERWAVE_WEBHOOK_SECRET))throw new Error('Live checkout requires HTTPS and payment notifications.');
 return url.origin;
}
export async function enrollment(userId:string):Promise<Enrollment|undefined> {
 return (await db().prepare('SELECT starts_at,expires_at FROM enrollments WHERE user_id=? AND mode=?').get(userId,paymentMode())) as Enrollment|undefined;
}
export async function requireEnrollment(userId:string){
 const access=(await enrollment(userId));
 if(!access||access.expires_at<=Date.now())throw new Error('Course access is inactive. Visit the enrollment page to unlock three months of learning.');
 return access;
}
export async function studentPayments(userId:string){
 return (await db().prepare('SELECT * FROM payments WHERE user_id=? AND mode=? ORDER BY created_at DESC LIMIT 10').all(userId,paymentMode())) as Payment[];
}
export async function findPayment(reference:string){
 if(typeof reference!=='string'||reference.length>100)return undefined;
 return (await db().prepare('SELECT * FROM payments WHERE reference=? AND mode=?').get(reference,paymentMode())) as Payment|undefined;
}
export function addThreeMonths(timestamp:number){
 const date=new Date(timestamp),day=date.getUTCDate();
 date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+3);
 const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
 date.setUTCDate(Math.min(day,last));return date.getTime();
}
async function flutterwave(path:string,body?:object){
 const key=secretKey();
 // A local HTTP stand-in is permitted only in the isolated automated test process.
 const base=process.env.NODE_ENV==='test'&&process.env.PAYMENT_TEST_API_URL?process.env.PAYMENT_TEST_API_URL:'https://api.flutterwave.com/v3';
 try{
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('Provider unavailable');
  const result=await response.json();
  if(result?.status!=='success'||!result.data)throw new Error('Provider unavailable');
  return result.data;
 }catch{throw new Error('We could not confirm with Flutterwave. If you have paid, check payment status before trying to pay again.');}
}
export async function startCheckout(student:Student){
 secretKey();const origin=appOrigin();
 if(((await enrollment(student.id))?.expires_at||0)>Date.now())throw new Error('Your course access is already active.');
 const database=db(),now=Date.now();let payment:Payment;
 await transaction(async()=>{
  await database.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').get(student.id);
  payment=(await database.prepare("SELECT * FROM payments WHERE user_id=? AND mode=? AND status='pending' AND created_at>? ORDER BY created_at DESC LIMIT 1").get(student.id,paymentMode(),now-30*60000)) as Payment;
  if(!payment){
   const reference='s2c-'+randomUUID();
   (await database.prepare('INSERT INTO payments(reference,user_id,mode,amount,currency,created_at) VALUES(?,?,?,?,?,?)').run(reference,student.id,paymentMode(),COURSE_PRICE,COURSE_CURRENCY,now));
   payment=(await findPayment(reference))!;
  }
 });
 if(payment.checkout_url)return payment.checkout_url;
 const data=await flutterwave('/payments',{tx_ref:payment.reference,amount:payment.amount,currency:payment.currency,redirect_url:origin+'/payments/return',customer:{email:student.email,name:student.name},customizations:{title:'Solo2CEO Masterclass',description:'Three months of course access'},configurations:{session_duration:30,max_retry_attempt:5}});
 const link=new URL(data.link);
 if(link.protocol!=='https:'||link.hostname!=='checkout.flutterwave.com'||link.username||link.password)throw new Error('Flutterwave returned an invalid checkout address.');
 (await database.prepare('UPDATE payments SET checkout_url=? WHERE reference=?').run(link.href,payment.reference));
 return link.href;
}
// Called only with data returned by the authenticated Flutterwave verification API.
export async function applyVerifiedPayment(reference:string,data:unknown,now=Date.now()){
 const payment=(await findPayment(reference));if(!payment)throw new Error('Payment not found.');
 const tx=data as {id?:number;tx_ref?:string;amount?:number|string;currency?:string;status?:string;customer?:{email?:string}};
 const owner=(await db().prepare('SELECT email FROM users WHERE id=?').get(payment.user_id)) as {email:string};
 if(!tx||tx.tx_ref!==reference||tx.currency!==payment.currency||Number(tx.amount)!==payment.amount||typeof tx.id!=='number'||!Number.isSafeInteger(tx.id)||tx.id<=0||tx.customer?.email?.toLowerCase()!==owner.email)throw new Error('Payment details do not match this enrollment. Please contact Amona.');
 if(tx.status!=='successful')return false;
 const database=db();return transaction(async()=>{
  await database.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').get(payment.user_id);
  const current=(await findPayment(reference))!;
  if(current.status==='paid'){
   if(current.transaction_id!==String(tx.id))throw new Error('This purchase already has a different payment. Please contact Amona.');
   return true;
  }
  const previous=(await enrollment(payment.user_id)),starts=previous&&previous.expires_at>now?previous.expires_at:now;
  (await database.prepare("UPDATE payments SET status='paid',transaction_id=?,verified_at=? WHERE reference=?").run(String(tx.id),now,reference));
  (await database.prepare('INSERT INTO enrollments VALUES(?,?,?,?) ON CONFLICT(user_id,mode) DO UPDATE SET starts_at=excluded.starts_at,expires_at=excluded.expires_at').run(payment.user_id,payment.mode,previous&&previous.expires_at>now?previous.starts_at:now,addThreeMonths(starts)));
  return true;
 });
}
export async function verifyPayment(reference:string,userId?:string){
 const payment=(await findPayment(reference));
 if(!payment||(userId&&payment.user_id!==userId))throw new Error('Payment not found for this account.');
 if(payment.status==='paid')return true;
 const data=await flutterwave('/transactions/verify_by_reference?tx_ref='+encodeURIComponent(reference));
 return (await applyVerifiedPayment(reference,data));
}
export function authenticWebhook(header:string|null){
 const secret=process.env.FLUTTERWAVE_WEBHOOK_SECRET;
 if(!secret||!header)return false;
 const expected=Buffer.from(secret),received=Buffer.from(header);
 return expected.length===received.length&&timingSafeEqual(expected,received);
}
export async function handleWebhook(request:Request){
 if(!authenticWebhook(request.headers.get('verif-hash')))return new Response('Unauthorized',{status:401});
 const text=await request.text();if(text.length>65536)return new Response('Too large',{status:413});
 let event;try{event=JSON.parse(text);}catch{return new Response('Invalid JSON',{status:400});}
 if(!event||typeof event!=='object')return new Response('Invalid event',{status:400});
 if(event.event!=='charge.completed'||event.data?.status!=='successful')return new Response('Ignored');
 const reference=event.data?.tx_ref;
 if(typeof reference!=='string')return new Response('Invalid reference',{status:400});
 if(!(await findPayment(reference)))return new Response('Ignored');
 try{await verifyPayment(reference);return new Response('OK');}
 catch{return new Response('Verification pending',{status:503});}
}
