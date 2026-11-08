'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authenticate, register, createSession, revokeSession, writeLearning, gradeAssessment, rateLimit, type Change } from '../lib/backend';
import { requireEnrolledStudent, SESSION_COOKIE } from '../lib/session';

export async function signIn(_previous:{error:string},form:FormData){
 try{rateLimit('auth-global',120);const mode=form.get('mode');const student=mode==='signup'?await register(form.get('name'),form.get('email'),form.get('password')):await authenticate(form.get('email'),form.get('password'));
 const session=createSession(student.id);
 (await cookies()).set(SESSION_COOKIE,session.token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',expires:new Date(session.expires),path:'/'});
 }catch(e){return {error:e instanceof Error?e.message:'Unable to sign in. Please try again.'}}
 redirect('/');
}
export async function signOut(){const jar=await cookies(),token=jar.get(SESSION_COOKIE)?.value;if(token)revokeSession(token);jar.delete(SESSION_COOKIE);redirect('/login')}
export async function saveLearning(changes:Change[]){
 try{const user=await requireEnrolledStudent();writeLearning(user.id,changes);return {ok:true as const}}catch(e){return {ok:false as const,error:e instanceof Error?e.message:'Unable to save changes.'}}
}
export async function submitAssessment(module:number,answers:number[]){
 try{const user=await requireEnrolledStudent();rateLimit('assessment:'+user.id,60);return {ok:true as const,...gradeAssessment(user.id,module,answers)}}catch(e){return {ok:false as const,error:e instanceof Error?e.message:'Unable to submit assessment.'}}
}
