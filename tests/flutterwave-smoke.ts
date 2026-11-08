// Creates a test checkout only. Does not charge a card or grant enrollment.
import { mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { db, register } from '../lib/backend.ts';
import { startCheckout } from '../lib/payments.ts';
if(!process.env.FLUTTERWAVE_SECRET_KEY?.startsWith('FLWSECK_TEST'))throw new Error('This check requires test credentials.');
process.env.PAYMENTS_MODE='test';
const folder=mkdtempSync(resolve('test-db-'));process.env.DATABASE_PATH=join(folder,'smoke.sqlite');
try{
 const user=await register('Checkout integration test','checkout-test@example.com','Temporary test password!');
 const link=await startCheckout(user);
 console.log('PASS: Flutterwave accepted the test credentials and returned a hosted checkout at '+new URL(link).origin);
}catch(e){console.error(e instanceof Error?e.message:'Checkout test failed');process.exitCode=1;}
finally{db().close();rmSync(folder,{recursive:true,force:true});}
