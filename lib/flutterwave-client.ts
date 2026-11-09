import { randomUUID } from 'node:crypto';

export function failureKind(status:number,contentType:string,providerMessage:unknown){
 if(status===401)return 'authentication';
 if(status===403)return contentType.includes('json')?'forbidden':'gateway_block';
 if(status===429)return 'rate_limit';
 if(status>=500)return 'provider_outage';
 if(typeof providerMessage==='string'&&/no transaction was found/i.test(providerMessage))return 'transaction_not_found';
 if(!contentType.includes('json'))return 'invalid_response';
 return 'request_rejected';
}
export async function requestFlutterwave(base:string,path:string,key:string,body?:object){
 const diagnosticId=randomUUID();
 const operation=body?'checkout':'verification';
 let kind='network',httpStatus:number|undefined;
 try{
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(12000)});
  httpStatus=response.status;
  const contentType=response.headers.get('content-type')||'';
  let result:any;
  try{result=await response.json();}catch{}
  if(response.ok&&result?.status==='success'&&result.data)return result.data;
  kind=failureKind(response.status,contentType,result?.message);
 }catch(error){
  kind=error instanceof Error&&['TimeoutError','AbortError'].includes(error.name)?'timeout':'network';
 }
 // Never log credentials, customer data, payment URLs, raw provider bodies or query strings.
 console.error('flutterwave_failure',JSON.stringify({diagnosticId,operation,kind,httpStatus}));
 const message=kind==='transaction_not_found'?'Flutterwave has not recorded a completed transaction for this order.':
  kind==='timeout'?'Flutterwave took too long to respond. Please try again shortly.':
  kind==='rate_limit'?'Flutterwave is receiving too many requests. Please try again shortly.':
  kind==='authentication'?'Flutterwave rejected the payment credentials. Please contact Amona.':
  kind==='gateway_block'||kind==='forbidden'?'Flutterwave blocked the request. Please contact Amona.':
  kind==='provider_outage'?'Flutterwave is temporarily unavailable. Please try again shortly.':
  operation==='checkout'?'Flutterwave could not create the checkout. Please try again shortly.':'We could not verify the payment with Flutterwave. Please try again shortly.';
 throw new Error(`${message} Support code: ${diagnosticId}`);
}
