// Run against the local development server; removes only its own generated account.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import course from '../course-data.json' with {type:'json'};
import assessments from '../assessment-data.json' with {type:'json'};
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
const email=`backend-test-${randomBytes(10).toString('hex')}@example.test`,password=randomBytes(24).toString('base64url');
const decode=s=>s.replaceAll('&quot;','"').replaceAll('&#x27;',"'").replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>');
async function account(mode){
 const html=await (await fetch(`${base}/login`)).text(),form=new FormData();
 for(const match of html.matchAll(/<input\b[^>]*>/g)){const name=match[0].match(/name="([^"]+)"/)?.[1],value=match[0].match(/value="([^"]*)"/)?.[1];if(name?.startsWith('$ACTION_'))form.set(decode(name),decode(value||''))}
 assert.ok([...form.keys()].length>0,'server form action is available');
 form.set('mode',mode);form.set('name','Backend test student');form.set('email',email);form.set('password',password);
 return fetch(`${base}/login`,{method:'POST',headers:{origin:base},body:form,redirect:'manual'});
}
try{
 const denied=await fetch(base,{redirect:'manual'});assert.equal(denied.status,307);assert.equal(denied.headers.get('location'),'/login');
 const signup=await account('signup');assert.equal(signup.status,303);assert.equal(signup.headers.get('location'),'/');
 const cookie=signup.headers.get('set-cookie');assert.ok(cookie?.includes('HttpOnly'));assert.match(cookie,/SameSite=lax/i);
 const headers={cookie:cookie.split(';')[0]};
 const locked=await fetch(base,{headers,redirect:'manual'});assert.equal(locked.headers.get('location'),'/enroll');
 const enrollmentHtml=await (await fetch(base+'/enroll',{headers})).text();assert.ok(enrollmentHtml.includes('30,000'));assert.ok(!enrollmentHtml.includes(course.groups[0].lessons[0].id));
 const fixtureDb=new DatabaseSync(process.env.DATABASE_PATH||'data/solo2ceo.sqlite');
 const fixtureUser=fixtureDb.prepare('SELECT id FROM users WHERE email=?').get(email);
 fixtureDb.prepare('INSERT INTO enrollments VALUES(?,?,?,?)').run(fixtureUser.id,'test',Date.now(),Date.now()+86400000);fixtureDb.close();
 const page=await fetch(base,{headers});assert.equal(page.status,200);const html=await page.text();assert.ok(html.includes('Backend test student'));assert.ok(html.includes('Your next chapter starts here.'));
 const signin=await account('login');assert.equal(signin.status,303);assert.ok(signin.headers.get('set-cookie'));
 const manifest=JSON.parse(readFileSync('.next/dev/server/server-reference-manifest.json','utf8')).node;
 const actionId=name=>Object.entries(manifest).find(([,v])=>v.exportedName===name)?.[0];
 async function action(name,args,cookieHeader=headers.cookie,origin=base){return fetch(base,{method:'POST',headers:{origin,'Content-Type':'text/plain;charset=UTF-8','Next-Action':actionId(name),cookie:cookieHeader},body:JSON.stringify(args),redirect:'manual'})}
 const lesson=course.groups[0].lessons[0].id;
 const saved=await action('saveLearning',[[{lesson,completed:true,note:'Persisted HTTP test note',bookmarked:true,last:true}]]);assert.ok((await saved.text()).includes('"ok":true'));
 const secondCookie=signin.headers.get('set-cookie').split(';')[0];
 const secondPage=await (await fetch(base,{headers:{cookie:secondCookie}})).text();assert.ok(secondPage.includes('Persisted HTTP test note'),'a new session must see the original progress');
 const forbidden=await action('saveLearning',[[{lesson,completed:false}]],'');assert.ok((await forbidden.text()).includes('"ok":false'));
 const grading=await action('submitAssessment',[1,assessments[0].map(q=>q.answer)]);assert.ok((await grading.text()).includes('"score":100'));
 const forged=await action('saveLearning',[[{lesson,score:999}]]);assert.ok((await forged.text()).includes('"ok":false'));
 const csrf=await action('saveLearning',[[{lesson,completed:false}]],headers.cookie,'https://untrusted.example');assert.ok(csrf.status>=400);
 const expiryDb=new DatabaseSync(process.env.DATABASE_PATH||'data/solo2ceo.sqlite');expiryDb.prepare('UPDATE enrollments SET expires_at=0 WHERE user_id=?').run(fixtureUser.id);expiryDb.close();
 assert.equal((await fetch(base,{headers,redirect:'manual'})).headers.get('location'),'/enroll');
 assert.ok((await (await action('saveLearning',[[{lesson,completed:false}]])).text()).includes('\"ok\":false'));
 assert.ok((await (await action('submitAssessment',[1,assessments[0].map(q=>q.answer)])).text()).includes('\"ok\":false'));
 await action('signOut',[]);assert.equal((await fetch(base,{headers,redirect:'manual'})).status,307);
 const invalid=await fetch(base,{headers:{cookie:'solo2ceo-session='+'a'.repeat(64)},redirect:'manual'});assert.equal(invalid.status,307);
 console.log('PASS: signup/login, cookie flags, unpaid/expired enrollment gates, authenticated course, learning writes across sessions, unauthorized writes rejected, server grading, forged scores rejected, cross-origin rejection, logout revocation.');
}finally{
 const database=new DatabaseSync(process.env.DATABASE_PATH||'data/solo2ceo.sqlite');database.exec('PRAGMA foreign_keys=ON');database.prepare('DELETE FROM users WHERE email=?').run(email);database.close();
}
