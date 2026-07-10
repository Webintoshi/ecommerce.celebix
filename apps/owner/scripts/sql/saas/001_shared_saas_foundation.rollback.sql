-- PROPOSAL ONLY - DO NOT APPLY TO PRODUCTION
-- Rollback scope is limited to the greenfield shared SaaS proposal tables.

BEGIN;

DROP TABLE IF EXISTS saas_tenant_operations;
DROP TABLE IF EXISTS saas_store_settings;
DROP TABLE IF EXISTS saas_subscriptions;
DROP TABLE IF EXISTS saas_plan_limits;
DROP TABLE IF EXISTS saas_plan_features;
DROP TABLE IF EXISTS saas_plans;
DROP TABLE IF EXISTS saas_memberships;
DROP TABLE IF EXISTS saas_domains;
DROP TABLE IF EXISTS saas_stores;
DROP TABLE IF EXISTS saas_principals;

COMMIT;
