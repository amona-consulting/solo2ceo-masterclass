'use server';
import { redirect } from 'next/navigation';
import { requireStudent } from '../../lib/session';
import { rateLimit } from '../../lib/backend';
import { startCheckout, verifyPayment } from '../../lib/payments';
export async function checkout(_previous:{error:string}){
 let link:string;
 try{const student=await requireStudent();rateLimit('checkout:'+student.id,10);link=await startCheckout(student);}
 catch(e){return {error:e instanceof Error?e.message:'Unable to open checkout. Please try again.'};}
 redirect(link);
}
export async function checkPayment(_previous:{error:string},form:FormData){
 try{
  const student=await requireStudent();rateLimit('payment-check:'+student.id,30);
  const reference=form.get('reference');if(typeof reference!=='string')throw new Error('Invalid payment reference.');
  if(!await verifyPayment(reference,student.id))return {error:'Payment is not successful yet. If you have been debited, wait and check again before making another payment.'};
 }catch(e){return {error:e instanceof Error?e.message:'Unable to confirm payment. Please check again shortly.'};}
 redirect('/');
}
