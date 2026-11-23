import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { db, type Student } from './backend.ts';
import { transaction } from './database.ts';
import { paymentMode, enrollment, addThreeMonths, type Payment } from './payments.ts';
import { paystackKey, paystackCheckoutUrl, requestPaystack } from './paystack-client.ts';

export function paystackOrigin(){
 const url=new URL(process.env.APP_URL||'http://127.0.0.1:3000');
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid site address.');
 if(paymentMode()==='live'&&(url.protocol!=='https:'||!process.env.PAYSTACK_WEBHOOK_SECRET))throw new Error('Live checkout requires HTTPS and payment notifications.');
 return url.origin;
}
export async function studentPaystackPayments(userId:string){
 return await db().prepare('SELECT * FROM paystack_payments WHERE user_id=? AND mode=? ORDER BY created_at DESC LIMIT 10').all(userId,paymentMode()) as Payment[];
}
async function findPayment(reference:string){
 if(typeof reference!=='string'||reference.length>100)return undefined;
 return await db().prepare('SELECT * FROM paystack_payments WHERE reference=? AND mode=?').get(reference,paymentMode()) as Payment|undefined;
}
export async function startPaystackCheckout(student:Student){
 paystackKey();const origin=paystackOrigin();
 // Serialize creation as well as verification for this student. A retry reuses the reference.
 const reference=await transaction(async()=>{
  await db().prepare('SELECT id FROM users WHERE id=? FOR UPDATE').get(student.id);
  if(((await enrollment(student.id))?.expires_at||0)>Date.now())throw new Error('Your course access is already active.');
  const now=Date.now();
  let payment=await db().prepare("SELECT * FROM paystack_payments WHERE user_id=? AND mode=? AND status='pending' AND created_at>? ORDER BY created_at DESC LIMIT 1").get(student.id,paymentMode(),now-30*60000) as Payment|undefined;
  if(!payment){
   const reference='s2c-ps-'+randomUUID();
   await db().prepare('INSERT INTO paystack_payments(reference,user_id,mode,amount,currency,created_at) VALUES(?,?,?,?,?,?)').run(reference,student.id,paymentMode(),30000,'NGN',now);
   payment=(await findPayment(reference))!;
  }
  return payment.reference;
 });
 return transaction(async()=>{
  await db().prepare('SELECT id FROM users WHERE id=? FOR UPDATE').get(student.id);
  const payment=(await findPayment(reference))!;
  if(((await enrollment(student.id))?.expires_at||0)>Date.now())throw new Error('Your course access is already active.');
  if(payment.checkout_url)return paystackCheckoutUrl(payment.checkout_url);
  const data=await requestPaystack('/transaction/initialize',{reference:payment.reference,email:student.email,amount:payment.amount*100,currency:payment.currency,callback_url:origin+'/payments/paystack/return'});
  if(data.reference!==payment.reference)throw new Error('Paystack returned an unexpected payment reference.');
  const link=paystackCheckoutUrl(data.authorization_url);
  await db().prepare('UPDATE paystack_payments SET checkout_url=? WHERE reference=?').run(link,payment.reference);
  return link;
 });
}
// Only call with the result of Paystack's authenticated verification endpoint.
export async function applyPaystackPayment(reference:string,data:unknown,now=Date.now()){
 const payment=await findPayment(reference);if(!payment)throw new Error('Payment not found.');
 const tx=data as {id?:number;reference?:string;amount?:number;currency?:string;domain?:string;status?:string};
 if(!tx||tx.reference!==reference||tx.currency!==payment.currency||tx.amount!==payment.amount*100||tx.domain!==payment.mode||typeof tx.id!=='number'||!Number.isSafeInteger(tx.id)||tx.id<=0)throw new Error('Payment details do not match this enrollment.');
 if(tx.status!=='success')return false;
 return transaction(async()=>{
  await db().prepare('SELECT id FROM users WHERE id=? FOR UPDATE').get(payment.user_id);
  const current=(await findPayment(reference))!;
  if(current.status==='paid'){
   if(current.transaction_id!==String(tx.id))throw new Error('Payment transaction does not match.');
   return true;
  }
  const previous=await enrollment(payment.user_id),starts=previous&&previous.expires_at>now?previous.expires_at:now;
  await db().prepare("UPDATE paystack_payments SET status='paid',transaction_id=?,verified_at=? WHERE reference=?").run(String(tx.id),now,reference);
  await db().prepare('INSERT INTO enrollments VALUES(?,?,?,?) ON CONFLICT(user_id,mode) DO UPDATE SET starts_at=excluded.starts_at,expires_at=excluded.expires_at').run(payment.user_id,payment.mode,previous&&previous.expires_at>now?previous.starts_at:now,addThreeMonths(starts));
  return true;
 });
}
export async function verifyPaystackPayment(reference:string,userId?:string){
 const payment=await findPayment(reference);
 if(!payment||(userId&&payment.user_id!==userId))throw new Error('Payment not found for this account.');
 if(payment.status==='paid')return true;
 return applyPaystackPayment(reference,await requestPaystack('/transaction/verify/'+encodeURIComponent(reference)));
}
export function authenticPaystackWebhook(raw:Buffer,header:string|null,now=Math.floor(Date.now()/1000)){
 const secret=process.env.PAYSTACK_WEBHOOK_SECRET?.trim();
 if(!secret||!header)return false;
 let timestamp:string|undefined;const signatures:string[]=[];
 for(const part of header.split(',')){
  const i=part.indexOf('=');if(i<0)continue;
  const key=part.slice(0,i).trim(),value=part.slice(i+1).trim();
  if(key==='t'){if(timestamp!==undefined||!/^\d+$/.test(value))return false;timestamp=value;}
  if(key==='v1'&&value.indexOf(':')>0)signatures.push(value.slice(value.indexOf(':')+1));
 }
 if(!timestamp||!Number.isSafeInteger(Number(timestamp))||Math.abs(now-Number(timestamp))>300)return false;
 const expected=createHmac('sha512',secret).update(timestamp+'.').update(raw).digest();
 return signatures.some(hex=>/^[0-9a-f]{128}$/.test(hex)&&timingSafeEqual(expected,Buffer.from(hex,'hex')));
}
export async function handlePaystackWebhook(request:Request){
 if(!process.env.PAYSTACK_WEBHOOK_SECRET)return new Response('Webhook configuration pending',{status:503});
 const reader=request.body?.getReader();if(!reader)return new Response('Invalid body',{status:400});
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();return new Response('Too large',{status:413});}chunks.push(value);}
 const raw=Buffer.concat(chunks);
 if(!authenticPaystackWebhook(raw,request.headers.get('paystack-signature')))return new Response('Unauthorized',{status:401});
 let event;try{event=JSON.parse(raw.toString('utf8'));}catch{return new Response('Invalid JSON',{status:400});}
 if(!event||typeof event!=='object'||Array.isArray(event))return new Response('Invalid event',{status:400});
 if(event.event!=='charge.success')return new Response('Ignored');
 const reference=event.data?.reference;
 if(typeof reference!=='string')return new Response('Invalid reference',{status:400});
 try{
  if(!await findPayment(reference))return new Response('Ignored');
  // Finish durable work before acknowledging, so failures remain eligible for provider retry.
  return await verifyPaystackPayment(reference)?new Response('OK'):new Response('Verification pending',{status:503});
 }catch{return new Response('Verification pending',{status:503});}
}
