import { redirect } from 'next/navigation';
import { currentStudent } from '../../lib/session';
import AccountForm from './account-form';
export default async function Login(){if(await currentStudent())redirect('/');return <AccountForm/>}
