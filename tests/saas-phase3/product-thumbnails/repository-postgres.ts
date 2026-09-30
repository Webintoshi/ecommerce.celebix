import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pool, type PoolClient, type QueryResult } from "pg";
import type { TenantContext } from "../../../packages/saas-contracts/src/index.ts";
import { PostgresInStoreSalesRepository } from "../../../packages/saas-data/src/in-store-sales/index.ts";
import { resolveProductThumbnails, type ProductThumbnailReference } from "../../../packages/saas-data/src/product-thumbnails.ts";
import type { PostgresClientLike, PostgresPoolLike } from "../../../packages/saas-data/src/postgres/pool.ts";

const connectionString = process.env.PRODUCT_THUMBNAILS_NATIVE_DATABASE_URL;
if (!connectionString) throw new Error("PRODUCT_THUMBNAILS_NATIVE_DATABASE_URL required");
const url = new URL(connectionString);
if (url.pathname !== "/celebix_pos_v2_20260930" || url.hostname !== "localhost" || !url.searchParams.get("host")?.startsWith("/Users/Celebix/.codex/tmp/")) throw new Error("isolated POS clone required");
const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();
const id = (n: number) => `a1850000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const STORE="a1840000-0000-4000-8000-000000000001",PRINCIPAL="a1840000-0000-4000-8000-000000000002",MEMBER="a1840000-0000-4000-8000-000000000003",PLAN="a1840000-0000-4000-8000-000000000004";
const PRODUCT="a1840000-0000-4000-8000-000000000007",VARIANT="a1840000-0000-4000-8000-000000000008",VARIANT2="a1840000-0000-4000-8000-000000000009",SALE="a1840000-0000-4000-8000-000000000010";
const NOW=new Date("2026-09-26T10:00:00.000Z"),auth=[STORE,PRINCIPAL,MEMBER,PLAN,"pos184_qa",1,NOW];
const photo = (store: string, product: string, media: string) => `https://media.celebix.site/stores/${store}/products/${product}/${media}.webp`;
const MAIN=photo(STORE,PRODUCT,id(1)),SELECTED=photo(STORE,PRODUCT,id(2));
class ScopedClient implements PostgresClientLike {
 readonly queries: {text:string;values?:unknown[]}[]=[];
 constructor(private readonly client:PoolClient){}
 async query(text:string,values?:unknown[]):Promise<QueryResult<Record<string,unknown>>>{
  this.queries.push({text,values});
  if(text.startsWith("BEGIN"))return this.client.query("SAVEPOINT thumbnail_repository_call");
  if(text==="COMMIT")return this.client.query("RELEASE SAVEPOINT thumbnail_repository_call");
  if(text==="ROLLBACK"){await this.client.query("ROLLBACK TO SAVEPOINT thumbnail_repository_call");return this.client.query("RELEASE SAVEPOINT thumbnail_repository_call");}
  return this.client.query(text,values);
 }
 release(){}
}
const scoped=new ScopedClient(client),scopedPool:PostgresPoolLike={connect:async()=>scoped};
const repo=new PostgresInStoreSalesRepository({pool:scopedPool,role:"celebix_saas_app",timeouts:{poolCheckoutMs:1000,statementMs:10000,lockMs:1000,idleTransactionMs:10000}});
const tenantContext={schemaVersion:1,requestId:"thumbnail-native",principal:{id:PRINCIPAL,issuer:"https://qa.celebix.invalid",subject:"pos184"},store:{id:STORE,slug:"pos-regression-184",status:"active"},membership:{id:MEMBER,role:"store_owner",status:"active"},entitlements:{schemaVersion:1,planId:PLAN,planCode:"pos184_qa",version:1,status:"active",features:["orders","catalog","analytics"],limits:{products:100,staff:5,storageBytes:1024},validFrom:"2026-09-25T10:00:00.000Z"},locale:"tr-TR"} as TenantContext;
async function rpc(scope:string,refs:unknown,authority=auth) {return (await client.query("SELECT outcome,result_payload FROM saas.merchant_product_images($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::text,$9::jsonb)",[...authority,scope,JSON.stringify(refs)])).rows[0]!;}
async function attachMedia(store:string,product:string,media:string,variant:string|null,sort:number,status="active") {
 await client.query("INSERT INTO saas.product_media(id,store_id,product_id,variant_id,object_key,public_url,media_type,byte_size,sort_order,status,created_at,updated_at,archived_at,retention_expires_at,cleanup_state) VALUES($1,$2,$3,$4,$5,$6,'image/webp',10,$7,$8,$9,$9,CASE WHEN $8='archived' THEN $9::timestamptz ELSE NULL END,CASE WHEN $8='archived' THEN $9::timestamptz+interval '30 days' ELSE NULL END,CASE WHEN $8='archived' THEN 'retained' ELSE 'active' END)",[media,store,product,variant,`stores/${store}/products/${product}/${media}.webp`,photo(store,product,media),sort,status,NOW]);
}
try {
 await client.query("BEGIN");await client.query("SET LOCAL ROLE celebix_saas_owner");
 const fixture=readFileSync(new URL("../in-store-sales-register/price-payment-v2.sql",import.meta.url),"utf8").replace(/^BEGIN;$/m,"").replace(/^ROLLBACK;$/m,"");
 await client.query(fixture);
 await client.query("ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable");
 await client.query("INSERT INTO saas.plan_features VALUES($1,'analytics',3,true)",[PLAN]);
 await client.query("ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable");
 const foreignStore=id(10),foreignProduct=id(11),wrongProduct=id(12),emptyProduct=id(13),colorProduct=id(14),colorA=id(15),colorB=id(16);
 await client.query("INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES($1,'Other thumbnail store','thumbnail-other','active','tr','TRY','hemenaku',$2,$2)",[foreignStore,NOW]);
 for(const [product,store,slug] of [[foreignProduct,foreignStore,"foreign"],[wrongProduct,STORE,"wrong"],[emptyProduct,STORE,"empty"],[colorProduct,STORE,"colors"]])await client.query("INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES($1,$2,$3,'Thumbnail product','active','TRY',$4,$4)",[product,store,slug,NOW]);
 await client.query("INSERT INTO saas.product_variants(id,store_id,product_id,title,price_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES($1,$3,$4,'Red',100,false,0,'active',$5,$5),($2,$3,$4,'Blue',100,false,0,'active',$5,$5)",[colorA,colorB,STORE,colorProduct,NOW]);
 await attachMedia(STORE,PRODUCT,id(1),null,0);await attachMedia(STORE,PRODUCT,id(2),VARIANT,4);
 await attachMedia(STORE,PRODUCT,id(3),VARIANT2,1,"pending");await attachMedia(STORE,PRODUCT,id(4),VARIANT2,2,"archived");
 await attachMedia(foreignStore,foreignProduct,id(5),null,0);await attachMedia(STORE,wrongProduct,id(6),null,0);await attachMedia(STORE,colorProduct,id(7),colorB,0);
 const item=(await client.query("SELECT id FROM saas.order_items WHERE store_id=$1 AND order_id=(SELECT order_id FROM saas.in_store_sales WHERE id=$2) ORDER BY position LIMIT 1",[STORE,SALE])).rows[0]!.id as string;
 const order=(await client.query("SELECT order_id FROM saas.order_items WHERE id=$1",[item])).rows[0]!.order_id as string;
 const readers=[{principal:id(220),member:id(221),role:"analyst"},{principal:id(222),member:id(223),role:"editor"}];
 for(const reader of readers){
  await client.query("INSERT INTO saas.principals VALUES($1,'https://qa.celebix.invalid',$2,$3,true,$4,$4)",[reader.principal,reader.role,`${reader.role}@qa.celebix.invalid`,NOW]);
  await client.query("INSERT INTO saas.memberships VALUES($1,$2,$3,$4,'active',$5,$5)",[reader.member,reader.principal,STORE,reader.role,NOW]);
 }
 await client.query("SET LOCAL ROLE celebix_saas_app");
 const refs:ProductThumbnailReference[]=[{key:"selected",productId:PRODUCT,variantId:VARIANT},{key:"fallback",productId:PRODUCT,variantId:VARIANT2},{key:"main",productId:PRODUCT},{key:"missing",productId:emptyProduct},{key:"foreign",productId:foreignProduct},{key:"mismatch",productId:wrongProduct,variantId:VARIANT},{key:"other-color",productId:colorProduct,variantId:colorA}];
 scoped.queries.length=0;
 const images=await resolveProductThumbnails(scoped,auth,"pos",refs);
 assert.deepEqual([...images],[['selected',SELECTED],['fallback',MAIN],['main',MAIN],['missing',null],['foreign',null],['mismatch',null],['other-color',null]]);
 assert.equal(scoped.queries.length,1);
 assert.equal((await resolveProductThumbnails(scoped,auth,"analytics",[{key:"analytics",productId:PRODUCT}])).get("analytics"),MAIN);
 const orderImages=await resolveProductThumbnails(scoped,auth,"orders",[{key:"order",orderId:order,orderItemId:item},{key:"wrong-order",orderId:id(999),orderItemId:item}]);
 assert.equal(orderImages.get("order"),SELECTED);assert.equal(orderImages.get("wrong-order"),null);
 for(const reader of readers)assert.equal((await resolveProductThumbnails(scoped,[STORE,reader.principal,reader.member,PLAN,"pos184_qa",1,NOW],"orders",[{key:"read",orderId:order,orderItemId:item}])).get("read"),SELECTED);
 await client.query("SET LOCAL ROLE celebix_saas_owner");
 await client.query("INSERT INTO saas.order_archive_operations(store_id,operation_id,order_id,principal_id,membership_id,action,reason,evidence_reference,changed_at,result_payload) VALUES($1,$2,$3,$4,$5,'archive','Native QA archive','thumbnail-test',$6,'{}'::jsonb)",[STORE,id(230),order,PRINCIPAL,MEMBER,NOW]);
 await client.query("INSERT INTO saas.order_archive_state VALUES($1,$2,true,$3,$4)",[STORE,order,id(230),NOW]);
 await client.query("SET LOCAL ROLE celebix_saas_app");
 for(const reader of readers)assert.equal((await resolveProductThumbnails(scoped,[STORE,reader.principal,reader.member,PLAN,"pos184_qa",1,NOW],"orders",[{key:"archived-order",orderId:order,orderItemId:item}])).get("archived-order"),null);
 assert.equal((await resolveProductThumbnails(scoped,auth,"orders",[{key:"manager-archive",orderId:order,orderItemId:item}])).get("manager-archive"),SELECTED);
 const cashier=[STORE,"a1840000-0000-4000-8000-000000000041","a1840000-0000-4000-8000-000000000040",PLAN,"pos184_qa",1,NOW];
 assert.equal((await resolveProductThumbnails(scoped,cashier,"pos",[{key:"cashier",productId:PRODUCT,variantId:VARIANT}])).get("cashier"),SELECTED);
 assert.equal((await rpc("orders",[{key:"order",orderId:order,orderItemId:item}],cashier)).outcome,"membership_denied");
 assert.equal((await rpc("analytics",[{key:"main",productId:PRODUCT}],cashier)).outcome,"membership_denied");
 assert.equal((await rpc("pos",refs,[STORE,id(900),MEMBER,PLAN,"pos184_qa",1,NOW])).outcome,"membership_denied");
 assert.equal((await rpc("pos",refs,[foreignStore,PRINCIPAL,MEMBER,PLAN,"pos184_qa",1,NOW])).outcome,"membership_denied");
 for(const [scope,invalid] of [["pos",{}],["pos",[{key:"bad",productId:"bad"}]],["pos",[{key:"bad",productId:PRODUCT,variantId:[]}]],['pos',[{key:"same",productId:PRODUCT},{key:"same",productId:PRODUCT}]],['pos',Array.from({length:5001},(_,n)=>({key:String(n),productId:PRODUCT}))],['orders',[{key:"item",orderItemId:item}]],['pos',[{key:"item",orderId:order,orderItemId:item}]],['bad',[]]])assert.equal((await rpc(scope as string,invalid)).outcome,"invalid_input");
 const authority={tenantContext,now:NOW,contractVersion:2 as const};
 scoped.queries.length=0;
 const reopened=await repo.getSale({...authority,saleId:SALE});assert.equal(reopened.items[0]?.imageUrl,SELECTED);assert.equal(reopened.items[0]?.unitPriceOverrideCents,9000);
 assert.equal(scoped.queries.filter(q=>q.text.includes("merchant_product_images")).length,1);
 const locationId=(await repo.bootstrap(authority)).locations.find(location=>location.isDefault)!.id;
 const searched=await repo.searchProducts({...authority,locationId,query:"POS",limit:20});assert.equal(searched.products.find(product=>product.variantId===VARIANT)?.imageUrl,SELECTED);
 const recent=await repo.listSales({...authority,status:"completed",pageSize:50});assert.equal(recent.sales.find(sale=>sale.id===SALE)?.items[0]?.imageUrl,SELECTED);
 const bootstrap=await repo.bootstrap(authority);assert.equal(bootstrap.recentSales.find(sale=>sale.id===SALE)?.items[0]?.imageUrl,SELECTED);assert.equal(bootstrap.activeDraft?.items[0]?.imageUrl,MAIN);
 const replay=await repo.getOperation({...authority,operationId:"a1840000-0000-4000-8000-000000000020"});assert.equal(replay?.sale.items[0]?.imageUrl,null);
 await client.query("SET LOCAL ROLE celebix_saas_owner");
 // Product-only reads may choose the first active photo; a selected color never takes another color's photo.
 await client.query("UPDATE saas.product_media SET status='pending',updated_at=$1,version=version+1 WHERE id IN($2,$3)",[NOW,id(1),id(2)]);
 await client.query("UPDATE saas.product_media SET status='archived',archived_at=$1,retention_expires_at=$1::timestamptz+interval '30 days',cleanup_state='retained',updated_at=$1,version=version+1 WHERE id IN($2,$3)",[NOW,id(1),id(2)]);
 await client.query("UPDATE saas.product_media SET cleanup_state='cleanup_pending',updated_at=$1,version=version+1 WHERE id=$2",[NOW,id(4)]);
 await client.query("UPDATE saas.product_media SET cleanup_state='object_deleted',object_deleted_at=$1,updated_at=$1,version=version+1 WHERE id=$2",[NOW,id(4)]);
 await client.query("SET LOCAL ROLE celebix_saas_app");
 assert.equal((await resolveProductThumbnails(scoped,auth,"pos",[{key:"archived",productId:PRODUCT,variantId:VARIANT}])).get("archived"),null);
 const privileges=(await client.query("SELECT has_table_privilege(current_user,'saas.product_media','SELECT') AS media,has_table_privilege(current_user,'saas.order_items','SELECT') AS items,has_function_privilege('public','saas.merchant_product_images(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb)','EXECUTE') AS public_execute")).rows[0]!;
 assert.deepEqual(privileges,{media:false,items:false,public_execute:false});
 console.log("Native thumbnail SQL and POS repository passed: variant first, product fallback, color isolation, one query batch, cashier scope, tenant/order/archive isolation, bounded input, archived/deleted/missing media, all POS read groups, immutable replay and private tables.");
} finally {await client.query("ROLLBACK");client.release();await pool.end();}
