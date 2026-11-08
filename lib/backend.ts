import { db, transaction } from './database.ts';
export { db } from './database.ts';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import course from '../course-data.json' with { type: 'json' };
import assessments from '../assessment-data.json' with { type: 'json' };

export type Student = { id: string; name: string; email: string };
export type Learning = { completed: string[]; bookmarks: string[]; notes: Record<string,string>; last: string; scores: Record<string,number> };
export type Change = { lesson: string; completed?: boolean; bookmarked?: boolean; note?: string; last?: boolean };
const ids = new Set(course.groups.flatMap(g=>g.lessons.map(l=>l.id)));
const firstLesson = course.groups[0].lessons[0].id;
const digest = (s:string)=>createHash('sha256').update(s).digest('hex');
const derive = (password:string,salt:string)=>new Promise<Buffer>((ok,no)=>scrypt(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024},(e,key)=>e?no(e):ok(key)));
export async function rateLimit(key:string,maximum=10,windowMs=15*60*1000){
 const database=db(),now=Date.now();
 (await database.prepare('DELETE FROM limits WHERE expires_at < ?').run(now));
 const row=(await database.prepare('INSERT INTO limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=limits.count+1 RETURNING count').get(digest(key),now+windowMs)) as {count:number};
 if(row.count>maximum)throw new Error('Too many attempts. Please try again in 15 minutes.');
}
export async function register(name:unknown,email:unknown,password:unknown):Promise<Student>{
 if(typeof name!=='string'||name.trim().length<2||name.length>100)throw new Error('Enter your name (2–100 characters).');
 if(typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email))throw new Error('Enter a valid email address.');
 if(typeof password!=='string'||password.length<12||password.length>128)throw new Error('Use a password between 12 and 128 characters.');
 const normalized=email.trim().toLowerCase();(await rateLimit('register:'+normalized,5));
 const salt=randomBytes(16).toString('hex'),hash=(await derive(password,salt)).toString('hex');
 const student={id:randomUUID(),name:name.trim(),email:normalized};
 try{(await db().prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(student.id,student.name,student.email,`${salt}:${hash}`,Date.now()))}
 catch(e){if((e as {code?:string}).code==='23505')throw new Error('Unable to create this account. Try signing in instead.');throw e}
 return student;
}
export async function authenticate(email:unknown,password:unknown):Promise<Student>{
 if(typeof email!=='string'||email.length>254||typeof password!=='string'||password.length>128)throw new Error('Email or password is incorrect.');
 (await rateLimit('login:'+email.trim().toLowerCase()));
 const row=(await db().prepare('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase())) as (Student & {password:string})|undefined;
 const [salt,hash]=(row?.password||'00000000000000000000000000000000:'+ '0'.repeat(128)).split(':');
 const computed=await derive(password,salt);
 if(!row||!timingSafeEqual(computed,Buffer.from(hash,'hex')))throw new Error('Email or password is incorrect.');
 return {id:row.id,name:row.name,email:row.email};
}
export async function createSession(userId:string){
 const token=randomBytes(32).toString('hex'),expires=Date.now()+30*24*60*60*1000;
 (await db().prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()));
 (await db().prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),userId,expires));return {token,expires};
}
export async function sessionStudent(token:string|undefined):Promise<Student|null>{
 if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
 const row=(await db().prepare('SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(digest(token),Date.now())) as Student|undefined;
 return row?{id:row.id,name:row.name,email:row.email}:null;
}
export async function revokeSession(token:string){(await db().prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token)))}
export async function readLearning(userId:string):Promise<Learning>{
 const rows=(await db().prepare('SELECT * FROM lessons WHERE user_id=?').all(userId)) as {lesson_id:string;completed:number;bookmarked:number;note:string}[];
 const last=(await db().prepare('SELECT last_lesson FROM learning WHERE user_id=?').get(userId)) as {last_lesson:string}|undefined;
 const scores:Record<string,number>={};
 for(const a of (await db().prepare('SELECT module,score FROM attempts WHERE user_id=? ORDER BY created_at,sequence').all(userId)))scores[String(a.module)]=Number(a.score);
 return {completed:rows.filter(r=>r.completed).map(r=>r.lesson_id),bookmarks:rows.filter(r=>r.bookmarked).map(r=>r.lesson_id),notes:Object.fromEntries(rows.map(r=>[r.lesson_id,r.note])),last:last?.last_lesson||firstLesson,scores};
}
export async function writeLearning(userId:string,changes:Change[]){
 if(!Array.isArray(changes)||changes.length<1||changes.length>22)throw new Error('Invalid learning update.');
 for(const c of changes){
  if(!c||typeof c!=='object'||!ids.has(c.lesson)||Object.keys(c).some(k=>!['lesson','completed','bookmarked','note','last'].includes(k)))throw new Error('Invalid lesson.');
  if(c.completed!==undefined&&typeof c.completed!=='boolean'||c.bookmarked!==undefined&&typeof c.bookmarked!=='boolean'||c.last!==undefined&&typeof c.last!=='boolean'||c.note!==undefined&&(typeof c.note!=='string'||c.note.length>20000))throw new Error('Invalid learning update. Notes can contain up to 20,000 characters.');
 }
 return transaction(async()=>{const database=db();
 for(const c of changes){
  (await database.prepare('INSERT INTO lessons(user_id,lesson_id) VALUES(?,?) ON CONFLICT DO NOTHING').run(userId,c.lesson));
  if(c.completed!==undefined)(await database.prepare('UPDATE lessons SET completed=? WHERE user_id=? AND lesson_id=?').run(Number(c.completed),userId,c.lesson));
  if(c.bookmarked!==undefined)(await database.prepare('UPDATE lessons SET bookmarked=? WHERE user_id=? AND lesson_id=?').run(Number(c.bookmarked),userId,c.lesson));
  if(c.note!==undefined)(await database.prepare('UPDATE lessons SET note=? WHERE user_id=? AND lesson_id=?').run(c.note,userId,c.lesson));
  if(c.last)(await database.prepare('INSERT INTO learning VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET last_lesson=excluded.last_lesson').run(userId,c.lesson));
 }
 });
}
export async function gradeAssessment(userId:string,module:unknown,answers:unknown){
 if(typeof module!=='number'||!Number.isInteger(module)||module<1||module>3)throw new Error('Invalid module.');
 const questions=assessments[module-1];
 if(!Array.isArray(answers)||answers.length!==questions.length||answers.some(a=>!Number.isInteger(a)||a<0||a>2))throw new Error('Please answer every question before submitting.');
 const score=Math.round(questions.filter((q,i)=>q.answer===answers[i]).length/questions.length*100);
 (await db().prepare('INSERT INTO attempts(id,user_id,module,score,answers,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),userId,module,score,JSON.stringify(answers),Date.now()));
 return {score,correctAnswers:questions.map(q=>q.answer)};
}
