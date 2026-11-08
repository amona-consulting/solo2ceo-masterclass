import { currentStudent } from '../../../lib/session';
import { appOrigin, verifyPayment } from '../../../lib/payments';
import { rateLimit } from '../../../lib/backend';
export const runtime='nodejs';
export async function GET(request:Request){
 const origin=appOrigin(),student=await currentStudent();
 if(!student)return Response.redirect(origin+'/login',303);
 const reference=new URL(request.url).searchParams.get('tx_ref');
 let confirmed=false;
 try{rateLimit('payment-check:'+student.id,30);if(reference)confirmed=await verifyPayment(reference,student.id);}catch{}
 // Browser status and transaction_id are deliberately not trusted.
 return Response.redirect(origin+(confirmed?'/':'/enroll?payment=pending'),303);
}
