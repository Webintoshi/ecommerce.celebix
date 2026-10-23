import type {Pool} from 'pg';
import type {CartIdentityBinding} from './runtime.ts';

export async function bindStorefrontCartIdentity(pool: Pick<Pool,'connect'>,input: CartIdentityBinding):Promise<unknown> {
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE celebix_saas_host_resolver');
    await client.query("SET LOCAL statement_timeout='5000ms'");
    await client.query("SET LOCAL lock_timeout='2000ms'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='5000ms'");
    const result=await client.query({text:'SELECT outcome FROM saas.public_account_cart_bind($1::text,$2::timestamptz,$3::jsonb,$4::jsonb)',values:[input.hostname,input.now,JSON.stringify(input.accountCandidates),JSON.stringify(input.cartCandidates)]});
    if(result.rowCount!==1||result.rows.length!==1||Object.keys(result.rows[0]).join(',')!=='outcome'||typeof result.rows[0].outcome!=='string')throw Error();
    await client.query('COMMIT');
    return result.rows[0].outcome;
  }catch{
    await client.query('ROLLBACK').catch(()=>undefined);
    // A lost commit response must never cause an automatic mutation replay.
    throw Error('cart_identity_binding_unavailable');
  }finally{client.release();}
}
