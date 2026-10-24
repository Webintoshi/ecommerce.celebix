import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {applyBaseline} from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';

const dir=import.meta.dirname,fixture=startDisposablePostgres({database:'product_variant_order271_native'}),{sql}=fixture;
const read=file=>readFileSync(path.join(dir,file),'utf8');
const lit=value=>`'${String(value).replaceAll("'","''")}'`;
const signatures=[
 'saas.catalog_get_product_details_v3(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,boolean)',
 'saas.catalog_get_product_editor_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid)',
 'saas.catalog_onboarding_result_projection_v2(uuid,uuid)',
 'saas.public_effective_product_projection(uuid,uuid,timestamptz)',
 'saas.public_campaign_product_projection(uuid,uuid,timestamptz)',
 'saas.catalog_get_product_preview_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid)',
 'saas.catalog_onboard_product_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb)',
 'saas.catalog_create_variants_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb)',
];
try{
 applyBaseline(sql,dir);
 for(const file of readdirSync(dir).filter(file=>/^\d{12}/.test(file)&&Number(file.slice(8,12))>227&&Number(file.slice(8,12))<=270&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(file)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(read(file));
 if(process.argv.includes('--dump-hashes')){
  console.log(sql(`SELECT jsonb_object_agg(signature,jsonb_build_object('sha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'securityDefiner',p.prosecdef)) FROM unnest(ARRAY[${signatures.map(lit).join(',')}]::text[])signature LEFT JOIN pg_proc p ON p.oid=to_regprocedure(signature)`));
 }else{
  if(!process.argv.includes('--before-fix')){
   assert.equal(readdirSync(dir).filter(file=>/^202610240271_catalog_variant_order\.up\.sql$/.test(file)).length,1,'exact native271 candidate is required');
   const definitionSnapshot=()=>JSON.parse(sql(`SELECT jsonb_object_agg(signature,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl::text,'config',p.proconfig,'securityDefiner',p.prosecdef))FROM unnest(ARRAY[${signatures.map(lit).join(',')}]::text[])signature JOIN pg_proc p ON p.oid=to_regprocedure(signature)`));
   const predecessor=definitionSnapshot(),signature=signatures[0],definition=sql(`SELECT pg_get_functiondef(${lit(signature)}::regprocedure)`),drift=definition.replace(/\nBEGIN\b/,'\nBEGIN /* isolated predecessor drift271 */');
   assert.deepEqual(signatures.map(name=>predecessor[name].securityDefiner),[true,true,false,false,false,true,true,true]);
   sql(`SET ROLE celebix_saas_owner;GRANT EXECUTE ON FUNCTION ${signature} TO celebix_saas_workflow`);
   assert.throws(()=>sql(read('202610240271_catalog_variant_order.up.sql')),/VARIANT_ORDER271_PREDECESSOR_DRIFT/,'changed predecessor ACL must stop before installation');
   sql(`SET ROLE celebix_saas_owner;REVOKE EXECUTE ON FUNCTION ${signature} FROM celebix_saas_workflow`);
   assert.deepEqual(definitionSnapshot(),predecessor);
   assert.notEqual(drift,definition);sql('SET ROLE celebix_saas_owner;'+drift);
   assert.throws(()=>sql(read('202610240271_catalog_variant_order.up.sql')),/VARIANT_ORDER271_PREDECESSOR_DRIFT/);
   assert.equal(sql("SELECT to_regclass('saas.catalog_variant_order271_backup')IS NULL"),'t','failed installation must roll back all changes');
   sql('SET ROLE celebix_saas_owner;'+definition);sql(read('202610240271_catalog_variant_order.up.sql'));
   assert.equal(sql('SELECT count(*)FROM saas.catalog_variant_order271_backup'),'8');assert.throws(()=>sql(read('202610240271_catalog_variant_order.up.sql')),/VARIANT_ORDER271_ALREADY_INSTALLED_OR_SOURCE_INVALID/);
   assert.throws(()=>sql(read('202610240271_catalog_variant_order.down.sql')),/VARIANT_ORDER271_ROLLBACK_CONFIRMATION_REQUIRED/);
   sql("SET celebix.allow_native271_down='on';"+read('202610240271_catalog_variant_order.down.sql'));
   assert.deepEqual(definitionSnapshot(),predecessor,'empty rollback restores exact definitions owners ACLs and configs');
   sql(read('202610240271_catalog_variant_order.up.sql'));
   console.log('PASS migration source drift rolls back; empty explicit down restores all eight predecessors');
  }
  const id=n=>`27100000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const S=id(1),P=id(2),M=id(3),OTHER=id(4),OM=id(5),PRODUCT=id(6),FOREIGN_PRODUCT=id(7),PLAN='00000000-0000-4000-8000-000000000010';
  const A=id(90),B=id(20),C=id(60),ARCHIVED=id(10),FOREIGN=id(11);
  const json=value=>lit(JSON.stringify(value))+'::jsonb',owned=q=>sql('SET ROLE celebix_saas_owner;'+q),query=q=>JSON.parse(sql(q));
  const operation=()=>({id:randomUUID(),fingerprint:createHash('sha256').update(randomUUID()).digest('hex')});
  let checks=0;const check=(name,fn)=>{fn();console.log(`PASS ${++checks} ${name}`);};
  check('authorized variant-order entry points exist',()=>{
   for(const signature of ['saas.catalog_get_variant_order(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid)','saas.catalog_reorder_variants(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,uuid[])','saas.catalog_recover_variant_order(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text)'])assert.equal(sql(`SELECT to_regprocedure(${lit(signature)})IS NOT NULL`),'t',signature);
  });
  owned(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${S}','Variant271','variant271','active','tr','TRY','starter',now(),now()),('${OTHER}','Variant271 other','variant271-other','active','tr','TRY','starter',now(),now());
   INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${P}','fixture','variant271','variant271@example.test',true,now(),now());
   INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${M}','${P}','${S}','store_owner','active',now(),now()),('${OM}','${P}','${OTHER}','store_owner','active',now(),now());
   INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES('${id(8)}','${S}','${PLAN}','professional',2,'active',now()-interval '1 day',now(),now()),('${id(9)}','${OTHER}','${PLAN}','professional',2,'active',now()-interval '1 day',now(),now());
   SELECT set_config('saas.inventory.source_marker','catalog_adjustment',false),set_config('saas.inventory.source_id','${id(12)}',false),set_config('saas.inventory.source_time',now()::text,false);
   INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at)VALUES('${PRODUCT}','${S}','variant271-product','Variant271 Product','active','TRY',now(),now()),('${FOREIGN_PRODUCT}','${OTHER}','variant271-foreign','Variant271 Foreign','active','TRY',now(),now());
   INSERT INTO saas.product_variants(id,store_id,product_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at)VALUES
    ('${A}','${S}','${PRODUCT}','First',1100,400,false,0,'active','{}',1,'2026-01-01',now()),
    ('${B}','${S}','${PRODUCT}','Second',1200,500,false,0,'active','{}',1,'2026-01-02',now()),
    ('${C}','${S}','${PRODUCT}','Third',1300,600,false,0,'active','{}',1,'2026-01-03',now()),
    ('${ARCHIVED}','${S}','${PRODUCT}','Archived',1000,300,false,0,'active','{}',1,'2026-01-04',now()),
    ('${FOREIGN}','${OTHER}','${FOREIGN_PRODUCT}','Foreign',900,200,false,0,'active','{}',1,'2026-01-01',now());UPDATE saas.product_variants SET status='archived',archived_at=now(),updated_at=now()WHERE id='${ARCHIVED}';
   INSERT INTO saas.catalog_variant_commerce_profiles(variant_id,product_id,store_id,continue_selling_when_out_of_stock,version,created_at,updated_at)SELECT id,product_id,store_id,false,1,now(),now()FROM saas.product_variants WHERE store_id IN('${S}','${OTHER}');
   INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at)VALUES('${id(13)}','${S}','variant271.example.test','custom_domain','active',true,now(),now(),now());`);
  const limit=sql(`SELECT effective_limit FROM saas.plan_limits WHERE plan_id='${PLAN}'AND limit_key='products'`);
  const auth=(store=S,member=M,principal=P)=>`${lit(store)},${lit(principal)},${lit(member)},${lit(PLAN)},'professional',2,${limit},clock_timestamp()`;
  const rpc=(name,args,store=S,member=M,principal=P)=>query(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM saas.${name}(${auth(store,member,principal)}${args?','+args:''})r`);
  const uuidArray=ids=>`ARRAY[${ids.map(lit).join(',')}]::uuid[]`;
  const get=(product=PRODUCT,store=S,member=M)=>rpc('catalog_get_variant_order',lit(product),store,member);
  const reorder=(ids,{product=PRODUCT,version=get(product).result_payload.version,op=operation(),store=S,member=M,principal=P}={})=>rpc('catalog_reorder_variants',`${lit(op.id)},${lit(op.fingerprint)},${lit(product)},${version},${uuidArray(ids)}`,store,member,principal);
  const recover=(op,store=S,member=M)=>rpc('catalog_recover_variant_order',`${lit(op.id)},${lit(op.fingerprint)}`,store,member);
  const stable=()=>query(`SET ROLE celebix_saas_owner;SELECT jsonb_build_object('products',(SELECT jsonb_agg(to_jsonb(p)ORDER BY id)FROM saas.products p WHERE store_id='${S}'),'variants',(SELECT jsonb_agg(to_jsonb(v)ORDER BY id)FROM saas.product_variants v WHERE store_id='${S}'),'inventory',(SELECT coalesce(jsonb_agg(to_jsonb(i)ORDER BY id),'[]')FROM saas.inventory_movements i WHERE store_id='${S}'),'balances',(SELECT coalesce(jsonb_agg(to_jsonb(b)ORDER BY variant_id,location_id),'[]')FROM saas.inventory_balances b WHERE store_id='${S}'),'catalogOperations',(SELECT coalesce(jsonb_agg(to_jsonb(o)ORDER BY operation_id),'[]')FROM saas.catalog_operations o WHERE store_id='${S}'))`);
  const orderState=()=>query(`SET ROLE celebix_saas_owner;SELECT jsonb_build_object('state',(SELECT coalesce(jsonb_agg(to_jsonb(s)ORDER BY product_id),'[]')FROM saas.catalog_variant_order_state s),'operations',(SELECT coalesce(jsonb_agg(to_jsonb(o)ORDER BY operation_id),'[]')FROM saas.catalog_variant_order_operations o))`);
  const idsOf=payload=>(payload.variants??[]).map(row=>row.id??row.variant?.id);
  const namesOf=payload=>(payload.variants??[]).map(row=>row.title);
  const projection=(name,product=PRODUCT)=>query(`SET ROLE celebix_saas_owner;SELECT saas.${name}('${S}',${lit(product)},clock_timestamp())`);
  check('old products expose stable creation order and virtual version zero without changing rows',()=>{
   const before=stable();const result=get();assert.equal(result.outcome,'found');assert.deepEqual(result.result_payload,{productId:PRODUCT,version:0,orderedVariantIds:[A,B,C]});assert.deepEqual(stable(),before);
  });
  const firstOp=operation();let firstReceipt;
  check('manual drag order persists separately without price stock cost product or variant version changes',()=>{
   const before=stable();firstReceipt=reorder([C,A,B],{version:0,op:firstOp});assert.equal(firstReceipt.outcome,'reordered');assert.deepEqual(firstReceipt.result_payload,{productId:PRODUCT,version:1,orderedVariantIds:[C,A,B],replayed:false});assert.deepEqual(stable(),before);assert.deepEqual(get().result_payload.orderedVariantIds,[C,A,B]);
  });
  check('same operation and recovery return the original receipt without a second write',()=>{
   const before=orderState();const replay=reorder([C,A,B],{version:0,op:firstOp});assert.equal(replay.outcome,'operation_replayed');assert.deepEqual(replay.result_payload,{...firstReceipt.result_payload,replayed:true});assert.deepEqual(recover(firstOp),replay);assert.deepEqual(orderState(),before);
  });
  check('stale changed fingerprint duplicate missing archived and foreign ids cannot alter saved order',()=>{
   const before=orderState();for(const [ids,options,outcome]of[
    [[A,B,C],{version:0},'version_conflict'],[[A,B,C],{version:1,op:{...firstOp,fingerprint:'f'.repeat(64)}},'operation_mismatch'],
    [[A,A,C],{version:1},'invalid_input'],[[A,C],{version:1},'order_membership_changed'],[[A,B,FOREIGN],{version:1},'order_membership_changed'],[[A,B,C,ARCHIVED],{version:1},'order_membership_changed']])assert.equal(reorder(ids,options).outcome,outcome);
   assert.deepEqual(orderState(),before);
  });
  check('foreign tenant and unbound principal cannot read write or recover another shop order',()=>{
   const before=orderState();assert.equal(get(PRODUCT,OTHER,OM).outcome,'product_not_found');assert.equal(reorder([A,B,C],{version:1,store:OTHER,member:OM}).outcome,'product_not_found');assert.notEqual(recover(firstOp,OTHER,OM).outcome,'operation_replayed');assert.equal(reorder([A,B,C],{version:1,principal:id(999)}).outcome,'membership_denied');assert.deepEqual(orderState(),before);
  });
  check('editor details onboarding public detail campaign and preview use the same saved order',()=>{
   const detail=rpc('catalog_get_product_details_v3',`${lit(PRODUCT)},false`),editor=rpc('catalog_get_product_editor_with_origins',lit(PRODUCT)),preview=rpc('catalog_get_product_preview_v2',lit(PRODUCT));
   for(const [name,result]of[['detail',detail],['editor',editor],['preview',preview]])assert.equal(result.outcome,'found',name);
   assert.deepEqual(idsOf(detail.result_payload),[C,A,B]);assert.deepEqual(idsOf(editor.result_payload),[C,A,B]);
   const onboard=query(`SET ROLE celebix_saas_owner;SELECT saas.catalog_onboarding_result_projection_v2('${S}','${PRODUCT}')`);assert.deepEqual(idsOf(onboard),[C,A,B]);
   for(const name of['public_effective_product_projection','public_campaign_product_projection'])assert.deepEqual(idsOf(projection(name)),[C,A,B]);
   assert.deepEqual(namesOf(preview.result_payload),['Third','First','Second']);
  });
  const NEW=id(5_000);
  check('new active variant appends and archived variants disappear without rewriting original product fields',()=>{
   owned(`SELECT set_config('saas.inventory.source_marker','catalog_adjustment',false),set_config('saas.inventory.source_id','${id(5001)}',false),set_config('saas.inventory.source_time',now()::text,false);INSERT INTO saas.product_variants(id,store_id,product_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at)VALUES('${NEW}','${S}','${PRODUCT}','Newest',1400,700,false,0,'active','{}',1,now(),now());`);
   assert.deepEqual(get().result_payload.orderedVariantIds,[C,A,B,NEW]);owned(`UPDATE saas.product_variants SET status='archived',archived_at=now(),updated_at=now()WHERE id='${A}'`);assert.deepEqual(get().result_payload.orderedVariantIds,[C,B,NEW]);
  });
  check('later manual order survives replay of an earlier drag operation',()=>{
   const saved=reorder([NEW,B,C],{version:1});assert.equal(saved.outcome,'reordered');assert.equal(saved.result_payload.version,2);const before=orderState();assert.equal(recover(firstOp).outcome,'operation_replayed');assert.equal(reorder([C,A,B],{version:0,op:firstOp}).outcome,'operation_replayed');assert.deepEqual(get().result_payload.orderedVariantIds,[NEW,B,C]);assert.deepEqual(orderState(),before);
  });
  check('advanced creation preserves caller variant array order atomically and creation replay cannot overwrite later sorting',()=>{
   const product=id(100),variants=[id(190),id(120),id(160)],op=operation(),resources={collections:[],tags:[],attributes:[],extras:[],definitions:[]};
   const intent={kind:'advanced',productType:'physical',title:'Native271 ordered creation',publish:false,variants:variants.map((_,i)=>({title:`Created ${i+1}`,priceCents:100+i,stockTracking:false,stockQuantity:0,attributes:{},continueSellingWhenOutOfStock:false,inventory:[]})),profile:{minimumPurchaseQuantity:1},categoryIds:[],resourceIds:resources,channelIds:[]};
   const create=()=>rpc('catalog_onboard_product_with_origins',`${lit(op.id)},${lit(op.fingerprint)},${lit(product)},${uuidArray(variants)},${json(intent)}`);
   const created=create();assert.equal(created.outcome,'created');assert.deepEqual(idsOf(created.result_payload),variants);assert.deepEqual(get(product).result_payload,{productId:product,version:1,orderedVariantIds:variants});
   const later=reorder([...variants].reverse(),{product,version:1});assert.equal(later.outcome,'reordered');const state=orderState(),replayed=create();assert.equal(replayed.outcome,'operation_replayed');assert.deepEqual(idsOf(replayed.result_payload),variants);assert.deepEqual(get(product).result_payload.orderedVariantIds,[...variants].reverse());assert.deepEqual(orderState(),state);
  });
  check('failed order-state insertion rolls product creation and its operation ledgers back together',()=>{
   const product=id(300),variant=id(301),op=operation(),before=stable(),intent={kind:'quick',title:'Atomic order271',priceCents:100,publish:false};
   owned(`CREATE FUNCTION saas.variant271_test_fail_creation()RETURNS trigger LANGUAGE plpgsql AS $f$BEGIN IF NEW.product_id='${product}'THEN RAISE EXCEPTION 'VARIANT271_CREATION_FAILURE';END IF;RETURN NEW;END$f$;CREATE TRIGGER variant271_test_fail_creation BEFORE INSERT ON saas.catalog_variant_order_state FOR EACH ROW EXECUTE FUNCTION saas.variant271_test_fail_creation();`);
   try{assert.throws(()=>rpc('catalog_onboard_product_with_origins',`${lit(op.id)},${lit(op.fingerprint)},${lit(product)},${uuidArray([variant])},${json(intent)}`),/VARIANT271_CREATION_FAILURE/);}finally{owned('DROP TRIGGER variant271_test_fail_creation ON saas.catalog_variant_order_state;DROP FUNCTION saas.variant271_test_fail_creation();');}
   assert.equal(sql(`SELECT count(*)FROM saas.products WHERE id='${product}'`),'0');assert.equal(sql(`SELECT count(*)FROM saas.product_variants WHERE id='${variant}'`),'0');assert.equal(sql(`SELECT count(*)FROM saas.catalog_onboarding_operations WHERE operation_id='${op.id}'`),'0');assert.deepEqual(stable(),before);
  });
  check('batch creation records input array order and replay never overwrites a later manual reorder',()=>{
   const product=id(200),initial=id(201),attribute=id(202),variants=[id(290),id(220)],op=operation();
   owned(`INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at)VALUES('${product}','${S}','variant271-batch','Native271 Batch','draft','TRY',now(),now());SELECT set_config('saas.inventory.source_marker','catalog_adjustment',false),set_config('saas.inventory.source_id','${id(203)}',false),set_config('saas.inventory.source_time',now()::text,false);INSERT INTO saas.product_variants(id,store_id,product_id,title,price_cents,stock_tracking,stock_quantity,status,attributes,created_at,updated_at)VALUES('${initial}','${S}','${product}','Initial',100,false,0,'active','{}',now(),now());INSERT INTO saas.catalog_admin_resources(id,store_id,resource_kind,name,slug,config,created_at,updated_at)VALUES('${attribute}','${S}','attribute','Size271','size271','{"values":["A","B"]}',now(),now());`);
   const value=variants.map((_,i)=>({title:`Batch ${i+1}`,priceCents:200+i,stockTracking:false,stockQuantity:0,attributes:{size271:i===0?'A':'B'}}));
   const create=()=>rpc('catalog_create_variants_batch_v2',`${lit(op.id)},${lit(op.fingerprint)},${lit(product)},${uuidArray(variants)},${json(value)}`);
   const created=create();assert.equal(created.outcome,'created');assert.deepEqual(idsOf(created.result_payload),variants);assert.deepEqual(get(product).result_payload.orderedVariantIds,[initial,...variants]);const version=get(product).result_payload.version;
   assert.equal(reorder([variants[1],initial,variants[0]],{product,version}).outcome,'reordered');const state=orderState(),replayed=create();assert.equal(replayed.outcome,'operation_replayed');assert.deepEqual(idsOf(replayed.result_payload),variants);assert.deepEqual(get(product).result_payload.orderedVariantIds,[variants[1],initial,variants[0]]);assert.deepEqual(orderState(),state);
  });
  check('operation insertion failure rolls the new order version back atomically',()=>{
   const before=orderState(),op=operation();owned(`CREATE FUNCTION saas.variant271_test_fail()RETURNS trigger LANGUAGE plpgsql AS $f$BEGIN RAISE EXCEPTION 'VARIANT271_INJECTED_FAILURE';END$f$;CREATE TRIGGER variant271_test_fail BEFORE INSERT ON saas.catalog_variant_order_operations FOR EACH ROW EXECUTE FUNCTION saas.variant271_test_fail();`);
   try{assert.throws(()=>reorder([C,NEW,B],{version:2,op}),/VARIANT271_INJECTED_FAILURE/);}finally{owned('DROP TRIGGER variant271_test_fail ON saas.catalog_variant_order_operations;DROP FUNCTION saas.variant271_test_fail();');}
   assert.deepEqual(orderState(),before);
  });
  check('order tables and helpers are inaccessible to app resolver workflow and public callers',()=>{
   for(const role of['celebix_saas_app','celebix_saas_host_resolver','celebix_saas_workflow'])for(const table of['catalog_variant_order_state','catalog_variant_order_operations','catalog_variant_order271_backup','catalog_variant_order271_functions'])assert.equal(sql(`SELECT has_table_privilege('${role}','saas.${table}','SELECT,INSERT,UPDATE,DELETE')`),'f');
   for(const role of['celebix_saas_host_resolver','celebix_saas_workflow'])assert.equal(sql(`SELECT has_function_privilege('${role}','saas.catalog_reorder_variants(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,uuid[])','EXECUTE')`),'f');
  });
  check('committed display order prevents rollback from discarding staff choices',()=>{assert.throws(()=>sql("SET celebix.allow_native271_down='on';"+read('202610240271_catalog_variant_order.down.sql')),/VARIANT_ORDER271_ROLLBACK_IN_USE/);});
  sql(read('202610240271_catalog_variant_order_assertions.sql'));
  if(process.argv.includes('--dump-installed'))console.log(sql(`SELECT jsonb_build_object('kind','native271Installed','sourceFunctionMetadataSha256',(SELECT encode(sha256(convert_to(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'body',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile)ORDER BY p.oid::regprocedure::text)::text,'UTF8')),'hex')FROM pg_proc p JOIN saas.catalog_variant_order271_functions f ON f.signature=p.oid::regprocedure::text),'functionCount',(SELECT count(*)FROM saas.catalog_variant_order271_functions),'backupCount',(SELECT count(*)FROM saas.catalog_variant_order271_backup),'privateTables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity)ORDER BY c.relname)FROM pg_class c WHERE c.relnamespace='saas'::regnamespace AND c.relname IN('catalog_variant_order_state','catalog_variant_order_operations','catalog_variant_order271_backup','catalog_variant_order271_functions'))) `));
  if(process.argv.includes('--readiness')){
   const index=process.argv.indexOf('--readiness'),file=process.argv[index+1];assert.ok(file,'disposable readiness query path required');
   const result=query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;'+readFileSync(path.resolve(file),'utf8')+'ROLLBACK;');
   assert.equal(Object.keys(result).length,22);assert.equal(result.nativeAuthority,false,'a disposable database must never impersonate live authority');
   for(const [key,value]of Object.entries(result))if(key!=='nativeAuthority')assert.equal(value,true,key);
   console.log('PASS read-only release readiness retains native270 and verifies native271 source/private boundaries');
  }
  console.log(`Native product variant order271: ${checks} checks passed`);
 }
}finally{fixture.stop();}
