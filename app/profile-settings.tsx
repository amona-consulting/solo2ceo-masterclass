'use client';
import { useState } from 'react';
import type { Student } from '../lib/backend';
import { saveProfile, savePassword } from './profile-actions';
import { signOut } from './actions';

export default function ProfileSettings({student,onName,dark,onTheme,accessExpires,testMode,canSignOut}:{student:Student;onName:(name:string)=>void;dark:boolean;onTheme:(dark:boolean)=>void;accessExpires:number;testMode:boolean;canSignOut:boolean}){
 const [profileMessage,setProfileMessage]=useState(''),[passwordMessage,setPasswordMessage]=useState('');
 const [profileBusy,setProfileBusy]=useState(false),[passwordBusy,setPasswordBusy]=useState(false);
 return <section className="profile-settings">
  <div className="page-heading simple"><p className="eyebrow">YOUR LEARNING SPACE</p><h1>My account</h1><p>Manage your profile, security and preferences.</p></div>
  <div className="settings-grid">
   <section className="settings-card"><h2>Profile details</h2><p>Your name appears throughout your learning space.</p>
    <form onSubmit={async e=>{e.preventDefault();const form=new FormData(e.currentTarget);setProfileBusy(true);setProfileMessage('');try{const result=await saveProfile(form);if(result.ok){onName(result.name);setProfileMessage('Profile saved.')}else setProfileMessage(result.error)}catch{setProfileMessage('Unable to save. Please try again.')}finally{setProfileBusy(false)}}}>
     <label>Your name<input name="name" defaultValue={student.name} autoComplete="name" minLength={2} maxLength={100} required/></label>
     <label>Email address<input value={student.email} type="email" readOnly/></label><small>To change your sign-in email, <a href="https://amonaconsulting.com/contact/">contact Amona</a>.</small>
     <button className="button green" disabled={profileBusy}>{profileBusy?'Saving…':'Save profile'}</button><p role="status">{profileMessage}</p>
    </form>
   </section>
   <section className="settings-card"><h2>Password & security</h2><p>Changing your password signs out your other sessions.</p>
    <form onSubmit={async e=>{e.preventDefault();const element=e.currentTarget,form=new FormData(element);setPasswordBusy(true);setPasswordMessage('');try{const result=await savePassword(form);if(result.ok){element.reset();setPasswordMessage('Password changed. Your other sessions have been signed out.')}else setPasswordMessage(result.error)}catch{setPasswordMessage('Unable to change password. Please try again.')}finally{setPasswordBusy(false)}}}>
     <input type="text" name="username" autoComplete="username" value={student.email} readOnly hidden/>
     <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" maxLength={128} required/></label>
     <label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label><small>Use 12–128 characters.</small>
     <label>Confirm new password<input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label>
     <button className="button green" disabled={passwordBusy}>{passwordBusy?'Updating…':'Change password'}</button><p role="status">{passwordMessage}</p>
    </form>
   </section>
   <section className="settings-card"><h2>Your enrollment</h2><p>Solo2CEO Masterclass</p><dl><dt>Status</dt><dd>{testMode?'Active · Test enrollment':'Active'}</dd><dt>Access until</dt><dd>{new Date(accessExpires).toLocaleDateString('en-NG',{day:'numeric',month:'long',year:'numeric',timeZone:'Africa/Lagos'})}</dd></dl><small>Three months of course access from enrollment.</small></section>
   <section className="settings-card"><h2>Preferences</h2><label>Appearance<select value={dark?'dark':'light'} onChange={e=>onTheme(e.target.value==='dark')}><option value="light">Light</option><option value="dark">Dark</option></select></label><p>Saved on this browser.</p><form action={signOut}><button className="button outlined" disabled={!canSignOut||profileBusy||passwordBusy}>Sign out</button></form>{!canSignOut&&<small>Save your learning changes before signing out.</small>}</section>
  </div>
 </section>;
}
