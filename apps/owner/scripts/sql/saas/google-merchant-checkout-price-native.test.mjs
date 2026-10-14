import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Socket-only disposable PostgreSQL. The real V3 entrypoints, source lineage,
// reference calculation and migration run here; the mature V2 order engine is
// represented by a small price/stock/discount adapter, not copied or modified.
const PG = process.env.CELEBIX_TEST_PG_BIN ?? '/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin';
const SQL = import.meta.dirname;
const PREFIX = '202610140233_google_merchant_checkout_price';
const A = '10000000-0000-4000-8000-000000000233';
const B = '10000000-0000-4000-8000-000000000234';
const P = '20000000-0000-4000-8000-000000000233';
const V = '30000000-0000-4000-8000-000000000233';
const C = '40000000-0000-4000-8000-000000000233';
const S1 = '50000000-0000-4000-8000-000000000233';
const S2 = '50000000-0000-4000-8000-000000000234';
const R = '60000000-0000-4000-8000-000000000233';
const INTENT = '40000000-0000-4000-8000-000000000234';
const INTENT_CREDS = `[{"keyId":"intent","digest":"${'9'.repeat(64)}"}]`;
const CUSTOMER = '70000000-0000-4000-8000-000000000233';
const CREDS = `[{"keyId":"cart","digest":"${'a'.repeat(64)}"}]`;
const ATTR = '{"firstTouch":{"source":"unknown","medium":"unknown"},"lastTouch":{"source":"unknown","medium":"unknown"},"landingPathGroup":"/unknown","deviceGroup":"unknown"}';
const source = file => readFileSync(path.join(SQL, file), 'utf8');
function fn(file, name) {
  const text = source(file);
  const match = new RegExp(`CREATE (?:OR REPLACE )?FUNCTION saas\\.${name}\\(`).exec(text);
  assert.ok(match, `${name} production source exists`);
  const rest = text.slice(match.index);
  const tag = /AS (\$[a-z0-9_]+\$)/i.exec(rest)?.[1];
  assert.ok(tag);
  const end = rest.indexOf(`${tag};`, rest.indexOf(tag) + tag.length);
  assert.ok(end > 0);
  return rest.slice(0, end + tag.length + 1);
}
const core = '202609200132_reference_pricing_checkout.up.sql';
const realFunctions = ['pricing_checkout_source_context', 'pricing_checkout_quote_digest',
  'public_checkout_quote_v3', 'public_checkout_complete_v3',
  'public_storefront_hosted_checkout_authority_v3', 'public_storefront_hosted_checkout_begin_v3']
  .map(name => fn(core, name)).join('\n');
const definitions = `
CREATE ROLE celebix_saas_owner NOLOGIN BYPASSRLS;
CREATE ROLE celebix_saas_app NOLOGIN; CREATE ROLE celebix_saas_workflow NOLOGIN;
CREATE ROLE celebix_saas_host_resolver NOLOGIN; CREATE ROLE celebix_saas_identity NOLOGIN;
CREATE ROLE celebix_saas_bootstrap NOLOGIN; CREATE ROLE celebix_saas_observability NOLOGIN;
CREATE SCHEMA saas AUTHORIZATION celebix_saas_owner;
GRANT USAGE ON SCHEMA saas TO celebix_saas_host_resolver,celebix_saas_app;
SET ROLE celebix_saas_owner;
CREATE TABLE saas.stores(id uuid PRIMARY KEY,status text);
CREATE TABLE saas.products(id uuid PRIMARY KEY,store_id uuid,status text);
CREATE TABLE saas.product_variants(id uuid PRIMARY KEY,store_id uuid,product_id uuid,status text,version bigint,price_cents bigint,stock_quantity bigint);
CREATE TABLE saas.pricing_reference_definitions(id uuid PRIMARY KEY,store_id uuid,kind text,reference_purity numeric);
CREATE TABLE saas.pricing_reference_set_values(store_id uuid,set_id uuid,reference_id uuid,rate_try numeric,active boolean);
CREATE TABLE saas.pricing_reference_state(store_id uuid PRIMARY KEY,active_set_id uuid,version bigint);
CREATE TABLE saas.pricing_variant_policy_state(store_id uuid,variant_id uuid,current_version bigint);
CREATE TABLE saas.pricing_variant_policy_versions(store_id uuid,variant_id uuid,version bigint,method text,reference_id uuid,fixed_price_cents bigint,source_amount numeric,metal_grams numeric,purity_mode text,product_purity numeric,labor_mode text,labor_amount numeric,uplift_percent numeric);
CREATE TABLE saas.price_lists(id uuid PRIMARY KEY,store_id uuid,version bigint);
CREATE TABLE saas.storefront_carts(id uuid PRIMARY KEY,store_id uuid,status text,version bigint,expires_at timestamptz,created_at timestamptz);
CREATE TABLE saas.storefront_cart_credentials(store_id uuid,cart_id uuid,key_id text,credential_digest text,expires_at timestamptz);
CREATE TABLE saas.storefront_cart_items(store_id uuid,cart_id uuid,variant_id uuid,quantity integer,unit_price_cents bigint);
CREATE TABLE saas.storefront_checkout_intents(id uuid PRIMARY KEY,store_id uuid,key_id text,credential_digest text,status text,expires_at timestamptz,created_at timestamptz,variant_id uuid,quantity integer,unit_price_cents bigint);
CREATE TABLE saas.customers(id uuid PRIMARY KEY,store_id uuid,status text,archived_at timestamptz);
CREATE TABLE saas.storefront_customer_credentials(id uuid PRIMARY KEY,store_id uuid,customer_id uuid,key_id text,credential_digest text,expires_at timestamptz,created_at timestamptz);
CREATE TABLE saas.storefront_checkout_operations(operation_id uuid PRIMARY KEY,store_id uuid,result_payload jsonb);
CREATE TABLE saas.storefront_hosted_checkout_operations(operation_id uuid PRIMARY KEY,store_id uuid,operation_kind text,result_payload jsonb);
CREATE TABLE saas.pricing_checkout_bindings(store_id uuid,operation_id uuid PRIMARY KEY,operation_kind text,order_id uuid,price_digest char(64),private_trace jsonb,bound_at timestamptz);
CREATE TABLE saas.fixture_orders(id uuid PRIMARY KEY,store_id uuid,payment_kind text,unit_cents bigint,total_cents bigint);
CREATE TABLE saas.fixture_settings(discount_cents bigint,shipping_cents bigint);
INSERT INTO saas.fixture_settings VALUES(100,200);
CREATE FUNCTION saas.storefront_public_store(p_hostname text,p_now timestamptz) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT CASE WHEN $1='a.example.test' THEN '${A}'::uuid WHEN $1='b.example.test' THEN '${B}'::uuid END $$;
CREATE FUNCTION saas.storefront_credential_candidates_valid(p_value jsonb,p_empty boolean) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_typeof($1)='array' AND ($2 OR jsonb_array_length($1)>0) $$;
${fn('202609200130_reference_pricing.up.sql', 'pricing_calculate_variant_price')}
CREATE FUNCTION saas.resolve_effective_variant_price(p_store_id uuid,p_variant_id uuid,p_channel text,p_now timestamptz,p_customer_email text DEFAULT NULL) RETURNS TABLE(outcome text,price_cents bigint,source_kind text,price_list_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $$ SELECT outcome,price_cents,'base'::text,NULL::uuid FROM saas.pricing_calculate_variant_price($1,$2,NULL) $$;
CREATE FUNCTION saas.storefront_cart_projection(p_store_id uuid,p_cart_id uuid,p_now timestamptz) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('sourceId',$2,'items',jsonb_build_array(jsonb_build_object('variantId','${V}','quantity',i.quantity,'unitPriceCents',i.unit_price_cents)),'subtotalCents',i.quantity*i.unit_price_cents) FROM saas.storefront_cart_items i WHERE i.store_id=$1 AND i.cart_id=$2 $$;
CREATE FUNCTION saas.storefront_intent_projection(p_store_id uuid,p_id uuid,p_now timestamptz) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION saas.fixture_quote(p_store uuid,p_credentials jsonb,p_now timestamptz,p_kind text DEFAULT 'cart') RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,saas AS $$
DECLARE item record;priced record;subtotal bigint;discount bigint;shipping bigint;pub jsonb;
BEGIN
IF p_kind='cart' THEN
SELECT i.* INTO item FROM saas.storefront_cart_items i JOIN saas.storefront_carts c ON c.id=i.cart_id AND c.store_id=i.store_id JOIN saas.storefront_cart_credentials k ON k.cart_id=c.id AND k.store_id=c.store_id JOIN jsonb_array_elements(p_credentials) v ON v->>'keyId'=k.key_id AND v->>'digest'=k.credential_digest WHERE c.store_id=p_store AND c.status='active' AND c.expires_at>p_now AND k.expires_at>p_now LIMIT 1;
ELSE
SELECT i.* INTO item FROM saas.storefront_checkout_intents i JOIN jsonb_array_elements(p_credentials) v ON v->>'keyId'=i.key_id AND v->>'digest'=i.credential_digest WHERE i.store_id=p_store AND i.status='active' AND i.expires_at>p_now LIMIT 1;
END IF;
IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
SELECT * INTO priced FROM saas.resolve_effective_variant_price(p_store,item.variant_id,'storefront',p_now,NULL);
IF priced.outcome<>'found' OR priced.price_cents<>item.unit_price_cents THEN RETURN QUERY SELECT 'price_changed',NULL::jsonb;RETURN;END IF;
IF (SELECT stock_quantity FROM saas.product_variants WHERE id=item.variant_id)<item.quantity THEN RETURN QUERY SELECT 'stock_unavailable',NULL::jsonb;RETURN;END IF;
SELECT discount_cents,shipping_cents INTO discount,shipping FROM saas.fixture_settings;subtotal:=priced.price_cents*item.quantity;
pub:=jsonb_build_object('cart',jsonb_build_object('items',jsonb_build_array(jsonb_build_object('variantId',item.variant_id,'quantity',item.quantity,'unitPriceCents',priced.price_cents)),'subtotalCents',subtotal,'shippingCents',shipping,'discountCents',discount,'lineDiscountCents',discount,'shippingDiscountCents',0,'totalCents',subtotal+shipping-discount),'appliedPromotions','[]'::jsonb,'gifts','[]'::jsonb,'promotionStatus','ready');
RETURN QUERY SELECT 'quoted',jsonb_build_object('quote',pub); END $$;
CREATE FUNCTION saas.public_checkout_quote_v2(p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,p_customer_credentials jsonb,p_normalized_codes text[],p_attribution jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $$ SELECT * FROM saas.fixture_quote(saas.storefront_public_store($1,$2),$4,$2,$3) $$;
CREATE FUNCTION saas.public_checkout_complete_v2(p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,p_customer_credentials jsonb,p_operation_id uuid,p_fingerprint text,p_expected_version bigint,p_delivery jsonb,p_payment_kind text,p_order_id uuid,p_customer_id uuid,p_address_id uuid,p_event_id uuid,p_receipt_id uuid,p_receipt_key_id text,p_receipt_digest text,p_receipt_expires_at timestamptz,p_customer_credential_id uuid,p_customer_key_id text,p_customer_digest text,p_customer_expires_at timestamptz,p_normalized_codes text[]) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE q record;r jsonb;
BEGIN IF EXISTS(SELECT 1 FROM saas.storefront_checkout_operations WHERE operation_id=p_operation_id) THEN RETURN QUERY SELECT 'replayed',o.result_payload FROM saas.storefront_checkout_operations o WHERE o.operation_id=p_operation_id; RETURN; END IF;
IF (SELECT version FROM saas.storefront_carts WHERE id='${C}')<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
SELECT * INTO q FROM saas.public_checkout_quote_v2(p_hostname,p_now,p_kind,p_credentials,p_customer_credentials,p_normalized_codes,'{}');IF q.outcome<>'quoted' THEN RETURN QUERY SELECT q.outcome,q.result_payload;RETURN;END IF;
r:=(q.result_payload->'quote'->'cart')||((q.result_payload->'quote')-'cart');
INSERT INTO saas.fixture_orders VALUES(p_order_id,saas.storefront_public_store(p_hostname,p_now),p_payment_kind,(r->'items'->0->>'unitPriceCents')::bigint,(r->>'totalCents')::bigint);
INSERT INTO saas.storefront_checkout_operations VALUES(p_operation_id,saas.storefront_public_store(p_hostname,p_now),jsonb_build_object('receipt',r));
RETURN QUERY SELECT 'committed',jsonb_build_object('receipt',r);END $$;
CREATE FUNCTION saas.public_storefront_hosted_checkout_authority_v2(p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,p_expected_version bigint,p_delivery jsonb,p_payment_method_id uuid,p_customer_candidates jsonb,p_normalized_codes jsonb,p_order_id uuid,p_prospective_customer_id uuid,p_operation_id uuid) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $$ DECLARE q record;c jsonb;BEGIN SELECT * INTO q FROM saas.fixture_quote(saas.storefront_public_store(p_hostname,p_now),p_credentials,p_now,p_kind);IF q.outcome<>'quoted' THEN RETURN QUERY SELECT 'authority_unavailable',NULL::jsonb;RETURN;END IF;c:=q.result_payload->'quote'->'cart';RETURN QUERY SELECT 'found',jsonb_build_object('subtotalMinor',c->'subtotalCents','shippingMinor',c->'shippingCents','discountMinor',c->'discountCents','totalMinor',c->'totalCents');END $$;
CREATE FUNCTION saas.public_storefront_hosted_checkout_begin_v2(p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,p_expected_version bigint,p_delivery jsonb,p_payment_method_id uuid,p_expected_authority_digest text,p_operation_id uuid,p_fingerprint text,p_session_id uuid,p_callback_binding_digest text,p_order_id uuid,p_customer_id uuid,p_address_id uuid,p_event_id uuid,p_receipt_id uuid,p_customer_credential_id uuid,p_payment_session_key_id text,p_payment_session_digest text,p_receipt_key_id text,p_receipt_digest text,p_customer_key_id text,p_customer_digest text,p_customer_candidates jsonb,p_normalized_codes jsonb,p_expected_evaluator_authority_digest text) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $$ DECLARE q record;c jsonb;BEGIN IF EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_operations WHERE operation_id=p_operation_id) THEN RETURN QUERY SELECT 'replayed',o.result_payload FROM saas.storefront_hosted_checkout_operations o WHERE o.operation_id=p_operation_id;RETURN;END IF;SELECT * INTO q FROM saas.fixture_quote(saas.storefront_public_store(p_hostname,p_now),p_credentials,p_now,p_kind);IF q.outcome<>'quoted' THEN RETURN QUERY SELECT q.outcome,q.result_payload;RETURN;END IF;c:=q.result_payload->'quote'->'cart';INSERT INTO saas.fixture_orders VALUES(p_order_id,saas.storefront_public_store(p_hostname,p_now),'hosted',(c->'items'->0->>'unitPriceCents')::bigint,(c->>'totalCents')::bigint);INSERT INTO saas.storefront_hosted_checkout_operations VALUES(p_operation_id,saas.storefront_public_store(p_hostname,p_now),'start',c);RETURN QUERY SELECT 'created',c;END $$;
${realFunctions}
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA saas FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.public_checkout_quote_v3(text,timestamptz,text,jsonb,jsonb,text[],jsonb),saas.public_checkout_complete_v3(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[],text),saas.public_storefront_hosted_checkout_authority_v3(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid),saas.public_storefront_hosted_checkout_begin_v3(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text) TO celebix_saas_host_resolver;
INSERT INTO saas.stores VALUES('${A}','active'),('${B}','active');INSERT INTO saas.products VALUES('${P}','${A}','active');INSERT INTO saas.product_variants VALUES('${V}','${A}','${P}','active',1,1000,10);
INSERT INTO saas.pricing_reference_definitions VALUES('${R}','${A}','usd',NULL);INSERT INTO saas.pricing_reference_set_values VALUES('${A}','${S1}','${R}',10,true),('${A}','${S2}','${R}',20,true);INSERT INTO saas.pricing_reference_state VALUES('${A}','${S1}',1);
INSERT INTO saas.pricing_variant_policy_state VALUES('${A}','${V}',1);INSERT INTO saas.pricing_variant_policy_versions VALUES('${A}','${V}',1,'usd','${R}',NULL,1,NULL,NULL,NULL,'per_item_try',0,0);
INSERT INTO saas.storefront_carts VALUES('${C}','${A}','active',1,now()+interval '1 day',now());INSERT INTO saas.storefront_cart_credentials VALUES('${A}','${C}','cart','${'a'.repeat(64)}',now()+interval '1 day');INSERT INTO saas.storefront_cart_items VALUES('${A}','${C}','${V}',2,1000);
INSERT INTO saas.storefront_checkout_intents VALUES('${INTENT}','${A}','intent','${'9'.repeat(64)}','active',now()+interval '1 day',now(),'${V}',2,1000);
INSERT INTO saas.customers VALUES('${CUSTOMER}','${A}','active',NULL);
INSERT INTO saas.storefront_customer_credentials VALUES('${CUSTOMER}','${A}','${CUSTOMER}','customer','${'b'.repeat(64)}',now()+interval '1 day',now());
RESET ROLE;`;

test('233 server-issued quote protects reference activation without trusting customer prices', async () => {
  const dir = mkdtempSync('/tmp/celebix-merchant-quote-'), socket = path.join(dir, 'socket'); mkdirSync(socket);
  const port = String(22000 + Math.floor(Math.random() * 18000));
  let started = false;
  const run = (bin, args, input = '', failure = false) => { const r = spawnSync(path.join(PG,bin),args,{input,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024});if(r.error)throw r.error;if(!failure)assert.equal(r.status,0,r.stderr);return r; };
  const query = (text, failure=false) => run('psql',['-h',socket,'-p',port,'-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],text,failure);
  const json = text => JSON.parse(query(text).stdout.trim());
  const quote = (customers='[]',codes='ARRAY[]::text[]',time="date_trunc('milliseconds',now())") => json(`SET ROLE celebix_saas_host_resolver;SELECT to_jsonb(q) FROM saas.public_checkout_quote_v3('a.example.test',${time},'cart','${CREDS}','${customers}',${codes},'${ATTR}') q;`);
  const completeSql = (token,n,kind='bank_transfer',customers='[]',time="date_trunc('milliseconds',now())",creds=CREDS,codes='ARRAY[]::text[]',host='a.example.test',intentKind='cart') => `SET ROLE celebix_saas_host_resolver;SELECT to_jsonb(q) FROM saas.public_checkout_complete_v3('${host}',${time},'${intentKind}','${creds}','${customers}','80000000-0000-4000-8000-${String(n).padStart(12,'0')}','${'c'.repeat(64)}',1,'{}','${kind}','90000000-0000-4000-8000-${String(n).padStart(12,'0')}','${CUSTOMER}','${CUSTOMER}','${CUSTOMER}','${CUSTOMER}','receipt','${'d'.repeat(64)}',now()+interval '1 hour','${CUSTOMER}','customer','${'e'.repeat(64)}',now()+interval '1 hour',${codes},'${token}') q;`;
  const complete = (...args) => json(completeSql(...args));
  const concurrent = input => new Promise((resolve,reject) => { const child=spawn(path.join(PG,'psql'),['-h',socket,'-p',port,'-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']);let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('error',reject);child.on('close',code=>code===0?resolve(JSON.parse(out.trim().split('\n')[0])):reject(Error(err)));child.stdin.end(input); });
  try {
    run('initdb',['-D',path.join(dir,'data'),'--auth=trust','--username=postgres','--no-locale','--encoding=UTF8','--no-sync']);
    run('pg_ctl',['-D',path.join(dir,'data'),'-o',`-k ${socket} -p ${port} -h ''`,'-l',path.join(dir,'postgres.log'),'start']);started=true;
    query(definitions);
    const originals=() => json("SELECT jsonb_agg(jsonb_build_object('oid',oid,'name',proname,'owner',proowner,'grants',proacl,'config',proconfig,'body',prosrc) ORDER BY proname) FROM pg_proc WHERE proname IN('resolve_effective_variant_price','pricing_checkout_source_context','public_checkout_quote_v3','public_checkout_complete_v3','public_storefront_hosted_checkout_authority_v3','public_storefront_hosted_checkout_begin_v3')");
    const originalDefinitions=originals();
    if (existsSync(path.join(SQL,`${PREFIX}.up.sql`))) {
      query(source(`${PREFIX}.up.sql`));query(source(`${PREFIX}_assertions.sql`));
      query(source(`${PREFIX}.down.sql`));assert.deepEqual(originals(),originalDefinitions,'empty rollback restores exact engine OIDs, owners, grants, bodies and contracts');
      query(source(`${PREFIX}.up.sql`));
    }
    const oldReplica=json(`BEGIN READ ONLY;SET LOCAL ROLE celebix_saas_host_resolver;SELECT to_jsonb(q) FROM saas.public_checkout_quote_v3('a.example.test',date_trunc('milliseconds',now()),'cart','${CREDS}','[]',ARRAY[]::text[],'${ATTR}') q;COMMIT;`);
    assert.equal(oldReplica.outcome,'quoted','native-first deployment keeps old READ ONLY replicas working');
    const oldHosted=json(`SET ROLE celebix_saas_host_resolver;SELECT to_jsonb(q) FROM saas.public_storefront_hosted_checkout_authority_v3('a.example.test',date_trunc('milliseconds',now()),'cart','${CREDS}',1,'{}','${CUSTOMER}','[]','[]','90000000-0000-4000-8000-000000000013','${CUSTOMER}','80000000-0000-4000-8000-000000000013') q;`);
    assert.equal(oldHosted.outcome,'found');
    assert.equal(oldHosted.result_payload.pricingDigest,oldReplica.result_payload.quoteDigest,'old READ ONLY quote and existing writable hosted authority must keep the same legacy seal');
    assert.equal(query('SELECT count(*) FROM saas.merchant_checkout_quotes_233;').stdout.trim(),'0','hosted authority must not invent a protected quote the client never received');
    const buyFirst=json(`SET ROLE celebix_saas_host_resolver;SELECT to_jsonb(q) FROM saas.public_checkout_quote_v3('a.example.test',date_trunc('milliseconds',now()),'buy_now','${INTENT_CREDS}','[]',ARRAY[]::text[],'${ATTR}') q;`);assert.equal(buyFirst.outcome,'quoted');
    const first=quote();assert.equal(first.outcome,'quoted');const token=first.result_payload.quoteDigest;
    const mixedOldHosted=json(`SET ROLE celebix_saas_host_resolver;SELECT to_jsonb(q) FROM saas.public_storefront_hosted_checkout_authority_v3('a.example.test',date_trunc('milliseconds',now()),'cart','${CREDS}',1,'{}','${CUSTOMER}','[]','[]','90000000-0000-4000-8000-000000000014','${CUSTOMER}','80000000-0000-4000-8000-000000000014') q;`);
    assert.equal(mixedOldHosted.outcome,'found');
    assert.equal(mixedOldHosted.result_payload.pricingDigest,oldReplica.result_payload.quoteDigest,'12-argument old client must keep legacy digest even when a protected quote already exists');
    const explicitHosted=(digest,time="date_trunc('milliseconds',now())",codes="'[]'",customers="'[]'") => json(`SET ROLE celebix_saas_host_resolver;SELECT to_jsonb(q) FROM saas.public_storefront_hosted_checkout_authority_v3('a.example.test',${time},'cart','${CREDS}',1,'{}','${CUSTOMER}',${customers},${codes},'90000000-0000-4000-8000-000000000015','${CUSTOMER}','80000000-0000-4000-8000-000000000015',${digest===null?'NULL':`'${digest}'`}) q;`);
    const missingExplicit=explicitHosted(null);assert.equal(missingExplicit.outcome,'found');assert.equal(missingExplicit.result_payload.pricingDigest,oldReplica.result_payload.quoteDigest,'an explicit NULL retains legacy/no-confirmation compatibility, even with a protected row');
    assert.equal(explicitHosted('not-a-seal').outcome,'invalid_input','a malformed non-NULL quote remains invalid');
    const explicit=explicitHosted(token);assert.equal(explicit.outcome,'found');assert.equal(explicit.result_payload.pricingDigest,token);assert.equal(explicit.result_payload.totalMinor,2100);
    assert.equal(explicitHosted(oldReplica.result_payload.quoteDigest).result_payload.pricingDigest,oldReplica.result_payload.quoteDigest,'explicit legacy digest uses only legacy authority despite existing protected row');
    assert.equal(explicitHosted('f'.repeat(64)).outcome,'price_changed','13 arguments reject a forged client quote');
    assert.equal(explicitHosted(token,"date_trunc('milliseconds',now())+interval '11 minutes'").outcome,'price_changed','13 arguments reject an expired protected quote');
    assert.equal(explicitHosted(token,"date_trunc('milliseconds',now())","'[\"OTHER\"]'").outcome,'price_changed','13 arguments bind the exact coupon set');
    query(`SET ROLE celebix_saas_owner;UPDATE saas.pricing_reference_state SET active_set_id='${S2}',version=2 WHERE store_id='${A}'`);
    assert.equal(complete(buyFirst.result_payload.quoteDigest,25,'bank_transfer','[]',"date_trunc('milliseconds',now())",INTENT_CREDS,'ARRAY[]::text[]','a.example.test','buy_now').outcome,'committed','buy-now intent quote also protects its server price');
    assert.equal(complete(token,1).outcome,'committed','a valid server quote must survive a manual 10→20 TRY reference activation');
    assert.deepEqual(json("SELECT jsonb_build_object('unit',unit_cents,'total',total_cents) FROM saas.fixture_orders LIMIT 1"),{unit:1000,total:2100});
    assert.equal(quote().result_payload.quoteDigest,token,'re-quoting does not silently advance price or expiry');
    assert.equal(complete('f'.repeat(64),2).outcome,'price_changed','unknown token cannot select old price');
    assert.equal(complete(oldReplica.result_payload.quoteDigest,20).outcome,'price_changed','old replica seal safely re-quotes after activation; it cannot forge new price authority');
    assert.equal(complete(token,3,'bank_transfer','[]',"date_trunc('milliseconds',now())",CREDS,"ARRAY['OTHER']::text[]").outcome,'price_changed','coupon set is bound');
    assert.equal(complete(token,4,'bank_transfer',`[{"keyId":"customer","digest":"${'b'.repeat(64)}"}]`).outcome,'price_changed','guest quote cannot transfer to another customer session');
    assert.notEqual(complete(token,5,'bank_transfer','[]',"date_trunc('milliseconds',now())",`[{"keyId":"cart","digest":"${'f'.repeat(64)}"}]`).outcome,'committed','invalid cart credential cannot use a known token');
    assert.notEqual(complete(token,6,'bank_transfer','[]',"date_trunc('milliseconds',now())",CREDS,'ARRAY[]::text[]','b.example.test').outcome,'committed','quote cannot cross stores');
    assert.equal(complete(token,7,'cash_on_delivery','[]',"date_trunc('milliseconds',now())+interval '11 minutes'").outcome,'price_changed','quote lifetime is bounded');
    query('SET ROLE celebix_saas_owner;UPDATE saas.product_variants SET stock_quantity=0;');
    assert.notEqual(complete(token,8).outcome,'committed','protected retail price does not reserve unavailable stock');
    query('SET ROLE celebix_saas_owner;UPDATE saas.product_variants SET stock_quantity=10;UPDATE saas.storefront_carts SET version=2;');
    assert.equal(complete(token,9).outcome,'price_changed','cart version changes invalidate price authority');
    query('SET ROLE celebix_saas_owner;UPDATE saas.storefront_carts SET version=1;UPDATE saas.fixture_settings SET discount_cents=200;');
    assert.equal(complete(token,10).outcome,'price_changed','expired/changed promotion cannot be preserved by a price lock');
    query('SET ROLE celebix_saas_owner;UPDATE saas.fixture_settings SET discount_cents=100;');
    assert.equal(complete(token,11,'cash_on_delivery').outcome,'committed','COD uses the same protected unit price');
    assert.equal(complete(token,1).outcome,'replayed','committed operation remains replayable');
    const prepared=json(`SET ROLE celebix_saas_host_resolver;SELECT to_jsonb(q) FROM saas.public_storefront_hosted_checkout_authority_v3('a.example.test',date_trunc('milliseconds',now()),'cart','${CREDS}',1,'{}','${CUSTOMER}','[]','[]','90000000-0000-4000-8000-000000000012','${CUSTOMER}','80000000-0000-4000-8000-000000000012','${token}') q;`);
    assert.equal(prepared.outcome,'found','hosted authority survives the same activation');
    assert.equal(prepared.result_payload.pricingDigest,token);
    assert.equal(prepared.result_payload.totalMinor,2100);
    const hosted=json(`SET ROLE celebix_saas_host_resolver;SELECT to_jsonb(q) FROM saas.public_storefront_hosted_checkout_begin_v3('a.example.test',date_trunc('milliseconds',now()),'cart','${CREDS}',1,'{}','${CUSTOMER}','${'1'.repeat(64)}','80000000-0000-4000-8000-000000000012','${'2'.repeat(64)}','${CUSTOMER}','${'3'.repeat(64)}','90000000-0000-4000-8000-000000000012','${CUSTOMER}','${CUSTOMER}','${CUSTOMER}','${CUSTOMER}','${CUSTOMER}','payment','${'4'.repeat(64)}','receipt','${'5'.repeat(64)}','customer','${'6'.repeat(64)}','[]','[]','${'7'.repeat(64)}','${token}') q;`);
    assert.equal(hosted.outcome,'created','hosted start commits the protected snapshot');
    assert.deepEqual(json("SELECT jsonb_build_object('unit',unit_cents,'total',total_cents) FROM saas.fixture_orders WHERE payment_kind='hosted'"),{unit:1000,total:2100});
    const raced=await Promise.all([concurrent(`BEGIN;${completeSql(token,99)} SELECT pg_sleep(0.1);COMMIT;`),concurrent(completeSql(token,99))]);
    assert.deepEqual(raced.map(r=>r.outcome).sort(),['committed','replayed'],'duplicate clicks serialize to one order');
    assert.equal(query("SELECT count(*) FROM saas.fixture_orders WHERE id='90000000-0000-4000-8000-000000000099'").stdout.trim(),'1');
    assert.equal(query(`SELECT expires_at=issued_at+interval '10 minutes' FROM saas.merchant_checkout_quotes_233 WHERE quote_digest='${token}'`).stdout.trim(),'t');
    assert.equal(query(`SELECT private_trace->'items'->0->>'activeSetId' FROM saas.pricing_checkout_bindings WHERE operation_id='80000000-0000-4000-8000-000000000012'`).stdout.trim(),S1,'historical trace records the honored old set, not current set');
    assert.equal(query('SELECT count(*) FROM saas.merchant_checkout_price_context_233;').stdout.trim(),'0','request context is cleared');
    const denied=query(`SET ROLE celebix_saas_host_resolver;INSERT INTO saas.merchant_checkout_price_context_233 VALUES(pg_backend_pid(),txid_current(),'${token}');`,true);assert.notEqual(denied.status,0,'host resolver cannot forge price context');
    assert.equal(query(`BEGIN;SET LOCAL celebix.quote_digest='${token}';SELECT price_cents FROM saas.resolve_effective_variant_price('${A}','${V}','storefront',now(),NULL);ROLLBACK;`).stdout.trim(),'2000','arbitrary client GUC cannot activate an old price');
    const immutable=query(`SET ROLE celebix_saas_owner;UPDATE saas.merchant_checkout_quotes_233 SET expires_at=expires_at+interval '1 minute' WHERE quote_digest='${token}';`,true);assert.notEqual(immutable.status,0);assert.match(immutable.stderr,/IMMUTABLE/);
    query(source(`${PREFIX}_assertions.sql`));
    query(source(`${PREFIX}.up.sql`));query(source(`${PREFIX}_assertions.sql`));
    const blocked=query(source(`${PREFIX}.down.sql`),true);assert.notEqual(blocked.status,0);assert.match(blocked.stderr,/FORWARD_RECOVERY_REQUIRED/,'rollback cannot discard active price promises or bound financial history');
  } finally {
    if(started)run('pg_ctl',['-D',path.join(dir,'data'),'-m','fast','stop'],'',true);
    rmSync(dir,{recursive:true,force:true});
  }
});
