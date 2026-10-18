import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';

// Source assembly only. Never connects to a database or deploys an application.
const output=process.argv[2],runtimeSource=process.argv[3];
if(!output||process.argv.length!==4||!/^[a-f0-9]{40}$/.test(runtimeSource??''))throw Error('Usage: node build-native254-stage.mjs <new-output.sql> <owner-reader-source-sha>');
const up=readFileSync(path.join(import.meta.dirname,'202610180254_native_marketing_builder.up.sql'),'utf8');
const sha=createHash('sha256').update(up).digest('hex');
const EXPECTED_UP_SHA='d3e454c7bd35537cd399f2b6f1a3c3c7a6d3db429ebf8b05aeef5d738334a571';
if(sha!==EXPECTED_UP_SHA)throw Error('NATIVE254_SOURCE_FILE_DRIFT');
const begin=up.indexOf('\nBEGIN;\n'),end=up.lastIndexOf('\nCOMMIT;');
if(begin<0||end<=begin||up.slice(end+8).trim()!=='')throw Error('NATIVE254_TRANSACTION_SHAPE');
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
const targets=["saas.native_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)", "saas.native_marketing_content_valid(jsonb)", "saas.native_marketing_projection(jsonb,jsonb,jsonb,text,text,boolean,boolean)", "saas.native_marketing_work_authorize(uuid,uuid,text,timestamp with time zone)"];
const expected=[{"acl":"{celebix_saas_owner=X/celebix_saas_owner}","owner":"celebix_saas_owner","config":["search_path=pg_catalog, saas"],"sha256":"b1bf273d2cbe12cd2b05f2658a0b00ef3c54e9e323c52403c521c46f31e80bef","strict":false,"parallel":"u","security":true,"signature":"saas.native_marketing_builder_block_images(uuid,jsonb)","volatility":"s"},{"acl":"{celebix_saas_owner=X/celebix_saas_owner}","owner":"celebix_saas_owner","config":["search_path=pg_catalog, saas"],"sha256":"2aa7f897e82e737ba25238df992f1a598f8e94a84eba451971d09c3b75eb83e8","strict":false,"parallel":"u","security":false,"signature":"saas.native_marketing_builder_block_valid(jsonb)","volatility":"i"},{"acl":"{celebix_saas_owner=X/celebix_saas_owner}","owner":"celebix_saas_owner","config":["search_path=pg_catalog, saas"],"sha256":"0abfeafd3b4a213409cf8097a9c2f0cc65be370bab36179e9e8d673a24b153f2","strict":false,"parallel":"u","security":false,"signature":"saas.native_marketing_builder_json_bytes(jsonb)","volatility":"i"},{"acl":"{celebix_saas_owner=X/celebix_saas_owner}","owner":"celebix_saas_owner","config":["search_path=pg_catalog, saas"],"sha256":"192d150f3e78e02ac0b86068c190f3cd219fbab6b8c1eda73dc9c5ff7c5a6ff0","strict":false,"parallel":"u","security":false,"signature":"saas.native_marketing_builder_path_valid(jsonb,boolean)","volatility":"i"},{"acl":"{celebix_saas_owner=X/celebix_saas_owner}","owner":"celebix_saas_owner","config":["search_path=pg_catalog, saas"],"sha256":"949c691dd45a78b956348140e53f540db38aadab2b69ea7297076269c685cd65","strict":false,"parallel":"u","security":false,"signature":"saas.native_marketing_builder_product_ids(jsonb)","volatility":"i"},{"acl":"{celebix_saas_owner=X/celebix_saas_owner}","owner":"celebix_saas_owner","config":["search_path=pg_catalog, saas"],"sha256":"528d7a655833d9370dad210d04a42661dcb72fa50a4fd76a86f4474e88ab7615","strict":false,"parallel":"u","security":false,"signature":"saas.native_marketing_builder_text_valid(jsonb,integer,boolean)","volatility":"i"},{"acl":"{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}","owner":"celebix_saas_owner","config":["search_path=pg_catalog, saas"],"sha256":"9d50b4c6049ce203e18c74cbe042cd04b8e15475f2ab4b8ab5b07b22d8ab0100","strict":false,"parallel":"u","security":true,"signature":"saas.native_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)","volatility":"v"},{"acl":"{celebix_saas_owner=X/celebix_saas_owner}","owner":"celebix_saas_owner","config":["search_path=pg_catalog, saas"],"sha256":"9b70374ffe947f8be06052f1f39244d3965ee78974f6e73af98e06daa01b058e","strict":false,"parallel":"u","security":false,"signature":"saas.native_marketing_content_valid(jsonb)","volatility":"i"},{"acl":"{celebix_saas_owner=X/celebix_saas_owner}","owner":"celebix_saas_owner","config":["search_path=pg_catalog, saas"],"sha256":"66fa582ca729aa8e0a1d1474b41b4793e521ea6ad69f387f53e284a28226f5b0","strict":false,"parallel":"u","security":false,"signature":"saas.native_marketing_projection(jsonb,jsonb,jsonb,text,text,boolean,boolean)","volatility":"i"},{"acl":"{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}","owner":"celebix_saas_owner","config":["search_path=pg_catalog, saas"],"sha256":"209114874ae9d3bb5c6af4f9b3ece72d1d023934250fcb6ed3ac61f2ae373474","strict":false,"parallel":"u","security":true,"signature":"saas.native_marketing_work_authorize(uuid,uuid,text,timestamp with time zone)","volatility":"v"}];
const sql=`-- Root-only native254. Assembly source SHA256: ${sha}
-- ROOT must verify BOTH owner runtimes serve source ${runtimeSource} before staging.
-- Then set session celebix.native254_readers_ready='owner_net_site' with recorded runtime proof.
-- No queue operation, data rewrite, automatic replay or automatic rollback.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));
DO $pre$ BEGIN
 IF current_database()<>'celebix_saas_staging_auth01' OR current_setting('celebix.deployment_tier',true) IS DISTINCT FROM 'isolated_staging' OR pg_is_in_recovery() THEN RAISE EXCEPTION 'NATIVE254_DATABASE_AUTHORITY';END IF;
 IF current_setting('celebix.native254_readers_ready',true) IS DISTINCT FROM 'owner_net_site' THEN RAISE EXCEPTION 'NATIVE254_OWNER_READERS_NOT_ACKNOWLEDGED';END IF;
 IF(SELECT encode(sha256(convert_to(string_agg(p.oid::regprocedure::text||':'||pg_get_functiondef(p.oid)||':'||coalesce(p.proacl::text,'')||':'||p.proowner::text,E'\\n' ORDER BY p.oid::regprocedure::text),'UTF8')),'hex') FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace)<>'6abef1d6d3b8ba24bb7f1b3a9a4b53e2fbdcfd5535930a00ff1ef6059a0b147b' THEN RAISE EXCEPTION 'NATIVE254_BASELINE1916_FINGERPRINT';END IF;
 IF(SELECT count(*) FROM pg_proc WHERE pronamespace='saas'::regnamespace)<>1916 THEN RAISE EXCEPTION 'NATIVE254_EXPECTED1916_FUNCTIONS';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='celebix_saas_owner' AND rolbypassrls AND NOT rolsuper) THEN RAISE EXCEPTION 'NATIVE254_OWNER_AUTHORITY';END IF;
END $pre$;
${functionsSnapshot('_n254_before_functions')}
${schemaSnapshot('_n254_before_schema')}
-- native254 reviewed source begins
${body}
-- native254 reviewed source ends
${functionsSnapshot('_n254_after_functions')}
${schemaSnapshot('_n254_after_schema')}
DO $post$ DECLARE changed text[]:=ARRAY[${targets.map(x=>`'${x}'`).join(',')}];f record;spec jsonb;BEGIN
 IF(SELECT count(*) FROM _n254_after_functions)<>1922 THEN RAISE EXCEPTION 'NATIVE254_FUNCTION_SCOPE';END IF;
 IF EXISTS(SELECT 1 FROM _n254_before_functions b LEFT JOIN _n254_after_functions a USING(oid) WHERE a.oid IS NULL OR (NOT b.signature=ANY(changed) AND to_jsonb(b) IS DISTINCT FROM to_jsonb(a))) THEN RAISE EXCEPTION 'NATIVE254_OTHER1912_FUNCTIONS_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM _n254_before_functions b JOIN _n254_after_functions a USING(oid) WHERE b.signature=ANY(changed) AND (b.catalog-'prosrc' IS DISTINCT FROM a.catalog-'prosrc')) THEN RAISE EXCEPTION 'NATIVE254_TARGET_AUTHORITY_CHANGED';END IF;
 FOR spec IN SELECT value FROM jsonb_array_elements('${JSON.stringify(expected)}'::jsonb) LOOP
 SELECT p.*,pg_get_functiondef(p.oid) definition INTO STRICT f FROM pg_proc p WHERE p.oid=(spec->>'signature')::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>spec->>'sha256' OR pg_get_userbyid(f.proowner)<>spec->>'owner' OR f.proacl::text IS DISTINCT FROM spec->>'acl' OR to_jsonb(f.proconfig) IS DISTINCT FROM spec->'config' OR to_jsonb(f.prosecdef) IS DISTINCT FROM spec->'security' OR f.provolatile::text<>spec->>'volatility' OR to_jsonb(f.proisstrict) IS DISTINCT FROM spec->'strict' OR f.proparallel::text<>spec->>'parallel' THEN RAISE EXCEPTION 'NATIVE254_EXPECTED_FUNCTION_DRIFT %',spec->>'signature';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM _n254_after_functions a LEFT JOIN _n254_before_functions b USING(oid) WHERE b.oid IS NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements('${JSON.stringify(expected)}'::jsonb) allowed WHERE allowed.value->>'signature'=a.signature)) THEN RAISE EXCEPTION 'NATIVE254_UNAUTHORIZED_HELPER';END IF;
 IF EXISTS(SELECT 1 FROM _n254_before_schema b FULL JOIN _n254_after_schema a USING(oid) WHERE to_jsonb(b) IS DISTINCT FROM to_jsonb(a)) THEN RAISE EXCEPTION 'NATIVE254_SCHEMA_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM pg_stat_xact_user_tables WHERE schemaname='saas' AND(n_tup_ins<>0 OR n_tup_upd<>0 OR n_tup_del<>0)) THEN RAISE EXCEPTION 'NATIVE254_DATA_WRITE_DETECTED';END IF;
END $post$;
SELECT jsonb_build_object('kind','native254StageAcknowledgement','runtimeSource','${runtimeSource}','sourceSha256','${sha}','functionsChanged',4,'privateHelpersAdded',6,'otherFunctionsPreserved',1912,'schemaChanges',0,'dataWrites',0,'automaticReplay',false);
COMMIT;
`;
writeFileSync(path.resolve(output),sql,{encoding:'utf8',mode:0o600,flag:'wx'});
console.log(JSON.stringify({kind:'native254StageSourcePrepared',output:path.resolve(output),runtimeSource,sourceSha256:sha,stageSha256:createHash('sha256').update(sql).digest('hex'),databaseConnections:0}));
