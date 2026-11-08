import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { db, register } from '../lib/backend.ts';
import { addThreeMonths, applyVerifiedPayment, enrollment, requireEnrollment, authenticWebhook, handleWebhook, startCheckout, verifyPayment, studentPayments } from '../lib/payments.ts';
const folder=mkdtempSync(resolve('test-db-'));process.env.DATABASE_PATH=join(folder,'test.sqlite');
process.env.PAYMENTS_MODE='test';process.env.FLUTTERWAVE_SECRET_KEY='FLWSECK_TEST-fixture-X';process.env.FLUTTERWAVE_WEBHOOK_SECRET='fixture-webhook-secret';
after(()=>{db().close();rmSync(folder,{recursive:true,force:true});});
function order(userId:string){const ref=randomUUID();db().prepare('INSERT INTO payments(reference,user_id,mode,amount,currency,created_at) VALUES(?,?,?,?,?,?)').run(ref,userId,'test',30000,'NGN',Date.now());return ref;}
test('verified enrollment rejects mismatches, deduplicates, expires and isolates test purchases',async()=>{
 const a=await register('Paid Student','paid@example.test','Long test password!'),b=await register('Other Student','other@example.test','Long test password!');
 assert.throws(()=>requireEnrollment(a.id));const ref=order(a.id);
 const tx={id:123,tx_ref:ref,amount:30000,currency:'NGN',status:'successful',customer:{email:a.email}};
 for(const bad of [{amount:1},{currency:'USD'},{tx_ref:'forged'},{customer:{email:b.email}},{id:0}])assert.throws(()=>applyVerifiedPayment(ref,{...tx,...bad}));
 assert.equal(enrollment(a.id),undefined);
 assert.equal(applyVerifiedPayment(ref,{...tx,status:'failed'}),false);
 assert.equal(applyVerifiedPayment(ref,tx),true);const original=enrollment(a.id)!;
 assert.equal(applyVerifiedPayment(ref,tx,Date.now()+60000),true);assert.deepEqual(enrollment(a.id),original);
 assert.throws(()=>requireEnrollment(b.id));
 const duplicate=order(b.id);assert.throws(()=>applyVerifiedPayment(duplicate,{...tx,tx_ref:duplicate,customer:{email:b.email}}));assert.equal(enrollment(b.id),undefined);
 process.env.PAYMENTS_MODE='live';assert.throws(()=>requireEnrollment(a.id));process.env.PAYMENTS_MODE='test';
 db().prepare('UPDATE enrollments SET expires_at=0 WHERE user_id=?').run(a.id);assert.throws(()=>requireEnrollment(a.id));
 const renew=order(a.id);applyVerifiedPayment(renew,{...tx,id:124,tx_ref:renew});assert.ok(requireEnrollment(a.id).expires_at>Date.now());
});
test('calendar months clamp month-end and handle leap years',()=>{
 assert.equal(new Date(addThreeMonths(Date.parse('2026-01-31T12:30:00Z'))).toISOString(),'2026-04-30T12:30:00.000Z');
 assert.equal(new Date(addThreeMonths(Date.parse('2023-11-30T12:30:00Z'))).toISOString(),'2024-02-29T12:30:00.000Z');
});
test('webhook authentication fails closed and malformed events do not unlock access',async()=>{
 assert.equal(authenticWebhook(null),false);assert.equal(authenticWebhook('wrong'),false);
 assert.equal((await handleWebhook(new Request('http://localhost/webhook',{method:'POST',body:'{}'}))).status,401);
 const headers={'verif-hash':'fixture-webhook-secret'};
 assert.equal((await handleWebhook(new Request('http://localhost/webhook',{method:'POST',headers,body:'not json'}))).status,400);
 assert.equal((await handleWebhook(new Request('http://localhost/webhook',{method:'POST',headers,body:'null'}))).status,400);
 assert.equal((await handleWebhook(new Request('http://localhost/webhook',{method:'POST',headers,body:'{"event":"transfer.completed"}'}))).status,200);
});
test('real payment adapter against local HTTP simulation', {skip:!process.env.PAYMENT_TEST_API_URL},async()=>{
 const user=await register('Simulation Student','simulation@example.test','Long test password!');
 const link=await startCheckout(user);assert.ok(link.startsWith('https://checkout.flutterwave.com/'));
 assert.equal(await startCheckout(user),link,'pending checkout is reused');
 const payment=studentPayments(user.id)[0];
 await assert.rejects(verifyPayment(payment.reference,'another-user'));
 assert.equal(await verifyPayment(payment.reference,user.id),false,'pending provider payment stays locked');
 const control=process.env.PAYMENT_TEST_API_URL+'/__control';
 await fetch(control,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reference:payment.reference,status:'successful',amount:1})});
 await assert.rejects(verifyPayment(payment.reference,user.id));assert.equal(enrollment(user.id),undefined);
 await fetch(control,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reference:payment.reference,status:'successful',amount:30000,outage:true})});
 await assert.rejects(verifyPayment(payment.reference,user.id));assert.equal(enrollment(user.id),undefined);
 await fetch(control,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reference:payment.reference,outage:false})});
 const event=()=>new Request('http://localhost/webhook',{method:'POST',headers:{'verif-hash':'fixture-webhook-secret'},body:JSON.stringify({event:'charge.completed',data:{tx_ref:payment.reference,status:'successful'}})});
 assert.equal((await handleWebhook(event())).status,200);const access=enrollment(user.id);assert.ok(access);
 assert.equal((await handleWebhook(event())).status,200);assert.deepEqual(enrollment(user.id),access);
 await assert.rejects(startCheckout(user),/already active/);
});
