-- Inactive attribute starters for new stores and the explicitly approved Ezmeo tenant.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.catalog-attribute-templates.release278',0));
LOCK TABLE saas.stores IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE saas.catalog_admin_resources IN SHARE ROW EXCLUSIVE MODE;
DO $precondition$BEGIN
 IF to_regclass('saas.catalog_attribute_templates278_seeded')IS NOT NULL
  OR to_regprocedure('saas.seed_store_catalog_attribute_templates(uuid,timestamp with time zone)')IS NOT NULL
  OR to_regprocedure('saas.create_store_catalog_attribute_templates()')IS NOT NULL
  OR to_regprocedure('saas.catalog_attribute_native_key(jsonb,text)')IS NULL
  OR to_regclass('saas.order_delete_quotes277_function_backup')IS NULL
  OR(SELECT count(*)FROM saas.order_delete_quotes277_function_backup)<>3
  OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.stores'::regclass AND tgname='stores_catalog_attribute_templates278')
 THEN RAISE EXCEPTION 'CATALOG_ATTRIBUTE_TEMPLATES278_PREREQUISITE_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM saas.stores WHERE id='7892a771-67a9-42d7-9b36-f4c3e8562e95'AND slug<>'ezmeo')
 THEN RAISE EXCEPTION 'CATALOG_ATTRIBUTE_TEMPLATES278_EZMEO_IDENTITY_INVALID';END IF;
END $precondition$;

-- Provenance contains only inserted rows, never a snapshot or rewrite of existing resources.
CREATE TABLE saas.catalog_attribute_templates278_seeded(
 store_id uuid NOT NULL,
 template_slug text NOT NULL,
 resource_id uuid NOT NULL,
 seeded_record jsonb NOT NULL,
 original_record jsonb,
 PRIMARY KEY(store_id,template_slug),
 UNIQUE(resource_id),
 FOREIGN KEY(store_id,resource_id)REFERENCES saas.catalog_admin_resources(store_id,id)ON DELETE CASCADE,
 CHECK(template_slug IN('renk','beden','malzeme','desen','kalip','cinsiyet','yas-grubu','agirlik','hacim','uzunluk','en','yukseklik','paket-ici-adet','urun-durumu')),
 CHECK(jsonb_typeof(seeded_record)='object'AND pg_column_size(seeded_record)<=16384),
 CHECK(original_record IS NULL OR(jsonb_typeof(original_record)='object'AND pg_column_size(original_record)<=16384))
);
ALTER TABLE saas.catalog_attribute_templates278_seeded ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_attribute_templates278_seeded FORCE ROW LEVEL SECURITY;

CREATE FUNCTION saas.seed_store_catalog_attribute_templates(p_store_id uuid,p_now timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE template record;inserted saas.catalog_admin_resources%ROWTYPE;next_config jsonb;
BEGIN
 IF p_store_id IS NULL OR p_now IS NULL OR NOT isfinite(p_now)
  OR NOT EXISTS(SELECT 1 FROM saas.stores WHERE id=p_store_id)
 THEN RAISE EXCEPTION 'CATALOG_ATTRIBUTE_TEMPLATES278_INPUT_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store_id::text,0));
 FOR template IN SELECT *FROM(VALUES
  ('renk','Renk','["Siyah","Beyaz","Kırmızı","Mavi","Yeşil"]'::jsonb,NULL::text),
  ('beden','Beden','["XS","S","M","L","XL","XXL"]'::jsonb,NULL::text),
  ('malzeme','Malzeme','["Pamuk","Polyester","Yün","Ahşap","Metal","Cam"]'::jsonb,NULL::text),
  ('desen','Desen','["Düz","Çizgili","Kareli","Desenli"]'::jsonb,NULL::text),
  ('kalip','Kalıp','["Dar","Standart","Rahat"]'::jsonb,NULL::text),
  ('cinsiyet','Cinsiyet','["Kadın","Erkek","Unisex"]'::jsonb,NULL::text),
  ('yas-grubu','Yaş Grubu','["Bebek","Çocuk","Genç","Yetişkin"]'::jsonb,NULL::text),
  ('agirlik','Ağırlık','["100 g","250 g","500 g","1 kg","2 kg","5 kg"]'::jsonb,'weight'),
  ('hacim','Hacim','["100 ml","250 ml","500 ml","1 L","2 L","5 L"]'::jsonb,'volume'),
  ('uzunluk','Uzunluk','["10 cm","20 cm","50 cm","1 m","2 m"]'::jsonb,'length'),
  ('en','En','["5 cm","10 cm","20 cm","50 cm"]'::jsonb,'width'),
  ('yukseklik','Yükseklik','["5 cm","10 cm","20 cm","30 cm"]'::jsonb,'height'),
  ('paket-ici-adet','Paket İçi Adet','["1","2","4","6","12","24"]'::jsonb,'packageCount'),
  ('urun-durumu','Ürün Durumu','["Yeni","Yenilenmiş","İkinci el"]'::jsonb,NULL::text)
 )definitions(slug,name,values,measurement_field)LOOP
  -- Archived records and native keys are deliberately included; none may be replaced.
  IF EXISTS(SELECT 1 FROM saas.catalog_admin_resources r WHERE r.store_id=p_store_id AND r.resource_kind='attribute'
   AND(r.slug=template.slug OR saas.catalog_attribute_native_key(r.config,r.slug)=template.slug
    OR lower(translate(btrim(r.name),'IİÇĞÖŞÜ','ıiçğöşü'))=lower(translate(template.name,'IİÇĞÖŞÜ','ıiçğöşü'))))
  THEN CONTINUE;END IF;
  next_config:=jsonb_strip_nulls(jsonb_build_object('key',template.slug,'values',template.values,
   'enabled',false,'starterTemplate',template.slug,'measurementField',template.measurement_field));
  inserted:=NULL;
  INSERT INTO saas.catalog_admin_resources(id,store_id,resource_kind,name,slug,config,status,version,created_at,updated_at)
  VALUES(gen_random_uuid(),p_store_id,'attribute',template.name,template.slug,next_config,'active',1,p_now,p_now)
  ON CONFLICT(store_id,resource_kind,slug)DO NOTHING RETURNING *INTO inserted;
  IF inserted.id IS NOT NULL THEN
   INSERT INTO saas.catalog_attribute_templates278_seeded(store_id,template_slug,resource_id,seeded_record)
   VALUES(p_store_id,template.slug,inserted.id,to_jsonb(inserted));
  END IF;
 END LOOP;
END $function$;

CREATE FUNCTION saas.create_store_catalog_attribute_templates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
BEGIN PERFORM saas.seed_store_catalog_attribute_templates(NEW.id,NEW.created_at);RETURN NEW;END $function$;

REVOKE ALL ON FUNCTION saas.seed_store_catalog_attribute_templates(uuid,timestamptz),saas.create_store_catalog_attribute_templates()FROM PUBLIC;
REVOKE ALL ON saas.catalog_attribute_templates278_seeded FROM PUBLIC;
DO $private$DECLARE role_name text;BEGIN
 FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION saas.seed_store_catalog_attribute_templates(uuid,timestamptz),saas.create_store_catalog_attribute_templates() FROM %I',role_name);
  EXECUTE format('REVOKE ALL ON saas.catalog_attribute_templates278_seeded FROM %I',role_name);
 END LOOP;
END $private$;

CREATE TRIGGER stores_catalog_attribute_templates278 AFTER INSERT ON saas.stores
FOR EACH ROW EXECUTE FUNCTION saas.create_store_catalog_attribute_templates();

-- No scan or backfill of other existing tenants; absent Ezmeo is valid in clean signup rehearsals.
DO $ezmeo$BEGIN
 IF EXISTS(SELECT 1 FROM saas.stores WHERE id='7892a771-67a9-42d7-9b36-f4c3e8562e95'AND slug='ezmeo')THEN
  PERFORM saas.seed_store_catalog_attribute_templates('7892a771-67a9-42d7-9b36-f4c3e8562e95',clock_timestamp());
 END IF;
END $ezmeo$;

-- The approved existing Ezmeo weight attribute keeps its values, enabled state and native key.
-- Only its typed binding is added; exact before/after rows make rollback non-destructive.
DO $weight$DECLARE existing saas.catalog_admin_resources%ROWTYPE;changed saas.catalog_admin_resources%ROWTYPE;
BEGIN
 SELECT *INTO existing FROM saas.catalog_admin_resources WHERE store_id='7892a771-67a9-42d7-9b36-f4c3e8562e95'
  AND id='d52682bd-6b26-40b0-8464-15d938d790c3'AND resource_kind='attribute'AND slug='agirlik'AND status='active'FOR UPDATE;
 IF existing.id IS NULL OR existing.config ? 'measurementField'THEN RETURN;END IF;
 IF jsonb_typeof(existing.config->'values')IS DISTINCT FROM 'array'THEN RAISE EXCEPTION 'CATALOG_ATTRIBUTE_TEMPLATES278_EZMEO_WEIGHT_VALUES_INVALID';END IF;
 IF jsonb_array_length(existing.config->'values')NOT BETWEEN 1 AND 64 OR EXISTS(
  SELECT 1 FROM jsonb_array_elements(existing.config->'values')v WHERE jsonb_typeof(v.value)IS DISTINCT FROM 'string'
   OR v.value#>>'{}'!~'^[0-9]+([.,][0-9]{1,3})? ?(g|kg)$')
 THEN RAISE EXCEPTION 'CATALOG_ATTRIBUTE_TEMPLATES278_EZMEO_WEIGHT_VALUES_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(existing.config->'values')v(value)
  WHERE replace(regexp_replace(v.value,' ?(g|kg)$',''),',','.')::numeric<=0)
 THEN RAISE EXCEPTION 'CATALOG_ATTRIBUTE_TEMPLATES278_EZMEO_WEIGHT_VALUES_INVALID';END IF;
 UPDATE saas.catalog_admin_resources SET config=existing.config||jsonb_build_object('measurementField','weight'),
  version=version+1,updated_at=greatest(updated_at,clock_timestamp())WHERE store_id=existing.store_id AND id=existing.id RETURNING *INTO changed;
 INSERT INTO saas.catalog_attribute_templates278_seeded(store_id,template_slug,resource_id,seeded_record,original_record)
 VALUES(existing.store_id,'agirlik',existing.id,to_jsonb(changed),to_jsonb(existing));
END $weight$;
COMMIT;
