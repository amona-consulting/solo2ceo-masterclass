import { randomUUID } from 'node:crypto';
import { paymentMode } from './payments.ts';

export function paystackKey(){
 const key=process.env.PAYSTACK_SECRET_KEY?.trim();
 if(!key||!new RegExp(`^(rk|sk)_${paymentMode()}_.+`).test(key))throw new Error('Paystack is not configured for this payment mode. Please contact Amona.');
 return key;
}
export function paystackCheckoutUrl(value:unknown){
 let url:URL;
 try{if(typeof value!=='string')throw new Error();url=new URL(value);}catch{throw new Error('Paystack returned an invalid checkout address.');}
 if(url.protocol!=='https:'||url.hostname!=='checkout.paystack.com'||url.port||url.username||url.password)throw new Error('Paystack returned an invalid checkout address.');
 return url.href;
}
export async function requestPaystack(path:string,body?:object){
 const key=paystackKey();
 const base=process.env.NODE_ENV==='test'&&process.env.PAYSTACK_TEST_API_URL?process.env.PAYSTACK_TEST_API_URL:'https://api.paystack.co';
 const diagnosticId=randomUUID();let status:number|undefined;
 try{
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(15000)});
  status=response.status;const result=await response.json();
  if(response.ok&&result?.status===true&&result.data)return result.data;
 }catch{}
 console.error('paystack_failure',JSON.stringify({diagnosticId,operation:body?'checkout':'verification',httpStatus:status}));
 throw new Error(`Paystack could not ${body?'open checkout':'confirm payment'}. Please try again shortly. Support code: ${diagnosticId}`);
}
