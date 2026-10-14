-- Shared Merchant API catalog projection and durable, tenant-fenced delivery queue.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TABLE saas.google_merchant_230_backup(signature text PRIMARY KEY,definition text NOT NULL);
INSERT INTO saas.google_merchant_230_backup SELECT p.oid::regprocedure::text,pg_catalog.pg_get_functiondef(p.oid)
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='saas' AND p.proname IN('google_marketing_command','google_marketing_selection_valid','google_marketing_oauth_return');
REVOKE ALL ON saas.google_merchant_230_backup FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability;
ALTER TABLE saas.google_marketing_connections DROP CONSTRAINT google_marketing_connections_service_check;
ALTER TABLE saas.google_marketing_connections ADD CONSTRAINT google_marketing_connections_service_check CHECK(service IN('gtm','ads','search_console','merchant'));
ALTER TABLE saas.google_marketing_oauth_states DROP CONSTRAINT google_marketing_oauth_states_service_check;
ALTER TABLE saas.google_marketing_oauth_states ADD CONSTRAINT google_marketing_oauth_states_service_check CHECK(service IN('gtm','ads','search_console','merchant'));
ALTER TABLE saas.google_marketing_operations DROP CONSTRAINT google_marketing_operations_service_check;
ALTER TABLE saas.google_marketing_operations ADD CONSTRAINT google_marketing_operations_service_check CHECK(service IN('gtm','ads','search_console','merchant'));
DO $patch$
DECLARE definition text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef('saas.google_marketing_selection_valid(jsonb,text,text)'::regprocedure) INTO definition;
 IF position('WHEN ''search_console'' THEN' IN definition)=0 THEN RAISE EXCEPTION 'MERCHANT230_SELECTION_DRIFT'; END IF;
 definition:=replace(definition,'WHEN ''search_console'' THEN','WHEN ''merchant'' THEN p_selection->>''accountId''~''^[0-9]{1,30}$'' AND p_selection->>''resourceId''~''^[0-9]{1,30}$'' AND NOT p_selection ?| ARRAY[''tagId'',''conversionLabel'',''create''] WHEN ''search_console'' THEN');
 EXECUTE definition;
 SELECT pg_catalog.pg_get_functiondef('saas.google_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb)'::regprocedure) INTO definition;
 IF position('svc NOT IN(''gtm'',''ads'',''search_console'')' IN definition)=0 OR position('saas.google_marketing_connection_projection(p_store_id,''search_console''))' IN definition)=0 OR position('''verified'']' IN definition)=0 THEN RAISE EXCEPTION 'MERCHANT230_COMMAND_DRIFT'; END IF;
 definition:=replace(definition,'svc NOT IN(''gtm'',''ads'',''search_console'')','svc NOT IN(''gtm'',''ads'',''search_console'',''merchant'')');
 definition:=replace(definition,'saas.google_marketing_connection_projection(p_store_id,''search_console''))','saas.google_marketing_connection_projection(p_store_id,''search_console''))||CASE WHEN p_input->>''includeMerchant''=''true'' THEN jsonb_build_array(saas.google_marketing_connection_projection(p_store_id,''merchant'')) ELSE ''[]''::jsonb END');
 definition:=replace(definition,'''verified'']','''verified'',''merchantDataSourceId'',''merchantSourceName'',''merchantDomain'']');
 definition:=replace(definition,'UPDATE saas.google_marketing_connections SET selection=p_input->''selection''', 'IF svc=''merchant'' AND (op.progress->>''merchantDomain'' IS DISTINCT FROM domain_name OR op.progress->>''merchantDataSourceId'' IS DISTINCT FROM p_input->''selection''->>''resourceId'' OR op.progress->>''merchantSourceName'' IS DISTINCT FROM ''Celebix ''||p_store_id::text) THEN RETURN QUERY SELECT ''invalid_input'',NULL::jsonb;RETURN;END IF; UPDATE saas.google_marketing_connections SET selection=p_input->''selection''');
 EXECUTE definition;
 SELECT pg_catalog.pg_get_functiondef('saas.google_marketing_oauth_return(text,timestamptz)'::regprocedure) INTO definition;
 IF position('''returnOrigin'',state.return_origin' IN definition)>0 THEN
   EXECUTE replace(definition,'''returnOrigin'',state.return_origin','''returnOrigin'',state.return_origin,''service'',state.service');
 ELSIF position('''returnOrigin'',s.return_origin' IN definition)>0 THEN
   EXECUTE replace(definition,'''returnOrigin'',s.return_origin','''returnOrigin'',s.return_origin,''service'',s.service');
 ELSE RAISE EXCEPTION 'MERCHANT230_OAUTH_RETURN_DRIFT'; END IF;
END $patch$;
-- These preferences are managed ephemeral catalog metadata with an explicit CASCADE.
-- Register only this new relation in the existing conservative deletion allowlist.
DO $delete_guard$
DECLARE entry record;definition text;patched integer:=0;
BEGIN
 FOR entry IN SELECT p.oid,p.oid::regprocedure::text signature FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname LIKE '%delete_product%' LOOP
  definition:=pg_catalog.pg_get_functiondef(entry.oid);
  IF position('dependent_class.relname NOT IN(' IN definition)>0 AND position('''barcode_print_job_items''' IN definition)>0 THEN
   IF (length(definition)-length(replace(definition,'''barcode_print_job_items''','')))/length('''barcode_print_job_items''')<>1 THEN RAISE EXCEPTION 'MERCHANT230_DELETE_GUARD_DRIFT';END IF;
   INSERT INTO saas.google_merchant_230_backup VALUES(entry.signature,definition);
   EXECUTE replace(definition,'''barcode_print_job_items''','''barcode_print_job_items'',''google_merchant_preferences''');patched:=patched+1;
  END IF;
 END LOOP;
 IF patched=0 THEN RAISE EXCEPTION 'MERCHANT230_DELETE_GUARD_MISSING';END IF;
END $delete_guard$;
CREATE TABLE saas.google_merchant_accounts(
 store_id uuid PRIMARY KEY REFERENCES saas.stores(id),connection_version bigint NOT NULL,domain text NOT NULL,last_synced_at timestamptz
);
CREATE TABLE saas.google_merchant_preferences(
 store_id uuid NOT NULL REFERENCES saas.stores(id),product_id uuid NOT NULL,variant_id uuid NOT NULL,enabled boolean NOT NULL DEFAULT true,
 attributes jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(attributes)='object'),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(store_id,variant_id),
 FOREIGN KEY(store_id,product_id,variant_id) REFERENCES saas.product_variants(store_id,product_id,id) ON DELETE CASCADE
);
CREATE TABLE saas.google_merchant_operations(
 operation_id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),membership_id uuid NOT NULL,fingerprint text NOT NULL CHECK(fingerprint~'^[a-f0-9]{64}$'),result_payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE saas.google_merchant_outbox(
 store_id uuid NOT NULL REFERENCES saas.stores(id),product_id uuid NOT NULL,variant_id uuid NOT NULL,generation bigint NOT NULL DEFAULT 1 CHECK(generation BETWEEN 1 AND 9007199254740991),connection_version bigint NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','leased','submitted','approved','limited','disapproved','excluded','failed','withdrawn')),
 next_action text NOT NULL DEFAULT 'upsert' CHECK(next_action IN('upsert','status')),next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
 lease_id uuid,lease_generation bigint,lease_connection_version bigint,lease_until timestamptz,
 last_submission_connection_version bigint,last_export_fingerprint text CHECK(last_export_fingerprint IS NULL OR last_export_fingerprint~'^[a-f0-9]{32}$'),last_google_state text CHECK(last_google_state IS NULL OR last_google_state IN('submitted','approved','limited','disapproved','excluded','withdrawn')),google_product_id text,last_submitted_at timestamptz,issues jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(issues)='array'),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(store_id,variant_id),CHECK(google_product_id IS NULL OR google_product_id='tr~TR~'||variant_id::text),CHECK((state='leased')=(lease_id IS NOT NULL AND lease_generation IS NOT NULL AND lease_connection_version IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE TABLE saas.google_merchant_price_boundaries(
 store_id uuid NOT NULL REFERENCES saas.stores(id),price_list_id uuid NOT NULL,boundary_key text NOT NULL,due_at timestamptz NOT NULL,cursor_variant uuid,processed boolean NOT NULL DEFAULT false,PRIMARY KEY(store_id,boundary_key)
);
CREATE INDEX google_merchant_price_boundaries_due_idx ON saas.google_merchant_price_boundaries(due_at,store_id,boundary_key) WHERE NOT processed;
CREATE INDEX google_merchant_outbox_lease_idx ON saas.google_merchant_outbox(lease_until) WHERE state='leased';
CREATE INDEX google_merchant_outbox_due_idx ON saas.google_merchant_outbox(next_attempt_at,store_id,variant_id) WHERE state NOT IN('failed','excluded','withdrawn');
DO $tables$ DECLARE tab text;BEGIN
 FOREACH tab IN ARRAY ARRAY['google_merchant_accounts','google_merchant_preferences','google_merchant_operations','google_merchant_outbox','google_merchant_price_boundaries'] LOOP
 EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',tab);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',tab);
 EXECUTE format('CREATE TRIGGER platform_support_atomic_journal AFTER INSERT OR UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.platform_support_journal_write()',tab);
 EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability',tab);
 END LOOP;
END $tables$;
CREATE FUNCTION saas.google_merchant_gtin_valid(p_value text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $f$
DECLARE total integer:=0;weight integer:=3;i integer;
BEGIN
 IF p_value IS NULL OR p_value!~'^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$' OR p_value~'^(98|99)' OR p_value~'^0+$' THEN RETURN false; END IF;
 FOR i IN REVERSE length(p_value)-1..1 LOOP total:=total+substring(p_value,i,1)::integer*weight;weight:=CASE weight WHEN 3 THEN 1 ELSE 3 END;END LOOP;
 RETURN (10-total%10)%10=right(p_value,1)::integer;
END $f$;
CREATE FUNCTION saas.google_merchant_attributes_valid(p_value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE key text;val jsonb;
BEGIN
 IF jsonb_typeof(p_value) IS DISTINCT FROM 'object' OR p_value-ARRAY['gtin','mpn','identifierExists','color','size','material','gender','ageGroup']<>'{}' THEN RETURN false;END IF;
 FOR key,val IN SELECT * FROM jsonb_each(p_value) LOOP
  IF key='identifierExists' THEN IF jsonb_typeof(val)<>'boolean' THEN RETURN false;END IF;
  ELSIF jsonb_typeof(val)<>'string' OR length(val#>>'{}') NOT BETWEEN 1 AND 70 OR val#>>'{}'~'[<>[:cntrl:]]' THEN RETURN false;
  END IF;
 END LOOP;
 IF p_value?'gtin' AND NOT saas.google_merchant_gtin_valid(p_value->>'gtin') THEN RETURN false;END IF;
 IF p_value->>'identifierExists'='false' AND p_value ?| ARRAY['gtin','mpn'] THEN RETURN false;END IF;
 IF p_value?'gender' AND p_value->>'gender' NOT IN('male','female','unisex') OR p_value?'ageGroup' AND p_value->>'ageGroup' NOT IN('newborn','infant','toddler','kids','adult') THEN RETURN false;END IF;
 RETURN true;
END $f$;
CREATE FUNCTION saas.google_merchant_plain(p_value text,p_limit integer) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $f$
 SELECT btrim(left(regexp_replace(regexp_replace(regexp_replace(coalesce(p_value,''),'<(script|style)[^>]*>.*?</(script|style)>',' ','gi'),'<[^>]*>',' ','g'),'[[:space:][:cntrl:]]+',' ','g'),p_limit))
$f$;
CREATE FUNCTION saas.google_merchant_projection(p_store uuid,p_variant uuid,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,saas AS $f$
DECLARE v saas.product_variants;p saas.products;pref saas.google_merchant_preferences;profile saas.catalog_product_profiles;domain_name text;account_domain text;public_product jsonb;public_variant jsonb;offer jsonb;issues jsonb:='[]';attrs jsonb;price record;images jsonb;primary_media uuid;assigned boolean;assigned_count integer;legacy_count integer;method text;gtin text;brand_name text;color text;size text;material text;description text;title text;product_url text;locale text;enabled boolean;
BEGIN
 SELECT * INTO v FROM saas.product_variants WHERE store_id=p_store AND id=p_variant;
 IF NOT FOUND THEN RETURN jsonb_build_object('offer',NULL,'issues',jsonb_build_array(jsonb_build_object('code','product_removed','message','Ürün veya varyant kaldırılmış.')));END IF;
 SELECT * INTO p FROM saas.products WHERE store_id=p_store AND id=v.product_id;
 SELECT * INTO pref FROM saas.google_merchant_preferences WHERE store_id=p_store AND variant_id=p_variant;
 attrs:=coalesce(pref.attributes,'{}');enabled:=coalesce(pref.enabled,true);
 SELECT * INTO profile FROM saas.catalog_product_profiles WHERE store_id=p_store AND product_id=v.product_id;
 IF NOT enabled THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','export_disabled','message','Bu varyantın Google aktarımı kapalı.'));END IF;
 IF p.status<>'active' OR v.status<>'active' THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','not_published','message','Ürün ve varyant yayında olmalıdır.'));END IF;
 IF profile.product_type='digital' THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','unsupported_product_type','message','Dijital ürünler bu Google aktarımında desteklenmiyor.'));END IF;
 IF coalesce(profile.minimum_purchase_quantity,1)<>1 THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','unsupported_minimum_quantity','message','Minimum satın alma adedi 1 olmalıdır.'));END IF;
 SELECT d.hostname,s.locale INTO domain_name,locale FROM saas.store_domains d JOIN saas.stores s ON s.id=d.store_id AND s.status='active' WHERE d.store_id=p_store AND d.status='active' AND d.is_primary AND d.verified_at<=p_now;
 SELECT domain INTO account_domain FROM saas.google_merchant_accounts WHERE store_id=p_store;
 IF locale IS NOT NULL AND lower(locale) NOT LIKE 'tr%' THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','unsupported_content_language','message','İlk Google aktarımı Türkçe içerik ve Türkiye satışları içindir.'));END IF;
 IF p.currency<>'TRY' THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','unsupported_currency','message','İlk Google aktarımı için TL satış fiyatı gerekir.'));END IF;
 IF domain_name IS NULL OR account_domain IS NOT NULL AND account_domain<>domain_name THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','domain_reconnect_required','message','Google hesabını mağazanın güncel alan adıyla yeniden bağlayın.'));END IF;
 SELECT coalesce(policy.method,'fixed_try') INTO method FROM (SELECT 1) dummy LEFT JOIN saas.pricing_variant_policy_state state ON state.store_id=p_store AND state.variant_id=p_variant LEFT JOIN saas.pricing_variant_policy_versions policy ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id AND policy.version=state.current_version;
 IF method<>'fixed_try' THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','dynamic_price_unsupported','message','Döviz veya altın referansına bağlı fiyat için sabit TL fiyatlı bir teklif hazırlayın.'));END IF;
 SELECT * INTO price FROM saas.resolve_effective_variant_price(p_store,p_variant,'storefront',p_now,NULL);
 IF price.outcome IS DISTINCT FROM 'found' OR price.price_cents IS NULL OR price.price_cents<=0 THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','price_unavailable','message','Mağazada geçerli bir satış fiyatı bulunamadı.'));END IF;
 public_product:=saas.public_effective_product_projection(p_store,v.product_id,p_now);
 SELECT e.value INTO public_variant FROM jsonb_array_elements(coalesce(public_product->'variants','[]')) e WHERE e.value->>'id'=p_variant::text;
 IF public_variant IS NULL THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','not_public','message','Varyant mağazada satın alınabilir olarak bulunamadı.'));END IF;
 primary_media:=saas.variant_primary_media_id(p_store,v.product_id,p_variant);
 SELECT EXISTS(SELECT 1 FROM saas.variant_media_galleries WHERE store_id=p_store AND product_id=v.product_id AND variant_id=p_variant) INTO assigned;
 SELECT count(*) INTO assigned_count FROM saas.variant_media_links l JOIN saas.product_media m ON m.store_id=l.store_id AND m.id=l.media_id AND m.product_id=l.product_id AND m.status='active' AND m.object_deleted_at IS NULL WHERE l.store_id=p_store AND l.product_id=v.product_id AND l.variant_id=p_variant;
 SELECT count(*) INTO legacy_count FROM saas.product_media WHERE store_id=p_store AND product_id=v.product_id AND variant_id=p_variant AND status='active' AND object_deleted_at IS NULL;
 SELECT coalesce(jsonb_agg(m.public_url ORDER BY CASE WHEN m.id=primary_media THEN 0 ELSE 1 END,coalesce(l.position,m.sort_order),m.id),'[]') INTO images FROM saas.product_media m LEFT JOIN saas.variant_media_links l ON l.store_id=m.store_id AND l.product_id=m.product_id AND l.media_id=m.id AND l.variant_id=p_variant
 WHERE m.store_id=p_store AND m.product_id=v.product_id AND m.status='active' AND m.object_deleted_at IS NULL AND CASE WHEN assigned_count>0 THEN l.media_id IS NOT NULL WHEN NOT assigned AND legacy_count>0 THEN m.variant_id=p_variant ELSE true END;
 IF jsonb_array_length(images)=0 THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','image_missing','message','Ürüne mağazada görünen bir görsel ekleyin.'));END IF;
 gtin:=attrs->>'gtin';
 -- Catalog's barcode field can contain store-only codes; only validated official-looking identifiers are candidates.
 IF gtin IS NULL AND attrs->>'identifierExists' IS DISTINCT FROM 'false' AND saas.google_merchant_gtin_valid(v.barcode) THEN gtin:=v.barcode;END IF;
 IF v.barcode IS NOT NULL AND NOT saas.google_merchant_gtin_valid(v.barcode) AND gtin IS NULL AND attrs->>'mpn' IS NULL AND attrs->>'identifierExists' IS DISTINCT FROM 'false' THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','manufacturer_gtin_required','message','Dahili barkodu GTIN olarak gönderemeyiz. Gerçek üretici GTIN numarasını girin veya üretici tanımlayıcısı olmadığını belirtin.'));END IF;
 IF gtin IS NULL AND attrs->>'mpn' IS NULL AND attrs->>'identifierExists' IS DISTINCT FROM 'false' THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','identifiers_missing','message','Üreticinin GTIN veya MPN bilgisini girin; gerçekten yoksa tanımlayıcı bulunmadığını belirtin.'));END IF;
 SELECT r.name INTO brand_name FROM saas.catalog_admin_resource_products a JOIN saas.catalog_admin_resources r ON r.store_id=a.store_id AND r.id=a.resource_id AND r.resource_kind='brand' AND r.status='active' WHERE a.store_id=p_store AND a.product_id=v.product_id ORDER BY a.position,r.id LIMIT 1;
 IF (attrs->>'mpn' IS NOT NULL OR gtin IS NOT NULL) AND brand_name IS NULL THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','brand_missing','message','Ürünün gerçek markasını ürün düzenleme ekranından ekleyin.'));END IF;
 color:=coalesce(attrs->>'color',v.attributes->>'color',v.attributes->>'renk',v.attributes->>'Renk');size:=coalesce(attrs->>'size',v.attributes->>'size',v.attributes->>'beden',v.attributes->>'Beden',v.attributes->>'boyut');material:=coalesce(attrs->>'material',v.attributes->>'material',v.attributes->>'materyal',v.attributes->>'Materyal');
 IF (SELECT count(*) FROM saas.product_variants WHERE store_id=p_store AND product_id=v.product_id AND status='active')>1 AND coalesce(color,size,material,attrs->>'gender',attrs->>'ageGroup') IS NULL THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','variant_dimensions_missing','message','Birden fazla varyant için renk, beden veya materyal bilgisini belirtin.'));END IF;
 IF brand_name IS NOT NULL AND length(brand_name)>70 THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','brand_too_long','message','Gerçek marka adı 70 karakterden uzun olmamalıdır.'));END IF;
 IF length(coalesce(color,''))>70 OR length(coalesce(size,''))>70 OR length(coalesce(material,''))>70 THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','variant_attribute_too_long','message','Varyant özellikleri 70 karakterden uzun olmamalıdır.'));END IF;
 description:=saas.google_merchant_plain(p.description,5000);title:=saas.google_merchant_plain(p.title||CASE WHEN v.title IN('Varsayılan','Default','Standart',p.title) THEN '' ELSE ' - '||v.title END,150);
 IF description='' THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','description_missing','message','Ürün açıklamasını ekleyin.'));END IF;
 product_url:=CASE WHEN domain_name IS NULL THEN NULL ELSE 'https://'||domain_name||CASE WHEN lower(locale) LIKE 'tr%' THEN '/urun/' ELSE '/products/' END||p.slug||'?variant='||p_variant::text END;
 IF jsonb_array_length(issues)=0 THEN
 offer:=jsonb_strip_nulls(jsonb_build_object('offerId',p_variant,'contentLanguage','tr','feedLabel','TR','title',title,'description',description,'link',product_url,'imageLink',images->>0,'additionalImageLinks',coalesce((SELECT jsonb_agg(x.value) FROM jsonb_array_elements(images) WITH ORDINALITY x(value,ord) WHERE ord BETWEEN 2 AND 11),'[]'),'price',jsonb_build_object('amountMicros',(price.price_cents::numeric*10000)::text,'currencyCode','TRY'),'availability',CASE WHEN coalesce((public_variant->>'available')::boolean,false) THEN 'in_stock' ELSE 'out_of_stock' END,'condition','new','itemGroupId',p.id,'brand',brand_name,'gtin',CASE WHEN attrs->>'identifierExists'='false' THEN NULL ELSE gtin END,'mpn',attrs->>'mpn','identifierExists',attrs->'identifierExists','googleProductCategory',profile.google_product_category_id,'color',nullif(color,''),'size',nullif(size,''),'material',nullif(material,''),'gender',attrs->>'gender','ageGroup',attrs->>'ageGroup'));
 END IF;
 RETURN jsonb_build_object('offer',offer,'issues',issues,'priceCents',CASE WHEN price.outcome='found' THEN price.price_cents ELSE NULL END,'productUrl',product_url,'title',title,'sku',v.sku,'enabled',enabled,'attributes',attrs,'productId',v.product_id,'variantId',v.id,'updatedAt',saas.orders_json_timestamp(greatest(v.updated_at,p.updated_at,coalesce(pref.updated_at,v.updated_at))));
END $f$;
CREATE FUNCTION saas.google_merchant_enqueue(p_store uuid,p_product uuid,p_variant uuid) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE c saas.google_marketing_connections;
BEGIN
 SELECT * INTO c FROM saas.google_marketing_connections WHERE store_id=p_store AND service='merchant' AND status='connected' AND credential IS NOT NULL AND selection IS NOT NULL FOR SHARE;
 IF NOT FOUND THEN RETURN;END IF;
 INSERT INTO saas.google_merchant_outbox(store_id,product_id,variant_id,connection_version) VALUES(p_store,p_product,p_variant,c.version)
 ON CONFLICT(store_id,variant_id) DO UPDATE SET product_id=EXCLUDED.product_id,generation=saas.google_merchant_outbox.generation+1,connection_version=EXCLUDED.connection_version,next_action='upsert',next_attempt_at=clock_timestamp(),updated_at=clock_timestamp(),attempts=0,
 state=CASE WHEN saas.google_merchant_outbox.state='leased' THEN 'leased' ELSE 'pending' END;
END $f$;
CREATE FUNCTION saas.google_merchant_enqueue_product(p_store uuid,p_product uuid) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected record;
BEGIN
 FOR selected IN SELECT id variant_id FROM saas.product_variants WHERE store_id=p_store AND product_id=p_product UNION SELECT variant_id FROM saas.google_merchant_outbox WHERE store_id=p_store AND product_id=p_product LOOP PERFORM saas.google_merchant_enqueue(p_store,p_product,selected.variant_id);END LOOP;
END $f$;
CREATE FUNCTION saas.google_merchant_price_changed() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE body jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;s uuid:=(body->>'store_id')::uuid;list_id uuid;product_id uuid;moment timestamptz:=clock_timestamp();
BEGIN
 IF TG_TABLE_NAME='price_list_items' THEN
  SELECT v.product_id INTO product_id FROM saas.product_variants v WHERE v.store_id=s AND v.id=(body->>'variant_id')::uuid;
  IF product_id IS NOT NULL THEN PERFORM saas.google_merchant_enqueue(s,product_id,(body->>'variant_id')::uuid);END IF;RETURN NULL;
 END IF;
 list_id:=(body->>CASE WHEN TG_TABLE_NAME='price_lists' THEN 'id' ELSE 'price_list_id' END)::uuid;
 -- One coalesced immediate task per list, never a whole catalog rebuild in a save.
 INSERT INTO saas.google_merchant_price_boundaries(store_id,price_list_id,boundary_key,due_at) VALUES(s,list_id,'immediate:'||list_id::text,moment)
 ON CONFLICT(store_id,boundary_key) DO UPDATE SET due_at=EXCLUDED.due_at,cursor_variant=NULL,processed=false;
 IF TG_TABLE_NAME='price_list_rules' THEN
  DELETE FROM saas.google_merchant_price_boundaries WHERE store_id=s AND boundary_key IN('rule:'||(body->>'id')||':start','rule:'||(body->>'id')||':end');
  IF TG_OP<>'DELETE' AND NEW.channel='storefront' AND NEW.customer_tag_id IS NULL THEN
   INSERT INTO saas.google_merchant_price_boundaries(store_id,price_list_id,boundary_key,due_at,processed) VALUES(s,list_id,'rule:'||NEW.id::text||':start',NEW.starts_at,NEW.starts_at<=moment);
   IF NEW.ends_at IS NOT NULL THEN INSERT INTO saas.google_merchant_price_boundaries(store_id,price_list_id,boundary_key,due_at,processed) VALUES(s,list_id,'rule:'||NEW.id::text||':end',NEW.ends_at,NEW.ends_at<=moment);END IF;
  END IF;
 END IF;RETURN NULL;
END $f$;
CREATE FUNCTION saas.google_merchant_advance_price_boundaries(p_now timestamptz) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE boundary record;variant record;seen integer;last_variant uuid;more boolean;
BEGIN
 -- Due-index only, at most 5 boundaries and 100 variants per boundary in one worker claim.
 FOR boundary IN SELECT * FROM saas.google_merchant_price_boundaries WHERE NOT processed AND due_at<=p_now ORDER BY due_at,store_id,boundary_key LIMIT 5 FOR UPDATE SKIP LOCKED LOOP
  IF NOT EXISTS(SELECT 1 FROM saas.google_marketing_connections WHERE store_id=boundary.store_id AND service='merchant' AND status='connected' AND credential IS NOT NULL) THEN UPDATE saas.google_merchant_price_boundaries SET processed=true WHERE store_id=boundary.store_id AND boundary_key=boundary.boundary_key;CONTINUE;END IF;
  seen:=0;last_variant:=boundary.cursor_variant;more:=false;
  FOR variant IN SELECT i.variant_id,v.product_id FROM saas.price_list_items i JOIN saas.product_variants v ON v.store_id=i.store_id AND v.id=i.variant_id WHERE i.store_id=boundary.store_id AND i.price_list_id=boundary.price_list_id AND (boundary.cursor_variant IS NULL OR i.variant_id>boundary.cursor_variant) ORDER BY i.variant_id LIMIT 101 LOOP
   seen:=seen+1;IF seen>100 THEN more:=true;EXIT;END IF;
   PERFORM saas.google_merchant_enqueue(boundary.store_id,variant.product_id,variant.variant_id);last_variant:=variant.variant_id;
  END LOOP;
  UPDATE saas.google_merchant_price_boundaries SET cursor_variant=last_variant,processed=NOT more WHERE store_id=boundary.store_id AND boundary_key=boundary.boundary_key;
 END LOOP;
END $f$;
CREATE TRIGGER google_merchant_price_list_changed AFTER INSERT OR UPDATE OR DELETE ON saas.price_lists FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_price_changed();
CREATE TRIGGER google_merchant_price_list_item_changed AFTER INSERT OR UPDATE OR DELETE ON saas.price_list_items FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_price_changed();
CREATE TRIGGER google_merchant_price_list_rule_changed AFTER INSERT OR UPDATE OR DELETE ON saas.price_list_rules FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_price_changed();
-- Existing schedules are registered once; no periodic historical catalog scan.
INSERT INTO saas.google_merchant_price_boundaries(store_id,price_list_id,boundary_key,due_at,processed)
 SELECT store_id,price_list_id,'rule:'||id::text||':start',starts_at,starts_at<=clock_timestamp() FROM saas.price_list_rules WHERE channel='storefront' AND customer_tag_id IS NULL
 UNION ALL SELECT store_id,price_list_id,'rule:'||id::text||':end',ends_at,ends_at<=clock_timestamp() FROM saas.price_list_rules WHERE channel='storefront' AND customer_tag_id IS NULL AND ends_at IS NOT NULL;
CREATE FUNCTION saas.google_merchant_changed() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE old_data jsonb:=CASE WHEN TG_OP='INSERT' THEN '{}' ELSE to_jsonb(OLD) END;new_data jsonb:=CASE WHEN TG_OP='DELETE' THEN '{}' ELSE to_jsonb(NEW) END;s uuid;p uuid;v uuid;row record;
BEGIN
 s:=coalesce(new_data->>'store_id',old_data->>'store_id')::uuid;
 IF TG_TABLE_NAME='google_marketing_connections' THEN
  IF coalesce(new_data->>'service',old_data->>'service')<>'merchant' THEN RETURN NULL;END IF;
  IF TG_OP='UPDATE' AND NEW.selection IS NOT DISTINCT FROM OLD.selection AND NEW.version=OLD.version AND NEW.status=OLD.status THEN RETURN NULL;END IF;
  IF NEW.status='connected' AND NEW.selection IS NOT NULL AND NEW.credential IS NOT NULL THEN
   INSERT INTO saas.google_merchant_accounts(store_id,connection_version,domain) SELECT s,NEW.version,d.hostname FROM saas.store_domains d WHERE d.store_id=s AND d.is_primary AND d.status='active' AND d.verified_at<=clock_timestamp() ON CONFLICT(store_id) DO UPDATE SET connection_version=EXCLUDED.connection_version,domain=EXCLUDED.domain WHERE saas.google_merchant_accounts.connection_version<>EXCLUDED.connection_version;
   FOR row IN SELECT id FROM saas.products WHERE store_id=s LOOP PERFORM saas.google_merchant_enqueue_product(s,row.id);END LOOP;
  ELSE
   UPDATE saas.google_merchant_outbox SET generation=generation+1,connection_version=NEW.version,state='excluded',lease_id=NULL,lease_generation=NULL,lease_connection_version=NULL,lease_until=NULL,issues=jsonb_build_array(jsonb_build_object('code','not_connected','message','Google Merchant bağlantısı etkin değil.')),updated_at=clock_timestamp() WHERE store_id=s;
  END IF;RETURN NULL;
 ELSIF TG_TABLE_NAME='store_domains' THEN
  FOR row IN SELECT id FROM saas.products WHERE store_id=s LOOP PERFORM saas.google_merchant_enqueue_product(s,row.id);END LOOP;RETURN NULL;
 ELSIF TG_TABLE_NAME='products' THEN p:=coalesce(new_data->>'id',old_data->>'id')::uuid;
 ELSIF TG_TABLE_NAME='product_variants' THEN p:=coalesce(new_data->>'product_id',old_data->>'product_id')::uuid;v:=coalesce(new_data->>'id',old_data->>'id')::uuid;
 ELSIF TG_TABLE_NAME IN('inventory_balances','pricing_variant_policy_state','catalog_variant_commerce_profiles','variant_media_links','variant_media_galleries') THEN v:=coalesce(new_data->>'variant_id',old_data->>'variant_id')::uuid;SELECT product_id INTO p FROM saas.product_variants WHERE store_id=s AND id=v;
 ELSIF TG_TABLE_NAME='catalog_admin_resources' THEN FOR row IN SELECT product_id FROM saas.catalog_admin_resource_products WHERE store_id=s AND resource_id=coalesce(new_data->>'id',old_data->>'id')::uuid LOOP PERFORM saas.google_merchant_enqueue_product(s,row.product_id);END LOOP;RETURN NULL;
 ELSE p:=coalesce(new_data->>'product_id',old_data->>'product_id')::uuid;END IF;
 IF p IS NOT NULL AND v IS NOT NULL THEN PERFORM saas.google_merchant_enqueue(s,p,v);ELSIF p IS NOT NULL THEN PERFORM saas.google_merchant_enqueue_product(s,p);END IF;RETURN NULL;
END $f$;
CREATE TRIGGER google_merchant_connection_changed AFTER INSERT OR UPDATE OF selection,version,status ON saas.google_marketing_connections FOR EACH ROW WHEN(NEW.service='merchant') EXECUTE FUNCTION saas.google_merchant_changed();
CREATE TRIGGER google_merchant_product_changed AFTER INSERT OR UPDATE OR DELETE ON saas.products FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_changed();
CREATE TRIGGER google_merchant_variant_changed AFTER INSERT OR UPDATE OR DELETE ON saas.product_variants FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_changed();
CREATE TRIGGER google_merchant_media_changed AFTER INSERT OR UPDATE OR DELETE ON saas.product_media FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_changed();
CREATE TRIGGER google_merchant_gallery_changed AFTER INSERT OR UPDATE OR DELETE ON saas.product_variant_gallery_state FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_changed();
CREATE TRIGGER google_merchant_variant_gallery_changed AFTER INSERT OR UPDATE OR DELETE ON saas.variant_media_galleries FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_changed();
CREATE TRIGGER google_merchant_variant_media_changed AFTER INSERT OR UPDATE OR DELETE ON saas.variant_media_links FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_changed();
CREATE TRIGGER google_merchant_inventory_changed AFTER INSERT OR UPDATE OR DELETE ON saas.inventory_balances FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_changed();
CREATE TRIGGER google_merchant_profile_changed AFTER INSERT OR UPDATE OR DELETE ON saas.catalog_product_profiles FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_changed();
CREATE TRIGGER google_merchant_variant_profile_changed AFTER INSERT OR UPDATE OR DELETE ON saas.catalog_variant_commerce_profiles FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_changed();
CREATE TRIGGER google_merchant_brand_assignment_changed AFTER INSERT OR UPDATE OR DELETE ON saas.catalog_admin_resource_products FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_changed();
CREATE TRIGGER google_merchant_brand_changed AFTER UPDATE OF name,status ON saas.catalog_admin_resources FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_changed();
CREATE TRIGGER google_merchant_price_policy_changed AFTER INSERT OR UPDATE OR DELETE ON saas.pricing_variant_policy_state FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_changed();
CREATE TRIGGER google_merchant_domain_changed AFTER INSERT OR UPDATE OR DELETE ON saas.store_domains FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_changed();
CREATE FUNCTION saas.google_merchant_product_row(p_store uuid,p_variant uuid,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,saas AS $f$
DECLARE projected jsonb:=saas.google_merchant_projection(p_store,p_variant,p_now);q saas.google_merchant_outbox;status text;
BEGIN
 IF projected->>'variantId' IS NULL THEN RETURN NULL;END IF;SELECT * INTO q FROM saas.google_merchant_outbox WHERE store_id=p_store AND variant_id=p_variant;
 status:=CASE WHEN jsonb_array_length(projected->'issues')>0 THEN 'excluded' WHEN q.state='leased' THEN 'pending' ELSE coalesce(q.state,'ready') END;
 RETURN (projected-ARRAY['offer'])||jsonb_build_object('status',status,'issues',CASE WHEN status IN('submitted','approved','limited','disapproved','failed') THEN projected->'issues'||coalesce(q.issues,'[]') ELSE projected->'issues' END,'lastSubmittedAt',CASE WHEN q.last_submitted_at IS NULL THEN NULL ELSE saas.orders_json_timestamp(q.last_submitted_at) END);
END $f$;
CREATE FUNCTION saas.google_merchant_command(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_action text,p_input jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;domain_name text;c saas.google_marketing_connections;operation saas.google_merchant_operations;op_id uuid;queued integer:=0;entry record;items jsonb;limit_value integer;cursor uuid;last_id uuid;more boolean;attrs jsonb;v saas.product_variants;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_action NOT IN('overview','products','sync','preferences') OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 err:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'integrations',CASE WHEN p_action IN('overview','products') THEN 'integrations.read' ELSE 'integrations.manage' END);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;IF NOT saas.platform_membership_is_authorized(p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 SELECT hostname INTO domain_name FROM saas.store_domains WHERE store_id=p_store_id AND is_primary AND status='active' AND verified_at<=clock_timestamp();
 IF domain_name IS NULL THEN RETURN QUERY SELECT 'wrong_domain',NULL::jsonb;RETURN;END IF;
 SELECT * INTO c FROM saas.google_marketing_connections WHERE store_id=p_store_id AND service='merchant';
 IF p_action='overview' THEN
 RETURN QUERY SELECT 'found',jsonb_build_object('storeDomain',domain_name,'connection',saas.google_marketing_connection_projection(p_store_id,'merchant'),'dataSourceId',c.selection->>'resourceId','lastSyncedAt',(SELECT CASE WHEN last_synced_at IS NULL THEN NULL ELSE saas.orders_json_timestamp(last_synced_at) END FROM saas.google_merchant_accounts WHERE store_id=p_store_id),'counts',(SELECT jsonb_build_object('ready',0,'pending',count(*) FILTER(WHERE state IN('pending','leased')),'submitted',count(*) FILTER(WHERE state='submitted'),'approved',count(*) FILTER(WHERE state='approved'),'limited',count(*) FILTER(WHERE state='limited'),'disapproved',count(*) FILTER(WHERE state='disapproved'),'excluded',count(*) FILTER(WHERE state='excluded'),'failed',count(*) FILTER(WHERE state='failed')) FROM saas.google_merchant_outbox WHERE store_id=p_store_id));RETURN;
 ELSIF p_action='products' THEN
 limit_value:=(p_input->>'limit')::integer;cursor:=(p_input->>'cursor')::uuid;IF limit_value IS NULL OR limit_value NOT BETWEEN 1 AND 50 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 WITH selected AS MATERIALIZED(SELECT id FROM saas.product_variants WHERE store_id=p_store_id AND (cursor IS NULL OR id>cursor) ORDER BY id LIMIT limit_value+1),page AS(SELECT id FROM selected ORDER BY id LIMIT limit_value)
 SELECT coalesce(jsonb_agg(saas.google_merchant_product_row(p_store_id,id,p_now) ORDER BY id),'[]'),(SELECT count(*)>limit_value FROM selected),(SELECT id FROM page ORDER BY id DESC LIMIT 1) INTO items,more,last_id FROM page;
 RETURN QUERY SELECT 'found',jsonb_build_object('items',items,'nextCursor',CASE WHEN more THEN last_id::text ELSE NULL END);RETURN;
 END IF;
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'google_merchant.'||p_action);
 PERFORM pg_advisory_xact_lock(hashtextextended('google.merchant:'||p_store_id::text,230));
 op_id:=(p_input->>'operationId')::uuid;IF op_id IS NULL OR p_input->>'fingerprint'!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO operation FROM saas.google_merchant_operations WHERE operation_id=op_id;
 IF FOUND THEN IF operation.store_id<>p_store_id OR operation.membership_id<>p_membership_id OR operation.fingerprint IS DISTINCT FROM p_input->>'fingerprint' THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;RETURN QUERY SELECT CASE p_action WHEN 'sync' THEN 'queued' ELSE 'saved' END,operation.result_payload||jsonb_build_object('replayed',true);RETURN;END IF;
 IF p_action='preferences' THEN
 SELECT * INTO v FROM saas.product_variants WHERE store_id=p_store_id AND product_id=(p_input->>'productId')::uuid AND id=(p_input->>'variantId')::uuid;
 attrs:=coalesce(p_input->'attributes','{}');IF NOT FOUND OR jsonb_typeof(p_input->'enabled') IS DISTINCT FROM 'boolean' OR NOT saas.google_merchant_attributes_valid(attrs) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.google_merchant_preferences(store_id,product_id,variant_id,enabled,attributes) VALUES(p_store_id,v.product_id,v.id,(p_input->>'enabled')::boolean,attrs) ON CONFLICT(store_id,variant_id) DO UPDATE SET enabled=EXCLUDED.enabled,attributes=EXCLUDED.attributes,updated_at=clock_timestamp();
 PERFORM saas.google_merchant_enqueue(p_store_id,v.product_id,v.id);
 items:=jsonb_build_object('saved',true,'replayed',false);
 ELSE
 IF c.status IS DISTINCT FROM 'connected' OR c.selection IS NULL OR c.credential IS NULL THEN RETURN QUERY SELECT 'not_connected',NULL::jsonb;RETURN;END IF;
 FOR entry IN SELECT product_id,id variant_id FROM saas.product_variants WHERE store_id=p_store_id UNION SELECT product_id,variant_id FROM saas.google_merchant_outbox WHERE store_id=p_store_id LOOP PERFORM saas.google_merchant_enqueue(p_store_id,entry.product_id,entry.variant_id);queued:=queued+1;END LOOP;
 items:=jsonb_build_object('queued',queued,'replayed',false);
 END IF;
 INSERT INTO saas.google_merchant_operations VALUES(op_id,p_store_id,p_membership_id,p_input->>'fingerprint',items,clock_timestamp());
 RETURN QUERY SELECT CASE p_action WHEN 'sync' THEN 'queued' ELSE 'saved' END,items;
END $f$;
CREATE FUNCTION saas.google_merchant_job_projection(p_store uuid,p_variant uuid,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,saas AS $f$
DECLARE q saas.google_merchant_outbox;c saas.google_marketing_connections;domain_name text;projection jsonb;
BEGIN
 SELECT * INTO q FROM saas.google_merchant_outbox WHERE store_id=p_store AND variant_id=p_variant;SELECT * INTO c FROM saas.google_marketing_connections WHERE store_id=p_store AND service='merchant';
 SELECT hostname INTO domain_name FROM saas.store_domains WHERE store_id=p_store AND status='active' AND is_primary AND verified_at<=p_now;
 IF domain_name IS NULL THEN SELECT domain INTO domain_name FROM saas.google_merchant_accounts WHERE store_id=p_store;END IF;
 IF c.status IS DISTINCT FROM 'connected' OR c.credential IS NULL OR c.version IS DISTINCT FROM q.connection_version OR q.state<>'leased' OR q.lease_until<=clock_timestamp() OR domain_name IS NULL THEN RETURN NULL;END IF;
 projection:=saas.google_merchant_projection(p_store,p_variant,p_now);
 RETURN jsonb_build_object('storeId',q.store_id,'productId',q.product_id,'variantId',q.variant_id,'generation',q.generation,'connectionVersion',q.connection_version,'leaseId',q.lease_id,'accountId',c.selection->>'accountId','dataSourceId',c.selection->>'resourceId','domain',domain_name,'credential',c.credential,'projection',projection->'offer','issues',projection->'issues','action',CASE WHEN projection->'offer'='null'::jsonb AND q.google_product_id IS NOT NULL THEN 'delete' ELSE q.next_action END,'googleProductId',q.google_product_id,'renewal',q.last_submitted_at IS NULL OR q.last_submission_connection_version IS DISTINCT FROM q.connection_version OR q.last_submitted_at+interval '25 days'<=p_now);
END $f$;
CREATE FUNCTION saas.google_merchant_claim(p_now timestamptz,p_limit integer,p_lease uuid) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE payload jsonb;claimed_keys jsonb:='[]';moment timestamptz:=clock_timestamp();candidate record;projection jsonb;same boolean;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 OR p_lease IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM saas.google_merchant_advance_price_boundaries(moment);
 UPDATE saas.google_merchant_outbox SET state=CASE WHEN attempts>=8 THEN 'failed' ELSE 'pending' END,lease_id=NULL,lease_generation=NULL,lease_connection_version=NULL,lease_until=NULL,next_attempt_at=moment+interval '60 seconds',updated_at=moment WHERE state='leased' AND lease_until<=moment;
 FOR candidate IN SELECT q.* FROM saas.google_merchant_outbox q JOIN saas.google_marketing_connections c ON c.store_id=q.store_id AND c.service='merchant' AND c.status='connected' AND c.version=q.connection_version AND c.credential IS NOT NULL JOIN saas.stores s ON s.id=q.store_id AND s.status='active'
 WHERE (EXISTS(SELECT 1 FROM saas.store_domains d WHERE d.store_id=q.store_id AND d.is_primary AND d.status='active' AND d.verified_at<=moment) OR EXISTS(SELECT 1 FROM saas.google_merchant_accounts a WHERE a.store_id=q.store_id AND a.domain IS NOT NULL)) AND q.state IN('pending','submitted','approved','limited','disapproved') AND q.next_attempt_at<=moment AND q.attempts<8 ORDER BY q.next_attempt_at,q.store_id,q.variant_id LIMIT p_limit FOR UPDATE OF q SKIP LOCKED LOOP
  projection:=saas.google_merchant_projection(candidate.store_id,candidate.variant_id,moment);
  same:=candidate.next_action='upsert' AND candidate.last_submission_connection_version=candidate.connection_version AND projection->'offer'<>'null'::jsonb AND candidate.last_export_fingerprint=md5((projection->'offer')::text) AND candidate.google_product_id IS NOT NULL AND candidate.last_submitted_at+interval '25 days'>moment;
  IF coalesce(same,false) THEN
   -- A tracked quantity change such as 12→11 with unchanged in_stock export costs no Google request.
   UPDATE saas.google_merchant_outbox SET state=coalesce(last_google_state,'submitted'),next_action=CASE WHEN last_google_state IN('approved','limited') THEN 'upsert' ELSE 'status' END,next_attempt_at=CASE WHEN last_google_state IN('approved','limited') THEN last_submitted_at+interval '25 days' ELSE least(moment+interval '4 hours',last_submitted_at+interval '25 days') END,attempts=0,updated_at=moment WHERE store_id=candidate.store_id AND variant_id=candidate.variant_id;
   CONTINUE;
  END IF;
  UPDATE saas.google_merchant_outbox SET state='leased',lease_id=p_lease,lease_generation=generation,lease_connection_version=connection_version,lease_until=moment+interval '2 minutes',attempts=attempts+1 WHERE store_id=candidate.store_id AND variant_id=candidate.variant_id;
  claimed_keys:=claimed_keys||jsonb_build_array(jsonb_build_object('storeId',candidate.store_id,'variantId',candidate.variant_id));
 END LOOP;
 -- A separate statement sees the leased rows and constructs private jobs without writable-CTE snapshot confusion.
 SELECT coalesce(jsonb_agg(saas.google_merchant_job_projection((entry->>'storeId')::uuid,(entry->>'variantId')::uuid,moment)),'[]') INTO payload FROM jsonb_array_elements(claimed_keys) entry;
 RETURN QUERY SELECT 'claimed',payload;
END $f$;
CREATE FUNCTION saas.google_merchant_read(p_store uuid,p_variant uuid,p_generation bigint,p_connection_version bigint,p_lease uuid,p_now timestamptz) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE q saas.google_merchant_outbox;payload jsonb;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_store IS NULL OR p_variant IS NULL OR p_lease IS NULL OR p_generation IS NULL OR p_connection_version IS NULL OR p_generation<1 OR p_connection_version<1 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO q FROM saas.google_merchant_outbox WHERE store_id=p_store AND variant_id=p_variant FOR UPDATE;
 IF q.store_id IS NULL OR q.state<>'leased' OR q.lease_id IS DISTINCT FROM p_lease OR q.lease_generation IS DISTINCT FROM p_generation OR q.lease_connection_version IS DISTINCT FROM p_connection_version OR q.lease_until<=clock_timestamp() THEN RETURN QUERY SELECT 'stale','{}'::jsonb;RETURN;END IF;
 IF q.generation<>p_generation OR q.connection_version<>p_connection_version THEN UPDATE saas.google_merchant_outbox SET state='pending',lease_id=NULL,lease_generation=NULL,lease_connection_version=NULL,lease_until=NULL,next_attempt_at=clock_timestamp() WHERE store_id=p_store AND variant_id=p_variant;RETURN QUERY SELECT 'stale','{}'::jsonb;RETURN;END IF;
 payload:=saas.google_merchant_job_projection(p_store,p_variant,clock_timestamp());IF payload IS NULL THEN RETURN QUERY SELECT 'stale','{}'::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',payload;
END $f$;
CREATE FUNCTION saas.google_merchant_finish(p_store uuid,p_variant uuid,p_generation bigint,p_connection_version bigint,p_lease uuid,p_now timestamptz,p_result text,p_google_product_id text,p_issues jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE q saas.google_merchant_outbox;c saas.google_marketing_connections;moment timestamptz:=clock_timestamp();
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_store IS NULL OR p_variant IS NULL OR p_lease IS NULL OR p_generation IS NULL OR p_connection_version IS NULL OR p_generation<1 OR p_connection_version<1 OR p_result IS NULL OR p_result NOT IN('submitted','pending','withdrawn','approved','limited','disapproved','excluded') OR jsonb_typeof(p_issues) IS DISTINCT FROM 'array' OR jsonb_array_length(p_issues)>30 OR length(p_issues::text)>20000 OR p_google_product_id IS NOT NULL AND (length(p_google_product_id)>1024 OR p_google_product_id IS DISTINCT FROM 'tr~TR~'||p_variant::text) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO c FROM saas.google_marketing_connections WHERE store_id=p_store AND service='merchant' FOR UPDATE;SELECT * INTO q FROM saas.google_merchant_outbox WHERE store_id=p_store AND variant_id=p_variant FOR UPDATE;
 IF q.store_id IS NULL OR q.state<>'leased' OR q.lease_id IS DISTINCT FROM p_lease OR q.lease_generation IS DISTINCT FROM p_generation OR q.lease_connection_version IS DISTINCT FROM p_connection_version OR q.lease_until<=moment OR c.store_id IS NULL OR c.status IS DISTINCT FROM 'connected' OR c.version IS DISTINCT FROM p_connection_version THEN RETURN QUERY SELECT 'stale','{}'::jsonb;RETURN;END IF;
 IF q.generation<>p_generation OR q.connection_version<>p_connection_version THEN UPDATE saas.google_merchant_outbox SET state='pending',lease_id=NULL,lease_generation=NULL,lease_connection_version=NULL,lease_until=NULL,next_attempt_at=moment WHERE store_id=p_store AND variant_id=p_variant;RETURN QUERY SELECT 'stale','{}'::jsonb;RETURN;END IF;
 UPDATE saas.google_merchant_outbox SET state=CASE WHEN p_result='pending' THEN 'submitted' ELSE p_result END,last_google_state=CASE WHEN p_result='pending' THEN 'submitted' ELSE p_result END,last_submission_connection_version=CASE WHEN p_result='submitted' THEN p_connection_version ELSE last_submission_connection_version END,last_export_fingerprint=CASE WHEN p_result='submitted' THEN md5((saas.google_merchant_projection(p_store,p_variant,moment)->'offer')::text) WHEN p_result IN('excluded','withdrawn') THEN NULL ELSE last_export_fingerprint END,lease_id=NULL,lease_generation=NULL,lease_connection_version=NULL,lease_until=NULL,attempts=0,issues=p_issues,google_product_id=CASE WHEN p_result IN('withdrawn','excluded') THEN NULL ELSE coalesce(p_google_product_id,google_product_id) END,
 last_submitted_at=CASE WHEN p_result='submitted' THEN moment ELSE last_submitted_at END,
 next_action=CASE WHEN p_result='submitted' THEN 'status' WHEN p_result IN('approved','limited') THEN 'upsert' WHEN p_result IN('pending','disapproved') AND q.last_submitted_at IS NOT NULL AND q.last_submitted_at+interval '25 days'>moment THEN 'status' ELSE 'upsert' END,
 next_attempt_at=CASE WHEN p_result='submitted' THEN moment+interval '15 minutes' WHEN p_result IN('approved','limited') THEN coalesce(q.last_submitted_at+interval '25 days',moment) WHEN p_result='pending' THEN least(moment+interval '4 hours',coalesce(q.last_submitted_at+interval '25 days',moment)) WHEN p_result='disapproved' THEN least(moment+interval '1 day',coalesce(q.last_submitted_at+interval '25 days',moment)) ELSE moment+interval '25 days' END,updated_at=moment WHERE store_id=p_store AND variant_id=p_variant;
 IF p_result IN('submitted','withdrawn') THEN UPDATE saas.google_merchant_accounts SET last_synced_at=moment WHERE store_id=p_store;END IF;RETURN QUERY SELECT 'finished','{}'::jsonb;
END $f$;
CREATE FUNCTION saas.google_merchant_defer(p_store uuid,p_variant uuid,p_generation bigint,p_connection_version bigint,p_lease uuid,p_now timestamptz,p_code text,p_retry_seconds integer) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE q saas.google_merchant_outbox;c saas.google_marketing_connections;result text;moment timestamptz:=clock_timestamp();
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_store IS NULL OR p_variant IS NULL OR p_lease IS NULL OR p_generation IS NULL OR p_connection_version IS NULL OR p_generation<1 OR p_connection_version<1 OR p_code IS NULL OR p_code!~'^[a-z0-9_]{1,80}$' OR p_retry_seconds IS NULL OR p_retry_seconds NOT BETWEEN 1 AND 86400 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO c FROM saas.google_marketing_connections WHERE store_id=p_store AND service='merchant' FOR UPDATE;
 SELECT * INTO q FROM saas.google_merchant_outbox WHERE store_id=p_store AND variant_id=p_variant FOR UPDATE;
 IF q.store_id IS NULL OR q.state<>'leased' OR q.lease_id IS DISTINCT FROM p_lease OR q.lease_generation IS DISTINCT FROM p_generation OR q.lease_connection_version IS DISTINCT FROM p_connection_version OR q.lease_until<=moment THEN RETURN QUERY SELECT 'stale','{}'::jsonb;RETURN;END IF;
 IF q.generation<>p_generation OR q.connection_version<>p_connection_version OR NOT EXISTS(SELECT 1 FROM saas.google_marketing_connections WHERE store_id=p_store AND service='merchant' AND status='connected' AND version=p_connection_version) THEN UPDATE saas.google_merchant_outbox SET state='pending',lease_id=NULL,lease_generation=NULL,lease_connection_version=NULL,lease_until=NULL,next_attempt_at=moment WHERE store_id=p_store AND variant_id=p_variant;RETURN QUERY SELECT 'stale','{}'::jsonb;RETURN;END IF;
 IF p_code='needs_reconnect' THEN UPDATE saas.google_marketing_connections SET status='needs_reconnect',error_code='needs_reconnect',updated_at=moment WHERE store_id=p_store AND service='merchant' AND version=p_connection_version;RETURN QUERY SELECT 'failed','{}'::jsonb;RETURN;END IF;
 result:=CASE WHEN q.attempts>=8 THEN 'failed' ELSE 'retry' END;
 UPDATE saas.google_merchant_outbox SET state=CASE WHEN result='failed' THEN 'failed' ELSE 'pending' END,lease_id=NULL,lease_generation=NULL,lease_connection_version=NULL,lease_until=NULL,next_attempt_at=moment+make_interval(secs=>greatest(p_retry_seconds,least(3600,30*power(2,q.attempts)::integer))),issues=jsonb_build_array(jsonb_build_object('code',p_code,'message','Google aktarımı tamamlanamadı; seçiminiz korunuyor.')),updated_at=moment WHERE store_id=p_store AND variant_id=p_variant;
 RETURN QUERY SELECT result,'{}'::jsonb;
END $f$;
CREATE FUNCTION saas.google_merchant_save_credential(p_store uuid,p_variant uuid,p_generation bigint,p_connection_version bigint,p_lease uuid,p_now timestamptz,p_credential jsonb,p_subject text) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_store IS NULL OR p_variant IS NULL OR p_lease IS NULL OR p_generation IS NULL OR p_connection_version IS NULL OR p_generation<1 OR p_connection_version<1 OR p_subject IS NULL OR length(p_subject) NOT BETWEEN 1 AND 256 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM 1 FROM saas.google_marketing_connections WHERE store_id=p_store AND service='merchant' AND status='connected' AND version=p_connection_version AND google_subject=p_subject FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'stale','{}'::jsonb;RETURN;END IF;
 PERFORM 1 FROM saas.google_merchant_outbox WHERE store_id=p_store AND variant_id=p_variant AND state='leased' AND generation=p_generation AND lease_generation=p_generation AND connection_version=p_connection_version AND lease_connection_version=p_connection_version AND lease_id=p_lease AND lease_until>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'stale','{}'::jsonb;RETURN;END IF;
 UPDATE saas.google_marketing_connections SET credential=p_credential,updated_at=clock_timestamp() WHERE store_id=p_store AND service='merchant' AND status='connected' AND version=p_connection_version AND google_subject=p_subject;
 IF NOT FOUND THEN RETURN QUERY SELECT 'stale','{}'::jsonb;RETURN;END IF;RETURN QUERY SELECT 'saved','{}'::jsonb;
END $f$;
REVOKE ALL ON FUNCTION saas.google_merchant_price_changed(),saas.google_merchant_advance_price_boundaries(timestamptz),saas.google_merchant_gtin_valid(text),saas.google_merchant_attributes_valid(jsonb),saas.google_merchant_plain(text,integer),saas.google_merchant_projection(uuid,uuid,timestamptz),saas.google_merchant_enqueue(uuid,uuid,uuid),saas.google_merchant_enqueue_product(uuid,uuid),saas.google_merchant_changed(),saas.google_merchant_product_row(uuid,uuid,timestamptz),saas.google_merchant_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb),saas.google_merchant_job_projection(uuid,uuid,timestamptz),saas.google_merchant_claim(timestamptz,integer,uuid),saas.google_merchant_read(uuid,uuid,bigint,bigint,uuid,timestamptz),saas.google_merchant_finish(uuid,uuid,bigint,bigint,uuid,timestamptz,text,text,jsonb),saas.google_merchant_defer(uuid,uuid,bigint,bigint,uuid,timestamptz,text,integer),saas.google_merchant_save_credential(uuid,uuid,bigint,bigint,uuid,timestamptz,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.google_merchant_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.google_merchant_claim(timestamptz,integer,uuid),saas.google_merchant_read(uuid,uuid,bigint,bigint,uuid,timestamptz),saas.google_merchant_finish(uuid,uuid,bigint,bigint,uuid,timestamptz,text,text,jsonb),saas.google_merchant_defer(uuid,uuid,bigint,bigint,uuid,timestamptz,text,integer),saas.google_merchant_save_credential(uuid,uuid,bigint,bigint,uuid,timestamptz,jsonb,text) TO celebix_saas_workflow;
COMMIT;
