import { PGlite } from '@electric-sql/pglite';
Object.assign(process.env,{NODE_ENV:'test'});
const database=new PGlite();
const wrap=(client:any)=>({async query(sql:string,values:unknown[]=[]){
 if(sql.includes('CREATE SCHEMA')){await client.exec(sql);return {rows:[]};}
 return client.query(sql,values);
}});
(globalThis as any).soloTestDriver={...wrap(database),
 transaction:(fn:any)=>database.transaction((client)=>fn(wrap(client))),
 close:()=>database.close()
};

