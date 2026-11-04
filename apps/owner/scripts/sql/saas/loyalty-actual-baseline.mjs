import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {isDeepStrictEqual}from'node:util';
import {applyBaseline} from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';
const lit=value=>`'${String(value).replaceAll("'","''")}'`,ident=value=>`"${String(value).replaceAll('"','""')}"`,digest=value=>createHash('sha256').update(value).digest('hex');
function readBound(file){assert.ok(file&&path.isAbsolute(file.path)&&/^[a-f0-9]{64}$/.test(file.sha256),'actual_baseline_file_binding_required');const bytes=readFileSync(file.path);assert.equal(digest(bytes),file.sha256,'actual_baseline_file_changed');return bytes.toString('utf8');}
function acl(value){if(value===null)return null;assert.ok(typeof value==='string'||Array.isArray(value));return Array.isArray(value)?`ARRAY[${value.map(lit).join(',')}]::aclitem[]`:`${lit(value)}::aclitem[]`;}
function grants(kind,target,value){const selected=acl(value);if(selected===null)return'';return`REVOKE ALL ON ${kind} ${target} FROM PUBLIC;DO $acl$DECLARE r record;BEGIN FOR r IN SELECT *FROM aclexplode(${selected})LOOP EXECUTE 'GRANT '||r.privilege_type||' ON ${kind} ${target} TO '||CASE WHEN r.grantee=0 THEN 'PUBLIC'ELSE quote_ident(pg_get_userbyid(r.grantee))END||CASE WHEN r.is_grantable THEN ' WITH GRANT OPTION'ELSE ''END;END LOOP;END $acl$;`;}
function syntheticStatic(dir){
 const box=startDisposablePostgres({database:'loyalty_source_static'});try{
  applyBaseline(box.sql,dir);for(const f of readdirSync(dir).filter(f=>/^\d{12}/.test(f)&&Number(f.slice(8,12))>227&&Number(f.slice(8,12))<=501&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))box.sql(readFileSync(path.join(dir,f),'utf8'));
  const plan='00000000-0000-4000-8000-000000000010',rows={};
  for(const table of['plans','plan_features','plan_limits','platform_plan_prices','commercial_plan_policies'])rows[table]=JSON.parse(box.sql(`SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)FROM saas.${table} r WHERE ${table==='plans'?'id':'plan_id'}='${plan}'`));
  rows.merchant_provider_definitions=JSON.parse(box.sql("SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)FROM saas.merchant_provider_definitions r WHERE provider_code IN('paytr_iframe','akbank_json','iyzico_iframe')"));
  for(const table of['accounting_release_state','commercial_package_release_state','commercial248_release_state','product_tax_release'])rows[table]=JSON.parse(box.sql(`SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)FROM saas.${table} r`));
  assert.equal(rows.plans.length,1);return rows;
 }finally{box.stop();}
}
function seedStatic(sql,rows){
 const insert=(table,row)=>{const available=JSON.parse(sql(`SELECT jsonb_agg(attname)FROM pg_attribute WHERE attrelid='saas.${table}'::regclass AND attnum>0 AND NOT attisdropped AND attgenerated=''`)),columns=Object.keys(row).filter(k=>available.includes(k));return`INSERT INTO saas.${table}(${columns.map(ident).join(',')})SELECT ${columns.map(k=>`r.${ident(k)}`).join(',')}FROM jsonb_populate_record(NULL::saas.${table},${lit(JSON.stringify(row))}::jsonb)r;`;};
 let source='BEGIN;';source+=rows.plans.map(r=>insert('plans',r)).join('');for(const row of rows.plans)source+=`INSERT INTO saas.platform_plan_publications(plan_id,transaction_id)VALUES('${row.id}',txid_current());`;
 for(const[table,values]of Object.entries(rows))if(table!=='plans')source+=values.map(r=>insert(table,r)).join('');source+='DELETE FROM saas.platform_plan_publications;COMMIT;';sql(source);
}
export function actualBaselineOptions(argv=process.argv.slice(2)){
 const i=argv.indexOf('--actual-baseline'),j=argv.indexOf('--actual-baseline-sha');if(i===-1&&j===-1)return null;assert.ok(i>=0&&j>=0&&argv[i+1]&&/^[a-f0-9]{64}$/.test(argv[j+1]??''),'actual_baseline_explicit_admission_and_hash_required');return{path:path.resolve(argv[i+1]),sha256:argv[j+1]};
}
export function applyAdmittedActualBaseline(pg,dir,options){
 const manifest=JSON.parse(readBound(options));assert.equal(manifest.rootReviewed,true);assert.equal(manifest.restoreNotAuthorized,false);assert.equal(manifest.isolatedRestoreOnly,true);assert.equal(manifest.customerDataIncluded,false);assert.equal(manifest.passwordsIncluded,false);
 const schema=readBound(manifest.files.schema),metadata=JSON.parse(readBound(manifest.files.rolesAndMetadata)),catalog=JSON.parse(readBound(manifest.files.nativeCatalog));
 assert.match(pg.socket,/^\/.*\/cspg-[^/]+\/s$/);assert.equal(pg.sql("SELECT current_setting('data_directory')||':'||current_setting('listen_addresses')||':'||current_setting('unix_socket_directories')"),`${pg.data}::${pg.socket}`);assert.equal(pg.sql("SELECT current_setting('server_version_num')::integer/10000||':'||coalesce(inet_server_addr()::text,'socket')||':'||current_database()"),`16:socket:${pg.database}`);assert.equal(pg.sql("SELECT count(*)FROM pg_namespace WHERE nspname='saas'"),'0');
 assert.equal(Object.keys(catalog.catalog).length,2098);assert.deepEqual(metadata.extensions.map(x=>`${x.name}:${x.version}`).sort(),['pg_trgm:1.6','plpgsql:1.0']);assert.deepEqual(metadata.externalRelations,[]);
 const bypass=manifest.sourceNoLoginBypassRlsRoles??[];assert.ok(Array.isArray(bypass)&&bypass.every(name=>['celebix_saas_owner','celebix_saas_bootstrap'].includes(name)&&metadata.roles.some(r=>r.name===name&&r.bypassRls===true)));
 const roles=metadata.roles.filter(r=>r.name!=='postgres');assert.equal(roles.length,20);for(const r of roles){assert.match(r.name,/^[a-z][a-z0-9_]{0,62}$/);pg.sql(`CREATE ROLE ${ident(r.name)} NOLOGIN NOSUPERUSER ${bypass.includes(r.name)?'BYPASSRLS':'NOBYPASSRLS'} NOCREATEDB NOCREATEROLE NOREPLICATION ${r.inherit?'INHERIT':'NOINHERIT'};`);}
 for(const r of metadata.memberships){assert.ok(metadata.roles.some(x=>x.name===r.role)&&metadata.roles.some(x=>x.name===r.member));pg.sql(`GRANT ${ident(r.role)} TO ${ident(r.member)}${r.admin?' WITH ADMIN OPTION':''};`);}
 const anchor='CREATE SCHEMA saas;';assert.equal(schema.split(anchor).length,2);const extension=`${anchor}ALTER SCHEMA saas OWNER TO celebix_saas_owner;GRANT CREATE ON DATABASE ${ident(pg.database)} TO celebix_saas_owner;SET ROLE celebix_saas_owner;CREATE EXTENSION pg_trgm WITH SCHEMA saas VERSION '1.6';RESET ROLE;REVOKE CREATE ON DATABASE ${ident(pg.database)} FROM celebix_saas_owner;`;
 pg.sql(schema.replace(anchor,extension));
 let authority=`BEGIN;ALTER SCHEMA saas OWNER TO ${ident(metadata.schemaMetadata.owner)};${grants('SCHEMA','saas',metadata.schemaMetadata.acl)}`;
 for(const[signature,r]of Object.entries(catalog.catalog)){assert.ok(signature.startsWith('saas.')&&!/[;\n]/.test(signature));authority+=`ALTER FUNCTION ${signature}OWNER TO ${ident(r.owner)};${grants('FUNCTION',signature,r.acl)}`;}
 for(const[name,r]of Object.entries(metadata.relationAuthority)){const relation=catalog.relations[name];assert.ok(relation,`actual_relation_metadata_missing:${name}`);if(['i','I'].includes(relation.kind))continue;const target=`saas.${ident(name)}`,kind=relation.kind==='S'?'SEQUENCE':relation.kind==='v'?'VIEW':relation.kind==='m'?'MATERIALIZED VIEW':'TABLE';authority+=`ALTER ${kind} ${target}OWNER TO ${ident(r.owner)};${grants(relation.kind==='S'?'SEQUENCE':'TABLE',target,r.acl)}`;}
 authority+='COMMIT;';pg.sql(authority);
 assert.equal(pg.sql("SELECT count(*)FROM pg_proc WHERE pronamespace='saas'::regnamespace"),'2098');
 const actual=JSON.parse(pg.sql("SET search_path=pg_catalog;SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile))FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace"));const changed=Object.keys(catalog.catalog).filter(signature=>!isDeepStrictEqual(actual[signature],catalog.catalog[signature]));assert.equal(changed.length,0,'actual_predecessor_function_authority_mismatch:'+JSON.stringify(changed.slice(0,20)));
 const relations=JSON.parse(pg.sql("SELECT jsonb_object_agg(c.relname,jsonb_build_object('owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text))FROM pg_class c WHERE c.relnamespace='saas'::regnamespace")),changedRelations=Object.keys(metadata.relationAuthority).filter(name=>!isDeepStrictEqual(relations[name],metadata.relationAuthority[name]));assert.equal(changedRelations.length,0,'actual_relation_authority_mismatch:'+JSON.stringify(changedRelations.slice(0,20)));
 assert.equal(pg.sql("SELECT nspacl::text FROM pg_namespace WHERE nspname='saas'"),metadata.schemaMetadata.acl,'actual_schema_acl_mismatch');
 seedStatic(pg.sql,syntheticStatic(dir));
 if(manifest.cloneNonSecretExecutionAuthorities===true)for(const row of catalog.executionAuthorities){const columns=Object.keys(row);pg.sql(`INSERT INTO saas.merchant_provider_execution_authorities(${columns.map(ident).join(',')})SELECT ${columns.map(k=>`r.${ident(k)}`).join(',')}FROM jsonb_populate_record(NULL::saas.merchant_provider_execution_authorities,${lit(JSON.stringify(row))}::jsonb)r`);}
 return{manifestSha256:options.sha256,schemaSha256:manifest.files.schema.sha256,routineCount:2098,sourceRoleCount:20,sourceLoginsCloned:0,customerRowsCloned:0,isolatedBypassRoles:bypass};
}
