import {test} from 'node:test';
import assert from 'node:assert/strict';
import {failureKind} from '../lib/flutterwave-client.ts';
test('provider failures distinguish credentials, blocking, rate limits and missing transactions',()=>{
 assert.equal(failureKind(401,'application/json','secret'),'authentication');
 assert.equal(failureKind(403,'text/html','Cloudflare'),'gateway_block');
 assert.equal(failureKind(429,'application/json',null),'rate_limit');
 assert.equal(failureKind(503,'text/html',null),'provider_outage');
 assert.equal(failureKind(400,'application/json','No transaction was found for this id'),'transaction_not_found');
 assert.equal(failureKind(200,'text/html',null),'invalid_response');
 assert.equal(failureKind(400,'application/json','customer@example.test'),'request_rejected');
});
