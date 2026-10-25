import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {applyBaseline} from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';

const dir=import.meta.dirname,fixture=startDisposablePostgres({database:'attribute_templates278_native'}),{sql}=fixture;
const read=name=>readFileSync(path.join(dir,name),'utf8'),lit=value=>`'${String(value).replaceAll("'","''")}'`,json=value=>lit(JSON.stringify(value))+'::jsonb';
const owned=source=>sql('SET ROLE celebix_saas_owner;'+source),query=source=>JSON.parse(sql(source));
const id=n=>`27800000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const EZMEO='7892a771-67a9-42d7-9b36-f4c3e8562e95',WEIGHT='d52682bd-6b26-40b0-8464-15d938d790c3',OTHER=id(1),FUTURE=id(2),COLLISIONS=id(3);
const paths={up:'202610260278_catalog_attribute_templates.up.sql',down:'202610260278_catalog_attribute_templates.down.sql',assertions:'202610260278_catalog_attribute_templates_assertions.sql'};
const templates=['renk','beden','malzeme','desen','kalip','cinsiyet','yas-grubu','agirlik','hacim','uzunluk','en','yukseklik','paket-ici-adet','urun-durumu'];
const catalog=()=>query("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('body',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile)ORDER BY p.oid::regprocedure::text)FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace");
const resources=store=>query(`SELECT coalesce(jsonb_agg(to_jsonb(r)ORDER BY r.slug),'[]')FROM saas.catalog_admin_resources r WHERE store_id=${lit(store)}`);
const store=(sid,slug)=>owned(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES(${lit(sid)},${lit(slug)},${lit(slug)},'active','tr','TRY','starter','2026-01-01','2026-01-01')`);
const insertResource=(store,slug,name,config,status='active')=>owned(`INSERT INTO saas.catalog_admin_resources(id,store_id,resource_kind,name,slug,config,status,archived_at,version,created_at,updated_at)VALUES(${lit(randomUUID())},${lit(store)},'attribute',${lit(name)},${lit(slug)},${json(config)},${lit(status)},${status==='archived'?"'2026-01-01'":'NULL'},1,'2026-01-01','2026-01-01')`);
const seed=store=>owned(`SELECT saas.seed_store_catalog_attribute_templates(${lit(store)},'2026-01-01')`);
const expectedAdded=['saas.create_store_catalog_attribute_templates()','saas.seed_store_catalog_attribute_templates(uuid,timestamp with time zone)'];
let checks=0;const check=(label,fn)=>{fn();console.log(`PASS ${++checks} ${label}`);};
try{
 applyBaseline(sql,dir);
 for(const file of readdirSync(dir).filter(file=>/^\d{12}/.test(file)&&Number(file.slice(8,12))>227&&Number(file.slice(8,12))<=277&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(file)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(read(file));
 store(EZMEO,'ezmeo');store(OTHER,'untouched-attribute278');
 insertResource(OTHER,'renk','Renk',{values:['Korunan']});
 insertResource(EZMEO,'renk','Özel renk',{values:['Ezmeo rengi']});
 owned(`INSERT INTO saas.catalog_admin_resources(id,store_id,resource_kind,name,slug,config,status,version,created_at,updated_at)VALUES('${WEIGHT}','${EZMEO}','attribute','Ağırlık','agirlik',${json({values:['500g','1000g','250g']})},'active',2,'2026-01-01','2026-01-01')`);
 const protectedExisting=resources(OTHER),ezmeoExisting=resources(EZMEO),beforeCatalog=catalog();
 if(!process.argv.includes('--before-fix'))sql('SET enable_nestloop=off;'+read(paths.up));
 store(FUTURE,'future-attribute278');
 check('a future store receives fourteen inactive editable templates at store insertion',()=>{
  const rows=resources(FUTURE);assert.equal(rows.length,14,'all fourteen future-store attribute templates are required');
  assert.deepEqual(rows.map(row=>row.slug).sort(),[...templates].sort());
  for(const row of rows){assert.equal(row.resource_kind,'attribute');assert.equal(row.status,'active');assert.equal(row.version,1);assert.equal(row.config.enabled,false);assert.equal(row.config.starterTemplate,row.slug);assert.equal(row.config.key,row.slug);assert.ok(Array.isArray(row.config.values)&&row.config.values.length>0&&row.config.values.length<=64);assert.equal(row.created_at,row.updated_at);}
  const physical={agirlik:'weight',hacim:'volume',uzunluk:'length',en:'width',yukseklik:'height','paket-ici-adet':'packageCount'};
  for(const row of rows)assert.equal(row.config.measurementField,physical[row.slug]);
  assert.deepEqual(rows.find(row=>row.slug==='agirlik').config.values,['100 g','250 g','500 g','1 kg','2 kg','5 kg']);
 });
 check('only Ezmeo is backfilled and its existing weight values are preserved with one typed annotation',()=>{
  assert.deepEqual(resources(OTHER),protectedExisting);const rows=resources(EZMEO);assert.equal(rows.length,14);
  for(const prior of ezmeoExisting){const after=rows.find(row=>row.id===prior.id);if(prior.id!==WEIGHT)assert.deepEqual(after,prior);else{assert.deepEqual(after.config,{...prior.config,measurementField:'weight'});assert.equal(after.version,prior.version+1);assert.deepEqual({...after,config:prior.config,version:prior.version,updated_at:prior.updated_at},prior);}}
  assert.equal(sql(`SELECT count(*)FROM saas.catalog_attribute_templates278_seeded WHERE store_id=${lit(OTHER)}`),'0');
 });
 check('repeated seed calls do not duplicate overwrite reactivate or reset any resource',()=>{const before=resources(FUTURE);seed(FUTURE);seed(FUTURE);assert.deepEqual(resources(FUTURE),before);assert.equal(sql(`SELECT count(*)FROM saas.catalog_attribute_templates278_seeded WHERE store_id=${lit(FUTURE)}`),'14');});
 check('slug native-key and Turkish-normalized name collisions including archived resources are skipped',()=>{
  sql('BEGIN;SET LOCAL ROLE celebix_saas_owner;ALTER TABLE saas.stores DISABLE TRIGGER stores_catalog_attribute_templates278;'+`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${COLLISIONS}','Collision fixture','collision-attribute278','active','tr','TRY','starter','2026-01-01','2026-01-01');`+'ALTER TABLE saas.stores ENABLE TRIGGER stores_catalog_attribute_templates278;COMMIT;');
  insertResource(COLLISIONS,'renk','Özel renk',{values:['Özel']},'archived');insertResource(COLLISIONS,'ozel-beden','Özel beden',{key:'beden',values:['Özel']});insertResource(COLLISIONS,'ozel-malzeme','MALZEME',{values:['Özel']});insertResource(COLLISIONS,'ozel-agirlik','AĞIRLIK',{values:['Özel']},'archived');const before=resources(COLLISIONS);seed(COLLISIONS);const after=resources(COLLISIONS);assert.equal(after.length,14);for(const row of before)assert.deepEqual(after.find(next=>next.id===row.id),row);assert.equal(sql(`SELECT count(*)FROM saas.catalog_attribute_templates278_seeded WHERE store_id='${COLLISIONS}'`),'10');
 });
 check('template writes roll back with failed signup and do not alter signup replay or plan records',()=>{
  const sid=id(4);sql(`BEGIN;SET LOCAL ROLE celebix_saas_owner;INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${sid}','Rollback fixture','rollback-attribute278','active','tr','TRY','starter',now(),now());ROLLBACK;`);assert.equal(sql(`SELECT count(*)FROM saas.catalog_admin_resources WHERE store_id='${sid}'`),'0');assert.equal(sql(`SELECT count(*)FROM saas.catalog_attribute_templates278_seeded WHERE store_id='${sid}'`),'0');
 });
 check('owner cleanup of an unlinked attribute is not blocked by private template provenance',()=>{
  const sid=id(5);store(sid,'cleanup-attribute278');const row=resources(sid)[0];assert.doesNotThrow(()=>owned(`DELETE FROM saas.catalog_admin_resources WHERE store_id='${sid}'AND id='${row.id}'`));assert.equal(sql(`SELECT count(*)FROM saas.catalog_attribute_templates278_seeded WHERE resource_id='${row.id}'`),'0');assert.equal(resources(sid).length,13);
 });
 check('new routines and provenance rows remain private to the owner',()=>{
  for(const role of ['celebix_saas_app','celebix_saas_identity','celebix_saas_workflow','celebix_saas_host_resolver','celebix_saas_bootstrap','celebix_saas_observability']){
   for(const signature of expectedAdded)assert.equal(sql(`SELECT has_function_privilege('${role}',${lit(signature)},'EXECUTE')`),'f');
   assert.equal(sql(`SELECT has_table_privilege('${role}','saas.catalog_attribute_templates278_seeded','SELECT,INSERT,UPDATE,DELETE')`),'f');
  }
  assert.equal(sql("SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='saas.catalog_attribute_templates278_seeded'::regclass"),'t');
 });
 check('merchant value edits use the existing optimistic version and durable operation replay contract',()=>{
  const principal=id(10),member=id(11),plan='00000000-0000-4000-8000-000000000010',operation=randomUUID(),fingerprint=createHash('sha256').update(operation).digest('hex'),resource=resources(FUTURE).find(row=>row.slug==='renk');
  owned(`INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${principal}','fixture','attribute278','attr278@example.test',true,now(),now());INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${member}','${principal}','${FUTURE}','store_owner','active',now(),now());INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES('${id(12)}','${FUTURE}','${plan}','professional',2,'active',now()-interval '1 day',now(),now());`);
  const args=`'${FUTURE}','${principal}','${member}','${plan}','professional',2,clock_timestamp(),'${operation}','${fingerprint}','${resource.id}',1,'attribute','Renk','renk',NULL,${json({...resource.config,enabled:true,values:['Özel Mavi']})},'{}'::uuid[]`,rpc=`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM saas.catalog_admin_save_resource(${args})r`;
  const saved=query(rpc);assert.equal(saved.outcome,'saved');assert.equal(saved.result_payload.version,2);assert.equal(query(rpc).outcome,'operation_replayed');const after=resources(FUTURE).find(row=>row.id===resource.id);assert.equal(after.config.enabled,true);assert.deepEqual(after.config.values,['Özel Mavi']);assert.equal(after.version,2);seed(FUTURE);assert.deepEqual(resources(FUTURE).find(row=>row.id===resource.id),after);
 });
 check('down requires explicit opt-in and refuses to delete merchant-edited templates atomically',()=>{
  assert.throws(()=>sql(read(paths.down)),/TEMPLATES278_DOWN_OPT_IN_REQUIRED/);const before=resources(FUTURE);assert.throws(()=>sql("SET celebix.allow_native278_down='on';"+read(paths.down)),/TEMPLATES278_SEEDED_RESOURCE_CHANGED/);assert.deepEqual(resources(FUTURE),before);assert.equal(sql("SELECT count(*)FROM pg_trigger WHERE tgname='stores_catalog_attribute_templates278'"),'1');
 });
 check('native catalogue adds only two routines and preserves every predecessor definition and grant',()=>{const after=catalog();assert.deepEqual(Object.keys(after).filter(key=>!Object.hasOwn(beforeCatalog,key)).sort(),expectedAdded);for(const [signature,row]of Object.entries(beforeCatalog))assert.deepEqual(after[signature],row,signature);sql('SET enable_nestloop=off;'+read(paths.assertions));});
 // A fresh pristine database transaction proves exact catalogue/data rollback without touching merchant edits.
 owned(`UPDATE saas.catalog_admin_resources r SET config=s.seeded_record->'config',version=(s.seeded_record->>'version')::bigint,updated_at=(s.seeded_record->>'updated_at')::timestamptz FROM saas.catalog_attribute_templates278_seeded s WHERE s.resource_id=r.id AND r.store_id='${FUTURE}'AND r.slug='renk';`);
 check('pristine down removes only seeded rows and restores the exact predecessor native catalogue',()=>{sql("SET enable_nestloop=off;SET celebix.allow_native278_down='on';"+read(paths.down));assert.deepEqual(catalog(),beforeCatalog);assert.deepEqual(resources(OTHER),protectedExisting);assert.deepEqual(resources(EZMEO),ezmeoExisting);assert.equal(resources(FUTURE).length,0);assert.equal(resources(COLLISIONS).length,4);assert.equal(sql("SELECT to_regclass('saas.catalog_attribute_templates278_seeded')IS NULL"),'t');});
 console.log(JSON.stringify({checks,postgresqlMajor:16,externalConnections:0,productionMutations:0,predecessorRoutineCount:Object.keys(beforeCatalog).length,installedRoutineCount:Object.keys(beforeCatalog).length+2,rollbackExact:true}));
}finally{fixture.stop();}
