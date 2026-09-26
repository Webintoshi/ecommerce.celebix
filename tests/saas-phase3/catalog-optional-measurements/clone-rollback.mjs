import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

const connectionString=process.env.MEASUREMENTS_DATABASE_URL??readFileSync("/tmp/measurements-qa.env","utf8").match(/^MEASUREMENTS_DATABASE_URL=(.*)$/m)?.[1];
if(!connectionString)throw Error("MEASUREMENT_QA_CONNECTION_REQUIRED");
const client=new pg.Client({connectionString});await client.connect();
const migration=readFileSync(new URL("../../../apps/owner/scripts/sql/saas/202609260162_catalog_optional_measurements.down.sql",import.meta.url),"utf8");
const down=migration.split("\n").filter(line=>line!=="BEGIN;"&&line!=="COMMIT;").join("\n");
const newFunctions=JSON.parse(readFileSync("/tmp/measurements-qa-migration.json","utf8")).newFunctions;
async function functions(){return(await client.query("SELECT p.oid::regprocedure::text signature,r.rolname owner,p.proacl::text acl,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='saas' AND p.prokind='f' ORDER BY p.oid::regprocedure::text")).rows;}
async function metadata(){return(await client.query("SELECT count(*)::text count,md5(coalesce(jsonb_agg(jsonb_build_object('id',id,'measurements',measurements) ORDER BY id),'[]'::jsonb)::text) digest FROM saas.product_variants WHERE measurements IS NOT NULL")).rows[0];}
try{
 assert.equal((await client.query("SELECT current_database() db")).rows[0].db,"celebix_measurements_qa_20260926","EXACT_DISPOSABLE_CLONE_REQUIRED");
 const before=await functions(),beforeMetadata=await metadata();assert.ok(Number(beforeMetadata.count)>0,"POPULATED_METADATA_REQUIRED");
 await client.query("BEGIN");
 await assert.rejects(client.query(down),error=>error.message.startsWith("MEASUREMENT_ROLLBACK_DATA_PRESENT"));
 await client.query("ROLLBACK");assert.deepEqual(await metadata(),beforeMetadata);console.log("PASS populated metadata refuses destructive schema rollback without changing user values");
 await client.query("BEGIN");await client.query("SET LOCAL ROLE celebix_saas_owner");
 await client.query("UPDATE saas.product_variants SET measurements=NULL WHERE measurements IS NOT NULL");
 await client.query(down);
 const existing=before.filter(item=>!newFunctions.some(added=>added.signature===item.signature));
 assert.deepEqual(await functions(),existing,"ALL_ORIGINAL_FUNCTION_OWNER_ACL_AND_BODY_HASHES_RESTORED");
 assert.equal((await client.query("SELECT count(*)::text count FROM information_schema.columns WHERE table_schema='saas' AND table_name='product_variants' AND column_name='measurements'")).rows[0].count,"0");
 await client.query("ROLLBACK");assert.deepEqual(await functions(),before);assert.deepEqual(await metadata(),beforeMetadata);
 const report={checkedAt:new Date().toISOString(),status:"passed",database:"celebix_measurements_qa_20260926",originalFunctionsPreserved:existing.length,newFunctionsRemovedInRehearsal:newFunctions.length,populatedMetadataGuard:true,emptySchemaRollback:true,rehearsalFullyRolledBack:true};
 writeFileSync("/tmp/measurements-backend-rollback.json",JSON.stringify(report,null,2)+"\n");console.log("PASS clean schema rollback removes only the additive feature and preserves all legacy functions");console.log(JSON.stringify(report));
}finally{await client.query("ROLLBACK").catch(()=>undefined);await client.end();}
