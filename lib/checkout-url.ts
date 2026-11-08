export function checkoutUrl(value:unknown,mode:'test'|'live'):string {
 const invalid=()=>new Error('Flutterwave returned an invalid checkout address.');
 if(typeof value!=='string')throw invalid();
 let url:URL;
 try{url=new URL(value);}catch{throw invalid();}
 const allowed=url.hostname==='checkout.flutterwave.com'||
  (mode==='test'&&url.hostname==='checkout-v2.dev-flutterwave.com');
 if(!allowed||url.protocol!=='https:'||url.port||url.username||url.password)throw invalid();
 return url.href;
}
