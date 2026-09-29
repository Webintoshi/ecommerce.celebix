BEGIN;
SET LOCAL ROLE celebix_saas_owner;
-- History, its digest column and the binding guard are intentionally retained.
-- Reverting application code cannot erase saved provenance or invalidate existing cross-actor history.
DROP FUNCTION saas.catalog_update_product_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,text,jsonb);
DROP FUNCTION saas.catalog_update_merchandising_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb,jsonb);
DROP FUNCTION saas.catalog_onboard_product_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb);
DROP FUNCTION saas.catalog_get_product_editor_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid);
DROP FUNCTION saas.content_authoring_append_origins(uuid,uuid,uuid,text[],jsonb,timestamptz,boolean);
DROP FUNCTION saas.content_authoring_normalize(text,text);
DROP FUNCTION saas.content_authoring_render_description(jsonb);
DROP FUNCTION saas.content_authoring_render_nodes(jsonb);
DROP FUNCTION saas.content_authoring_escape(text);
COMMIT;
