// Local stand-in based on Flutterwave v3 Standard and verify-by-reference docs.
// __control is test-only; it is not a Flutterwave endpoint.
const http = require('http');
const key = 'flutterwave.orders';
http.createServer(async (req, res) => {
 const url = new URL(req.url, 'http://localhost');
 const send = (status, body) => {res.writeHead(status, {'Content-Type':'application/json'});res.end(JSON.stringify(body));};
 const orders = await pm.state.get(key) || {};
 if (req.method === 'POST' && url.pathname === '/v3/__control') {
  const input=req.body;
  if(!orders[input.reference]) return send(400,{status:'error'});
  Object.assign(orders[input.reference],input);await pm.state.set(key,orders);return send(200,{status:'success'});
 }
 if(req.headers.authorization !== 'Bearer FLWSECK_TEST-fixture-X')return send(401,{status:'error'});
 if(req.method === 'POST' && url.pathname === '/v3/payments') {
  const body=req.body;
  if(!body.tx_ref || body.amount !== 30000 || body.currency !== 'NGN' || !body.customer?.email || !body.redirect_url) return send(400,{status:'error'});
  orders[body.tx_ref] ||= {...body,id:3091255+Object.keys(orders).length,status:'pending'};
  await pm.state.set(key,orders);
  return send(200,{status:'success',data:{link:'https://checkout.flutterwave.com/v3/hosted/pay/'+body.tx_ref}});
 }
 if(req.method === 'GET' && url.pathname === '/v3/transactions/verify_by_reference') {
  const tx=orders[url.searchParams.get('tx_ref')];
  if(!tx)return send(400,{status:'error',data:null});
  if(tx.outage)return send(503,{status:'error'});
  return send(200,{status:'success',data:tx});
 }
 send(501,{status:'error',message:'Not modeled'});
}).listen(process.env.PORT || 4500);
