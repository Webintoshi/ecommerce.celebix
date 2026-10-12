import {acquirePostgresClient} from '../postgres/pool.ts';
import {parseAdminLoginSecurityCommand,parseAdminLoginInvalidationInput} from '../../../saas-contracts/src/admin-login-security/validation.ts';
import type {AdminLoginSecurityCommand,AdminLoginInvalidationInput} from '../../../saas-contracts/src/admin-login-security/types.ts';
import type {PostgresAdminLoginSecurityOptions} from './types.ts';
import {adminLoginSecurityResult} from './validation.ts';
export class PostgresAdminLoginSecurityRepository {
 readonly options:PostgresAdminLoginSecurityOptions;
 constructor(options:PostgresAdminLoginSecurityOptions){this.options=options;if(options.role!=='celebix_saas_identity')throw Error('admin_login_security_unavailable');}
 async command(command:AdminLoginSecurityCommand){const c=parseAdminLoginSecurityCommand(command);return execute(this.options,'celebix_saas_identity','SELECT outcome,authority FROM saas.admin_login_security_command($1::text,$2::jsonb)',[c.action,JSON.stringify(c.input)]);}
}
export function createPostgresAdminLoginSecurityRepository(options:PostgresAdminLoginSecurityOptions){return new PostgresAdminLoginSecurityRepository(options);}
export class PostgresAdminLoginInvalidationRepository {
 readonly options:Omit<PostgresAdminLoginSecurityOptions,'role'>&{role:'celebix_saas_workflow'};
 constructor(options:Omit<PostgresAdminLoginSecurityOptions,'role'>&{role:'celebix_saas_workflow'}){this.options=options;if(options.role!=='celebix_saas_workflow')throw Error('admin_login_security_unavailable');}
 async invalidate(input:AdminLoginInvalidationInput){return execute(this.options,'celebix_saas_workflow','SELECT outcome,authority FROM saas.admin_login_security_invalidate($1::jsonb)',[JSON.stringify(parseAdminLoginInvalidationInput(input))]);}
}
async function execute(options:Omit<PostgresAdminLoginSecurityOptions,'role'>,role:'celebix_saas_identity'|'celebix_saas_workflow',query:string,values:unknown[]){const client=await acquirePostgresClient(options.pool,options.timeouts.poolCheckoutMs);let released=false,committing=false;try{await client.query('BEGIN');for(const[name,ms]of [['statement_timeout',options.timeouts.statementMs],['lock_timeout',options.timeouts.lockMs],['idle_in_transaction_session_timeout',options.timeouts.idleTransactionMs]]as const){if(!Number.isSafeInteger(ms)||ms<1||ms>60000)throw Error();await client.query('SELECT pg_catalog.set_config($1,$2,true)',[name,`${ms}ms`]);}await client.query(`SET LOCAL ROLE ${role}`);const result=await client.query(query,values);if(result.rows.length!==1)throw Error();const parsed=adminLoginSecurityResult(result.rows[0]);committing=true;await client.query('COMMIT');client.release();released=true;return parsed;}catch{if(committing){client.release(true);released=true;throw Error('admin_login_security_commit_unknown');}try{await client.query('ROLLBACK');}catch{client.release(true);released=true;}throw Error('admin_login_security_unavailable');}finally{if(!released)client.release();}}
