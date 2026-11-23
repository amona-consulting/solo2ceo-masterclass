// Based on https://paystack.com/docs/api/transaction/ . __control is test-only.
const http=require('http');
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
 const orders=await pm.state.get('paystack.orders')||{};
 if(url.pathname==='/__control'&&req.method==='POST'){
  if(!orders[req.body.reference])return send(400,{status:false});
  Object.assign(orders[req.body.reference],req.body);await pm.state.set('paystack.orders',orders);return send(200,{status:true});
 }
 if(req.headers.authorization!=='Bearer rk_test_fixture')return send(401,{status:false});
 if(url.pathname==='/transaction/initialize'&&req.method==='POST'){
  const b=req.body;
  if(b.amount!==3000000||b.currency!=='NGN'||!b.email||!b.reference||!b.callback_url?.endsWith('/payments/paystack/return'))return send(400,{status:false});
  if(orders[b.reference])return send(400,{status:false,message:'Duplicate Transaction Reference'});
  orders[b.reference]={id:4000000+Object.keys(orders).length,domain:'test',reference:b.reference,amount:b.amount,currency:b.currency,status:'pending',customer:{email:b.email}};
  await pm.state.set('paystack.orders',orders);
  return send(200,{status:true,data:{reference:b.reference,authorization_url:'https://checkout.paystack.com/'+b.reference,access_code:b.reference}});
 }
 if(url.pathname.startsWith('/transaction/verify/')&&req.method==='GET'){
  const tx=orders[decodeURIComponent(url.pathname.split('/').pop())];
  if(!tx)return send(400,{status:false,message:'Transaction reference not found'});
  if(tx.outage)return send(503,{status:false});
  return send(200,{status:true,data:tx});
 }
 return send(501,{status:false,message:'Not modeled'});
}).listen(process.env.PORT||4501);
