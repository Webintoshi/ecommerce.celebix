// Reuses the established retail fixture seed against a disposable PostgreSQL16 cluster.
import assert from "node:assert/strict";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";


const ROOT=path.resolve(import.meta.dirname,"../../.."),SQL=path.join(ROOT,"apps/owner/scripts/sql/saas"),DB="starter_retail_experience",RESTORE="starter_retail_restore";
const UP="202608020075_complete_starter_retail_experience.up.sql",DOWN="202608020075_complete_starter_retail_experience.down.sql",ASSERTIONS="202608020075_complete_starter_retail_experience_assertions.sql";
const STORE_A="10000000-0000-4000-8000-000000000075",STORE_B="10000000-0000-4000-8000-000000000076",HOST_A="retail-a.example.test",HOST_PLATFORM="retail-a.saas-staging.celebix.site",HOST_B="retail-b.example.test",PLAN="00000000-0000-4000-8000-000000000001";
const PRINCIPAL_A="20000000-0000-4000-8000-000000000075",PRINCIPAL_B="20000000-0000-4000-8000-000000000076",MEMBERSHIP_A="30000000-0000-4000-8000-000000000075",MEMBERSHIP_B="30000000-0000-4000-8000-000000000076";
const PRODUCT="40000000-0000-4000-8000-000000000075",INACTIVE_PRODUCT="40000000-0000-4000-8000-000000000076",VARIANT="50000000-0000-4000-8000-000000000075",COMPOSITION="60000000-0000-4000-8000-000000000075",NOW="2026-08-02T09:00:00.000Z";

function executable(name){const candidates=[process.env.POSTGRES_BIN,...(process.env.PATH??"").split(path.delimiter)];try{for(const entry of readdirSync(path.join(homedir(),".codex","tmp"),{withFileTypes:true}))if(entry.isDirectory()&&/^postgresql-16[.]/.test(entry.name))candidates.push(path.join(homedir(),".codex","tmp",entry.name,"bin"));}catch{}for(const directory of candidates){if(!directory)continue;const candidate=path.join(directory,name);try{accessSync(candidate,constants.X_OK);return candidate;}catch{}}throw new Error(`DISPOSABLE_DB_EXECUTION_BLOCKED: missing ${name}`);}
function command(program,args,input="",allowFailure=false,environment={}){const result=spawnSync(program,args,{cwd:ROOT,input,encoding:"utf8",env:{...process.env,...environment,LC_ALL:"C",LANG:"C"},maxBuffer:128*1024*1024});if(result.error)throw result.error;if(!allowFailure&&result.status!==0)throw new Error(`${path.basename(program)} failed\n${result.stderr}`);return result;}
function start(){
 const tools=Object.fromEntries(["initdb","pg_ctl","psql"].map(name=>[name,executable(name)]));
 const root=mkdtempSync(path.join(tmpdir(),"celebix-product-seo-")),data=path.join(root,"data"),socket=path.join(root,"socket"),port=20000+Math.floor(Math.random()*15000);
 mkdirSync(socket,{mode:0o700});
 command(tools.initdb,["-D",data,"--auth=trust","--username=postgres","--no-locale","--encoding=UTF8"]);
 command(tools.pg_ctl,["-D",data,"-o",`-k ${socket} -p ${port} -h ''`,"-l",path.join(root,"postgres.log"),"start"]);
 return{tools,root,data,socket,port};
}
function stop(box){if(!box)return;command(box.tools.pg_ctl,["-D",box.data,"-m","fast","stop"],"",true);rmSync(box.root,{recursive:true,force:true});}
function psql(box,source,database=DB,allowFailure=false){return command(box.tools.psql,["-h",box.socket,"-p",String(box.port),"-X","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d",database],source,allowFailure);}
function apply(box,file,database=DB){psql(box,readFileSync(path.join(SQL,file),"utf8"),database);}
function migrations(){const accepted=/(?:[.]up|[.]seed|[.]freeze|_grants|_assertions|catalog_assertions)[.]sql$/;return readdirSync(SQL).filter(file=>{const sequence=Number.parseInt(file.slice(8,12),10);return Number.isSafeInteger(sequence)&&sequence<=71&&accepted.test(file)&&!file.includes(".down.");}).sort((left,right)=>{const a=Number.parseInt(left.slice(8,12),10),b=Number.parseInt(right.slice(8,12),10);if(a!==b)return a-b;const weight=value=>value.includes("assertions")?3:value.includes("freeze")||value.includes("grants")?2:1;return weight(left)-weight(right)||left.localeCompare(right);});}
function result(box,call,database=DB){const output=psql(box,`BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome||'|'||COALESCE(result_payload::text,'null') FROM ${call};COMMIT;`,database).stdout.trim().split("\n").at(-1),separator=output.indexOf("|");return{outcome:output.slice(0,separator),payload:JSON.parse(output.slice(separator+1))};}
async function main(){let box;try{
 for(const file of [UP,DOWN,ASSERTIONS])assert.equal(existsSync(path.join(SQL,file)),true,file);box=start();psql(box,`CREATE DATABASE ${DB};`,"postgres");for(const file of migrations())apply(box,file);for(const file of ["202607310072_storefront_cart_checkout.up.sql","202608010073_storefront_checkout_readiness.up.sql","202608010073_storefront_checkout_readiness_assertions.sql","202608010074_campaign_starter_composition.up.sql","202608010074_campaign_starter_composition_assertions.sql"])apply(box,file);apply(box,UP);apply(box,ASSERTIONS);
 assert.match(psql(box,"SHOW server_version;").stdout,/^16[.]/);
 psql(box,`BEGIN;SET LOCAL ROLE celebix_saas_owner;
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${STORE_A}','Retail A','retail-a','active','tr','TRY','starter','2026-01-01','2026-01-01'),('${STORE_B}','Retail B','retail-b','active','tr','TRY','starter','2026-01-01','2026-01-01');
 INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${PRINCIPAL_A}','https://identity.example.test/oidc','a','a@example.test',true,'2026-01-01','2026-01-01'),('${PRINCIPAL_B}','https://identity.example.test/oidc','b','b@example.test',true,'2026-01-01','2026-01-01');
 INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${MEMBERSHIP_A}','${PRINCIPAL_A}','${STORE_A}','store_owner','active','2026-01-01','2026-01-01'),('${MEMBERSHIP_B}','${PRINCIPAL_B}','${STORE_B}','store_owner','active','2026-01-01','2026-01-01');
 INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('71000000-0000-4000-8000-000000000075','${STORE_A}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01'),('71000000-0000-4000-8000-000000000076','${STORE_B}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
 INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES('72000000-0000-4000-8000-000000000075','${STORE_A}','${HOST_A}','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1),('72000000-0000-4000-8000-000000000074','${STORE_A}','${HOST_PLATFORM}','platform_subdomain','active',false,'2026-01-01','2026-01-01','2026-01-01',1),('72000000-0000-4000-8000-000000000076','${STORE_B}','${HOST_B}','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
 INSERT INTO saas.products(id,store_id,slug,title,description,status,currency,version,archived_at,created_at,updated_at) VALUES('${PRODUCT}','${STORE_A}','keten-etek','Keten Etek','**Yumuşak** dokulu.','active','TRY',1,NULL,'2026-01-01','2026-01-01'),('${INACTIVE_PRODUCT}','${STORE_A}','arsiv-urun','Arşiv Ürün',NULL,'archived','TRY',1,'2026-01-01','2026-01-01','2026-01-01');
 SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);SELECT pg_catalog.set_config('saas.inventory.source_id','73000000-0000-4000-8000-000000000075',true);SELECT pg_catalog.set_config('saas.inventory.source_time','${NOW}',true);
 INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,barcode,price_cents,compare_at_cents,cost_cents,stock_tracking,stock_quantity,status,attributes,version,archived_at,created_at,updated_at) VALUES('${VARIANT}','${PRODUCT}','${STORE_A}','Standart','RETAIL-1',NULL,11200,NULL,NULL,true,5,'active','{}',1,NULL,'2026-01-01','2026-01-01');
 SELECT pg_catalog.set_config('saas.inventory.source_marker','',true);SELECT pg_catalog.set_config('saas.inventory.source_id','',true);SELECT pg_catalog.set_config('saas.inventory.source_time','',true);
 INSERT INTO saas.product_reviews(id,store_id,product_id,reviewer_name,rating,review_title,review_body,status,merchant_reply,version,created_at,updated_at) VALUES('74000000-0000-4000-8000-000000000075','${STORE_A}','${PRODUCT}','Ada',5,'Harika','Çok memnun kaldım.','approved','Teşekkür ederiz.',1,'2026-02-01','2026-02-01'),('74000000-0000-4000-8000-000000000076','${STORE_A}','${PRODUCT}','Ece',5,NULL,'Gizli bekleyen yorum.','pending',NULL,1,'2026-02-02','2026-02-02'),('74000000-0000-4000-8000-000000000077','${STORE_A}','${INACTIVE_PRODUCT}','Can',5,NULL,'Arşiv ürün yorumu.','approved',NULL,1,'2026-02-03','2026-02-03');
 INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES('77000000-0000-4000-8000-000000000075','${STORE_A}','seo_control','SEO','{"metaTitle":"Retail A","metaDescription":"Retail A ürünleri","allowIndex":true}','active',1,'2026-01-01','2026-01-01');
 INSERT INTO saas.catalog_admin_resources(id,store_id,resource_kind,name,slug,config,status,version,created_at,updated_at) VALUES('75000000-0000-4000-8000-000000000075','${STORE_A}','definition','Özellik','ozellik','{"role":"highlight","text":"Nefes alan dokuma"}','active',1,'2026-01-01','2026-01-01'),('75000000-0000-4000-8000-000000000076','${STORE_A}','attribute','Bakım','bakim','{"role":"materials_and_care","body":"Elde nazikçe yıkayın."}','active',1,'2026-01-01','2026-01-01'),('75000000-0000-4000-8000-000000000077','${STORE_A}','extra','Sertifika','sertifika','{"role":"certification","label":"Sorumlu üretim"}','active',1,'2026-01-01','2026-01-01');
 INSERT INTO saas.catalog_admin_resource_products(store_id,resource_id,product_id,position) VALUES('${STORE_A}','75000000-0000-4000-8000-000000000075','${PRODUCT}',0),('${STORE_A}','75000000-0000-4000-8000-000000000076','${PRODUCT}',0),('${STORE_A}','75000000-0000-4000-8000-000000000077','${PRODUCT}',0);COMMIT;`);

 const call=(store=STORE_A,host=HOST_A,name="public_starter_product_detail_v2")=>`saas.${name}('${store}','${host}','${NOW}','keten-etek')`;
 const before=result(box,call(STORE_A,HOST_A,"public_starter_product_detail"));
 assert.equal(before.outcome,"found");
 assert.equal(psql(box,`SELECT to_regprocedure('saas.public_starter_product_detail_v2(uuid,text,timestamp with time zone,text)') IS NULL;`).stdout.trim(),"t");
 apply(box,"202609290171_storefront_product_seo.up.sql");
 const nullable=result(box,call());
 assert.deepEqual(nullable.payload,{...before.payload,seoTitle:null,seoDescription:null});
 psql(box,`SET ROLE celebix_saas_owner;INSERT INTO saas.catalog_product_profiles(product_id,store_id,product_type,seo_title,seo_description,created_at,updated_at) VALUES('${PRODUCT}','${STORE_A}','physical','Saved linen title','Saved linen description','${NOW}','${NOW}');`);
 const saved=result(box,call());
 assert.equal(saved.payload.seoTitle,"Saved linen title");assert.equal(saved.payload.seoDescription,"Saved linen description");
 assert.deepEqual(result(box,call(STORE_A,HOST_A,"public_starter_product_detail")),before);
 assert.equal(result(box,call(STORE_B,HOST_A)).outcome,"not_found");
 assert.equal(result(box,call(STORE_A,HOST_B)).outcome,"not_found");
 assert.equal(result(box,call(STORE_B,HOST_B)).outcome,"not_found");
 assert.doesNotMatch(JSON.stringify(saved.payload),/supplierName|supplier_name|googleProductCategoryId/);
 assert.equal(psql(box,`SELECT has_function_privilege('celebix_saas_host_resolver','saas.public_starter_product_detail_v2(uuid,text,timestamp with time zone,text)','EXECUTE'),has_function_privilege('celebix_saas_app','saas.public_starter_product_detail_v2(uuid,text,timestamp with time zone,text)','EXECUTE');`).stdout.trim(),"t|f");
 psql(box,`SET ROLE celebix_saas_owner;UPDATE saas.catalog_product_profiles SET seo_title='After save',version=version+1 WHERE product_id='${PRODUCT}';`);
 assert.equal(result(box,call()).payload.seoTitle,"After save");
 apply(box,"202609290171_storefront_product_seo.down.sql");
 assert.deepEqual(result(box,call(STORE_A,HOST_A,"public_starter_product_detail")),before);
 apply(box,"202609290171_storefront_product_seo.up.sql");
 assert.equal(result(box,call()).payload.seoTitle,"After save");
 console.log("PASS PostgreSQL16 V1 unchanged, V2 nullable/saved/live SEO, tenant isolation, grants, down/up");
 }finally{stop(box);}
}
await main();
