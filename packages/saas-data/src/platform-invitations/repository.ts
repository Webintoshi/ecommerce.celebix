import {acquirePostgresClient,type PostgresPoolLike} from '../postgres/pool.ts';
export class InvitationRepositoryError extends Error{constructor(readonly code:string){super(code);}}
export class PostgresInvitationRepository{
 constructor(private readonly pool:PostgresPoolLike){}
 async execute(name:'start'|'claim'|'complete',values:unknown[]):Promise<Record<string,unknown>>{
  const signatures={start:'$1::uuid,$2::text,$3::text,$4::text,$5::text,$6::jsonb,$7::timestamptz',claim:'$1::text,$2::text',complete:'$1::uuid,$2::text,$3::text,$4::text,$5::boolean'};
  const client=await acquirePostgresClient(this.pool,2000);let began=false,terminal=false;
  try{await client.query('BEGIN');began=true;await client.query("SET LOCAL statement_timeout='5s'");await client.query("SET LOCAL lock_timeout='3s'");await client.query("SET LOCAL idle_in_transaction_session_timeout='5s'");await client.query('SET LOCAL ROLE celebix_saas_identity');
   const result=await client.query(`SELECT saas.platform_invitation_${name}(${signatures[name]}) AS result`,values);const body=result.rows[0]?.result;if(result.rows.length!==1||!body||typeof body!=='object')throw new InvitationRepositoryError('invitation_unavailable');
   try{await client.query('COMMIT');terminal=true;client.release();}catch{terminal=true;client.release(true);throw new InvitationRepositoryError('commit_unknown');}return body as Record<string,unknown>;
  }catch(error){if(began&&!terminal){try{await client.query('ROLLBACK');client.release();}catch{client.release(true);}}else if(!terminal)client.release(true);if(error instanceof InvitationRepositoryError)throw error;const code=(error as Error)?.message;if(['invitation_denied','verified_identity_required','invitation_callback_consumed','invitation_rate_limited','admin_host_unverified','membership_denied','staff_limit_reached','operator_denied'].includes(code))throw new InvitationRepositoryError(code);throw new InvitationRepositoryError('invitation_unavailable');}
 }
}
