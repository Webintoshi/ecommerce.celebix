#!/usr/bin/env node
import { X509Certificate, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
const DATABASE='celebix_saas_staging_auth01';
const PREFIXES=['202609170129_store_admin_invitations','202609170130_invitation_member_panel_sessions','202609170131_store_admin_invitation_manager'];
const FILES=Object.freeze(PREFIXES.flatMap(p=>[`${p}.up.sql`,`${p}_assertions.sql`]));
export function resolveInvitationMigrationConfiguration(source=process.env) {
  try {
    if(source.CELEBIX_DEPLOYMENT_TIER!=='staging'||source.CELEBIX_SAAS_AUTH_MODE!=='approved_staging'||source.CELEBIX_STAGING_MIGRATION_MODE!=='approved_staging'||source.CELEBIX_SAAS_DATABASE_NAME!==DATABASE) throw Error();
    const raw=source.CELEBIX_TOSHI_MIGRATION_DATABASE_URL, encoded=source.CELEBIX_STAGING_DB_CA_B64;
    if(typeof raw!=='string'||raw!==raw.trim()||typeof encoded!=='string'||encoded.length>32768) throw Error();
    const url=new URL(raw);
    if(!['postgres:','postgresql:'].includes(url.protocol)||!url.username||!url.password||!url.hostname||url.pathname!==`/${DATABASE}`||url.hash||url.searchParams.size!==1||!['require','verify-full'].includes(url.searchParams.get('sslmode'))) throw Error();
    const bytes=Buffer.from(encoded,'base64'); if(bytes.toString('base64')!==encoded) throw Error();
    const ca=bytes.toString('utf8'); new X509Certificate(ca); bytes.fill(0); url.search='';
    return Object.freeze({connectionString:url.toString(),ssl:Object.freeze({ca,rejectUnauthorized:true}),connectionTimeoutMillis:5000,statement_timeout:120000,lock_timeout:5000,idle_in_transaction_session_timeout:30000,application_name:'celebix-invitation-migration'});
  } catch { throw Error('invitation_migration_configuration_invalid'); }
}
function body(sql) { return sql.replace(/^\s*(?:BEGIN|COMMIT|ROLLBACK);\s*$/gm,''); }
function functions(sql) {
  const found=[];
  const pattern=/CREATE(?: OR REPLACE)? FUNCTION (saas\.[a-z_]+)\s*\(([\s\S]*?)\)[\s\S]*?AS (\$[a-zA-Z0-9_]*\$)([\s\S]*?)\3;/g;
  for(const match of sql.matchAll(pattern)) { const args=match[2].trim()?match[2].split(',').map(x=>x.trim().replace(/^\w+\s+/,'').replace(/\s+DEFAULT\s+[\s\S]*$/i,'')).join(','):''; found.push({signature:`${match[1]}(${args})`,hash:createHash('md5').update(match[4]).digest('hex')}); }
  return found;
}
export async function runInvitationMigrations({client,readSql,write=()=>{}}) {
  let began=false;
  try {
    const scripts=await Promise.all(FILES.map(async name=>({name,sql:await readSql(name)})));
    const manifest=scripts.filter(x=>x.name.endsWith('.up.sql')).flatMap(x=>functions(x.sql));
    if(manifest.length<20) throw Error('manifest');
    const prior=[...functions(await readSql(`${PREFIXES[1]}.down.sql`)),...functions(await readSql(`${PREFIXES[2]}.down.sql`))];
    if(prior.length!==3) throw Error('predecessor_manifest');
    await client.connect();
    const preflight=await client.query(`/* invitation_migration_preflight */ SELECT current_database() database_name,current_setting('server_version_num')::integer version_num,r.rolsuper is_superuser,pg_has_role(current_user,'celebix_saas_owner','MEMBER') owner_member,to_regclass('saas.store_domain_replacements') IS NOT NULL AND to_regprocedure('saas.resolve_panel_session(text,text,timestamptz)') IS NOT NULL AS predecessor FROM pg_roles r WHERE r.rolname=current_user`);
    const p=preflight.rows[0];
    if(preflight.rows.length!==1||p.database_name!==DATABASE||Math.floor(Number(p.version_num)/10000)!==16||p.is_superuser!==false||p.owner_member!==true||p.predecessor!==true) throw Error('preflight');
    await client.query('BEGIN'); began=true;
    await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'; SET LOCAL idle_in_transaction_session_timeout='30s'; SET LOCAL ROLE celebix_saas_owner");
    await client.query("SELECT pg_advisory_xact_lock(129,131)");
    const state=async()=>{
      const result=await client.query(`/* invitation_migration_state */ WITH expected AS (SELECT * FROM unnest($1::text[],$2::text[]) AS e(signature,hash)), old AS (SELECT * FROM unnest($3::text[],$4::text[]) AS e(signature,hash)), installed AS (SELECT count(*) total,count(*) FILTER(WHERE md5(p.prosrc)=e.hash) matches FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)), tables AS (SELECT count(*) n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='saas' AND c.relname IN('store_admin_invitations','store_admin_invitation_deliveries','store_admin_invitation_operations','store_admin_invitation_acceptance_grants','store_admin_invitation_events','store_admin_invitation_provider_events')) SELECT CASE WHEN (SELECT n FROM tables)=6 AND (SELECT matches=total FROM installed) THEN 'complete' WHEN (SELECT n FROM tables)=0 AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='saas' AND p.proname LIKE 'store_admin_invitation%') AND (SELECT count(*) FROM old e JOIN pg_proc p ON p.oid=to_regprocedure(e.signature) AND md5(p.prosrc)=e.hash)=3 AND to_regprocedure('saas.merchant_admin_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text)') IS NULL THEN 'absent' ELSE 'partial' END AS state`,[manifest.map(x=>x.signature),manifest.map(x=>x.hash),prior.map(x=>x.signature),prior.map(x=>x.hash)]);
      if(result.rows.length!==1) throw Error('state'); return result.rows[0].state;
    };
    const before=await state(); if(!['absent','complete'].includes(before)) throw Error('partial');
    for(const entry of scripts) if(before==='absent'||entry.name.endsWith('_assertions.sql')) await client.query(body(entry.sql));
    if(await state()!=='complete') throw Error('postflight');
    await client.query('COMMIT'); began=false;
    const result=before==='complete'?'already_complete':'applied'; write(`invitation_migrations_${result}`); return result;
  } catch { if(began) try { await client.query('ROLLBACK'); } catch {} throw Error('invitation_migration_failed'); }
  finally { await client.end().catch(()=>{}); }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(process.argv.length!==2) throw Error('arguments');
    const config=resolveInvitationMigrationConfiguration();
    await runInvitationMigrations({client:new pg.Client(config),readSql:async name=>{if(!FILES.includes(name)&&![`${PREFIXES[1]}.down.sql`,`${PREFIXES[2]}.down.sql`].includes(name)) throw Error('file');return readFile(new URL(`./sql/saas/${name}`,import.meta.url),'utf8');},write:line=>process.stdout.write(`${line}\n`)});
  } catch { process.stderr.write('invitation_migration_failed\n'); process.exitCode=1; }
}
