import pg from 'pg';
import type {PostgresPoolLike} from '@celebix/saas-data';
import {createOwnerStagingDatabasePoolConfig,type OwnerStagingAuthConfig} from '../self-serve-auth-authority/config.ts';
import {createLoyaltyWorker} from './worker.ts';
type Pool=PostgresPoolLike&Readonly<{end():Promise<void>}>;
export type LoyaltyProductionDependencies=Readonly<{createPool(config:pg.PoolConfig):Pool;now():Date}>;
const defaults:LoyaltyProductionDependencies={createPool(config){const pool=new pg.Pool(config);pool.on('error',()=>undefined);return pool;},now:()=>new Date()};
export async function initializeLoyaltyProductionRuntime(database:OwnerStagingAuthConfig['database'],dependencies:LoyaltyProductionDependencies=defaults){
 const pool=dependencies.createPool({...createOwnerStagingDatabasePoolConfig(database),max:2,connectionTimeoutMillis:2_000,idleTimeoutMillis:10_000,statement_timeout:15_000,lock_timeout:1_000,idle_in_transaction_session_timeout:15_000,application_name:'celebix-loyalty-worker'});
 try{
  const client=await pool.connect();try{
   await client.query('BEGIN READ ONLY');await client.query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true)",['5000ms','1000ms']);await client.query('SET LOCAL ROLE celebix_saas_workflow');
   const selected=await client.query(`SELECT current_setting('server_version_num')::integer/10000 AS major,current_database() AS database,current_user AS role,
    session.rolsuper AS superuser,pg_has_role(session_user,'celebix_saas_workflow','MEMBER') AS workflow_member,
    to_regprocedure('saas.loyalty_process_pending_v1(timestamp with time zone,integer)') IS NOT NULL
    AND to_regclass('saas.loyalty_pos_redemptions') IS NOT NULL
    AND to_regclass('saas.loyalty503_functions') IS NOT NULL
    AND to_regclass('saas.loyalty_checkout_authorizations') IS NOT NULL
    AND to_regclass('saas.loyalty_order_members') IS NOT NULL
    AND to_regclass('saas.loyalty504_functions') IS NOT NULL
    AND to_regprocedure('saas.loyalty504_captured_group_v1(uuid,uuid,uuid,timestamp with time zone)') IS NOT NULL
    AND to_regprocedure('saas.loyalty_pos_projection_v1(uuid,uuid,jsonb)') IS NOT NULL
    AND EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('saas.in_store_staff_grants')AND attname='can_manage_loyalty'AND NOT attisdropped)
    AND has_function_privilege(current_user,'saas.loyalty_process_pending_v1(timestamp with time zone,integer)','EXECUTE') AS loyalty_lifecycle
    FROM pg_catalog.pg_roles session WHERE session.rolname=session_user`);
   const row=selected.rows[0];if(selected.rowCount!==1||!row||row.major!==16||row.database!==database.name||row.role!=='celebix_saas_workflow'||row.superuser!==false||row.workflow_member!==true||row.loyalty_lifecycle!==true)throw new Error('loyalty_production_preflight_failed');
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();}
  const worker=createLoyaltyWorker({pool,now:dependencies.now});return Object.freeze({runOnce:worker.runOnce,close:()=>pool.end()});
 }catch(error){await pool.end().catch(()=>undefined);throw error;}
}
