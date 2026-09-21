import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import process from "node:process";
import pg from "pg";

const APPROVED_STORE="a828862c-4cc1-475a-89cc-5fbee31eb43f";
const APPROVED_TENANT="guzide-kuyumcu-4";
const INVENTORY_SOURCE="96764834f99a24f8c32ebd1d1ba246742d02740e";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA=/^[0-9a-f]{64}$/u;
function fail(message){throw new Error(`CATALOG_WEIGHT_BACKFILL_REFUSED:${message}`);}
function stable(value){if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(stable).join(",")}]`;return`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;}
function fingerprint(value){return createHash("sha256").update(stable(value),"utf8").digest("hex");}
function validate(manifest){
  if(!manifest||typeof manifest!=="object"||manifest.schemaVersion!==1||manifest.storeId!==APPROVED_STORE||manifest.tenantSlug!==APPROVED_TENANT||manifest.sourceHead!==INVENTORY_SOURCE||!UUID.test(manifest.operationId)||!UUID.test(manifest.profileOperationId)||!UUID.test(manifest.auditPrincipalId)||!Array.isArray(manifest.entries))fail("manifest_identity");
  if(manifest.protectedChanges?.price!==0||manifest.protectedChanges?.stock!==0||manifest.protectedChanges?.pricingPolicy!==0||manifest.protectedChanges?.activationGate!==0)fail("protected_change");
  const eligible=manifest.entries.filter(entry=>entry.action==="import_declared_weight");
  if(eligible.length!==manifest.counts?.eligibleWrites)fail("eligible_count");
  for(const entry of eligible){if(entry.group!==1||entry.target?.level!=="variant"||!UUID.test(entry.productId)||!UUID.test(entry.target.variantId)||!UUID.test(entry.importOperationId)||!UUID.test(entry.declarationId)||!SHA.test(entry.sourceDigest)||!Number.isSafeInteger(entry.sourceProductVersion)||entry.sourceProductVersion<1||!Number.isSafeInteger(entry.target.expectedVariantVersion)||entry.target.expectedVariantVersion<1||!Number.isSafeInteger(entry.extractedGramsMilli)||entry.extractedGramsMilli<1||entry.approximate!==false||entry.toleranceBasisPoints!==null||entry.pricingVerified!==false||typeof entry.sourceQuote!=="string")fail("unsafe_entry");}
  return eligible;
}
async function transaction(client,run){await client.query("BEGIN");try{await client.query("SET LOCAL ROLE celebix_saas_workflow");await client.query("SET LOCAL statement_timeout='5s'");await client.query("SET LOCAL lock_timeout='3s'");const result=await run();await client.query("COMMIT");return result;}catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}}
async function main(){
  const args=process.argv.slice(2);const apply=args.includes("--apply");const file=args.find(value=>!value.startsWith("--"));if(!file)fail("manifest_path");
  const manifest=JSON.parse(await readFile(file,"utf8"));const eligible=validate(manifest);
  if(!apply){process.stdout.write(`${JSON.stringify({mode:"dry_run",storeId:manifest.storeId,sourceHead:manifest.sourceHead,profileMode:"jewelry",eligible:eligible.length,protectedChanges:manifest.protectedChanges})}\n`);return;}
  const url=process.env.CATALOG_WEIGHT_DATABASE_URL;if(typeof url!=="string"||url.length<20)fail("database_url");
  const client=new pg.Client({connectionString:url,application_name:"catalog-weight-v1-backfill",statement_timeout:5000,lock_timeout:3000});await client.connect();const outcomes=[];
  try{
    const profileBody={storeId:manifest.storeId,mode:"jewelry",auditPrincipalId:manifest.auditPrincipalId};
    const profile=await transaction(client,()=>client.query("SELECT outcome,result_payload FROM saas.catalog_weight_profile_set($1::uuid,$2::uuid,$3::text,$4::text,$5::uuid,$6::timestamptz)",[manifest.storeId,manifest.profileOperationId,fingerprint(profileBody),"jewelry",manifest.auditPrincipalId,new Date()]));
    const profileOutcome=profile.rows[0]?.outcome;if(!["profile_set","profile_preserved","operation_replayed"].includes(profileOutcome))fail(`profile_${profileOutcome??"missing"}`);
    for(const entry of eligible){
      const body={storeId:manifest.storeId,productId:entry.productId,variantId:entry.target.variantId,sourceDigest:entry.sourceDigest,sourceProductVersion:entry.sourceProductVersion,expectedVariantVersion:entry.target.expectedVariantVersion,gramsMilli:entry.extractedGramsMilli,scope:entry.scope,salesUnit:entry.salesUnit};
      try{const result=await transaction(client,()=>client.query("SELECT outcome,result_payload FROM saas.catalog_weight_import($1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::uuid,$7::bigint,$8::bigint,$9::text,$10::text,$11::bigint,$12::text,$13::text,$14::boolean,$15::integer,$16::uuid,$17::timestamptz)",[manifest.storeId,entry.importOperationId,fingerprint(body),entry.declarationId,entry.productId,entry.target.variantId,entry.sourceProductVersion,entry.target.expectedVariantVersion,entry.sourceDigest,entry.sourceQuote,entry.extractedGramsMilli,entry.scope,entry.salesUnit,false,null,manifest.auditPrincipalId,new Date()]));const outcome=result.rows[0]?.outcome;outcomes.push({productId:entry.productId,variantId:entry.target.variantId,outcome});}
      catch(error){outcomes.push({productId:entry.productId,variantId:entry.target.variantId,outcome:"failed",error:error instanceof Error?error.message:"unknown"});}
    }
  }finally{await client.end().catch(()=>undefined);}
  const failed=outcomes.filter(({outcome})=>!["imported","operation_replayed","existing_value_preserved","stale_source"].includes(outcome));
  process.stdout.write(`${JSON.stringify({mode:"applied",storeId:manifest.storeId,profileMode:"jewelry",results:outcomes,protectedChanges:manifest.protectedChanges})}\n`);if(failed.length)process.exitCode=1;
}
await main();
