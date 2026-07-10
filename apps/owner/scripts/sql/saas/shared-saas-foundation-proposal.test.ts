import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const proposal = readFileSync(
  new URL("./001_shared_saas_foundation.proposal.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("./001_shared_saas_foundation.rollback.sql", import.meta.url),
  "utf8",
);

const REQUIRED_TABLES = [
  "saas_principals",
  "saas_stores",
  "saas_domains",
  "saas_memberships",
  "saas_plans",
  "saas_plan_features",
  "saas_plan_limits",
  "saas_subscriptions",
  "saas_store_settings",
  "saas_tenant_operations",
] as const;

const REQUIRED_FEATURES = [
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
] as const;

const REQUIRED_LIMITS = [
  "products",
  "staff",
  "storageBytes",
  "monthlyOrders",
  "customDomains",
] as const;

test("proposal and rollback are explicitly non-production proposals", () => {
  assert.match(proposal, /^-- PROPOSAL ONLY - DO NOT APPLY TO PRODUCTION/m);
  assert.match(rollback, /^-- PROPOSAL ONLY - DO NOT APPLY TO PRODUCTION/m);
  assert.match(proposal, /BEGIN;/);
  assert.match(proposal, /COMMIT;/);
});

test("proposal creates every required shared SaaS table", () => {
  for (const table of REQUIRED_TABLES) {
    assert.match(proposal, new RegExp(`create table ${table}\\b`, "i"), table);
  }
});

test("identity, slug, domain, membership, and canonical uniqueness are explicit", () => {
  assert.match(proposal, /unique\s*\(issuer, subject\)/i);
  assert.match(proposal, /slug text not null unique/i);
  assert.match(proposal, /normalized_hostname text not null unique/i);
  assert.match(proposal, /unique\s*\(principal_id, store_id, role\)/i);
  assert.match(proposal, /create unique index[^;]+saas_domains[^;]+where canonical and status = 'active'/is);
  assert.doesNotMatch(proposal, /unique\s*\(email\)/i);
  assert.doesNotMatch(proposal, /email[^,\n]+unique/i);
});

test("finite feature and limit registries exactly match frozen contracts", () => {
  const featureConstraint = proposal.match(/feature_key in \(([^)]+)\)/i)?.[1] ?? "";
  const limitConstraint = proposal.match(/limit_key in \(([^)]+)\)/i)?.[1] ?? "";
  const parse = (value: string) => [...value.matchAll(/'([^']+)'/g)].map((match) => match[1]);

  assert.deepEqual(parse(featureConstraint), REQUIRED_FEATURES);
  assert.deepEqual(parse(limitConstraint), REQUIRED_LIMITS);
  assert.match(proposal, /'free_starter'\s*,\s*1/i);
});

test("required tenant lookup indexes are present", () => {
  for (const pattern of [
    /saas_memberships\s*\(principal_id, status\)/i,
    /saas_memberships\s*\(store_id, status\)/i,
    /saas_domains\s*\(normalized_hostname\)/i,
    /saas_stores\s*\(slug\)/i,
    /saas_subscriptions\s*\(store_id, status\)/i,
    /saas_store_settings\s*\(store_id, key\)/i,
    /saas_tenant_operations\s*\(idempotency_key\)/i,
    /saas_tenant_operations\s*\(status, created_at\)/i,
  ]) {
    assert.match(proposal, pattern);
  }
});

test("foreign-key and RLS columns have supporting indexes", () => {
  for (const pattern of [
    /saas_subscriptions\s*\(plan_id, plan_code, plan_version\)/i,
    /saas_tenant_operations\s*\(result_store_id\)/i,
    /saas_tenant_operations\s*\(result_store_id, result_domain_id\)/i,
    /saas_tenant_operations\s*\(result_store_id, result_membership_id\)/i,
  ]) {
    assert.match(proposal, pattern);
  }
});

test("store-scoped tables enable and force RLS with server-context policies", () => {
  for (const table of [
    "saas_stores",
    "saas_domains",
    "saas_memberships",
    "saas_subscriptions",
    "saas_store_settings",
    "saas_tenant_operations",
  ]) {
    assert.match(proposal, new RegExp(`alter table ${table} enable row level security`, "i"), table);
    assert.match(proposal, new RegExp(`alter table ${table} force row level security`, "i"), table);
    assert.match(proposal, new RegExp(`create policy [^;]+ on ${table}`, "i"), table);
  }
  assert.match(proposal, /select current_setting\('app\.current_store_id', true\)/i);
  assert.match(proposal, /non-bypass role/i);
  assert.match(proposal, /caller-provided store_id is never authority/i);
});

test("proposal stores no password, provider token, secret, or raw request body columns", () => {
  const columnDefinitions = proposal
    .split("\n")
    .filter((line) => /^\s{2}[a-z_]+\s+[a-z]/i.test(line))
    .join("\n");
  assert.doesNotMatch(columnDefinitions, /password|access_token|refresh_token|provider_token|secret|raw_request/i);
  assert.match(proposal, /payload_fingerprint char\(64\) not null/i);
  assert.match(proposal, /result_store_id uuid/i);
});

test("rollback removes every proposed table in dependency-safe order", () => {
  for (const table of REQUIRED_TABLES) {
    assert.match(rollback, new RegExp(`drop table if exists ${table}\\b`, "i"), table);
  }
  assert.ok(
    rollback.indexOf("saas_tenant_operations") < rollback.indexOf("saas_principals"),
    "dependent tables must be dropped before principals",
  );
});
