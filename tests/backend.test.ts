import './database-fixture.ts';
import { transaction } from '../lib/database.ts';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import course from '../course-data.json' with { type:'json' };
import assessments from '../assessment-data.json' with { type:'json' };
import { db, register, authenticate, createSession, sessionStudent, revokeSession, readLearning, writeLearning, gradeAssessment, rateLimit } from '../lib/backend.ts';
after(async()=>{await db().close();});
test('account, persistence, isolation and grading lifecycle',async()=>{
 const alice=await register('Test Student A','Test-A@example.test','Long test password A!');
 const bob=await register('Test Student B','test-b@example.test','Long test password B!');
 assert.equal((await authenticate('TEST-A@example.test','Long test password A!')).id,alice.id);
 await assert.rejects(authenticate('test-a@example.test','incorrect password'));
 await assert.rejects(register('Duplicate','test-a@example.test','Long test password A!'));
 await assert.rejects(register('Bad','invalid','short'));
 const stored=(await db().prepare('SELECT password FROM users WHERE id=?').get(alice.id))!;
 assert.notEqual(stored.password,'Long test password A!');assert.match(String(stored.password),/^[a-f0-9]{32}:[a-f0-9]{128}$/);
 const session=(await createSession(alice.id));assert.equal((await sessionStudent(session.token))?.id,alice.id);
 assert.equal((await sessionStudent('a'.repeat(64))),null);
 assert.equal((await db().prepare('SELECT token_hash FROM sessions').get())!.token_hash===session.token,false);
 const ids=course.groups[0].lessons.map(l=>l.id);
 (await writeLearning(alice.id,[{lesson:ids[0],completed:true,bookmarked:true,note:'My private note',last:true}]));
 (await writeLearning(bob.id,[{lesson:ids[0],note:'Another student note'}]));
 assert.equal((await readLearning(alice.id)).notes[ids[0]],'My private note');assert.equal((await readLearning(bob.id)).notes[ids[0]],'Another student note');
 assert.deepEqual((await readLearning(bob.id)).completed,[]);
 (await writeLearning(alice.id,[{lesson:ids[1],completed:true},{lesson:ids[0],bookmarked:false}]));
 assert.equal((await readLearning(alice.id)).notes[ids[0]],'My private note');assert.equal((await readLearning(alice.id)).completed.length,2);
 assert.equal((await readLearning(alice.id)).bookmarks.length,0);
 await assert.rejects(async()=>(await writeLearning(alice.id,[{lesson:ids[0],note:'x'.repeat(20001)}])));
 await assert.rejects(async()=>(await writeLearning(alice.id,[{lesson:ids[0],completed:false},{lesson:'invalid',completed:true}])));
 assert.equal((await readLearning(alice.id)).completed.length,2,'invalid batch must not partially save');
 await assert.rejects(async()=>(await writeLearning(alice.id,[{lesson:ids[0],score:100} as never])));
 for(let m=1;m<=3;m++){
  const answers=assessments[m-1].map(q=>q.answer);assert.equal((await gradeAssessment(alice.id,m,answers)).score,100);
  assert.equal((await gradeAssessment(alice.id,m,answers.map(a=>(a+1)%3))).score,0);
 }
 assert.equal((await readLearning(alice.id)).scores['1'],0);assert.deepEqual((await readLearning(bob.id)).scores,{});
 await assert.rejects(async()=>(await gradeAssessment(alice.id,4,[])));await assert.rejects(async()=>(await gradeAssessment(alice.id,1,[0])));await assert.rejects(async()=>(await gradeAssessment(alice.id,1,Array(12).fill(100))));
 assert.equal((await db().prepare('SELECT count(*) AS n FROM lessons').get()).n,3);
 (await revokeSession(session.token));assert.equal((await sessionStudent(session.token)),null);
 const expiring=(await createSession(bob.id));(await db().prepare('UPDATE sessions SET expires_at=0 WHERE user_id=?').run(bob.id));assert.equal((await sessionStudent(expiring.token)),null);
 (await rateLimit('test-limit',1));await assert.rejects(async()=>(await rateLimit('test-limit',1)),/Too many/);
});

test('database transactions roll back failed writes and keep errors private',async()=>{
 const student=await register('Rollback Student','rollback@example.test','Long test password!');
 await assert.rejects(transaction(async()=>{
  await db().prepare('UPDATE users SET name=? WHERE id=?').run('Must roll back',student.id);
  await db().prepare('INSERT INTO sessions VALUES(?,?,?)').run('fixture-token','missing-user',Date.now());
 }),/course database/);
 assert.equal((await db().prepare('SELECT name FROM users WHERE id=?').get(student.id)).name,'Rollback Student');
});
