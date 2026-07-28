BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

DROP FUNCTION saas.payment_method_single_active_provider_preflight();

REVOKE ALL ON FUNCTION saas.paytr_iframe_activation_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
DROP FUNCTION saas.paytr_iframe_activation_preflight();
ALTER FUNCTION saas.paytr_iframe_activation_preflight_without_single_active_provider()
  RENAME TO paytr_iframe_activation_preflight;
GRANT EXECUTE ON FUNCTION saas.paytr_iframe_activation_preflight()
TO celebix_saas_app,celebix_saas_workflow;

REVOKE ALL ON FUNCTION saas.paytr_iframe_test_payment_method_activate(
  uuid,uuid,timestamptz
)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
DROP FUNCTION saas.paytr_iframe_test_payment_method_activate(
  uuid,uuid,timestamptz
);
ALTER FUNCTION saas.paytr_iframe_test_payment_method_activate_without_single_active_provider(
  uuid,uuid,timestamptz
) RENAME TO paytr_iframe_test_payment_method_activate;

REVOKE ALL ON FUNCTION saas.payment_method_set_state(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text
)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
DROP FUNCTION saas.payment_method_set_state(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text
);

ALTER FUNCTION saas.payment_method_set_state_without_single_active_provider(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text
) RENAME TO payment_method_set_state;
GRANT EXECUTE ON FUNCTION saas.payment_method_set_state(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text
) TO celebix_saas_app;

DROP INDEX saas.payment_methods_one_active_provider_per_store_idx;

COMMIT;
