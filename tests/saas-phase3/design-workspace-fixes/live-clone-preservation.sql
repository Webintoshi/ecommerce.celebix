-- Read-only acceptance check against the migration's private pre-165 evidence.
BEGIN READ ONLY;
DO $qa_only$ BEGIN
 IF current_database()<>'celebix_design_qa_20260926' THEN RAISE EXCEPTION 'QA_CLONE_ONLY'; END IF;
END $qa_only$;
WITH projected AS (
 SELECT design.*,backup.original,
  backup.original->'presentation' prior,
  saas.public_starter_retail_presentation(design.store_id,statement_timestamp(),false) current
 FROM saas.storefront_designs design
 JOIN saas.storefront_design_workspace_fixes_backup backup ON backup.identity=design.store_id::text
), visible AS (
 SELECT projected.*,
  CASE WHEN prior IS NULL THEN false
   WHEN (original->>'publishedVersion')::bigint>1 THEN (original->'published'->'announcement'->>'enabled')::boolean
   ELSE prior?'announcement' END prior_announcement_visible,
  COALESCE(current?'announcement',false) current_announcement_visible,
  CASE WHEN (original->>'publishedVersion')::bigint>1 THEN original->'published'->'announcement'->'items'
   ELSE prior->'announcement'->'items' END prior_announcement_items,
  current->'announcement'->'items' current_announcement_items,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('heading',prior->'categoryShowcase'->>'heading','layout',prior->'categoryShowcase'->>'layout','items',
    (SELECT jsonb_agg(jsonb_build_object('slug',item->>'slug','name',item->>'name','imageUrl',item->'image'->>'url') ORDER BY ordinal)
     FROM jsonb_array_elements(prior->'categoryShowcase'->'items') WITH ORDINALITY items(item,ordinal))) ORDER BY section_ordinal)
   FROM jsonb_array_elements(COALESCE(prior->'sections','[]'::jsonb)) WITH ORDINALITY sections(section,section_ordinal)
   WHERE section->>'kind'='category_grid' AND prior?'categoryShowcase'),'[]'::jsonb) prior_categories,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('heading',section->>'heading','layout',section->>'layout','items',
    (SELECT jsonb_agg(jsonb_build_object('slug',item->>'slug','name',item->>'name','imageUrl',item->'image'->>'url') ORDER BY ordinal)
     FROM jsonb_array_elements(section->'items') WITH ORDINALITY items(item,ordinal))) ORDER BY section_ordinal)
   FROM jsonb_array_elements(COALESCE(current->'sections','[]'::jsonb)) WITH ORDINALITY sections(section,section_ordinal)
   WHERE section->>'kind'='category_grid'),'[]'::jsonb) current_categories
 FROM projected
)
SELECT jsonb_build_object(
 'designCount',count(*),
 'versionsPreserved',count(*) FILTER(WHERE draft_version=(original->>'draftVersion')::bigint AND published_version=(original->>'publishedVersion')::bigint),
 'draftDocumentsPreserved',count(*) FILTER(WHERE draft_config=original->'draft'),
 'announcementVisibilityPreserved',count(*) FILTER(WHERE prior_announcement_visible=current_announcement_visible),
 'visibleAnnouncementItemsPreserved',count(*) FILTER(WHERE CASE WHEN prior_announcement_visible THEN COALESCE(prior_announcement_items,'[]'::jsonb) ELSE '[]'::jsonb END=CASE WHEN current_announcement_visible THEN COALESCE(current_announcement_items,'[]'::jsonb) ELSE '[]'::jsonb END),
 'visibleCategoryContentPreserved',count(*) FILTER(WHERE prior_categories=current_categories)
) FROM visible;
ROLLBACK;
