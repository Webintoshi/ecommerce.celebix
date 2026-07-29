-- Phase 2A1 disposable rollback. It removes only objects created by the Phase 2A1 foundation.
-- Execute only after confirming no runtime has been activated and only in a disposable database.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP POLICY tenant_operations_active_membership_read ON saas.tenant_operations;
DROP POLICY store_settings_editor_write ON saas.store_settings;
DROP POLICY store_settings_active_membership_read ON saas.store_settings;
DROP POLICY subscriptions_active_membership_read ON saas.subscriptions;
DROP POLICY plan_limits_current_subscription_read ON saas.plan_limits;
DROP POLICY plan_features_current_subscription_read ON saas.plan_features;
DROP POLICY plans_current_subscription_read ON saas.plans;
DROP POLICY memberships_principal_discovery ON saas.memberships;
DROP POLICY domains_privileged_membership_write ON saas.domains;
DROP POLICY domains_active_membership_read ON saas.domains;
DROP POLICY stores_privileged_membership_update ON saas.stores;
DROP POLICY stores_active_membership_read ON saas.stores;
DROP POLICY principals_own_identity ON saas.principals;

DROP TRIGGER tenant_operations_replay_immutable ON saas.tenant_operations;
DROP TRIGGER plan_limits_immutable ON saas.plan_limits;
DROP TRIGGER plan_features_immutable ON saas.plan_features;
DROP TRIGGER plan_versions_immutable ON saas.plans;
DROP TRIGGER principals_authority_immutable ON saas.principals;

DROP FUNCTION saas.resolve_store_host(text);
DROP FUNCTION saas.has_active_membership(uuid, text[]);
DROP FUNCTION saas.guard_tenant_operation_mutation();
DROP FUNCTION saas.reject_plan_version_mutation();
DROP FUNCTION saas.reject_principal_authority_change();

DROP TABLE saas.tenant_operations;
DROP TABLE saas.store_settings;
DROP TABLE saas.subscriptions;
DROP TABLE saas.plan_limits;
DROP TABLE saas.plan_features;
DROP TABLE saas.plans;
DROP TABLE saas.memberships;
DROP TABLE saas.domains;
DROP TABLE saas.stores;
DROP TABLE saas.principals;

DROP SCHEMA saas;

COMMIT;
