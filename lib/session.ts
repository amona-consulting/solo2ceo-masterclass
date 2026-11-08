import { cookies } from 'next/headers';
import { sessionStudent } from './backend';
import { requireEnrollment } from './payments';
export const SESSION_COOKIE='solo2ceo-session';
export async function currentStudent(){return sessionStudent((await cookies()).get(SESSION_COOKIE)?.value)}
export async function requireStudent(){const user=await currentStudent();if(!user)throw new Error('Your session has ended. Sign in again to save changes.');return user}
export async function requireEnrolledStudent(){const user=await requireStudent();requireEnrollment(user.id);return user}
