import { currentStudent } from '../../../../lib/session';
import { paystackOrigin, verifyPaystackPayment } from '../../../../lib/paystack';
import { rateLimit } from '../../../../lib/backend';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request){
 const origin=paystackOrigin(),student=await currentStudent();
 if(!student)return Response.redirect(origin+'/login',303);
 const reference=new URL(request.url).searchParams.get('reference');
 let confirmed=false;
 try{await rateLimit('payment-check:'+student.id,30);if(reference)confirmed=await verifyPaystackPayment(reference,student.id);}catch{}
 return Response.redirect(origin+(confirmed?'/':'/enroll?payment=pending'),303);
}
