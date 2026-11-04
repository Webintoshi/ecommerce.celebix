import {loyaltyExact,loyaltyInteger} from '@celebix/saas-contracts';
import type {PostgresPoolLike,PostgresClientLike} from '@celebix/saas-data';
import {acquirePostgresClient} from '../../../../packages/saas-data/src/postgres/pool.ts';
export type LoyaltyTick=Readonly<{processed:number;failed:number}>;
function invalid():never{throw new Error('loyalty_worker_invalid');}
export function loyaltyWorkerDelay(result:LoyaltyTick|null,failures:number):number{
 if(result===null||result.failed>0)return Math.min(300_000,5_000*2**Math.min(6,Math.max(0,failures)));
 return result.processed===0?30_000:5_000;
}
export function createLoyaltyWorker(options:Readonly<{pool:PostgresPoolLike;now():Date}>){
 if(typeof options.pool?.connect!=='function'||typeof options.now!=='function')invalid();let running=false;
 return Object.freeze({async runOnce():Promise<LoyaltyTick|null>{
  if(running)return null;running=true;let client:PostgresClientLike|undefined,began=false,terminal=false;
  try{
   const now=options.now();if(!(now instanceof Date)||!Number.isFinite(now.getTime()))invalid();
   client=await acquirePostgresClient(options.pool,2_000);await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');began=true;
   await client.query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true),set_config('idle_in_transaction_session_timeout',$3,true)",['15000ms','1000ms','15000ms']);
   await client.query('SET LOCAL ROLE celebix_saas_workflow');
   const selected=await client.query('SELECT saas.loyalty_process_pending_v1($1::timestamptz,$2::integer) AS result',[now,20]);
   let result:LoyaltyTick;try{if(selected.rowCount!==1||selected.rows.length!==1)invalid();const row=loyaltyExact(selected.rows[0],['result']),value=loyaltyExact(row.result,['processed','failed']);result=Object.freeze({processed:loyaltyInteger(value.processed,0,20),failed:loyaltyInteger(value.failed,0,20)});if(result.processed+result.failed>20)invalid();}catch{invalid();}
   try{await client.query('COMMIT');terminal=true;client.release();}catch{terminal=true;client.release(true);throw new Error('loyalty_worker_commit_unknown');}
   return result;
  }catch(error){if(client&&!terminal){let destroy=!began;if(began)try{await client.query('ROLLBACK');}catch{destroy=true;}try{client.release(destroy||undefined);}catch{/* Connection is terminal. */}}throw error;}
  finally{running=false;}
 }});
}
