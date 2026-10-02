import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// A disposable, socket-only PostgreSQL fixture exercises the real migration. The
// fixture substitutes only the existing price projection and hostname authority.
const PG = process.env.CELEBIX_TEST_PG_BIN ?? '/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin';
const ROOT = path.resolve(import.meta.dirname, '../../../../..');
const SQL = import.meta.dirname;
const A = '10000000-0000-4000-8000-000000000194';
const B = '10000000-0000-4000-8000-000000000195';
const P = '20000000-0000-4000-8000-000000000194';
const Q = '20000000-0000-4000-8000-000000000195';
const V = '30000000-0000-4000-8000-000000000194';
const C = '10000000-0000-4000-8000-000000000196';
const LEASE = '40000000-0000-4000-8000-000000000194';
const NOW = '2027-10-02T12:00:00Z';
function run(program, args, input) {
  const result = spawnSync(program, args, { cwd: ROOT, input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
const fixture = `
CREATE ROLE celebix_saas_owner NOLOGIN BYPASSRLS;
CREATE ROLE celebix_saas_app NOLOGIN;
CREATE ROLE celebix_saas_workflow NOLOGIN;
CREATE ROLE celebix_saas_host_resolver NOLOGIN;
CREATE ROLE celebix_saas_identity NOLOGIN;
CREATE ROLE celebix_saas_bootstrap NOLOGIN;
CREATE ROLE celebix_saas_observability NOLOGIN;
CREATE ROLE celebix_saas_migrator NOLOGIN;
GRANT CREATE ON DATABASE postgres TO celebix_saas_owner;
CREATE SCHEMA saas AUTHORIZATION celebix_saas_owner;
GRANT USAGE ON SCHEMA saas TO celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
SET ROLE celebix_saas_owner;
CREATE TABLE saas.stores(id uuid PRIMARY KEY,status text);
CREATE TABLE saas.products(id uuid PRIMARY KEY,store_id uuid,slug text,title text,description text,status text,created_at timestamptz);
CREATE TABLE saas.product_variants(id uuid PRIMARY KEY,store_id uuid,product_id uuid,title text,sku text,barcode text,attributes jsonb,status text,stock_tracking boolean,stock_quantity bigint,price_cents bigint);
CREATE TABLE saas.catalog_categories(id uuid PRIMARY KEY,store_id uuid,name text,slug text,status text);
CREATE TABLE saas.catalog_product_categories(store_id uuid,product_id uuid,category_id uuid);
CREATE TABLE saas.catalog_admin_resources(id uuid PRIMARY KEY,store_id uuid,name text,slug text,status text,resource_kind text);
CREATE TABLE saas.catalog_admin_resource_products(store_id uuid,product_id uuid,resource_id uuid);
CREATE FUNCTION saas.store_policy_hostname_valid(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT $1 IN('a.example.test','b.example.test','c.example.test') $$;
CREATE FUNCTION saas.store_policy_public_store(text,timestamptz) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM saas.stores WHERE id=CASE $1 WHEN 'a.example.test' THEN '${A}'::uuid WHEN 'b.example.test' THEN '${B}'::uuid WHEN 'c.example.test' THEN '${C}'::uuid END AND status='active' $$;
CREATE FUNCTION saas.store_policy_timestamp(timestamptz) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT to_char($1 AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;
CREATE FUNCTION saas.resolve_effective_variant_price(uuid,uuid,text,timestamptz,text) RETURNS TABLE(outcome text,price_cents bigint,source_kind text,price_list_id uuid) LANGUAGE sql STABLE AS $$ SELECT CASE WHEN v.price_cents<0 THEN 'unavailable' ELSE 'found' END,v.price_cents,'fixed',NULL::uuid FROM saas.product_variants v WHERE v.store_id=$1 AND v.id=$2 AND v.status='active' $$;
CREATE FUNCTION saas.public_effective_product_projection(uuid,uuid,timestamptz) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('id',p.id,'title',p.title,'slug',p.slug,'priceCents',min(r.price_cents),'available',bool_or(NOT v.stock_tracking OR v.stock_quantity>0)) FROM saas.products p JOIN saas.product_variants v ON v.store_id=p.store_id AND v.product_id=p.id AND v.status='active' CROSS JOIN LATERAL saas.resolve_effective_variant_price($1,v.id,'storefront',$3,NULL) r WHERE p.store_id=$1 AND p.id=$2 AND p.status='active' AND r.outcome='found' GROUP BY p.id $$;
CREATE FUNCTION saas.public_search_products(text,timestamptz,text,integer,text) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER STABLE SET search_path=pg_catalog,saas AS $$ SELECT 'found',jsonb_build_object('items',COALESCE(jsonb_agg(saas.public_effective_product_projection(p.store_id,p.id,$2)),'[]'::jsonb)) FROM saas.products product JOIN saas.products p ON p.id=product.id WHERE product.store_id=saas.store_policy_public_store($1,$2) AND product.status='active' AND (p_query='' OR pg_catalog.strpos(pg_catalog.lower(product.title),pg_catalog.lower(p_query))>0) $$;
`;
// Named arguments make the predecessor predicate match the deployed function.
const predecessor = fixture.replace('saas.public_search_products(text,timestamptz,text,integer,text)', 'saas.public_search_products(p_hostname text,p_now timestamptz,p_query text,p_limit integer,p_cursor text)') + `
CREATE FUNCTION saas.public_catalog_query_v2(p_hostname text,p_now timestamptz,p_category_slug text,p_query text,p_filter text,p_order text,p_limit integer,p_offset integer) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $$ SELECT 'found',jsonb_build_object('items',COALESCE(jsonb_agg(jsonb_build_object('id',product.id)),'[]'::jsonb)) FROM saas.products product WHERE product.store_id=saas.store_policy_public_store(p_hostname,p_now) AND product.status='active' AND (p_query='' OR pg_catalog.strpos(pg_catalog.lower(product.title),pg_catalog.lower(p_query))>0) $$;
CREATE FUNCTION saas.public_catalog_collection_query(p_hostname text,p_now timestamptz,p_slug text,p_query text,p_filter text,p_order text,p_limit integer,p_offset integer) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $$ SELECT 'found',jsonb_build_object('items',COALESCE(jsonb_agg(jsonb_build_object('id',p.id)),'[]'::jsonb)) FROM saas.products p WHERE p.store_id=saas.store_policy_public_store(p_hostname,p_now) AND p.status='active' AND (p_query='' OR strpos(lower(p.title),lower(p_query))>0) $$;
RESET ROLE;
`;

test('194 real PostgreSQL search behavior and durable indexing lifecycle', async (t) => {
  const directory = mkdtempSync('/tmp/celebix-shared-search-');
  const socket = path.join(directory, 'socket');
  mkdirSync(socket);
  const port = String(23000 + Math.floor(Math.random() * 18000));
  const args = ['-h',socket,'-p',port,'-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'];
  const query = (sql) => run(path.join(PG,'psql'),args,sql);
  const json = (sql) => JSON.parse(query(sql));
  const concurrent = (sql) => new Promise((resolve,reject) => {
    const process = spawn(path.join(PG,'psql'),args,{stdio:['pipe','pipe','pipe']});
    let output='',error='';process.stdout.on('data',v=>output+=v);process.stderr.on('data',v=>error+=v);
    process.on('close',code=>code===0?resolve(output.trim()):reject(Error(error)));process.stdin.end(sql);
  });
  try {
    run(path.join(PG,'initdb'),['-D',path.join(directory,'data'),'--auth=trust','--username=postgres','--no-locale','--encoding=UTF8']);
    run(path.join(PG,'pg_ctl'),['-D',path.join(directory,'data'),'-o',`-k ${socket} -p ${port} -h ''`,'-l',path.join(directory,'postgres.log'),'start']);
    query(predecessor);
    query(`SET ROLE celebix_saas_owner; INSERT INTO saas.stores VALUES ('${A}','active'),('${B}','active'); INSERT INTO saas.products VALUES ('${P}','${A}','mavi-gomlek','Mavi Gömlek','<p>IŞIK İstanbul güzel</p>','active','2026-01-01'),('${Q}','${B}','mavi-gomlek','Mavi Gömlek',NULL,'active','2026-01-01'); INSERT INTO saas.product_variants VALUES ('${V}','${A}','${P}','Büyük','ABC-194','8680000194','{"renk":"Kırmızı","beden":"XL"}','active',true,8,1000),('30000000-0000-4000-8000-000000000195','${B}','${Q}','Default','ABC-194','8680000194','{}','active',true,8,1000);`);
    const up = path.join(SQL,'202610020194_shared_catalog_search.up.sql');
    if (existsSync(up)) query(readFileSync(up,'utf8'));
    await t.test('Turkish folding fixes dotted/dotless I, accents and whitespace', () => {
      assert.equal(query("SELECT to_regprocedure('saas.catalog_search_normalize(text)') IS NOT NULL"),'t','normalized search is missing');
      assert.equal(query("SELECT saas.catalog_search_normalize(E' Iİıi  ÇĞÖŞÜ É\\t\\n')"),'iiii cgosu e');
      assert.equal(query("SELECT saas.catalog_search_normalize(U&'Go\\0308mlek\\00a0 MAVI')"),'gomlek mavi');
    });
    if (!existsSync(up)) return;
    query(readFileSync(path.join(SQL,'202610020194_shared_catalog_search_assertions.sql'),'utf8'));
    const search = (term, cursor='NULL') => json(`SET ROLE celebix_saas_host_resolver; SELECT result_payload FROM saas.public_search_products('a.example.test','${NOW}','${term}',48,${cursor});`);
    await t.test('ASCII/reordered terms, SKU, barcode and variant attributes return only own tenant', () => {
      for (const term of ['gomlek mavi','isik','istanbul','ABC-194','8680000194','kirmizi xl']) assert.deepEqual(search(term).items.map(p=>p.id),[P],term);
      assert.equal(search('gomelk').items[0].id,P,'trigram typo fallback');
    });
    await t.test('catalog and collection queries share SKU matching', () => {
      for (const fn of ['public_catalog_query_v2','public_catalog_collection_query']) assert.deepEqual(json(`SET ROLE celebix_saas_host_resolver; SELECT result_payload FROM saas.${fn}('a.example.test','${NOW}',NULL,'ABC-194','all','featured',24,0);`).items.map(p=>p.id),[P]);
    });
    await t.test('new store product is indexed transactionally without setup', () => {
      const before = query(`SELECT generation FROM saas.catalog_search_outbox WHERE store_id='${A}' AND product_id='${P}'`);
      query(`BEGIN; SET ROLE celebix_saas_owner; UPDATE saas.products SET title='Değişti' WHERE id='${P}'; ROLLBACK;`);
      assert.equal(query(`SELECT generation FROM saas.catalog_search_outbox WHERE store_id='${A}' AND product_id='${P}'`),before);
      assert.equal(search('mavi gomlek').items[0].id,P);
      query(`SET ROLE celebix_saas_owner; INSERT INTO saas.products VALUES ('20000000-0000-4000-8000-000000000196','${A}','yeni-urun','Yeni Ürün',NULL,'active','2026-01-02'); INSERT INTO saas.product_variants VALUES ('30000000-0000-4000-8000-000000000196','${A}','20000000-0000-4000-8000-000000000196','Default',NULL,NULL,'{}','active',false,0,1000);`);
      assert.equal(search('yeni urun').items[0].id,'20000000-0000-4000-8000-000000000196');
    });
    await t.test('resource assignments, renames, status and deletes refresh matching', () => {
      query(`SET ROLE celebix_saas_owner; INSERT INTO saas.catalog_categories VALUES ('50000000-0000-4000-8000-000000000194','${A}','Özel Kategori','ozel-kategori','active'); INSERT INTO saas.catalog_product_categories VALUES ('${A}','${P}','50000000-0000-4000-8000-000000000194'); INSERT INTO saas.catalog_admin_resources VALUES ('60000000-0000-4000-8000-000000000194','${A}','Şık Marka','sik-marka','active','brand'); INSERT INTO saas.catalog_admin_resource_products VALUES ('${A}','${P}','60000000-0000-4000-8000-000000000194');`);
      assert.equal(search('ozel kategori').items[0].id,P);assert.equal(search('sik marka').items[0].id,P);
      query(`SET ROLE celebix_saas_owner; UPDATE saas.catalog_categories SET name='Başka Kategori',slug='baska-kategori' WHERE store_id='${A}'; DELETE FROM saas.catalog_admin_resource_products WHERE store_id='${A}';`);
      assert.equal(search('ozel kategori').items.length,0);assert.equal(search('baska kategori').items[0].id,P);assert.equal(search('sik marka').items.length,0);
    });
    let first;
    await t.test('claim is tenant-scoped, metadata-only and keeps pending during lease', () => {
      first = json(`SET ROLE celebix_saas_workflow; SELECT result_payload FROM saas.catalog_search_claim('${NOW}',100,'${LEASE}')`);
      assert.equal(first.length,3);assert.equal(first.find(p=>p.productId===P).document.id,`${A}_${P}`);
      assert.equal(JSON.stringify(first).includes('priceCents'),false);assert.equal(JSON.stringify(first).includes('stockQuantity'),false);
      assert.equal(json(`SET ROLE celebix_saas_host_resolver; SELECT result_payload FROM saas.public_catalog_search_scope('a.example.test','${NOW}')`).pending,true);
      assert.deepEqual(json(`SET ROLE celebix_saas_workflow; SELECT result_payload FROM saas.catalog_search_claim('${NOW}',100,'40000000-0000-4000-8000-000000000195')`),[]);
    });
    await t.test('another store pending changes cannot force own-store fallback', () => {
      const job=first.find(j=>j.storeId===B);
      assert.equal(query(`SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.catalog_search_ack('${LEASE}','${B}','${Q}',${job.generation},'${NOW}',NULL)`),'acknowledged');
      assert.equal(json(`SET ROLE celebix_saas_host_resolver; SELECT result_payload FROM saas.public_catalog_search_scope('b.example.test','${NOW}')`).pending,false);
      assert.equal(json(`SET ROLE celebix_saas_host_resolver; SELECT result_payload FROM saas.public_catalog_search_scope('a.example.test','${NOW}')`).pending,true);
    });
    await t.test('newer generations survive old acknowledgement and recover late stale tasks', () => {
      const job=first.find(p=>p.productId===P);
      query(`SET ROLE celebix_saas_owner; UPDATE saas.products SET title='Yeni Mavi Gömlek' WHERE id='${P}'`);
      assert.equal(query(`SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.catalog_search_ack('${LEASE}','${A}','${P}',${job.generation},'${NOW}',NULL)`),'stale');
      const next=json(`SET ROLE celebix_saas_workflow; SELECT result_payload FROM saas.catalog_search_claim('${NOW}',100,'40000000-0000-4000-8000-000000000196')`).find(p=>p.productId===P);
      assert.equal(next.generation>job.generation,true);assert.equal(next.document.title,'Yeni Mavi Gömlek');
      query(`SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.catalog_search_ack('40000000-0000-4000-8000-000000000196','${A}','${P}',${next.generation},'${NOW}',NULL)`);
      query(`SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.catalog_search_ack('${LEASE}','${A}','${P}',${job.generation},'${NOW}',NULL)`);
      assert.equal(json(`SET ROLE celebix_saas_host_resolver; SELECT result_payload FROM saas.public_catalog_search_scope('a.example.test','${NOW}')`).pending,true);
    });
    await t.test('expired lease and failed delivery retry without dropping the document', () => {
      const jobs=json(`SET ROLE celebix_saas_workflow; SELECT result_payload FROM saas.catalog_search_claim('2027-10-02T12:02:00Z',100,'40000000-0000-4000-8000-000000000197')`);
      assert.equal(jobs.length,2);const job=jobs.find(j=>j.productId===P);
      assert.equal(query(`SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.catalog_search_ack('40000000-0000-4000-8000-000000000197','${A}','${P}',${job.generation},'2027-10-02T12:02:00Z','unavailable')`),'retry');
    });
    await t.test('concurrent workers cannot claim the same generation', async () => {
      const claims=await Promise.all([concurrent(`BEGIN; SET ROLE celebix_saas_workflow; SELECT result_payload FROM saas.catalog_search_claim('2027-10-02T12:04:00Z',100,'40000000-0000-4000-8000-000000000198'); SELECT pg_sleep(0.15); COMMIT;`),concurrent(`SET ROLE celebix_saas_workflow; SELECT result_payload FROM saas.catalog_search_claim('2027-10-02T12:04:00Z',100,'40000000-0000-4000-8000-000000000199')`)]);
      const ids=claims.flatMap(c=>JSON.parse(c.split('\n')[0]).map(j=>j.productId));assert.equal(new Set(ids).size,ids.length);
    });
    await t.test('permanent product deletion produces a durable tombstone', () => {
      query(`SET ROLE celebix_saas_owner; DELETE FROM saas.catalog_product_categories WHERE product_id='${P}'; DELETE FROM saas.product_variants WHERE product_id='${P}'; DELETE FROM saas.products WHERE id='${P}'`);
      assert.equal(search('mavi').items.length,0);
      const tombstone=json(`SET ROLE celebix_saas_workflow; SELECT result_payload FROM saas.catalog_search_claim('2027-10-02T12:10:00Z',100,'40000000-0000-4000-8000-000000000200')`).find(j=>j.productId===P);
      assert.equal(tombstone.document,null);
    });
    await t.test('app cannot read documents or invoke cross-store worker authority', () => {
      assert.equal(query("SELECT has_table_privilege('celebix_saas_app','saas.catalog_search_documents','SELECT')"),'f');
      assert.equal(query("SELECT has_function_privilege('celebix_saas_host_resolver','saas.catalog_search_claim(timestamptz,integer,uuid)','EXECUTE')"),'f');
    });
    await t.test('a store created after migration automatically publishes its first product document', () => {
      query(`SET ROLE celebix_saas_owner; INSERT INTO saas.stores VALUES ('${C}','active'); INSERT INTO saas.products VALUES ('20000000-0000-4000-8000-000000000197','${C}','isik-urun','IŞIK Ürün',NULL,'active','2026-01-01'); INSERT INTO saas.product_variants VALUES ('30000000-0000-4000-8000-000000000197','${C}','20000000-0000-4000-8000-000000000197','Default','NEW-STORE',NULL,'{}','active',false,0,1000);`);
      assert.deepEqual(json(`SET ROLE celebix_saas_host_resolver; SELECT result_payload FROM saas.public_search_products('c.example.test','${NOW}','isik urun',48,NULL)`).items.map(p=>p.id),['20000000-0000-4000-8000-000000000197']);
      assert.equal(json(`SET ROLE celebix_saas_host_resolver; SELECT result_payload FROM saas.public_catalog_search_scope('c.example.test','${NOW}')`).pending,true);
      query(`SET ROLE celebix_saas_owner; UPDATE saas.stores SET status='inactive' WHERE id='${C}'`);
      assert.equal(query(`SELECT count(*) FROM saas.catalog_search_documents WHERE store_id='${C}'`),'0');
      assert.equal(query(`SELECT document IS NULL FROM saas.catalog_search_outbox WHERE store_id='${C}'`),'t');
    });
    await t.test('exact barcode then SKU then title outrank broad matches and cursor pages cover every hit once', () => {
      const id=(n)=>`70000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
      // Production timestamps have microseconds, while s2 cursors serialize milliseconds.
      query(`SET ROLE celebix_saas_owner; INSERT INTO saas.products SELECT ('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${A}', 'ranking-'||n,CASE WHEN n=61 THEN 'NeedleExact' ELSE 'Other '||n END,'NeedleExact description','active',CASE WHEN n=61 THEN '2020-01-01'::timestamptz ELSE '2026-09-01'::timestamptz+n*interval '1 microsecond' END FROM generate_series(1,63) n; INSERT INTO saas.product_variants SELECT ('80000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${A}',('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Default',CASE WHEN n=62 THEN 'NEEDLEEXACT' ELSE 'RANK-'||n END,CASE WHEN n=63 THEN 'NEEDLEEXACT' END,'{}'::jsonb,'active',false,0,1000 FROM generate_series(1,63) n;`);
      const firstPage=search('needleexact');
      assert.deepEqual(firstPage.items.slice(0,3).map(p=>p.id),[id(63),id(62),id(61)]);
      assert.equal(firstPage.items.length,48);assert.match(firstPage.nextCursor,/^s2\|/);
      const nextPage=search('needleexact',`'${firstPage.nextCursor}'`);
      assert.equal(nextPage.items.length,15);assert.equal(nextPage.nextCursor,undefined);
      const all=[...firstPage.items,...nextPage.items].map(p=>p.id);assert.equal(new Set(all).size,63);
      assert.equal(query(`SET ROLE celebix_saas_host_resolver; SELECT outcome FROM saas.public_search_products('a.example.test','${NOW}','needleexact',48,'s2|1|true|2026-13-01T00:00:00.000Z|${P}')`),'invalid_input');
    });
    await t.test('unavailable live price or archived variants cannot become public through indexed metadata', () => {
      query(`SET ROLE celebix_saas_owner; UPDATE saas.product_variants SET price_cents=-1 WHERE product_id='70000000-0000-4000-8000-000000000063';`);
      assert.equal(search('needleexact').items.some(p=>p.id==='70000000-0000-4000-8000-000000000063'),false);
      query(`SET ROLE celebix_saas_owner; UPDATE saas.product_variants SET status='archived' WHERE product_id='70000000-0000-4000-8000-000000000062';`);
      assert.equal(search('needleexact').items.some(p=>p.id==='70000000-0000-4000-8000-000000000062'),false);
    });
    await t.test('eight failed attempts keep fallback pending then recover after a bounded cooldown', () => {
      const target='20000000-0000-4000-8000-000000000197';
      for(let attempt=0;attempt<8;attempt++) {
        const when=`2027-10-02T12:${String(attempt*5).padStart(2,'0')}:00Z`;
        const lease=`90000000-0000-4000-8000-${String(attempt+1).padStart(12,'0')}`;
        const jobs=json(`SET ROLE celebix_saas_workflow; SELECT result_payload FROM saas.catalog_search_claim('${when}',100,'${lease}')`);
        const job=jobs.find(j=>j.productId===target);assert.ok(job,`retry ${attempt+1}`);
        assert.equal(query(`SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.catalog_search_ack('${lease}','${C}','${target}',${job.generation},'${when}','unavailable')`),'retry');
      }
      assert.equal(query(`SELECT state FROM saas.catalog_search_outbox WHERE product_id='${target}'`),'failed');
      const early=json("SET ROLE celebix_saas_workflow; SELECT result_payload FROM saas.catalog_search_claim('2027-10-02T12:39:00Z',100,'90000000-0000-4000-8000-000000000099')");
      assert.equal(early.some(j=>j.productId===target),false);
      const recovered=json("SET ROLE celebix_saas_workflow; SELECT result_payload FROM saas.catalog_search_claim('2027-10-02T12:40:00Z',100,'90000000-0000-4000-8000-000000000098')").find(j=>j.productId===target);
      assert.ok(recovered,'service recovery must retry the failed generation');
      assert.equal(query(`SELECT attempts FROM saas.catalog_search_outbox WHERE product_id='${target}'`),'1');
      assert.equal(query(`SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.catalog_search_ack('90000000-0000-4000-8000-000000000098','${C}','${target}',${recovered.generation},'2027-10-02T12:40:00Z',NULL)`),'acknowledged');
      assert.equal(query(`SELECT state FROM saas.catalog_search_outbox WHERE product_id='${target}'`),'synced');
    });
    await t.test('fresh index recovery requeues every current document and tombstone without losing leases', () => {
      assert.equal(query("SELECT to_regprocedure('saas.catalog_search_requeue_all(timestamptz)') IS NOT NULL"),'t','central index resync is missing');
      const lease='90000000-0000-4000-8000-000000000097';
      const held=json(`SET ROLE celebix_saas_workflow; SELECT result_payload FROM saas.catalog_search_claim('2027-10-02T14:00:00Z',100,'${lease}')`)[0];
      assert.ok(held);
      assert.deepEqual(json("SET ROLE celebix_saas_workflow; SELECT result_payload FROM saas.catalog_search_requeue_all('2027-10-02T14:00:00Z')"),{queued:67});
      assert.equal(query(`SELECT lease_id FROM saas.catalog_search_outbox WHERE store_id='${held.storeId}' AND product_id='${held.productId}'`),lease);
      assert.equal(query(`SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.catalog_search_ack('${lease}','${held.storeId}','${held.productId}',${held.generation},'2027-10-02T14:00:00Z',NULL)`),'stale');
      const next=json("SET ROLE celebix_saas_workflow; SELECT result_payload FROM saas.catalog_search_claim('2027-10-02T14:00:00Z',100,'90000000-0000-4000-8000-000000000096')");
      assert.equal(next.find(j=>j.productId===held.productId).generation,held.generation+1);
      assert.equal(query(`SELECT document IS NULL FROM saas.catalog_search_outbox WHERE product_id='${P}'`),'t');
      assert.equal(query("SELECT has_function_privilege('celebix_saas_host_resolver','saas.catalog_search_requeue_all(timestamptz)','EXECUTE')"),'f');
    });
    await t.test('compatibility normalization stays bounded without rejecting valid catalog writes', () => {
      const unicodeProduct='90000000-0000-4000-8000-000000000194';
      query(`SET ROLE celebix_saas_owner;
        INSERT INTO saas.products VALUES ('${unicodeProduct}','${A}','unicode-product','Unicode product',NULL,'active','2026-01-01');
        INSERT INTO saas.product_variants
        SELECT ('91000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${A}','${unicodeProduct}','Default','UNICODE-'||n,NULL,
          (SELECT jsonb_object_agg('a'||k,repeat(chr(64259),256)) FROM generate_series(1,8) k),
          'active',false,0,1000 FROM generate_series(1,30) n;`);
      assert.equal(query(`SELECT char_length(search_text)<=100000 AND strpos(search_text,'ffi')>0 FROM saas.catalog_search_documents WHERE product_id='${unicodeProduct}'`),'t');
    });
    await t.test('rollback restores predecessor functions and removes triggers and queues', () => {
      query(readFileSync(path.join(SQL,'202610020194_shared_catalog_search.down.sql'),'utf8'));
      assert.equal(query("SELECT to_regclass('saas.catalog_search_documents') IS NULL"),'t');
      assert.equal(query("SELECT to_regprocedure('saas.public_search_products(text,timestamptz,text,integer,text)') IS NOT NULL"),'t');
    });
  } finally {
    spawnSync(path.join(PG,'pg_ctl'),['-D',path.join(directory,'data'),'-m','fast','stop'],{encoding:'utf8'});
    rmSync(directory,{recursive:true,force:true});
  }
});
