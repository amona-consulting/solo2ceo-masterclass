import './database-fixture.ts';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { db, register } from '../lib/backend.ts';
import { enrollment, addThreeMonths } from '../lib/payments.ts';
import { applyPaystackPayment, authenticPaystackWebhook, handlePaystackWebhook, startPaystackCheckout, verifyPaystackPayment, studentPaystackPayments } from '../lib/paystack.ts';
import { paystackKey, paystackCheckoutUrl } from '../lib/paystack-client.ts';
process.env.PAYMENTS_MODE='test';process.env.PAYSTACK_SECRET_KEY='rk_test_fixture';process.env.PAYSTACK_WEBHOOK_SECRET='whsec_fixture';
after(async()=>{await db().close();});
async function order(userId:string){const ref='s2c-ps-'+randomUUID();await db().prepare('INSERT INTO paystack_payments(reference,user_id,mode,amount,currency,created_at) VALUES(?,?,?,?,?,?)').run(ref,userId,'test',30000,'NGN',Date.now());return ref;}
function signature(body:string,t=Math.floor(Date.now()/1000)){return `t=${t},v1=whk_fixture:${createHmac('sha512','whsec_fixture').update(t+'.'+body).digest('hex')}`;}
function webhook(body:string){return new Request('http://localhost/webhook',{method:'POST',headers:{'paystack-signature':signature(body)},body});}
test('restricted key mode and hosted checkout address validation',()=>{
 assert.equal(paystackKey(),'rk_test_fixture');process.env.PAYMENTS_MODE='live';assert.throws(paystackKey);process.env.PAYMENTS_MODE='test';
 assert.equal(paystackCheckoutUrl('https://checkout.paystack.com/abc'),'https://checkout.paystack.com/abc');
 for(const bad of [null,'http://checkout.paystack.com/a','https://checkout.paystack.com.evil.test/a','https://user:pass@checkout.paystack.com/a','https://checkout.paystack.com:444/a'])assert.throws(()=>paystackCheckoutUrl(bad));
});
test('verified payments enforce amount, currency, mode, reference, ownership and deduplicate',async()=>{
 const a=await register('Paystack Student','ps@example.test','Long test password!'),b=await register('Other','ps-other@example.test','Long test password!');
 const reference=await order(a.id),now=Date.now();
 const tx={id:1001,reference,amount:3000000,currency:'NGN',domain:'test',status:'success'};
 for(const bad of [{amount:30000},{currency:'USD'},{domain:'live'},{reference:'wrong'},{id:0},{id:1.5}])await assert.rejects(applyPaystackPayment(reference,{...tx,...bad}));
 assert.equal(await applyPaystackPayment(reference,{...tx,status:'abandoned'}),false);assert.equal(await enrollment(a.id),undefined);
 await assert.rejects(verifyPaystackPayment(reference,b.id));
 assert.deepEqual(await Promise.all([applyPaystackPayment(reference,tx,now),applyPaystackPayment(reference,tx,now)]),[true,true]);
 assert.equal((await enrollment(a.id))!.expires_at,addThreeMonths(now));
 const duplicate=await order(b.id);await assert.rejects(applyPaystackPayment(duplicate,{...tx,reference:duplicate}));assert.equal(await enrollment(b.id),undefined);
 await assert.rejects(applyPaystackPayment(reference,{...tx,id:1002}));
 process.env.PAYMENTS_MODE='live';assert.equal(await enrollment(a.id),undefined);process.env.PAYMENTS_MODE='test';
});
test('legacy records and course access survive the additive payment schema',async()=>{
 const a=await register('Legacy','ps-legacy@example.test','Long test password!');
 await db().prepare('INSERT INTO payments(reference,user_id,mode,amount,currency,status,transaction_id,created_at) VALUES(?,?,?,?,?,?,?,?)').run('legacy-ref',a.id,'test',30000,'NGN','paid','1001',Date.now());
 await db().prepare('INSERT INTO enrollments VALUES(?,?,?,?)').run(a.id,'test',Date.now(),Date.now()+100000);
 assert.ok(await enrollment(a.id));assert.equal((await studentPaystackPayments(a.id)).length,0);
 await assert.rejects(verifyPaystackPayment('legacy-ref',a.id));await assert.rejects(startPaystackCheckout(a),/already active/);
});
test('webhook validates raw bytes and timestamp, rejects malformed events and ignores other apps',async()=>{
 const body='{"event":"charge.success","data":{"reference":"another-app"}}';
 assert.equal(authenticPaystackWebhook(Buffer.from(body),signature(body)),true);
 assert.equal(authenticPaystackWebhook(Buffer.from(body+' '),signature(body)),false);
 assert.equal(authenticPaystackWebhook(Buffer.from(body),signature(body,1)),false);
 assert.equal(authenticPaystackWebhook(Buffer.from(body),'t=1,t=2,v1=x:abc'),false);
 assert.equal((await handlePaystackWebhook(new Request('http://localhost',{method:'POST',body}))).status,401);
 assert.equal((await handlePaystackWebhook(webhook('not json'))).status,400);
 assert.equal((await handlePaystackWebhook(webhook('null'))).status,400);
 assert.equal((await handlePaystackWebhook(webhook(body))).status,200);
 assert.equal((await handlePaystackWebhook(webhook('{"event":"charge.failed"}'))).status,200);
});
test('Paystack adapter through real HTTP simulation', {skip:!process.env.PAYSTACK_TEST_API_URL},async()=>{
 const a=await register('HTTP Student','ps-http@example.test','Long test password!');
 const link=await startPaystackCheckout(a);assert.ok(link.startsWith('https://checkout.paystack.com/'));
 assert.equal(await startPaystackCheckout(a),link);
 const {reference}= (await studentPaystackPayments(a.id))[0];
 assert.equal(await verifyPaystackPayment(reference,a.id),false);
 const change=async(data:object)=>{const r=await fetch(process.env.PAYSTACK_TEST_API_URL+'/__control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reference,...data})});assert.equal(r.status,200);};
 const event=()=>webhook(JSON.stringify({event:'charge.success',data:{reference}}));
 await change({status:'success',amount:1});assert.equal((await handlePaystackWebhook(event())).status,503);assert.equal(await enrollment(a.id),undefined);
 await change({amount:3000000,outage:true});assert.equal((await handlePaystackWebhook(event())).status,503);assert.equal(await enrollment(a.id),undefined);
 await change({outage:false});assert.equal((await handlePaystackWebhook(event())).status,200);const access=await enrollment(a.id);assert.ok(access);
 assert.equal((await handlePaystackWebhook(event())).status,200);assert.deepEqual(await enrollment(a.id),access);
});
