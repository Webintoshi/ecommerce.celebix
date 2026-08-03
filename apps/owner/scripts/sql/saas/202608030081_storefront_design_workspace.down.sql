BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $storefront_design_down_guard$
BEGIN
  IF COALESCE(pg_catalog.current_setting('celebix.allow_storefront_design_down',true),'off')<>'on' THEN
    RAISE EXCEPTION 'STORE_FRONT_DESIGN_WORKSPACE_DOWN_BLOCKED';
  END IF;
END
$storefront_design_down_guard$;

DROP FUNCTION saas.storefront_design_get_public(uuid,text,timestamptz);
DROP FUNCTION saas.storefront_design_media_reserve(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,integer,integer,bigint,text);
DROP FUNCTION saas.storefront_design_publish(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,bigint);
DROP FUNCTION saas.storefront_design_save_draft(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,jsonb);
DROP FUNCTION saas.storefront_design_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.storefront_design_workspace_payload(uuid);
DROP FUNCTION saas.storefront_design_public_payload(uuid,jsonb,bigint,timestamptz);
DROP FUNCTION saas.storefront_design_public_destination(uuid,jsonb);
DROP FUNCTION saas.storefront_design_public_media(uuid,jsonb);
DROP FUNCTION saas.storefront_design_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,boolean);
DROP TRIGGER storefront_design_events_immutable ON saas.storefront_design_events;
DROP FUNCTION saas.guard_storefront_design_event_immutability();
DROP TRIGGER storefront_design_operations_immutable ON saas.storefront_design_operations;
DROP FUNCTION saas.guard_storefront_design_operation_immutability();
DROP TABLE saas.storefront_design_events;
DROP TABLE saas.storefront_design_operations;
DROP TABLE saas.storefront_designs;
DROP FUNCTION saas.storefront_design_document_valid(uuid,jsonb,boolean);
DROP FUNCTION saas.storefront_design_destination_valid(uuid,jsonb);
DROP FUNCTION saas.storefront_design_media_reference_valid(uuid,jsonb,boolean);
DROP TABLE saas.storefront_design_media;
DROP FUNCTION saas.storefront_design_timestamp_valid(jsonb);
DROP FUNCTION saas.storefront_design_timestamp_value(jsonb);
DROP FUNCTION saas.storefront_design_text_valid(jsonb,integer,integer);
DROP FUNCTION saas.storefront_design_exact_keys(jsonb,text[]);
DROP FUNCTION saas.storefront_design_timestamp(timestamptz);

COMMIT;
