import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkoutUrl } from '../lib/checkout-url.ts';

test('checkout accepts the observed sandbox host only in test mode',()=>{
 const sandbox='https://checkout-v2.dev-flutterwave.com/v3/hosted/pay/test';
 assert.equal(checkoutUrl(sandbox,'test'),sandbox);
 assert.throws(()=>checkoutUrl(sandbox,'live'));
 const production='https://checkout.flutterwave.com/v3/hosted/pay/test';
 for(const mode of ['test','live'] as const)assert.equal(checkoutUrl(production,mode),production);
});
test('checkout rejects malformed, insecure and impersonating URLs',()=>{
 for(const value of [null,{},'invalid','http://checkout.flutterwave.com/pay',
  'https://checkout.flutterwave.com.evil.test/pay','https://checkout-v2.dev-flutterwave.com.evil.test/pay',
  'https://evil.test/pay','https://user:pass@checkout.flutterwave.com/pay',
  'https://checkout.flutterwave.com:8443/pay']){
  for(const mode of ['test','live'] as const)assert.throws(()=>checkoutUrl(value,mode));
 }
});
