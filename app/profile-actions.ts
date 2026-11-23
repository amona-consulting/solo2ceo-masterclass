'use server';
import { cookies } from 'next/headers';
import { requireStudent, SESSION_COOKIE } from '../lib/session';
import { updateProfile, changePassword, rateLimit } from '../lib/backend';

export async function saveProfile(form:FormData){
 try{
  const student=await requireStudent();
  await rateLimit('profile:'+student.id,30);
  const name=await updateProfile(student.id,form.get('name'));
  return {ok:true as const,name};
 }catch(e){return {ok:false as const,error:e instanceof Error?e.message:'Unable to save your profile.'}}
}
export async function savePassword(form:FormData){
 try{
  const student=await requireStudent();
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  if(!token)throw new Error('Please sign in again.');
  await changePassword(student.id,form.get('currentPassword'),form.get('password'),form.get('confirmation'),token);
  return {ok:true as const};
 }catch(e){return {ok:false as const,error:e instanceof Error?e.message:'Unable to change your password.'}}
}
