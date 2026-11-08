import { redirect } from 'next/navigation';
import { currentStudent } from '../../lib/session';
import { enrollment, paymentMode, studentPayments } from '../../lib/payments';
import { signOut } from '../actions';
import AmonaLogo from '../amona-logo';
import { CheckoutForm, PaymentCheck } from './payment-form';
export const runtime='nodejs';
export default async function Enroll({searchParams}:{searchParams:Promise<{payment?:string}>}){
 const student=await currentStudent();if(!student)redirect('/login');
 const access=enrollment(student.id);if(access&&access.expires_at>Date.now())redirect('/');
 const payments=studentPayments(student.id),params=await searchParams;
 return <main className="account-page app"><div className="account-intro"><div className="account-brand"><AmonaLogo/></div><p className="eyebrow">SOLO2CEO MASTERCLASS</p><h1>Your next chapter.<br/>One clear investment.</h1><p>22 lessons. Three modules. Practical tools to help you build clarity, strategy and systems for your business.</p></div><section className="account-panel enrollment-panel"><p className="eyebrow">{access?'CONTINUE YOUR JOURNEY':'YOUR ENROLLMENT'}</p><h2>{access?'Welcome back,':'Ready to begin,'} {student.name.split(' ')[0]}?</h2>{paymentMode()==='test'&&<p className="payment-test" role="status">Test checkout — use Flutterwave test payment details. This does not purchase live course access.</p>}<p>{access?'Your access has ended. Renew for three months and pick up with your saved progress.':'Get three months of access to every lesson, assessment and course resource.'}</p><div className="enrollment-price">₦30,000 <span>one-time payment</span></div><p className="enrollment-terms">Access starts when payment is verified and ends three calendar months later. No automatic renewal.</p>{params.payment==='pending'&&<p className="account-error" role="status">Your payment has not been confirmed yet. Check its status below before paying again.</p>}<CheckoutForm/>{payments.filter(p=>p.status==='pending').map(p=><div className="payment-record" key={p.reference}><small>Started {new Date(p.created_at).toLocaleDateString('en-NG',{timeZone:'Africa/Lagos'})}</small><code>{p.reference}</code><PaymentCheck reference={p.reference}/></div>)}<p className="account-help">Signed in as {student.email}. <a href="https://amonaconsulting.com/contact/">Need help?</a></p><form action={signOut}><button className="text-button">Sign out</button></form></section></main>;
}
