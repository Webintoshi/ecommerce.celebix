BEGIN;
SET LOCAL ROLE celebix_saas_owner;

REVOKE ALL ON FUNCTION saas.toshi_provider_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.toshi_provider_connection_identity(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.toshi_provider_connect(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,jsonb,text,bigint,text,text,jsonb,bigint),
  saas.toshi_provider_select_model(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,text,bigint),
  saas.toshi_provider_set_default(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,bigint),
  saas.toshi_provider_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,bigint),
  saas.toshi_provider_get_authority(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.toshi_provider_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)
FROM celebix_saas_app;

DROP FUNCTION saas.toshi_provider_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.toshi_provider_get_authority(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text);
DROP FUNCTION saas.toshi_provider_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,bigint);
DROP FUNCTION saas.toshi_provider_set_default(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,bigint);
DROP FUNCTION saas.toshi_provider_select_model(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,text,bigint);
DROP FUNCTION saas.toshi_provider_connect(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,jsonb,text,bigint,text,text,jsonb,bigint);
DROP FUNCTION saas.toshi_provider_connection_identity(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text);
DROP FUNCTION saas.toshi_provider_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.toshi_provider_public_payload(uuid,uuid);
DROP FUNCTION saas.toshi_provider_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,boolean);

DROP TRIGGER toshi_provider_events_immutable ON saas.toshi_provider_events;
DROP TRIGGER toshi_provider_operations_immutable ON saas.toshi_provider_operations;
DROP FUNCTION saas.guard_toshi_provider_event_immutability();
DROP FUNCTION saas.guard_toshi_provider_operation_immutability();

DROP TABLE saas.toshi_provider_events;
DROP TABLE saas.toshi_provider_operations;
DROP TABLE saas.toshi_provider_configs;

DROP FUNCTION saas.toshi_provider_model_available(jsonb,text);
DROP FUNCTION saas.toshi_provider_models_valid(jsonb);
DROP FUNCTION saas.toshi_provider_envelope_valid(jsonb);
DROP FUNCTION saas.toshi_provider_timestamp(timestamptz);

COMMIT;
