import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';

// Source assembly only. Never connects to a database or deploys an application.
const output=process.argv[2];
if(!output||process.argv.length!==3)throw Error('Usage: node build-native253-stage.mjs <new-output.sql>');
const up=readFileSync(path.join(import.meta.dirname,'202610180253_native_marketing_support_link.up.sql'),'utf8');
const sha=createHash('sha256').update(up).digest('hex');
const EXPECTED_UP_SHA='459fd07dabba4e481a34230657968c1531d404ef2b1f3661fb1a5942a6dd3d5f';
if(sha!==EXPECTED_UP_SHA)throw Error('NATIVE253_SOURCE_FILE_DRIFT');
const begin=up.indexOf('\nBEGIN;\n'),end=up.lastIndexOf('\nCOMMIT;');
if(begin<0||end<=begin||up.slice(end+8).trim()!=='')throw Error('NATIVE253_TRANSACTION_SHAPE');
const body=up.slice(begin+8,end);
const functionsSnapshot=name=>`CREATE TEMP TABLE ${name} ON COMMIT DROP AS
 SELECT p.oid,p.oid::regprocedure::text signature,to_jsonb(p) catalog,pg_get_functiondef(p.oid) definition
 FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace;`;
const schemaSnapshot=name=>`CREATE TEMP TABLE ${name} ON COMMIT DROP AS
 SELECT c.oid,jsonb_build_object(
 'class',to_jsonb(c)-ARRAY['relpages','reltuples','relallvisible','relfrozenxid','relminmxid'],
 'attributes',(SELECT coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum),'[]') FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_array(k.oid,k.conname,pg_get_constraintdef(k.oid),k.convalidated) ORDER BY k.oid),'[]') FROM pg_constraint k WHERE k.conrelid=c.oid),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_array(t.oid,pg_get_triggerdef(t.oid),t.tgenabled) ORDER BY t.oid),'[]') FROM pg_trigger t WHERE t.tgrelid=c.oid),
 'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]') FROM pg_policy p WHERE p.polrelid=c.oid),
 'index',CASE WHEN c.relkind IN('i','I') THEN pg_get_indexdef(c.oid) END,
 'view',CASE WHEN c.relkind IN('v','m') THEN pg_get_viewdef(c.oid,true) END) authority
 FROM pg_class c WHERE c.relnamespace='saas'::regnamespace;`;
const sql=`-- Root-only native253 correction. Assembly source SHA256: ${sha}
-- Root must first accept all four sealed252 targets and control verification.
-- Runtime source remains 5256aae9b6bd1e6e58aa8246eea3c6a4755f3288.
-- No queue operation, data rewrite, automatic replay or automatic rollback.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));
DO $pre$ BEGIN
 IF current_database()<>'celebix_saas_staging_auth01' OR current_setting('celebix.deployment_tier',true) IS DISTINCT FROM 'isolated_staging' OR pg_is_in_recovery() THEN RAISE EXCEPTION 'NATIVE253_DATABASE_AUTHORITY';END IF;
 IF(SELECT count(*) FROM pg_proc WHERE pronamespace='saas'::regnamespace)<>1916 THEN RAISE EXCEPTION 'NATIVE253_EXPECTED1916_FUNCTIONS';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='celebix_saas_owner' AND rolbypassrls AND NOT rolsuper) THEN RAISE EXCEPTION 'NATIVE253_OWNER_AUTHORITY';END IF;
END $pre$;
${functionsSnapshot('_n253_before_functions')}
${schemaSnapshot('_n253_before_schema')}
-- native253 reviewed source begins
${body}
-- native253 reviewed source ends
${functionsSnapshot('_n253_after_functions')}
${schemaSnapshot('_n253_after_schema')}
DO $post$ DECLARE target oid:=to_regprocedure('saas.native_marketing_branding(uuid,timestamptz)');BEGIN
 IF(SELECT count(*) FROM _n253_after_functions)<>1916 OR(SELECT count(*) FROM _n253_before_functions WHERE oid<>target)<>1915 THEN RAISE EXCEPTION 'NATIVE253_FUNCTION_SCOPE';END IF;
 IF EXISTS(SELECT 1 FROM _n253_before_functions b FULL JOIN _n253_after_functions a USING(oid)
  WHERE coalesce(b.oid,a.oid)<>target AND(to_jsonb(b) IS DISTINCT FROM to_jsonb(a))) THEN RAISE EXCEPTION 'NATIVE253_OTHER1915_FUNCTIONS_CHANGED';END IF;
 IF(SELECT catalog-'prosrc' FROM _n253_before_functions WHERE oid=target) IS DISTINCT FROM(SELECT catalog-'prosrc' FROM _n253_after_functions WHERE oid=target) THEN RAISE EXCEPTION 'NATIVE253_TARGET_AUTHORITY_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM _n253_before_schema b FULL JOIN _n253_after_schema a USING(oid) WHERE to_jsonb(b) IS DISTINCT FROM to_jsonb(a)) THEN RAISE EXCEPTION 'NATIVE253_SCHEMA_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM pg_stat_xact_user_tables WHERE schemaname='saas' AND(n_tup_ins<>0 OR n_tup_upd<>0 OR n_tup_del<>0)) THEN RAISE EXCEPTION 'NATIVE253_DATA_WRITE_DETECTED';END IF;
END $post$;
SELECT jsonb_build_object('kind','native253StageAcknowledgement','correction','published_contact_support_url','runtimeSource','5256aae9b6bd1e6e58aa8246eea3c6a4755f3288','sourceSha256','${sha}','functionSha256','686c8b97440f8272daa8e0336571bf8f9cc2a5ac2bea026c51b98c73735c6803','functionsChanged',1,'otherFunctionsPreserved',1915,'schemaChanges',0,'dataWrites',0,'automaticReplay',false);
COMMIT;
`;
writeFileSync(path.resolve(output),sql,{encoding:'utf8',mode:0o600,flag:'wx'});
console.log(JSON.stringify({kind:'native253StageSourcePrepared',output:path.resolve(output),sourceSha256:sha,stageSha256:createHash('sha256').update(sql).digest('hex'),databaseConnections:0}));
