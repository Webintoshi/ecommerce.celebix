import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..", "..");
const sqlDir = path.join(repoRoot, "apps", "owner", "scripts", "sql", "saas");

const REQUIRED_ARTIFACTS = [
  "202607110001_roles.up.sql",
  "202607110002_foundation.up.sql",
  "202607110002_foundation.down.sql",
  "202607110002_forward_recovery.sql",
  "202607110003_free_starter.seed.sql",
  "202607110003_plan_versions.freeze.sql",
  "202607110004_grants.sql",
  "202607110005_catalog_assertions.sql",
  "202607110006_roles.down.sql",
];

const REQUIRED_TABLES = [
  "principals",
  "stores",
  "domains",
  "memberships",
  "plans",
  "plan_features",
  "plan_limits",
  "subscriptions",
  "store_settings",
  "tenant_operations",
];

const FORBIDDEN_TABLES = [
  "products",
  "variants",
  "categories",
  "collections",
  "brands",
  "inventory",
  "carts",
  "checkout",
  "orders",
  "payments",
  "refunds",
  "shipping",
  "tax",
  "media",
  "themes",
  "seo_content",
  "cache",
  "queues",
  "analytics",
];

function readArtifact(file) {
  return readFileSync(path.join(sqlDir, file), "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

test("manifest pins every Phase 2A1 artifact purpose and checksum", () => {
  const manifest = JSON.parse(readArtifact("phase2a1-manifest.json"));
  assert.equal(manifest.bundleId, "phase2a1-202607110001");
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.productionDistributionCompatibility, "OPEN_INFRASTRUCTURE_GATE");
  assert.deepEqual(manifest.artifacts.map((artifact) => artifact.file), REQUIRED_ARTIFACTS);
  assert.equal(new Set(manifest.artifacts.map((artifact) => artifact.id)).size, REQUIRED_ARTIFACTS.length);

  for (const artifact of manifest.artifacts) {
    assert.match(artifact.id, /^20260711\d{4}_[a-z0-9_]+$/);
    assert.ok(artifact.purpose.length >= 20, artifact.file);
    assert.equal(artifact.sha256, sha256(readArtifact(artifact.file)), artifact.file);
  }
});

test("forward migration creates exactly the approved tenant foundation", () => {
  const forward = readArtifact("202607110002_foundation.up.sql");
  assert.match(forward, /BEGIN;/i);
  assert.match(forward, /COMMIT;/i);
  assert.match(forward, /to_regnamespace\('saas'\) is not null/i);
  assert.doesNotMatch(forward, /create\s+(?:table|schema)[^;]*if\s+not\s+exists/i);

  for (const table of REQUIRED_TABLES) {
    assert.match(forward, new RegExp(`create table saas\\.${table}\\b`, "i"), table);
  }
  for (const table of FORBIDDEN_TABLES) {
    assert.doesNotMatch(forward, new RegExp(`create table (?:saas\\.)?${table}\\b`, "i"), table);
  }
});

test("named authority and immutable replay constraints are explicit", () => {
  const forward = readArtifact("202607110002_foundation.up.sql");
  for (const constraint of [
    "principals_issuer_subject_key",
    "principals_authority_nonblank_check",
    "principals_timestamp_order_check",
    "stores_slug_key",
    "stores_slug_normalized_check",
    "domains_hostname_key",
    "domains_hostname_normalized_check",
    "memberships_principal_store_key",
    "subscriptions_plan_version_fk",
    "tenant_operations_idempotency_key_key",
    "tenant_operations_idempotency_key_canonical_check",
    "tenant_operations_fingerprint_check",
    "tenant_operations_committed_result_check",
    "tenant_operations_result_payload_shape_check",
    "tenant_operations_result_payload_size_check",
    "tenant_operations_timestamp_order_check",
  ]) {
    assert.match(forward, new RegExp(`constraint ${constraint}\\b`, "i"), constraint);
  }
  assert.doesNotMatch(forward, /unique\s*\(email\)/i);
  assert.match(forward, /create trigger principals_authority_immutable/i);
  assert.match(forward, /create trigger tenant_operations_replay_immutable/i);
  const freeze = readArtifact("202607110003_plan_versions.freeze.sql");
  assert.match(freeze, /create trigger plan_versions_immutable[\s\S]+before update or delete on saas\.plans/i);
  assert.match(freeze, /create trigger plan_features_immutable[\s\S]+before insert or update or delete on saas\.plan_features/i);
  assert.match(freeze, /create trigger plan_limits_immutable[\s\S]+before insert or update or delete on saas\.plan_limits/i);
  assert.match(
    forward,
    /constraint tenant_operations_result_payload_shape_check check \([\s\S]+?result_payload is null[\s\S]+?\) is true\s*\)/i,
    "missing JSON fields must evaluate FALSE rather than nullable CHECK success",
  );
});

test("roles are passwordless NOLOGIN authorities with bounded bypass", () => {
  const roles = readArtifact("202607110001_roles.up.sql");
  for (const role of [
    "celebix_saas_owner",
    "celebix_saas_migrator",
    "celebix_saas_bootstrap",
    "celebix_saas_app",
    "celebix_saas_workflow",
    "celebix_saas_host_resolver",
    "celebix_saas_observability",
  ]) {
    assert.match(roles, new RegExp(`create role ${role}[^;]+nologin`, "is"), role);
  }
  assert.doesNotMatch(roles, /password\s+['"]/i);
  assert.match(roles, /create role celebix_saas_bootstrap[^;]+bypassrls/is);
  assert.match(roles, /create role celebix_saas_app[^;]+nobypassrls/is);
  assert.match(roles, /create role celebix_saas_host_resolver[^;]+nobypassrls/is);
  assert.doesNotMatch(roles, /create role celebix_saas_bootstrap[^;]+\s(?:superuser|createdb|createrole)\b/is);
});

test("bootstrap and runtime grants remain least privilege", () => {
  const grants = readArtifact("202607110004_grants.sql");
  assert.match(grants, /grant usage on schema saas to celebix_saas_bootstrap/i);
  assert.match(grants, /grant select \([^;]+\) on saas\.principals to celebix_saas_bootstrap/is);
  assert.match(grants, /grant insert \([^;]+\) on saas\.tenant_operations to celebix_saas_bootstrap/is);
  const operationInsertColumns = grants.match(
    /grant insert \(\s*id,\s*idempotency_key,([\s\S]+?)\) on saas\.tenant_operations to celebix_saas_bootstrap/i,
  )?.[1] ?? "";
  assert.match(operationInsertColumns, /payload_fingerprint/i);
  assert.doesNotMatch(operationInsertColumns, /result_|committed_at/i);
  assert.match(grants, /grant update \([^;]*status[^;]*result_store_id[^;]*result_domain_id[^;]*result_membership_id[^;]*result_principal_id[^;]*result_subscription_id[^;]*result_plan_id[^;]*result_payload[^;]*committed_at[^;]*updated_at[^;]*\)/i);
  assert.doesNotMatch(grants, /grant\s+(?:create|truncate|trigger|references)\b[^;]+celebix_saas_bootstrap/i);
  assert.doesNotMatch(grants, /grant\s+all\b/i);
  assert.doesNotMatch(grants, /grant\s+select\b[^;]+to celebix_saas_host_resolver/i);
  assert.match(grants, /grant execute on function saas\.resolve_store_host\(text\)\s+to celebix_saas_host_resolver/i);
  assert.doesNotMatch(
    grants,
    /grant\s+update\s*\([^;]*\)\s+on\s+saas\.principals\s+to\s+celebix_saas_app/i,
    "the application role must not mutate verified identity metadata",
  );

  const assertions = readArtifact("202607110005_catalog_assertions.sql");
  assert.doesNotMatch(
    assertions,
    /celebix_saas_app',\s*'principals',\s*'UPDATE'/i,
    "the exact ACL matrix must deny every application principal UPDATE column",
  );
});

test("every tenant table forces RLS and store access requires principal membership", () => {
  const forward = readArtifact("202607110002_foundation.up.sql");
  for (const table of REQUIRED_TABLES) {
    assert.match(forward, new RegExp(`alter table saas\\.${table} enable row level security`, "i"), table);
    assert.match(forward, new RegExp(`alter table saas\\.${table} force row level security`, "i"), table);
  }
  assert.match(forward, /current_setting\('app\.current_principal_id', true\)/i);
  assert.match(forward, /current_setting\('app\.current_store_id', true\)/i);
  assert.match(forward, /memberships_principal_discovery/i);
  assert.match(forward, /status = 'active'/i);
  assert.doesNotMatch(forward, /using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i);
});

test("exact-host resolver is locked, execute-only, and returns the frozen projection", () => {
  const forward = readArtifact("202607110002_foundation.up.sql");
  assert.match(forward, /create function saas\.resolve_store_host\(requested_hostname text\)/i);
  assert.match(forward, /security definer/i);
  assert.match(forward, /set search_path = pg_catalog/i);
  assert.match(forward, /d\.normalized_hostname = requested_hostname/i);
  assert.match(forward, /d\.status = 'active'/i);
  assert.match(forward, /s\.status = 'active'/i);
  assert.match(forward, /canonical\.store_id = d\.store_id/i);
  assert.doesNotMatch(forward, /(?:like|ilike)\s+['"]?%|default_store|suffix/i);
  for (const field of [
    "schema_version",
    "hostname",
    "domain_id",
    "domain_type",
    "store_id",
    "store_slug",
    "canonical_hostname",
    "status",
    "cache_version",
  ]) {
    assert.match(forward, new RegExp(`\\b${field}\\b`, "i"), field);
  }
});

test("free_starter seed freezes the approved keys, values, and drift behavior", () => {
  const seed = readArtifact("202607110003_free_starter.seed.sql");
  const featureOrder = [
    "catalog",
    "orders",
    "customers",
    "content",
    "media",
    "analytics",
    "checkout",
    "custom_domains",
    "staff_management",
    "promotions",
    "integrations",
    "accounting",
    "marketplaces",
  ];
  const limitOrder = ["products", "staff", "storageBytes", "monthlyOrders", "customDomains"];
  let cursor = -1;
  for (const key of [...featureOrder, ...limitOrder]) {
    const next = seed.indexOf(`'${key}'`, cursor + 1);
    assert.ok(next > cursor, key);
    cursor = next;
  }
  for (const [key, value] of [
    ["products", "100"],
    ["staff", "1"],
    ["storageBytes", "1000000000"],
    ["monthlyOrders", "100"],
    ["customDomains", "0"],
  ]) {
    assert.match(seed, new RegExp(`'${key}'\\s*,\\s*${value}\\b`, "i"), key);
  }
  assert.match(seed, /pg_advisory_xact_lock/i);
  assert.match(seed, /FREE_STARTER_SEED_DRIFT/i);
  assert.doesNotMatch(seed, /on conflict[^;]+do update/is);
  assert.doesNotMatch(seed, /\) actual\s+on\s+actual\.plan_id/i);
});

test("rollback is explicit, schema-local, and non-cascading", () => {
  const rollback = readArtifact("202607110002_foundation.down.sql");
  assert.match(rollback, /BEGIN;/i);
  assert.match(rollback, /COMMIT;/i);
  assert.doesNotMatch(rollback, /\bCASCADE\b/i);
  assert.doesNotMatch(rollback, /drop schema\s+(?:public|auth|storage)/i);
  for (const table of [...REQUIRED_TABLES].reverse()) {
    assert.match(rollback, new RegExp(`drop table saas\\.${table}\\b`, "i"), table);
  }
  assert.match(rollback, /drop schema saas;/i);

  const rolesRollback = readArtifact("202607110006_roles.down.sql");
  assert.match(rolesRollback, /revoke create on database %I from celebix_saas_owner/i);
  assert.match(rolesRollback, /revoke celebix_saas_owner from celebix_saas_migrator/i);
});

test("artifacts contain no production target or committed credential", () => {
  const combined = REQUIRED_ARTIFACTS.map(readArtifact).join("\n");
  assert.doesNotMatch(combined, /postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(combined, /(?:supabase|neon|rds|amazonaws|azure|coolify|cloudflare|celebix\.(?:site|co))/i);
  assert.doesNotMatch(combined, /(?:password|token|secret)\s*=\s*['"][^'"]+['"]/i);
  assert.doesNotMatch(combined, /apps\/admin|apps\/admin-shared|apps\/storefront-base|stores\//i);
});

test("catalog checks inspect PUBLIC through ACL grantee zero rather than a nonexistent role", () => {
  const assertions = readArtifact("202607110005_catalog_assertions.sql");
  assert.doesNotMatch(assertions, /has_(?:schema|function)_privilege\('public'/i);
  assert.match(assertions, /aclexplode/i);
  assert.match(assertions, /grantee\s*=\s*0/i);
});

test("forward recovery requires seed, grants, RLS, and exact policy state", () => {
  const recovery = readArtifact("202607110002_forward_recovery.sql");
  assert.match(recovery, /free_starter/i);
  assert.match(recovery, /plan_features/i);
  assert.match(recovery, /plan_limits/i);
  assert.match(recovery, /has_function_privilege\('celebix_saas_host_resolver'/i);
  assert.match(recovery, /has_column_privilege\('celebix_saas_bootstrap'/i);

  const assertions = readArtifact("202607110005_catalog_assertions.sql");
  assert.doesNotMatch(assertions, /policy_count\s*<\s*\d+/i);
  assert.match(assertions, /expected_policies/i);
  assert.match(assertions, /actual_policies\s+is distinct from\s+expected_policies/i);
  assert.match(assertions, /class\.relname\s*\|\|\s*':'\s*\|\|\s*policy\.polname/i);
  assert.match(assertions, /pg_get_expr\(policy\.polqual/i);
  assert.match(assertions, /exact runtime column ACL matrix drift/i);
  assert.match(assertions, /exact runtime table ACL matrix drift/i);
  assert.match(assertions, /exact runtime function ACL matrix drift/i);
});

test("committed result snapshots validate the complete frozen result shape", () => {
  const forward = readArtifact("202607110002_foundation.up.sql");
  for (const requiredPath of [
    "operationId",
    "store,slug",
    "store,status",
    "primaryDomain,hostname",
    "primaryDomain,domainType",
    "primaryDomain,canonicalHostname",
    "primaryDomain,cacheVersion",
    "membership,principalId",
    "membership,role",
    "membership,status",
    "plan,planCode",
    "plan,version",
    "plan,features",
    "plan,limits",
    "panelUrl",
    "storefrontUrl",
  ]) {
    assert.match(forward, new RegExp(requiredPath.replaceAll(",", "[,}]"), "i"), requiredPath);
  }
  assert.match(forward, /result_principal_id uuid/i);
  assert.match(forward, /tenant_operations_membership_principal_fk/i);
  assert.doesNotMatch(forward, /jsonb_object_length/i);
  assert.match(forward, /result_payload\s*-\s*array\[[\s\S]+?storefrontUrl[\s\S]+?=\s*'\{\}'::jsonb/i);
  assert.match(forward, /\(result_payload\s*->\s*'plan'\)\s*-\s*array\[[\s\S]+?validUntil[\s\S]+?=\s*'\{\}'::jsonb/i);
  for (const requiredBinding of [
    /store\.slug\s*=\s*new\.result_payload\s*#>>\s*'\{store,slug\}'/i,
    /domain\.canonical/i,
    /domain\.normalized_hostname\s*=\s*new\.result_payload\s*#>>\s*'\{primaryDomain,hostname\}'/i,
    /membership\.created_at\s*=\s*\(new\.result_payload\s*#>>\s*'\{membership,createdAt\}'\)::timestamptz/i,
    /subscription\.status\s*=\s*'active'/i,
    /subscription\.valid_from\s*<=\s*new\.committed_at/i,
    /plan\.plan_code\s*=\s*new\.result_payload\s*#>>\s*'\{plan,planCode\}'/i,
    /jsonb_agg\(feature\.feature_key\s+order by feature\.feature_ordinal\)/i,
    /jsonb_object_agg\(\s*limit_row\.limit_key,\s*limit_row\.effective_limit\s+order by limit_row\.limit_ordinal\s*\)/i,
    /new\.result_payload\s*->>\s*'storefrontUrl'\s*=\s*'https:\/\/'\s*\|\|\s*domain\.normalized_hostname/i,
  ]) {
    assert.match(forward, requiredBinding);
  }
  assert.match(forward, /TENANT_OPERATION_RESULT_GRAPH_MISMATCH/i);
});
