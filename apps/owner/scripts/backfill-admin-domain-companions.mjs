import { randomUUID } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { createCloudflareCustomHostnameProvider, deriveManagedAdminHostname } from "@celebix/saas-domain-core";
import pg from "pg";

const { Client } = pg;
const HOST=/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

function exact(value,name,maximum=2048){if(typeof value!=="string"||value.length<1||value.length>maximum||value!==value.trim())throw new Error(`${name}_invalid`);return value;}
function hostname(value,name){const selected=exact(value,name,253);if(selected!==selected.toLowerCase()||!HOST.test(selected))throw new Error(`${name}_invalid`);return selected;}

export function resolveBackfillConfiguration(source=process.env,argv=process.argv.slice(2)){
  const apply=argv.includes("--apply");
  if(argv.some((value)=>value!=="--apply")||source.CELEBIX_DEPLOYMENT_TIER!=="staging"||source.CELEBIX_STAGING_MIGRATION_MODE!=="approved_staging")throw new Error("admin_companion_backfill_not_approved");
  const databaseUrl=exact(source.CELEBIX_TOSHI_MIGRATION_DATABASE_URL,"admin_companion_database_url",4096);
  const parsed=new URL(databaseUrl);if(!["postgres:","postgresql:"].includes(parsed.protocol)||!parsed.hostname||!parsed.pathname.slice(1))throw new Error("admin_companion_database_url_invalid");
  const adminCnameTarget=hostname(source.CELEBIX_CUSTOM_ADMIN_DOMAIN_CNAME_TARGET,"admin_companion_cname_target");
  const reservedSuffixes=Object.freeze(exact(source.CELEBIX_CUSTOM_DOMAIN_RESERVED_SUFFIXES,"admin_companion_reserved_suffixes",1024).split(",").map((value)=>hostname(value,"admin_companion_reserved_suffix")));
  if(reservedSuffixes.length<1||reservedSuffixes.length>16||new Set(reservedSuffixes).size!==reservedSuffixes.length)throw new Error("admin_companion_reserved_suffixes_invalid");
  if(!apply)return Object.freeze({apply,databaseUrl,adminCnameTarget,reservedSuffixes});
  const zoneId=exact(source.CLOUDFLARE_SAAS_ZONE_ID,"admin_companion_zone_id",128),apiToken=exact(source.CLOUDFLARE_SAAS_API_TOKEN,"admin_companion_api_token",2048);
  if(apiToken.length<8||/\s/u.test(apiToken))throw new Error("admin_companion_api_token_invalid");
  return Object.freeze({apply,databaseUrl,adminCnameTarget,reservedSuffixes,zoneId,apiToken});
}

export function buildBackfillPlan(storefronts,admins,policy){
  const adminByHostname=new Map(admins.map((row)=>[row.hostname,row]));
  return Object.freeze(storefronts.map((storefront)=>{
    const expectedAdminHostname=deriveManagedAdminHostname(storefront.hostname,policy),admin=adminByHostname.get(expectedAdminHostname)??null;
    const action=admin===null?"create":admin.storeId!==storefront.storeId?"conflict":admin.sourceStorefrontDomainId===storefront.id&&admin.management==="system"?"replay":admin.sourceStorefrontDomainId===null?"adopt":"conflict";
    return Object.freeze({storeId:storefront.storeId,storefrontDomainId:storefront.id,storefrontHostname:storefront.hostname,expectedAdminHostname,existingAdminDomainId:admin?.id??null,existingAdminVersion:admin?.version??null,providerHostnameId:admin?.providerHostnameId??null,providerStatus:admin===null?null:{hostnameStatus:admin.hostnameStatus,sslStatus:admin.sslStatus,dnsStatus:admin.dnsStatus,originStatus:admin.originStatus},conflict:action==="conflict",action});
  }));
}

function dns(value){if(value===null||value.type==="http")return[];return[{type:value.type==="txt"?"TXT":"CNAME",name:value.name,value:value.value}];}
async function ownerQuery(client,text,values){
  await client.query("BEGIN");
  try{await client.query("SET LOCAL ROLE celebix_saas_owner");const result=await client.query(text,values);await client.query("COMMIT");return result;}
  catch(error){try{await client.query("ROLLBACK");}catch{}throw error;}
}
async function provisionAndBind({client,provider,item,adminId,expectedVersion}){
  let snapshot;try{snapshot=await provider.create(item.expectedAdminHostname);}catch{snapshot=await provider.find(item.expectedAdminHostname);if(snapshot===null)throw new Error("admin_companion_backfill_provider_failed");}
  if(snapshot.hostname!==item.expectedAdminHostname)throw new Error("admin_companion_backfill_provider_failed");
  const bound=await ownerQuery(client,"SELECT outcome FROM saas.owner_bind_admin_domain_companion($1::uuid,$2::bigint,$3::text,$4::jsonb,$5::jsonb,clock_timestamp())",[adminId,expectedVersion,snapshot.providerHostnameId,JSON.stringify(dns(snapshot.ownershipValidation)),JSON.stringify(dns(snapshot.certificateValidation.find((entry)=>entry.type!=="http")??null))]);
  if(bound.rows[0]?.outcome!=="bound")throw new Error("admin_companion_backfill_bind_failed");
}

export async function runBackfill({client,config,write,provider}){
  await client.connect();
  try{
    const preflight=await client.query("SELECT pg_has_role(current_user,'celebix_saas_owner','MEMBER') AS owner_member,to_regprocedure('saas.owner_adopt_admin_domain_companion(uuid,uuid,text,text,timestamp with time zone)') IS NOT NULL AND to_regprocedure('saas.owner_prepare_admin_domain_companion(uuid,uuid,uuid,text,text,text,timestamp with time zone)') IS NOT NULL AS ready");
    if(preflight.rowCount!==1||preflight.rows[0]?.owner_member!==true||preflight.rows[0]?.ready!==true)throw new Error("admin_companion_backfill_preflight_failed");
    const [storefrontResult,adminResult]=await Promise.all([
      client.query("SELECT store_id AS \"storeId\",id,hostname FROM saas.store_domains WHERE hostname_type='custom_domain' AND status<>'disabled' ORDER BY store_id,hostname"),
      client.query("SELECT store_id AS \"storeId\",id,hostname,management,source_storefront_domain_id AS \"sourceStorefrontDomainId\",provider_hostname_id AS \"providerHostnameId\",version,hostname_status AS \"hostnameStatus\",ssl_status AS \"sslStatus\",dns_status AS \"dnsStatus\",origin_status AS \"originStatus\" FROM saas.admin_domains WHERE kind='custom_alias' ORDER BY store_id,hostname"),
    ]);
    const plan=buildBackfillPlan(storefrontResult.rows,adminResult.rows,{reservedSuffixes:config.reservedSuffixes,cnameTarget:config.adminCnameTarget});
    for(const item of plan)write(JSON.stringify(item));
    if(!config.apply)return Object.freeze({mode:"dry_run",plan});
    if(!provider)throw new Error("admin_companion_backfill_provider_missing");
    for(const item of plan){
      if(item.action==="conflict")continue;
      let adminId=item.existingAdminDomainId,expectedVersion=item.existingAdminVersion;
      if(item.action==="adopt"){
        const adopted=await ownerQuery(client,"SELECT outcome FROM saas.owner_adopt_admin_domain_companion($1::uuid,$2::uuid,$3::text,$4::text,clock_timestamp())",[item.storeId,item.storefrontDomainId,item.expectedAdminHostname,"staging-backfill-121"]);
        if(!["adopted","operation_replayed"].includes(adopted.rows[0]?.outcome))throw new Error("admin_companion_backfill_adopt_failed");
        if(adopted.rows[0]?.outcome==="adopted")expectedVersion+=1;
      }
      if(item.action==="create"){
        adminId=randomUUID();
        const prepared=await ownerQuery(client,"SELECT outcome,result_payload FROM saas.owner_prepare_admin_domain_companion($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::text,clock_timestamp())",[item.storeId,item.storefrontDomainId,adminId,item.expectedAdminHostname,config.adminCnameTarget,"staging-backfill-121"]);
        if(prepared.rows[0]?.outcome!=="prepared")throw new Error("admin_companion_backfill_prepare_failed");
        expectedVersion=prepared.rows[0].result_payload.version;
      }
      if(item.action==="create"||((item.action==="adopt"||item.action==="replay")&&item.providerHostnameId===null))await provisionAndBind({client,provider,item,adminId,expectedVersion});
    }
    return Object.freeze({mode:"applied",plan});
  }finally{await client.end();}
}

async function main(){const config=resolveBackfillConfiguration();const client=new Client({connectionString:config.databaseUrl,application_name:"celebix-staging-admin-companion-backfill",connectionTimeoutMillis:10000,statement_timeout:60000,lock_timeout:10000,idle_in_transaction_session_timeout:30000});const provider=config.apply?createCloudflareCustomHostnameProvider({zoneId:config.zoneId,apiToken:config.apiToken,apiBaseUrl:"https://api.cloudflare.com/client/v4",minimumTlsVersion:"1.2",timeoutMs:5000}):null;const result=await runBackfill({client,config,provider,write:(line)=>process.stdout.write(`${line}\n`)});process.stdout.write(`admin_companion_backfill=${result.mode}\n`);}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch((error)=>{const code=error instanceof Error&&/^admin_companion_[a-z_]+$/.test(error.message)?error.message:"admin_companion_backfill_failed";process.stderr.write(`${code}\n`);process.exitCode=1;});
