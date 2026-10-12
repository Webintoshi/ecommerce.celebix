import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

// Exact committed forward history. These fixture-only compatibility exceptions
// mirror accounting-ledger/fixture.mjs; no deployed SQL source is rewritten.
export function applyBaseline(sql,dir){
 const manifest=JSON.parse(readFileSync(new URL('./baseline-manifest.json',import.meta.url),'utf8'));
 const actual=readdirSync(dir).filter(f=>/^\d{12}/.test(f)&&Number(f.slice(8,12))<=227&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b));
 assert.deepEqual(actual,manifest.artifacts.map(a=>a.file),'forward migration inventory drift');
 assert.equal(actual.length,manifest.forwardArtifactCount);
 const missingSignatures=signatures=>JSON.parse(sql("SELECT coalesce(jsonb_agg(signature ORDER BY signature),'[]'::jsonb) FROM unnest(ARRAY["+signatures.map(s=>"'"+s.replaceAll("'","''")+"'").join(',')+"]) signature WHERE to_regprocedure(signature) IS NULL"));
 const omissions=[];
 for(const artifact of manifest.artifacts){
  const file=artifact.file;let source=readFileSync(path.join(dir,file),'utf8');
  assert.equal(createHash('sha256').update(source).digest('hex'),artifact.sha256,`${file} checksum drift`);
  if(file==='202607300073_seed_guzide_pilot_admin_domain.up.sql')sql("INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('10000000-0000-4000-8000-000000000073','Isolated seed prerequisite','guzide-kuyumcu-4','active','tr','TRY','starter',now(),now());");
  if(file==='202609230148_celebix_net_staging_starter_storefront.up.sql')sql("INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('10000000-0000-4000-8000-000000000148','Butik Siora','butik-siora','active','tr','TRY','hemenaku','2026-01-01','2026-01-01');INSERT INTO saas.domains(id,store_id,normalized_hostname,domain_type,status,canonical,cache_version,created_at,updated_at) VALUES('50000000-0000-4000-8000-000000000148','10000000-0000-4000-8000-000000000148','butik-siora.saas-staging.celebix.net','platform_subdomain','active',true,1,'2026-01-01','2026-01-01');");
  if(file==='202609260161_order_number_series.up.sql'){
   const anchor=') AS predecessors(signature,expected_hash,expected_owner,expected_acl,insert_anchor,updated_insert,allocation_statement,target_variable,add_variable,pos_sale) LOOP';
   assert.equal(source.split(anchor).length,2);
   const signatures=[...source.matchAll(/\('(saas\.[^']+)',\s*'[a-f0-9]{64}'/g)].map(m=>m[1]);assert.equal(signatures.length,10);
   const missing=missingSignatures(signatures);assert.deepEqual(missing,['saas.storefront_checkout_payment_attempt_terminal()','saas.storefront_checkout_submit_builtin(text,text,bigint,uuid,text,text,uuid,timestamp with time zone)']);
   omissions.push({file,missing});source=source.replace(anchor,anchor.replace(' LOOP',' WHERE to_regprocedure(signature) IS NOT NULL LOOP'));
  }
  if(file==='202610040214_platform_payment_preflight_compatibility.up.sql'){
   const anchor="FOR item IN SELECT value FROM jsonb_array_elements(manifest->'protected') LOOP";assert.equal(source.split(anchor).length,2);
   const signatures=JSON.parse(source.split('$manifest$')[1]).protected.map(r=>r.signature);assert.equal(signatures.length,12);
   const missing=missingSignatures(signatures);assert.deepEqual(missing,['saas.storefront_checkout_submit_builtin(text,text,bigint,uuid,text,text,uuid,timestamp with time zone)']);
   omissions.push({file,missing});source=source.replace(anchor,anchor.replace(' LOOP'," WHERE to_regprocedure(value->>'signature') IS NOT NULL LOOP"));
  }
  try{sql(source);}catch(error){throw new Error(`Baseline ${file} failed`,{cause:error});}
 }
 const catalog=JSON.parse(sql("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'config',p.proconfig,'securityDefiner',p.prosecdef)) FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace"));
 assert.equal(Object.keys(catalog).length,manifest.expectedFunctionCount,'full baseline function count drift');
 assert.deepEqual(missingSignatures(['saas.admin_login_security_command(text,jsonb)']),['saas.admin_login_security_command(text,jsonb)']);
 return {forwardArtifactCount:actual.length,functionCount:Object.keys(catalog).length,omissions,catalog};
}
