'use client';
import { useActionState } from 'react';
import { checkout, checkPayment } from './actions';
export function CheckoutForm(){
 const [state,action,pending]=useActionState(checkout,{error:''});
 return <form action={action}>{state.error&&<p role="alert" className="account-error">{state.error}</p>}<button className="button green" disabled={pending}>{pending?'Opening checkout…':'Pay ₦30,000 with Flutterwave'}</button></form>;
}
export function PaymentCheck({reference}:{reference:string}){
 const [state,action,pending]=useActionState(checkPayment,{error:''});
 return <form action={action}><input type="hidden" name="reference" value={reference}/><button className="button outlined" disabled={pending}>{pending?'Checking payment…':'Check payment status'}</button>{state.error&&<p role="alert" className="account-error">{state.error}</p>}</form>;
}
