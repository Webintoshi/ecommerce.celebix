import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { assertSafeEnvironment } from '../../saas-phase2/postgres/disposable-harness.mjs';
const ROOT=path.resolve(import.meta.dirname,'../../..');
const SQL=path.join(ROOT,'apps/owner/scripts/sql/saas');
const BIN=path.join(homedir(),'.codex/tmp/postgresql-16.14-install/bin');
export function startAccountingFixture(through=184){
 assertSafeEnvironment();const temporary=mkdtempSync('/tmp/celebix-accounting-ledger-'),socket=path.join(temporary,'socket'),data=path.join(temporary,'data'),port=20000+Math.floor(Math.random()*10000);mkdirSync(socket,{mode:0o700});
 const command=(name,args,input='',allowFailure=false)=>{const r=spawnSync(path.join(BIN,name),args,{cwd:ROOT,input,encoding:'utf8',maxBuffer:32*1024*1024,env:{PATH:process.env.PATH,LC_ALL:'C',LANG:'C'}});if(r.error)throw r.error;if(!allowFailure&&r.status!==0)throw new Error(`${name}: ${r.stderr}`);return r;};
 command('initdb',['-D',data,'--auth=trust','--username=postgres','--no-locale','--encoding=UTF8']);command('pg_ctl',['-D',data,'-o',`-k ${socket} -p ${port} -h ''`,'-l',path.join(temporary,'postgres.log'),'start']);
 const sql=(source,allowFailure=false)=>command('psql',['-h',socket,'-p',String(port),'-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],source,allowFailure);
 const value=source=>sql(source).stdout.trim();const apply=file=>sql(readFileSync(path.join(SQL,file),'utf8'));const stop=()=>{command('pg_ctl',['-D',data,'-m','fast','stop'],'',true);rmSync(temporary,{recursive:true,force:true});};
 try{assert.match(value('SHOW server_version;'),/^16\./);const migrations=readdirSync(SQL).filter(file=>/^\d{12}/.test(file)&&Number(file.slice(8,12))<=through&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(file)&&!file.includes('seed_guzide_pilot_admin_domain')).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b));
 for(const file of migrations){if(file==='202609230148_celebix_net_staging_starter_storefront.up.sql')sql("INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('10000000-0000-4000-8000-000000000148','Butik Siora','butik-siora','active','tr','TRY','hemenaku','2026-01-01','2026-01-01');INSERT INTO saas.domains(id,store_id,normalized_hostname,domain_type,status,canonical,cache_version,created_at,updated_at) VALUES('50000000-0000-4000-8000-000000000148','10000000-0000-4000-8000-000000000148','butik-siora.saas-staging.celebix.net','platform_subdomain','active',true,1,'2026-01-01','2026-01-01');");if(file==='202609260161_order_number_series.up.sql'){const numbering=readFileSync(path.join(SQL,file),'utf8'),anchor=') AS predecessors(signature,expected_hash,expected_owner,expected_acl,insert_anchor,updated_insert,allocation_statement,target_variable,add_variable,pos_sale) LOOP';assert.equal(numbering.split(anchor).length,2,'SQL161 manifest anchor drift');
// The repository bootstrap omits these two live legacy WEB functions. Preserve
// every available predecessor hash/ACL check, including the actual POS patch.
const signatures=[...numbering.matchAll(/\('(saas\.[^']+)',\s*'[a-f0-9]{64}'/g)].map(match=>match[1]);assert.equal(signatures.length,10,'SQL161 predecessor manifest cardinality drift');
const missing=JSON.parse(value("SELECT coalesce(jsonb_agg(signature ORDER BY signature),'[]'::jsonb) FROM unnest(ARRAY["+signatures.map(signature=>"'"+signature.replaceAll("'","''")+"'").join(',')+"]) signature WHERE to_regprocedure(signature) IS NULL;"));
assert.deepEqual(missing,['saas.storefront_checkout_payment_attempt_terminal()','saas.storefront_checkout_submit_builtin(text,text,bigint,uuid,text,text,uuid,timestamp with time zone)'],'unexpected missing SQL161 predecessor');
sql(numbering.replace(anchor,anchor.replace(' LOOP'," WHERE to_regprocedure(signature) IS NOT NULL LOOP")));}else if(file==='202610040214_platform_payment_preflight_compatibility.up.sql'){
const compatibility=readFileSync(path.join(SQL,file),'utf8'),anchor="FOR item IN SELECT value FROM jsonb_array_elements(manifest->'protected') LOOP";
assert.equal(compatibility.split(anchor).length,2,'SQL214 protected manifest anchor drift');
const manifest=JSON.parse(compatibility.split('$manifest$')[1]),signatures=manifest.protected.map(row=>row.signature);
assert.equal(signatures.length,12,'SQL214 protected manifest cardinality drift');
const missing=JSON.parse(value("SELECT coalesce(jsonb_agg(signature ORDER BY signature),'[]'::jsonb) FROM unnest(ARRAY["+signatures.map(signature=>"'"+signature.replaceAll("'","''")+"'").join(',')+"]) signature WHERE to_regprocedure(signature) IS NULL;"));
// The same omitted legacy WEB function from SQL161 remains absent in a fresh
// repository fixture. All eleven available protected proofs and all validator
// transformations remain exact; live SQL214 is never changed by this harness.
assert.deepEqual(missing,['saas.storefront_checkout_submit_builtin(text,text,bigint,uuid,text,text,uuid,timestamp with time zone)'],'unexpected missing SQL214 predecessor');
sql(compatibility.replace(anchor,anchor.replace(' LOOP'," WHERE to_regprocedure(value->>'signature') IS NOT NULL LOOP")));
}else if(!file.includes('seed_guzide_pilot_admin_domain'))apply(file);}
 return {socket,port,sql,value,apply,stop,connection:{host:socket,port,user:'postgres',database:'postgres'}};
 }catch(error){stop();throw error;}
}
