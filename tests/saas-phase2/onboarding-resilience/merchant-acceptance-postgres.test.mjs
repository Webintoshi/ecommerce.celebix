import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import test from 'node:test';
import pg from 'pg';
import { PostgresCatalogRepository, PostgresMerchantAdminRepository, PostgresPaymentMethodRepository, PostgresProductMediaRepository, PostgresPublicStorefrontRepository, PostgresSaaSDataRepository, PostgresStoreDomainRepository, PostgresStorefrontDesignRepository, PostgresTenantOperationRecovery } from '@celebix/saas-data';
import { createStarterTenantService } from '@celebix/saas-tenant-core';
import { createOwnerTenantCoreAdapter } from '../../../apps/owner/lib/saas-tenant-core/adapter.ts';
import { createAes256GcmPayloadCipher, createOpaqueStateDigester } from '../../../apps/owner/lib/saas-persistence/identity-crypto.ts';
import { PostgresRegistrationAttemptStore } from '../../../apps/owner/lib/saas-persistence/postgres-registration-attempt-store.ts';
import { createPersistentRegistrationCompletionService } from '../../../apps/owner/lib/self-serve-registration-completion.ts';
import { validateProductImage } from '../../../apps/customer-panel/lib/server-media/image-validation.ts';
import { createProductMediaUploadService } from '../../../apps/customer-panel/lib/server-media/upload-service.ts';
import { createSetupLoader } from '../../../apps/customer-panel/lib/server-setup/loader.ts';
import { merchantAdminFingerprint } from '../../../packages/saas-data/src/merchant-admin/canonical.ts';

const DATABASE='onboarding_merchant_qa_20260928';
const MARKER='celebix-task-owned-disposable-onboarding-20260927';
const OPT_IN='merchant-acceptance-20260928';
const MEDIA_ORIGIN='https://media.merchant-acceptance.invalid';
const TIMEOUTS={poolCheckoutMs:2000,statementMs:5000,lockMs:4000,idleTransactionMs:5000};
const AUTHORITY={panelOrigin:'https://panel.saas-staging.celebix.net',platformDomainSuffix:'saas-staging.celebix.net'};
const EXPECTED_GRAPH={stores:1,principals:1,operations:1,owners:1,subscriptions:1,domains:1,admindomains:1,storefrontdomains:1,medianamespaces:1,designs:1};
const EXPECTED_SALES={draft_products:1,active_media:1,delivery_records:1,orders:0,payment_methods:0,payment_attempts:0,provider_profiles:0};
function qaConfig(env){
 if(env.CELEBIX_MERCHANT_ACCEPTANCE_QA!==OPT_IN||env.CELEBIX_MERCHANT_ACCEPTANCE_DATABASE!==DATABASE||env.CELEBIX_MERCHANT_ACCEPTANCE_MARKER!==MARKER)throw new Error('explicit_disposable_merchant_qa_authority_required');
 if(env.CELEBIX_MERCHANT_ACCEPTANCE_MODE!==undefined&&!['fresh','preflight','continue-delivery'].includes(env.CELEBIX_MERCHANT_ACCEPTANCE_MODE))throw new Error('merchant_qa_mode_invalid');
 if(Object.keys(env).some(key=>/^PG/i.test(key)||/SUPABASE/i.test(key)||/DATABASE_URL$/i.test(key)||/^POSTGRES.*URL$/i.test(key)))throw new Error('ambient_database_authority_denied');
 return{host:'127.0.0.1',port:56417,user:'postgres',database:DATABASE,max:4,connectionTimeoutMillis:3000,application_name:'onboarding-merchant-acceptance-qa'};
}
function assertQaDatabase(proof){
 assert.equal(proof.database,DATABASE);assert.equal(proof.marker,MARKER);assert.equal(Math.floor(proof.version/10000),16);
}
function assertQaAuthority(proof){
 assertQaDatabase(proof);
 assert.equal(proof.stores,0,'schema-only QA must be empty before creating the one tenant fixture');
}
const optIn={CELEBIX_MERCHANT_ACCEPTANCE_QA:OPT_IN,CELEBIX_MERCHANT_ACCEPTANCE_DATABASE:DATABASE,CELEBIX_MERCHANT_ACCEPTANCE_MARKER:MARKER};
test('merchant acceptance refuses implicit, ambient, wrong database or missing-marker authority',()=>{
 assert.deepEqual(qaConfig(optIn),{host:'127.0.0.1',port:56417,user:'postgres',database:DATABASE,max:4,connectionTimeoutMillis:3000,application_name:'onboarding-merchant-acceptance-qa'});
 for(const key of['DATABASE_URL','OWNER_DATABASE_URL','POSTGRES_URL','POSTGRES_PRISMA_URL','PGHOST','PGPASSWORD','SUPABASE_DB_URL','OWNER_SUPABASE_URL'])assert.throws(()=>qaConfig({...optIn,[key]:''}));
 for(const override of[{CELEBIX_MERCHANT_ACCEPTANCE_QA:undefined},{CELEBIX_MERCHANT_ACCEPTANCE_DATABASE:'postgres'},{CELEBIX_MERCHANT_ACCEPTANCE_DATABASE:'onboarding_migrations_qa_20260928'},{CELEBIX_MERCHANT_ACCEPTANCE_MARKER:'other'},{CELEBIX_MERCHANT_ACCEPTANCE_MODE:'unsafe'}])assert.throws(()=>qaConfig({...optIn,...override}));
 const proof={database:DATABASE,marker:MARKER,version:160014,stores:0};assertQaAuthority(proof);
 for(const override of[{database:'other'},{marker:null},{version:150000},{version:170000},{stores:1}])assert.throws(()=>assertQaAuthority({...proof,...override}));
});

// A complete one-pixel PNG, generated locally without an image service or file.
function png(){
 function chunk(kind,bytes){const payload=Buffer.concat([Buffer.from(kind),bytes]);let crc=0xffffffff;for(const byte of payload){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const size=Buffer.alloc(4),tail=Buffer.alloc(4);size.writeUInt32BE(bytes.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([size,payload,tail]);}
 const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255]))),chunk('IEND',Buffer.alloc(0))]);
}
function memoryStorage(storeId,productId){
 const objects=new Map(),counts={put:0,publish:0};
 const prefix=`stores/${storeId}/products/${productId}/`;
 function scoped(key){assert.ok(key.startsWith(prefix));assert.match(key.slice(prefix.length),/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/);return key;}
 return{counts,objects,publicUrl(key){return`${MEDIA_ORIGIN}/${scoped(key)}`;},async head(key){return objects.get(scoped(key))??{kind:'not_found'};},async put(input){scoped(input.objectKey);assert.equal(input.mediaType,'image/png');assert.equal(createHash('sha256').update(input.bytes).digest('hex'),input.payloadSha256);assert.equal(objects.has(input.objectKey),false);counts.put++;objects.set(input.objectKey,{kind:'found',byteSize:input.bytes.byteLength,mediaType:input.mediaType,payloadSha256:input.payloadSha256,publication:'pending'});},async publish(input){const value=objects.get(scoped(input.objectKey));assert.ok(value);assert.equal(value.byteSize,input.byteSize);assert.equal(value.mediaType,input.mediaType);assert.equal(value.payloadSha256,input.payloadSha256);counts.publish++;objects.set(input.objectKey,{...value,publication:'active'});},async unpublish(){assert.fail('no archive operation permitted');},async delete(){assert.fail('no object cleanup needed in this acceptance path');}};
}
test('synthetic image and memory object port validate bytes and exact tenant namespace',async()=>{
 const bytes=png(),validated=validateProductImage({bytes,mediaType:'image/png',fileName:'synthetic.png'});
 assert.equal(validated.width,1);assert.equal(validated.height,1);assert.equal(validated.byteSize,bytes.length);
 assert.throws(()=>validateProductImage({bytes,mediaType:'image/png',fileName:'synthetic.webp'}));
 const storeId=randomUUID(),productId=randomUUID(),storage=memoryStorage(storeId,productId),objectKey=`stores/${storeId}/products/${productId}/${randomUUID()}.png`,payloadSha256=createHash('sha256').update(bytes).digest('hex');
 await storage.put({objectKey,mediaType:'image/png',bytes,payloadSha256});await storage.publish({objectKey,mediaType:'image/png',byteSize:bytes.length,payloadSha256});assert.equal((await storage.head(objectKey)).publication,'active');
 await assert.rejects(()=>storage.head(`stores/${randomUUID()}/products/${productId}/${randomUUID()}.png`));
 await assert.rejects(()=>storage.put({objectKey:`stores/${storeId}/products/${productId}/${randomUUID()}.png`,mediaType:'image/png',bytes,payloadSha256:'a'.repeat(64)}));
});

async function shippingProjection(pool,storeId){
 // SQL072 intentionally exposes this only inside owner-run public entrypoints.
 // QA may inspect its result as the existing owner, without granting a new port.
 const client=await pool.connect();try{await client.query('BEGIN READ ONLY');await client.query('SET LOCAL ROLE celebix_saas_owner');const result=await client.query('SELECT saas.storefront_shipping_projection($1::uuid) AS shipping',[storeId]);await client.query('COMMIT');return result.rows[0].shipping;}finally{await client.query('ROLLBACK').catch(()=>{});client.release();}
}
function merchantRepositories(pool){
 const options={pool,role:'celebix_saas_app',timeouts:TIMEOUTS,audit(){}};
 return{catalog:new PostgresCatalogRepository({...options,generateId:()=>randomUUID()}),design:new PostgresStorefrontDesignRepository(options),merchant:new PostgresMerchantAdminRepository({...options,uuid:randomUUID}),domains:new PostgresStoreDomainRepository({pool,role:'celebix_saas_app',timeouts:TIMEOUTS}),methods:new PostgresPaymentMethodRepository(options),media:new PostgresProductMediaRepository({...options,mediaOrigin:MEDIA_ORIGIN}),publicStorefront:new PostgresPublicStorefrontRepository({pool,role:'celebix_saas_host_resolver',timeouts:TIMEOUTS})};
}
test('merchant acceptance repository factories accept exact real constructor contracts without connecting',()=>{
 const repositories=merchantRepositories({connect(){assert.fail('constructor preflight cannot connect');}});
 assert.deepEqual(Object.keys(repositories).sort(),['catalog','design','domains','media','merchant','methods','publicStorefront']);
});
function setupLoader({catalog,design,merchant,domains,methods},clock=()=>new Date()){
 return createSetupLoader({access:async()=>{throw new Error('network_read_intentionally_unavailable');},products:(tenantContext,now)=>catalog.getDashboardSummary({tenantContext,now}),design:(tenantContext,now)=>design.getWorkspace({tenantContext,now}),domains:(tenantContext,now)=>domains.list({tenantContext,now}),delivery:(tenantContext,now)=>merchant.list({tenantContext,now,kind:'shipping_setting'}),payment:async(tenantContext,now)=>({methods:await methods.list({tenantContext,now}),profiles:[],authorities:[]})},clock);
}
function tenantContext(result,identity){return{schemaVersion:1,requestId:randomUUID(),principal:{id:result.membership.principalId,issuer:identity.issuer,subject:identity.subject},store:result.store,membership:{id:result.membership.id,role:result.membership.role,status:result.membership.status},entitlements:result.plan,locale:'tr-TR'};}
async function salesSnapshot(pool,storeId){return(await pool.query(`SELECT (SELECT count(*)::int FROM saas.products WHERE store_id=$1 AND status='draft') AS draft_products,(SELECT count(*)::int FROM saas.product_media WHERE store_id=$1 AND status='active') AS active_media,(SELECT count(*)::int FROM saas.merchant_admin_records WHERE store_id=$1 AND record_kind='shipping_setting') AS delivery_records,(SELECT count(*)::int FROM saas.orders WHERE store_id=$1) AS orders,(SELECT count(*)::int FROM saas.payment_methods WHERE store_id=$1) AS payment_methods,(SELECT count(*)::int FROM saas.payment_attempts WHERE store_id=$1) AS payment_attempts,(SELECT count(*)::int FROM saas.merchant_provider_profiles WHERE store_id=$1) AS provider_profiles`,[storeId])).rows[0];}
async function graph(pool,storeId){
 const result=await pool.query(`SELECT
  (SELECT count(*)::int FROM saas.stores) AS stores,
  (SELECT count(*)::int FROM saas.principals) AS principals,
  (SELECT count(*)::int FROM saas.tenant_operations WHERE status='committed') AS operations,
  (SELECT count(*)::int FROM saas.memberships WHERE store_id=$1) AS owners,
  (SELECT count(*)::int FROM saas.subscriptions WHERE store_id=$1) AS subscriptions,
  (SELECT count(*)::int FROM saas.domains WHERE store_id=$1) AS domains,
  (SELECT count(*)::int FROM saas.admin_domains WHERE store_id=$1) AS adminDomains,
  (SELECT count(*)::int FROM saas.store_domains WHERE store_id=$1) AS storefrontDomains,
  (SELECT count(*)::int FROM saas.store_media_namespaces WHERE store_id=$1 AND namespace_prefix='stores/'||$1::text||'/' AND status='active') AS mediaNamespaces,
  (SELECT count(*)::int FROM saas.storefront_designs WHERE store_id=$1) AS designs`,[storeId]);return result.rows[0];
}
async function existingDraftFixture(pool,repositories){
 const proof=(await pool.query("SELECT current_database() AS database,current_setting('server_version_num')::int AS version,shobj_description(oid,'pg_database') AS marker,(SELECT count(*)::int FROM saas.stores) AS stores FROM pg_database WHERE datname=current_database()")).rows[0];assertQaDatabase(proof);assert.equal(proof.stores,1);
 const operations=await pool.query("SELECT result_payload FROM saas.tenant_operations WHERE status='committed'");assert.equal(operations.rowCount,1);const result=operations.rows[0].result_payload;assert.match(result.store.slug,/^qa-merchant-[a-f0-9]{16}$/);assert.equal(result.primaryDomain.hostname,`${result.store.slug}.${AUTHORITY.platformDomainSuffix}`);
 const identity=(await pool.query('SELECT issuer,subject FROM saas.principals WHERE id=$1',[result.membership.principalId])).rows[0];assert.equal(identity.issuer,'https://merchant-acceptance.invalid/oidc');assert.match(identity.subject,/^synthetic-[a-f0-9]{16}$/);const context=tenantContext(result,identity);
 assert.equal((await pool.query("SELECT count(*)::int AS count FROM saas.registration_tenant_completions WHERE state='completed' AND tenant_operation_id=$1",[result.operationId])).rows[0].count,1);
 assert.deepEqual(await graph(pool,result.store.id),EXPECTED_GRAPH);assert.deepEqual(await salesSnapshot(pool,result.store.id),EXPECTED_SALES);
 const fees=await repositories.merchant.list({tenantContext:context,now:new Date(),kind:'shipping_setting'});assert.equal(fees.length,1);const fee=fees[0];assert.equal(fee.name,'Synthetic checkout delivery');assert.equal(fee.status,'draft');assert.equal(fee.version,1);assert.deepEqual(fee.config,{shippingPriceCents:1489,estimatedDays:365});
 const draftFingerprint=merchantAdminFingerprint('save',result.store.id,{recordId:null,expectedVersion:null,kind:'shipping_setting',name:fee.name,config:fee.config,status:'draft'});
 const creation=await pool.query("SELECT payload_fingerprint,result_payload FROM saas.merchant_admin_operations WHERE store_id=$1 AND operation_kind='save' AND result_payload->>'id'=$2",[result.store.id,fee.id]);assert.equal(creation.rowCount,1);assert.equal(creation.rows[0].payload_fingerprint,draftFingerprint);assert.equal(creation.rows[0].result_payload.version,1);assert.equal(creation.rows[0].result_payload.status,'draft');
 return{result,context,fee};
}
async function preservedRows(pool,storeId){
 const snapshots={};for(const table of['products','product_variants','product_media','storefront_designs','store_domains','admin_domains','memberships','subscriptions','domains','store_media_namespaces'])snapshots[table]=(await pool.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg(md5(to_jsonb(row)::text),'' ORDER BY md5(to_jsonb(row)::text)),'')) AS digest FROM saas.${table} row WHERE store_id=$1`,[storeId])).rows[0];return snapshots;
}
const enabled=Object.keys(optIn).some(key=>Object.hasOwn(process.env,key));
const preflight=process.env.CELEBIX_MERCHANT_ACCEPTANCE_MODE==='preflight';
const continuation=process.env.CELEBIX_MERCHANT_ACCEPTANCE_MODE==='continue-delivery';
test('READ ONLY existing synthetic merchant graph satisfies remaining repository and projection prerequisites',{skip:!enabled||!preflight,timeout:60000},async t=>{
 const pool=new pg.Pool(qaConfig(process.env));t.after(()=>pool.end());const repositories=merchantRepositories(pool);
 const proof=(await pool.query("SELECT current_database() AS database,current_setting('server_version_num')::int AS version,shobj_description(oid,'pg_database') AS marker,(SELECT count(*)::int FROM saas.stores) AS stores FROM pg_database WHERE datname=current_database()")).rows[0];assertQaDatabase(proof);assert.equal(proof.stores,1);
 const operations=await pool.query("SELECT result_payload FROM saas.tenant_operations WHERE status='committed'");assert.equal(operations.rowCount,1);const result=operations.rows[0].result_payload;assert.match(result.store.slug,/^qa-merchant-[a-f0-9]{16}$/);assert.equal(result.primaryDomain.hostname,`${result.store.slug}.${AUTHORITY.platformDomainSuffix}`);
 const identity=(await pool.query('SELECT issuer,subject FROM saas.principals WHERE id=$1',[result.membership.principalId])).rows[0];assert.equal(identity.issuer,'https://merchant-acceptance.invalid/oidc');assert.match(identity.subject,/^synthetic-[a-f0-9]{16}$/);const context=tenantContext(result,identity),authority=[context.store.id,context.principal.id,context.membership.id,context.entitlements.planId,context.entitlements.planCode,context.entitlements.version,new Date()];
 const graphBefore=await graph(pool,result.store.id),salesBefore=await salesSnapshot(pool,result.store.id);assert.deepEqual(salesBefore,{draft_products:1,active_media:1,delivery_records:1,orders:0,payment_methods:0,payment_attempts:0,provider_profiles:0});
 let networkCalls=0;t.mock.method(globalThis,'fetch',()=>{networkCalls++;assert.fail('preflight cannot call network');});
 const status=await setupLoader(repositories)(context);assert.equal(status.access.state,'unavailable');assert.equal(status.products.state,'action_required');assert.equal(status.design.state,'ready');assert.equal(status.payment.kind,'none');
 const products=await repositories.catalog.listProducts({tenantContext:context,now:new Date(),pageSize:10});assert.equal(products.items.length,1);const product=products.items[0];assert.equal(product.status,'draft');assert.equal((await repositories.media.listProductMedia({tenantContext:context,now:new Date(),productId:product.id})).length,1);
 const design=await repositories.design.getWorkspace({tenantContext:context,now:new Date()});assert.equal(design.publishedVersion,2);assert.equal(design.published.brand.primaryColor,'#224466');
 const fees=await repositories.merchant.list({tenantContext:context,now:new Date(),kind:'shipping_setting'});assert.equal(fees.length,1);assert.ok(fees[0].status==='draft'&&fees[0].version===1||fees[0].status==='active'&&fees[0].version===2);assert.deepEqual(fees[0].config,{shippingPriceCents:1489,estimatedDays:365});assert.equal(status.delivery.state,fees[0].status==='active'?'ready':'action_required');
 assert.deepEqual((await pool.query("SELECT has_function_privilege('celebix_saas_app','saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,jsonb,text)','EXECUTE') AS save,has_function_privilege('celebix_saas_owner','saas.storefront_shipping_projection(uuid)','EXECUTE') AS owner,has_function_privilege('celebix_saas_workflow','saas.storefront_shipping_projection(uuid)','EXECUTE') AS workflow")).rows[0],{save:true,owner:true,workflow:false});
 const client=await pool.connect();try{await client.query('BEGIN READ ONLY');await client.query('SET LOCAL ROLE celebix_saas_owner');const readiness=await client.query("SELECT saas.merchant_admin_authority_error($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,'shipping_setting',true) AS error,saas.merchant_admin_config_valid('shipping_setting',$8::jsonb) AS valid",[...authority,JSON.stringify(fees[0].config)]);assert.deepEqual(readiness.rows[0],{error:null,valid:true});await client.query('COMMIT');}finally{await client.query('ROLLBACK').catch(()=>{});client.release();}
 const projected=await shippingProjection(pool,result.store.id);assert.deepEqual(projected,fees[0].status==='active'?{shippingCents:1489,estimatedDays:365}:null);
 const storefront=await repositories.publicStorefront.getPublicStorefront({hostname:result.primaryDomain.hostname,now:new Date()});const publicDesign=await repositories.publicStorefront.getPublicStorefrontDesign({storefront,now:new Date()});assert.equal(publicDesign.publicationVersion,2);assert.equal(publicDesign.brand.primaryColor,'#224466');assert.equal((await repositories.publicStorefront.listPublicProducts({storefront,now:new Date(),limit:10})).items.length,0);
 assert.equal(networkCalls,0);assert.deepEqual(await graph(pool,result.store.id),graphBefore);assert.deepEqual(await salesSnapshot(pool,result.store.id),salesBefore);console.info(JSON.stringify({database:DATABASE,readOnlyPreflight:true,actualRepositoryReads:true,internalOwnerProjection:true,shipping:projected,appSaveAuthority:true,valid365Days:true,publicDesignVersion:2,publicActiveProducts:0,...salesBefore,externalNetworkCalls:networkCalls}));
});
test('bounded continuation activates only the existing draft fee after uncertain commit and replays once',{skip:!enabled||!continuation,timeout:60000},async t=>{
 const pool=new pg.Pool(qaConfig(process.env));t.after(()=>pool.end());const repositories=merchantRepositories(pool),{result,context,fee}=await existingDraftFixture(pool,repositories),before=await preservedRows(pool,result.store.id);
 let externalNetworkCalls=0;t.mock.method(globalThis,'fetch',()=>{externalNetworkCalls++;assert.fail('continuation cannot call network');});
 const initial=await setupLoader(repositories)(context);assert.equal(initial.delivery.state,'action_required');assert.equal(await shippingProjection(pool,result.store.id),null);
 const input={tenantContext:context,now:new Date(),operationId:randomUUID(),recordId:fee.id,expectedVersion:fee.version,kind:'shipping_setting',name:fee.name,config:fee.config,status:'active'};
 let commitResponseLost=false,recoveryTransportLost=false;
 const interruptedPool={async connect(){const client=await pool.connect();return{async query(text,values){if(text.includes('merchant_admin_recover_operation')){recoveryTransportLost=true;throw new Error('synthetic_recovery_response_unavailable');}const value=await client.query(text,values);if(text==='COMMIT'&&!commitResponseLost){commitResponseLost=true;throw new Error('synthetic_commit_response_lost');}return value;},release(destroy){client.release(destroy);}};}};
 const interrupted=new PostgresMerchantAdminRepository({pool:interruptedPool,role:'celebix_saas_app',timeouts:TIMEOUTS,uuid:randomUUID,audit(){}});
 await assert.rejects(()=>interrupted.save(input),error=>error.code==='unavailable');assert.equal(commitResponseLost,true);assert.equal(recoveryTransportLost,true);
 const active=await repositories.merchant.save({...input,now:new Date()});assert.equal(active.id,fee.id);assert.equal(active.version,2);assert.equal(active.status,'active');assert.equal(active.replayed,true);assert.equal((await repositories.merchant.save({...input,now:new Date()})).replayed,true);
 await assert.rejects(()=>repositories.merchant.save({...input,now:new Date(),config:{...fee.config,shippingPriceCents:1490}}),error=>error.code==='operation_mismatch');
 const rows=await repositories.merchant.list({tenantContext:context,now:new Date(),kind:'shipping_setting'});assert.equal(rows.length,1);assert.equal(rows[0].id,fee.id);assert.equal(rows[0].version,2);assert.equal(rows[0].status,'active');assert.deepEqual(rows[0].config,fee.config);
 assert.deepEqual(await shippingProjection(pool,result.store.id),{shippingCents:1489,estimatedDays:365});
 const final=await setupLoader(repositories)(context);assert.equal(final.delivery.state,'ready');assert.equal(final.products.state,'action_required');assert.equal(final.design.state,'ready');assert.equal(final.payment.kind,'none');assert.equal(final.access.state,'unavailable');
 assert.deepEqual(await graph(pool,result.store.id),EXPECTED_GRAPH);assert.deepEqual(await salesSnapshot(pool,result.store.id),EXPECTED_SALES);assert.deepEqual(await preservedRows(pool,result.store.id),before);assert.equal(externalNetworkCalls,0);
 console.info(JSON.stringify({database:DATABASE,continuedExistingGraph:true,registrationCreate:false,objectRecreation:false,changedDeliveryRecords:1,uncertainCommitRetryReplayed:true,changedPayloadRejected:true,deliveryVersion:2,internalOwnerProjection:true,shippingCents:1489,estimatedDays:365,...EXPECTED_SALES,setup:{products:final.products.state,design:final.design.state,delivery:final.delivery.state,payment:final.payment.kind,access:final.access.state},preservedMerchantTables:Object.keys(before).length,externalNetworkCalls}));
});
test('PG16 one registered tenant can create a draft product, scoped media, published design and checkout delivery fee',{skip:!enabled||preflight||continuation,timeout:120000},async t=>{
 const pool=new pg.Pool(qaConfig(process.env));t.after(()=>pool.end());const {catalog,design,merchant,domains,methods,media:mediaRepo}=merchantRepositories(pool);
 const proof=(await pool.query("SELECT current_database() AS database,current_setting('server_version_num')::int AS version,shobj_description(oid,'pg_database') AS marker,(SELECT count(*)::int FROM saas.stores) AS stores FROM pg_database WHERE datname=current_database()")).rows[0];assertQaAuthority(proof);
 assert.deepEqual((await pool.query("SELECT has_function_privilege('celebix_saas_owner','saas.storefront_shipping_projection(uuid)','EXECUTE') AS owner,has_function_privilege('celebix_saas_workflow','saas.storefront_shipping_projection(uuid)','EXECUTE') AS workflow")).rows[0],{owner:true,workflow:false});
 assert.equal(await shippingProjection(pool,randomUUID()),null,'verify the real internal read port before creating any fixture');
 for(const relation of['registration_verified_identities','registration_onboarding_jobs','registration_status_bindings','checkout_delivery_days_backup'])assert.ok((await pool.query('SELECT to_regclass($1) AS relation',[`saas.${relation}`])).rows[0].relation);
 const schemaRoles=(await pool.query("SELECT md5(string_agg(rolname||':'||rolsuper::text||':'||rolbypassrls::text,',' ORDER BY rolname)) AS digest FROM pg_roles")).rows[0].digest;
 let externalNetworkCalls=0;t.mock.method(globalThis,'fetch',()=>{externalNetworkCalls++;assert.fail('external network/provider execution is not part of merchant acceptance');});
 const clock=()=>new Date(),key=randomBytes(32),attempts=new PostgresRegistrationAttemptStore({pool,stateDigester:createOpaqueStateDigester({key:randomBytes(32),context:'registration-attempt-state'}),payloadCipher:createAes256GcmPayloadCipher({currentKeyId:'synthetic-merchant-qa',resolveKey:()=>key}),timeouts:TIMEOUTS,clock,audit(){},identityRole:'celebix_saas_identity'},AUTHORITY);
 const core=createOwnerTenantCoreAdapter(createStarterTenantService({repository:new PostgresSaaSDataRepository({pool,timeouts:TIMEOUTS,bootstrapRole:'celebix_saas_bootstrap',panelOrigin:AUTHORITY.panelOrigin,adminOriginEnvironment:'staging_net',generateId:()=>randomUUID(),audit(){}}),...AUTHORITY,panelBaseUrl:AUTHORITY.panelOrigin,adminOriginEnvironment:'staging_net',diagnostic(stage,failure){t.diagnostic(`Tenant Core ${stage}: ${failure}`);}}));
 const completion=createPersistentRegistrationCompletionService({workflowStore:attempts,tenantCore:core,recovery:new PostgresTenantOperationRecovery({pool,timeouts:TIMEOUTS,bootstrapRole:'celebix_saas_bootstrap',panelOrigin:AUTHORITY.panelOrigin,adminOriginEnvironment:'staging_net'}),...AUTHORITY,clock,audit(){}});
 const suffix=randomBytes(8).toString('hex'),now=clock().toISOString(),registration={id:`attempt_${suffix}${suffix}`,state:randomBytes(32).toString('base64url'),details:{storeName:'Synthetic merchant acceptance',storeSlug:`qa-merchant-${suffix}`,locale:'tr',currency:'TRY',themeKey:'starter',privacyAcceptedAt:now},idempotencyKey:`ssik_${suffix}${suffix}`,requestedAt:now,createdAt:now,expiresAt:new Date(Date.parse(now)+600000).toISOString(),status:'awaiting_identity'};
 await attempts.save(registration);await attempts.consume(registration.state);
 const identity={issuer:'https://merchant-acceptance.invalid/oidc',subject:`synthetic-${suffix}`,email:`synthetic-${suffix}@merchant-acceptance.invalid`,emailVerified:true};
 assert.equal((await completion.recordVerifiedIdentity({attemptId:registration.id,expectedVersion:1,identity})).kind,'identity_recorded');
 const created=await completion.resumeTenantCreation(registration.id);assert.equal(created.kind,'tenant_created');const result=created.result;
 assert.equal(result.provisioningStatus,'ready');const replay=await completion.resumeTenantCreation(registration.id);assert.equal(replay.kind,'tenant_already_created');assert.equal(replay.result.operationId,result.operationId);
 const expectedGraph={stores:1,principals:1,operations:1,owners:1,subscriptions:1,domains:1,admindomains:1,storefrontdomains:1,medianamespaces:1,designs:1};assert.deepEqual(await graph(pool,result.store.id),expectedGraph);
 const context=tenantContext(result,identity),load=setupLoader({catalog,design,merchant,domains,methods},clock);
 const initial=await load(context);assert.equal(initial.access.state,'unavailable');assert.equal(initial.products.state,'action_required');assert.equal(initial.design.state,'ready');assert.equal(initial.delivery.state,'action_required');assert.equal(initial.payment.kind,'none');
 const productInput={tenantContext:context,now:clock(),operationId:randomUUID(),product:{slug:'synthetic-first-product',title:'Synthetic draft product',description:'Task-owned acceptance fixture',status:'draft',currency:'TRY'},initialVariant:{title:'Default',sku:'QA-MERCHANT-1',priceCents:10000,stockTracking:true,stockQuantity:3,attributes:{}}};
 const product=await catalog.createProduct(productInput);assert.equal(product.product.status,'draft');assert.equal((await catalog.createProduct({...productInput,now:clock()})).replayed,true);
 const bytes=png(),image=validateProductImage({bytes,mediaType:'image/png',fileName:'synthetic.png'}),storage=memoryStorage(result.store.id,product.product.id),upload=createProductMediaUploadService({repository:mediaRepo,storage,now:clock}),uploadInput={tenantContext:context,operationId:randomUUID(),productId:product.product.id,mediaType:image.mediaType,altText:'Synthetic one-pixel fixture',width:image.width,height:image.height,bytes};
 const uploaded=await upload.upload(uploadInput);assert.equal(uploaded.media.status,'active');assert.equal(uploaded.media.storeId,result.store.id);assert.equal(uploaded.media.productId,product.product.id);assert.equal(uploaded.media.publicUrl,`${MEDIA_ORIGIN}/${uploaded.media.objectKey}`);assert.equal((await upload.upload(uploadInput)).replayed,true);assert.equal(storage.counts.put,1);assert.equal(storage.objects.size,1);
 assert.equal((await mediaRepo.listProductMedia({tenantContext:context,now:clock(),productId:product.product.id})).length,1);
 const workspace=await design.getWorkspace({tenantContext:context,now:clock()});assert.equal(workspace.draftVersion,1);assert.equal(workspace.publishedVersion,1);
 const edited={...workspace.draft,brand:{...workspace.draft.brand,primaryColor:'#224466'}},draftInput={tenantContext:context,now:clock(),operationId:randomUUID(),expectedDraftVersion:workspace.draftVersion,design:edited};
 const saved=await design.saveDraft(draftInput);assert.equal(saved.draftVersion,2);assert.deepEqual(await design.saveDraft({...draftInput,now:clock()}),saved);
 const changed=await load(context);assert.equal(changed.design.state,'ready');assert.equal(changed.design.recommendation,'unpublished_changes');
 const publishInput={tenantContext:context,now:clock(),operationId:randomUUID(),expectedDraftVersion:saved.draftVersion,expectedPublishedVersion:workspace.publishedVersion},published=await design.publish(publishInput);assert.equal(published.publishedVersion,2);assert.deepEqual(await design.publish({...publishInput,now:clock()}),published);
 const finalDesign=await design.getWorkspace({tenantContext:context,now:clock()});assert.equal(finalDesign.publishedVersion,2);assert.equal(finalDesign.published.brand.primaryColor,'#224466');
 const feeInput={tenantContext:context,now:clock(),operationId:randomUUID(),kind:'shipping_setting',name:'Synthetic checkout delivery',config:{shippingPriceCents:1489,estimatedDays:365},status:'draft'},draftFee=await merchant.save(feeInput);assert.equal(await shippingProjection(pool,result.store.id),null);
 const activeInput={...feeInput,now:clock(),operationId:randomUUID(),recordId:draftFee.id,expectedVersion:draftFee.version,status:'active'},active=await merchant.save(activeInput);assert.equal((await merchant.save({...activeInput,now:clock()})).replayed,true);assert.equal(active.version,2);
 assert.deepEqual(await shippingProjection(pool,result.store.id),{shippingCents:1489,estimatedDays:365});assert.deepEqual((await merchant.list({tenantContext:context,now:clock(),kind:'shipping_setting'}))[0].config,feeInput.config);
 const final=await load(context);assert.equal(final.products.state,'action_required','one draft is not a sellable active product');assert.equal(final.design.state,'ready');assert.equal(final.design.recommendation,'optional_logo');assert.equal(final.delivery.state,'ready');assert.equal(final.payment.kind,'none');assert.equal(final.access.state,'unavailable','local SQL cannot prove public TLS/route access');
 const sales=await salesSnapshot(pool,result.store.id);
 assert.deepEqual(sales,{draft_products:1,active_media:1,delivery_records:1,orders:0,payment_methods:0,payment_attempts:0,provider_profiles:0});assert.deepEqual(await graph(pool,result.store.id),expectedGraph);
 assert.equal((await pool.query("SELECT md5(string_agg(rolname||':'||rolsuper::text||':'||rolbypassrls::text,',' ORDER BY rolname)) AS digest FROM pg_roles")).rows[0].digest,schemaRoles);
 assert.equal(externalNetworkCalls,0);console.info(JSON.stringify({database:DATABASE,pg16:true,oneTenantGraph:true,registrationReplay:true,...sales,publishedVersion:finalDesign.publishedVersion,shippingCents:1489,estimatedDays:365,localObjectWrites:storage.counts.put,setup:{products:final.products.state,design:final.design.state,delivery:final.delivery.state,payment:final.payment.kind,access:final.access.state},externalNetworkCalls,objectStorage:'memory_fixture_only'}));
 // Preserve the synthetic graph and immutable operation evidence in this disposable DB.
});
