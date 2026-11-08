import { Pool } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { schema } from '../database/schema.ts';

type Connection = { query(sql:string, values?:unknown[]):Promise<{rows:Record<string,any>[]}> };
type Driver = Connection & { transaction<T>(fn:(client:Connection)=>Promise<T>):Promise<T>; close():Promise<void> };
const state=globalThis as typeof globalThis & { soloPool?:Pool; soloReady?:Promise<void>; soloTestDriver?:Driver };
const context=new AsyncLocalStorage<Connection>();
function databaseError(error:unknown){
 const safe=new Error('We could not reach the course database. Please try again shortly.');
 // Preserve the constraint code for duplicate-account handling, never SQL or credentials.
 return Object.assign(safe,{code:(error as {code?:string})?.code});
}
function pool(){
 if(!process.env.DATABASE_URL)throw new Error('Database is not configured. Please contact Amona.');
 if(!state.soloPool){
  state.soloPool=new Pool({connectionString:process.env.DATABASE_URL,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,allowExitOnIdle:true});
  state.soloPool.on('error',()=>console.error('An idle database connection failed.'));
 }
 return state.soloPool;
}
function driver():Driver {
 if(process.env.NODE_ENV==='test'&&state.soloTestDriver)return state.soloTestDriver;
 const p=pool();
 return {query:(sql,values)=>p.query(sql,values),close:()=>p.end(),async transaction(fn){
  const client=await p.connect().catch(error=>{throw databaseError(error);});
  try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }};
}
async function ready(){
 if(!state.soloReady)state.soloReady=driver().transaction(async client=>{
  // Serialize first-use schema creation across serverless instances.
  await client.query('SELECT pg_advisory_xact_lock(725029113)');
  await client.query(schema);
 }).catch(error=>{state.soloReady=undefined;throw databaseError(error);});
 await state.soloReady;
}
export async function transaction<T>(fn:()=>Promise<T>):Promise<T>{
 if(context.getStore())return fn();
 await ready();
 return driver().transaction(async client=>{
  await client.query('SET LOCAL search_path TO solo2ceo');
  return context.run(client,fn);
 });
}
async function query(sql:string,values:unknown[]){
 let index=0;const text=sql.replace(/\?/g,()=>`$${++index}`);
 const execute=async()=>{
  const result=await context.getStore()!.query(text,values).catch(error=>{throw databaseError(error);});
  // PostgreSQL returns BIGINT timestamps as strings; the public contract uses numbers.
  return result.rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[
   key,['created_at','expires_at','starts_at','verified_at','sequence'].includes(key)&&value!==null?Number(value):value
  ])));
 };
 return context.getStore()?execute():transaction(execute);
}
export function db(){return {
 prepare(sql:string){return {
  async get(...values:unknown[]){return (await query(sql,values))[0];},
  all(...values:unknown[]){return query(sql,values);},
  async run(...values:unknown[]){await query(sql,values);}
 };},
 async close(){await driver().close();state.soloPool=undefined;state.soloReady=undefined;}
};}
