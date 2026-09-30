-- Disposable fixture only. Runs after182/183 with the collection harness's
-- Store A, category570...001 and published automatic collection570...006.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $fixture$
DECLARE
 fixture_store constant uuid := '10000000-0000-4000-8000-000000000001';
 category_id constant uuid := '57000000-0000-4000-8000-000000000001';
 collection_id constant uuid := '57000000-0000-4000-8000-000000000006';
 media_id constant uuid := '59000000-0000-4000-8000-000000000183';
 baseline jsonb; composition jsonb; design jsonb; projection jsonb;
 response record; current_version bigint; retained_draft jsonb;
BEGIN
 INSERT INTO saas.storefront_design_media(id,store_id,object_key,public_url,media_type,alt_text,width,height,content_length,content_sha256,status,created_at,updated_at)
 VALUES(media_id,fixture_store,'stores/'||fixture_store||'/design/'||media_id||'.webp','https://media.saas-staging.celebix.site/stores/'||fixture_store||'/design/'||media_id||'.webp','image/webp','Sonbahar',1600,900,4096,repeat('a',64),'active','2026-09-30T18:00:00Z','2026-09-30T18:00:00Z');
 baseline:=saas.storefront_design_normalize_v5(jsonb_build_object(
  'schemaVersion',4,
  'brand',jsonb_build_object('logo',null,'favicon',null,'primaryColor','#FF5A00','accentColor','#171717','backgroundColor','#FFFFFF','textColor','#171717','fontFamily','inter'),
  'hero',jsonb_build_object('enabled',false,'slides',jsonb_build_array(jsonb_build_object('enabled',false,'headline','','body','','desktopImage','null'::jsonb,'mobileImage','null'::jsonb,'destination',jsonb_build_object('kind','none')))),
  'promotion',jsonb_build_object('enabled',false,'headline','Sonbahar','body','','destination',jsonb_build_object('kind','none'),'startsAt',null,'endsAt',null),
  'announcement',jsonb_build_object('enabled',false,'items',jsonb_build_array('Sonbahar'),'icon','none','speed','normal','direction','left','animation','continuous'),
  'typography',saas.storefront_design_typography_default('inter'),
  'composition',saas.storefront_theme_composition_with_home_ids(saas.storefront_theme_default_composition())||jsonb_build_object('sections','[]'::jsonb)
 ));
 INSERT INTO saas.storefront_designs(store_id,schema_version,draft_config,published_config,draft_version,published_version,draft_updated_at,published_at,draft_updated_by,published_by)
 VALUES(fixture_store,5,baseline,baseline,1,1,'2026-09-30T18:00:00Z','2026-09-30T18:00:00Z','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001')
 ON CONFLICT ON CONSTRAINT storefront_designs_pkey DO NOTHING;
 SELECT published_version,draft_config INTO current_version,retained_draft FROM saas.storefront_designs WHERE storefront_designs.store_id=fixture_store;
 composition:=baseline->'composition';
 composition:=jsonb_set(composition,'{navigation}',jsonb_build_object('rootCategoryIds',jsonb_build_array(category_id),'rootLinks',jsonb_build_array(jsonb_build_object('kind','catalog_collection','resourceId',collection_id),jsonb_build_object('kind','category','resourceId',category_id))));
 composition:=jsonb_set(composition,'{footer,groups,0,links}',jsonb_build_array(jsonb_build_object('kind','catalog_collection','resourceId',collection_id)));
 composition:=jsonb_set(composition,'{sections}',jsonb_build_array(jsonb_build_object('kind','banner','sectionId','home_collection_banner','enabled',true,'layout','single','autoplay',false,'presentation','overlay','slides',jsonb_build_array(jsonb_build_object('slideId','slide_collection_banner','enabled',true,'headline','Sonbahar','body','','desktopImage',jsonb_build_object('kind','media','mediaId',media_id),'mobileImage','null'::jsonb,'destination',jsonb_build_object('kind','catalog_collection','resourceId',collection_id))))));
 design:=jsonb_set(baseline,'{composition}',composition);
 IF NOT saas.storefront_design_composition_valid(composition) OR NOT saas.storefront_design_document_valid(fixture_store,design,true) OR NOT saas.storefront_design_v5_publishable(fixture_store,design,baseline) THEN RAISE EXCEPTION 'COLLECTION_DESIGN_V4_VALIDATION_FAILED'; END IF;
 SELECT * INTO response FROM saas.storefront_design_apply(fixture_store,'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','free_starter',1,'2026-09-30T18:00:00Z','99000000-0000-4000-8000-000000000183',repeat('b',64),current_version,design);
 IF response.outcome IS DISTINCT FROM 'applied' THEN RAISE EXCEPTION 'COLLECTION_DESIGN_APPLY_FAILED: %',response.outcome; END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.storefront_designs row WHERE row.store_id=fixture_store AND row.published_config=design AND row.draft_config=retained_draft AND row.published_version=current_version+1) THEN RAISE EXCEPTION 'COLLECTION_DESIGN_APPLY_NOT_ATOMIC'; END IF;
 projection:=saas.public_starter_retail_presentation(fixture_store,'2026-09-30T18:00:00Z',true);
 IF projection->>'schemaVersion' IS DISTINCT FROM '4' OR projection#>>'{navigation,items,0,kind}' IS DISTINCT FROM 'catalog_collection' OR projection#>>'{navigation,items,0,path}' IS DISTINCT FROM '/collections/sonbahar' OR jsonb_array_length(projection#>'{navigation,items}') IS DISTINCT FROM 2 OR projection#>>'{footer,groups,0,links,0,destination}' IS DISTINCT FROM '/collections/sonbahar' OR projection#>>'{sections,0,slides,0,destination}' IS DISTINCT FROM '/collections/sonbahar' THEN RAISE EXCEPTION 'COLLECTION_DESIGN_PUBLIC_V4_INTEGRATION_FAILED: %',projection; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(saas.storefront_design_editor_payload(fixture_store)->'destinations') choice WHERE choice->>'kind'='catalog_collection' AND choice->>'resourceId'=collection_id::text AND choice->>'path'='/collections/sonbahar') THEN RAISE EXCEPTION 'COLLECTION_DESIGN_EDITOR_CHOICE_MISSING'; END IF;
 IF saas.storefront_design_destination_valid(fixture_store,'{"kind":"catalog_collection","resourceId":"57000000-0000-4000-8000-000000000099"}') OR saas.storefront_theme_composition_references_valid(fixture_store,jsonb_set(composition,'{navigation,rootLinks,0,resourceId}','"57000000-0000-4000-8000-000000000099"'),true) THEN RAISE EXCEPTION 'COLLECTION_DESIGN_FOREIGN_REFERENCE_ACCEPTED'; END IF;
END $fixture$;
ROLLBACK;
