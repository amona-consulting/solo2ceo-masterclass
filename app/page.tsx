import LearningPortal from './portal';
import { redirect } from 'next/navigation';
import { currentStudent } from '../lib/session';
import { readLearning } from '../lib/backend';
import assessments from '../assessment-data.json';
import course from '../course-data.json';
import { enrollment, paymentMode } from '../lib/payments';
export const runtime='nodejs';
export default async function Page() {
 const student=await currentStudent();if(!student)redirect('/login');
 const access=enrollment(student.id);if(!access||access.expires_at<=Date.now())redirect('/enroll');
 return <LearningPortal student={student} course={course} accessExpires={access.expires_at} testMode={paymentMode()==='test'} initialLearning={readLearning(student.id)} quizzes={assessments.map(module=>module.map(({question,options})=>({question,options})))}/>;
}
