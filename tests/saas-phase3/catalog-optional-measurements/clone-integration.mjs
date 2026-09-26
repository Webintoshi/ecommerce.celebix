import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

// Deliberately restricted to this freshly restored, disposable clone.
const connectionString = process.env.MEASUREMENTS_DATABASE_URL ?? readFileSync("/tmp/measurements-qa.env", "utf8").match(/^MEASUREMENTS_DATABASE_URL=(.*)$/m)?.[1];
if (!connectionString) throw Error("MEASUREMENT_QA_CONNECTION_REQUIRED");
const pool = new pg.Pool({ connectionString, max: 4 });
const report = [];
function fingerprint(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
const full = { weight: { valueMilli: 14890, unit: "g" }, volume: { valueMilli: 500500, unit: "ml" }, length: { valueMilli: 125, unit: "m" }, width: { valueMilli: 2300, unit: "cm" }, depth: { valueMilli: 4000, unit: "cm" }, height: { valueMilli: 1001, unit: "cm" }, area: { valueMilli: 12550, unit: "m2" }, packageCount: 12 };
const now = new Date().toISOString();
const suffix = randomUUID().slice(0, 8);
function success(label) { report.push(label); console.log(`PASS ${label}`); }
function variantFields(title = "Standart") { return [title, null, null, 14900, null, null, true, 5, {}]; }
async function invoke(name, args) {
 const client = await pool.connect();
 try {
  await client.query("BEGIN"); await client.query("SET LOCAL ROLE celebix_saas_app");
  const result = await client.query(`SELECT outcome,result_payload FROM saas.${name}(${args.map((_, i) => `$${i + 1}`).join(",")})`, args.map(value => typeof value === "object" && value !== null && !Array.isArray(value) ? JSON.stringify(value) : value));
  await client.query("COMMIT"); return result.rows[0];
 } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
try {
 assert.equal((await pool.query("SELECT current_database() db")).rows[0].db, "celebix_measurements_qa_20260926", "EXACT_DISPOSABLE_CLONE_REQUIRED");
 const authorities = (await pool.query(`SELECT DISTINCT ON(m.store_id) m.store_id,m.principal_id,m.id membership_id,s.plan_id,s.plan_code,s.plan_version,l.effective_limit
 FROM saas.memberships m JOIN saas.stores st ON st.id=m.store_id JOIN saas.subscriptions s ON s.store_id=m.store_id
 JOIN saas.plans p ON p.id=s.plan_id JOIN saas.plan_limits l ON l.plan_id=s.plan_id AND l.limit_key='products'
 WHERE m.role='store_owner' AND m.status='active' AND st.status='active' AND s.status='active' AND p.status='active'
 AND s.valid_from<=now() AND (s.valid_until IS NULL OR s.valid_until>now())
 AND (SELECT count(*) FROM saas.products prod WHERE prod.store_id=m.store_id AND prod.status<>'archived')+20<l.effective_limit
 ORDER BY m.store_id,m.id LIMIT 2`)).rows;
 assert.equal(authorities.length, 2, "TWO_ACTIVE_CLONE_STORES_REQUIRED");
 const auth = authorities.map(a => [a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,Number(a.plan_version),Number(a.effective_limit),now]);
 const ids = [randomUUID(),randomUUID()];
 const quick = { kind: "quick", title: `QA optional measurements ${suffix}`, priceCents: 14900, publish: false, stockQuantity: 5, measurements: full };
 const quickOp = randomUUID(), quickFp = fingerprint(quick), quickArgs = [...auth[0],quickOp,quickFp,ids[0],[ids[1]],quick];
 const created = await invoke("catalog_onboard_product_v3",quickArgs);
 assert.equal(created.outcome,"created"); assert.deepEqual(created.result_payload.variants[0].measurements,full);
 assert.equal(created.result_payload.variants[0].stockQuantity,5); assert.equal(created.result_payload.variants[0].priceCents,14900);
 success("quick create persists all eight independent optional values without channel input");
 const replay = await invoke("catalog_onboard_product_v3",quickArgs);assert.equal(replay.outcome,"operation_replayed");assert.deepEqual(replay.result_payload.variants[0].measurements,full);
 success("create replay retains metadata without creating duplicate variants");
 const projected = (await pool.query("SELECT saas.catalog_variant_projection_v2($1::uuid) item",[ids[1]])).rows[0].item;
 assert.deepEqual(projected.measurements,full);success("fresh product reads preserve exact milli precision");
 const oldProjected=(await pool.query("SELECT saas.catalog_variant_projection($1::uuid) item",[ids[1]])).rows[0].item;assert.equal(Object.hasOwn(oldProjected,"measurements"),false);
 const oldDetails=await invoke("catalog_get_product_details_v2",[...auth[0],ids[0],false]);assert.equal(Object.hasOwn(oldDetails.result_payload.variants[0],"measurements"),false);
 const newDetails=await invoke("catalog_get_product_details_v3",[...auth[0],ids[0],false]);assert.deepEqual(newDetails.result_payload.variants[0].measurements,full);
 const oldEditor=await invoke("catalog_get_product_editor",[...auth[0],ids[0]]);assert.equal(Object.hasOwn(oldEditor.result_payload.variants[0].variant,"measurements"),false);
 const newEditor=await invoke("catalog_get_product_editor_v2",[...auth[0],ids[0]]);assert.deepEqual(newEditor.result_payload.variants[0].variant.measurements,full);
 success("versioned admin reads include metadata while old detail and editor projections preserve their exact ABI");
 const merchandising={profile:{minimumPurchaseQuantity:1},categoryIds:newEditor.result_payload.categoryIds,resourceIds:newEditor.result_payload.resourceIds,channelIds:newEditor.result_payload.channelIds};
 const profileArgs=[...auth[0],randomUUID(),fingerprint(merchandising),ids[0],1,merchandising];
 const profileUpdated=await invoke("catalog_update_merchandising_v2",profileArgs);assert.equal(profileUpdated.outcome,"updated");assert.deepEqual(profileUpdated.result_payload.variants[0].measurements,full);
 const profileOldReplay=await invoke("catalog_update_merchandising",profileArgs);assert.equal(profileOldReplay.outcome,"operation_replayed");assert.equal(Object.hasOwn(profileOldReplay.result_payload.variants[0],"measurements"),false);
 const publishArgs=[...auth[0],randomUUID(),fingerprint({publish:true}),ids[0],newEditor.result_payload.product.version,0];
 const published=await invoke("catalog_publish_after_media_v2",publishArgs);assert.equal(published.outcome,"published");assert.deepEqual(published.result_payload.variants[0].measurements,full);
 const publishOldReplay=await invoke("catalog_publish_after_media",publishArgs);assert.equal(publishOldReplay.outcome,"operation_replayed");assert.equal(Object.hasOwn(publishOldReplay.result_payload.variants[0],"measurements"),false);
 success("new merchandising and publish responses retain metadata while legacy replays keep exact ledger ABI");
 const empty = { kind:"quick", title:`QA blank optional ${suffix}`,priceCents:0,publish:false };
 const emptyResult = await invoke("catalog_onboard_product_v3",[...auth[0],randomUUID(),fingerprint(empty),randomUUID(),[randomUUID()],empty]);
 assert.equal(emptyResult.outcome,"created");assert.equal(Object.hasOwn(emptyResult.result_payload.variants[0],"measurements"),false);success("blank optional fields do not block a zero-price draft and remain absent");
 const advanced = { kind:"advanced",productType:"physical",title:`QA advanced optional ${suffix}`,publish:false,
  variants:[{title:"Standart",priceCents:14900,stockTracking:true,stockQuantity:5,attributes:{},continueSellingWhenOutOfStock:false,inventory:[],measurements:{height:{valueMilli:1,unit:"cm"}},unitPricing:{measuredQuantityMilli:3000,measuredUnit:"g",baseQuantityMilli:1000,baseUnit:"g"}}],
  categoryIds:[],resourceIds:{collections:[],tags:[],attributes:[],extras:[],definitions:[]},channelIds:[],profile:{minimumPurchaseQuantity:1} };
 const advIds=[randomUUID(),randomUUID()]; const advancedResult=await invoke("catalog_onboard_product_v3",[...auth[0],randomUUID(),fingerprint(advanced),advIds[0],[advIds[1]],advanced]);
 assert.equal(advancedResult.outcome,"created");assert.deepEqual(advancedResult.result_payload.variants[0].measurements,{height:{valueMilli:1,unit:"cm"}});
 const commerce=(await pool.query("SELECT measured_quantity_milli,measured_unit FROM saas.catalog_variant_commerce_profiles WHERE variant_id=$1",[advIds[1]])).rows[0];assert.equal(commerce.measured_quantity_milli,"3000");assert.equal(commerce.measured_unit,"g");success("advanced create allows one dimension and preserves unrelated unit-pricing data");
 const update = async (measurements,version=1,authority=auth[0],include=true) => invoke(include?"catalog_update_variant_measurements":"catalog_update_variant",[...authority,randomUUID(),fingerprint({measurements,version,token:randomUUID()}),ids[0],ids[1],version,...variantFields(),...(include?[measurements]:[])]);
 const changed={weight:{valueMilli:14891,unit:"g"}};const changedResult=await update(changed);assert.equal(changedResult.outcome,"updated");assert.deepEqual(changedResult.result_payload.variant.measurements,changed);assert.equal(changedResult.result_payload.variant.version,2);success("atomic variant edit changes measurement without changing stock or base price");
 const profileHistorical=await invoke("catalog_update_merchandising_v2",profileArgs);assert.equal(profileHistorical.outcome,"operation_replayed");assert.equal(profileHistorical.result_payload.variants[0].version,1);assert.equal(Object.hasOwn(profileHistorical.result_payload.variants[0],"measurements"),false);
 const publishHistorical=await invoke("catalog_publish_after_media_v2",publishArgs);assert.equal(publishHistorical.outcome,"operation_replayed");assert.equal(Object.hasOwn(publishHistorical.result_payload.variants[0],"measurements"),false);
 success("historical replays never pair current measurements with an older variant version");
 const omitted=await update(undefined,2,auth[0],false);assert.equal(omitted.outcome,"updated");assert.equal(omitted.result_payload.variant.measurements,undefined);assert.deepEqual((await pool.query("SELECT measurements FROM saas.product_variants WHERE id=$1",[ids[1]])).rows[0].measurements,changed);success("legacy update signature preserves stored optional measurements");
 const wrongStore=await update(full,3,auth[1]);assert.equal(wrongStore.outcome,"product_not_found");assert.deepEqual((await pool.query("SELECT measurements FROM saas.product_variants WHERE id=$1",[ids[1]])).rows[0].measurements,changed);success("cross-store metadata update is denied without mutation");
 const badAuth=[...auth[0]];badAuth[2]=randomUUID();const denied=await update(full,3,badAuth);assert.equal(denied.outcome,"membership_denied");success("missing membership authority denies metadata write");
 const raced=await Promise.all([update(full,3),update({volume:{valueMilli:1,unit:"l"}},3)]);assert.deepEqual(raced.map(r=>r.outcome).sort(),["updated","version_conflict"]);success("concurrent edits with the same version accept exactly one mutation");
 const clearArgs=[...auth[0],randomUUID(),fingerprint({clear:true}),ids[0],ids[1],4,...variantFields(),"null"];
 const cleared=await invoke("catalog_update_variant_measurements",clearArgs);assert.equal(cleared.outcome,"updated");assert.equal(Object.hasOwn(cleared.result_payload.variant,"measurements"),false);assert.equal((await pool.query("SELECT measurements FROM saas.product_variants WHERE id=$1",[ids[1]])).rows[0].measurements,null);
 const clearReplay=await invoke("catalog_update_variant_measurements",clearArgs);assert.equal(clearReplay.outcome,"operation_replayed");assert.equal(Object.hasOwn(clearReplay.result_payload.variant,"measurements"),false);success("explicit null clears metadata and replay preserves the cleared result");
 for(const invalid of [{},{weight:{valueMilli:0,unit:"g"}},{weight:{valueMilli:1,unit:"ml"}},{packageCount:1.5},{length:{valueMilli:1.5,unit:"cm"}},{unknown:1}]) {const result=await update(invalid,5);assert.equal(result.outcome,"invalid_input");}
 assert.equal((await pool.query("SELECT version,stock_quantity,price_cents FROM saas.product_variants WHERE id=$1",[ids[1]])).rows[0].version,"5");success("invalid filled metadata rejects unknown keys, nonpositive, fractional milli and wrong units atomically");
 const normalIds=[randomUUID(),randomUUID()];const normalProduct=[`qa-measurements-${suffix}`,`QA normal creation ${suffix}`,null,"draft","TRY"];
 const normal=await invoke("catalog_create_product_measurements",[...auth[0],randomUUID(),fingerprint({normal:true}),...normalIds,...normalProduct,...variantFields(),full]);assert.equal(normal.outcome,"created");assert.deepEqual(normal.result_payload.initialVariant.measurements,full);
 const newVariant=await invoke("catalog_create_variant_measurements",[...auth[0],randomUUID(),fingerprint({newVariant:true}),normalIds[0],randomUUID(),...variantFields("İkinci"),{packageCount:2}]);assert.equal(newVariant.outcome,"created");assert.deepEqual(newVariant.result_payload.variant.measurements,{packageCount:2});success("normal product and additional-variant create RPCs persist metadata in their ledger snapshots");
 const attributeSlug=`qa-measurements-${suffix}`;
 await pool.query("INSERT INTO saas.catalog_admin_resources(id,store_id,resource_kind,name,slug,config,created_at,updated_at) VALUES($1,$2,'attribute',$3,$4,$5::jsonb,$6,$6)",[randomUUID(),auth[0][0],`QA measurements ${suffix}`,attributeSlug,JSON.stringify({values:["QA"]}),now]);
 const batchVariant={title:"QA ölçülü varyant",priceCents:14900,stockTracking:true,stockQuantity:2,attributes:{[attributeSlug]:"QA"},measurements:{volume:{valueMilli:125,unit:"l"}}};
 const batchArgs=[...auth[0],randomUUID(),fingerprint(batchVariant),normalIds[0],[randomUUID()],JSON.stringify([batchVariant])];
 const batch=await invoke("catalog_create_variants_batch_v2",batchArgs);assert.equal(batch.outcome,"created");assert.deepEqual(batch.result_payload.variants[0].measurements,batchVariant.measurements);
 const batchReplay=await invoke("catalog_create_variants_batch_v2",batchArgs);assert.equal(batchReplay.outcome,"operation_replayed");assert.deepEqual(batchReplay.result_payload.variants[0].measurements,batchVariant.measurements);
 const invalidBatch=await invoke("catalog_create_variants_batch_v2",[...auth[0],randomUUID(),fingerprint({batchInvalid:true}),normalIds[0],[randomUUID()],JSON.stringify([{...batchVariant,measurements:{volume:{valueMilli:1,unit:"g"}}}])]);assert.equal(invalidBatch.outcome,"invalid_input");
 const crossStoreBatch=await invoke("catalog_create_variants_batch_v2",[...auth[1],randomUUID(),fingerprint({crossStoreBatch:true}),normalIds[0],[randomUUID()],JSON.stringify([batchVariant])]);assert.equal(crossStoreBatch.outcome,"product_not_found");
 success("batch create stores optional measurements atomically and preserves replay, unit and tenant boundaries");
 const permissions=(await pool.query("SELECT has_function_privilege('celebix_saas_app','saas.catalog_measurements_valid(jsonb)','EXECUTE') validator,has_function_privilege('celebix_saas_app','saas.catalog_create_variant_measurements_implementation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb,jsonb)','EXECUTE') implementation,has_table_privilege('celebix_saas_app','saas.product_variants','UPDATE') direct_write")).rows[0];assert.deepEqual(permissions,{validator:false,implementation:false,direct_write:false});success("application has only authorized public RPCs, no direct metadata table or private helper writes");
 console.log(JSON.stringify({status:"passed",tests:report.length,database:"celebix_measurements_qa_20260926",checks:report}));
} finally { await pool.end(); }
