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

test("slug, hostname, and idempotency constraints match the exact normalized contracts", () => {
  assert.match(proposal, /char_length\(slug\) between 3 and 63/i);
  const slugPattern = proposal.match(/slug ~ '([^']+)'/i)?.[1];
  assert.ok(slugPattern, "slug constraint regex must be present");
  const slugRegex = new RegExp(slugPattern);
  for (const slug of ["abc", "starter-store", "store-123"]) {
    assert.match(slug, slugRegex, slug);
    assert.ok(slug.length >= 3 && slug.length <= 63, slug);
  }
  for (const slug of ["ab", "Store", "-store", "store-", "store--name", "a".repeat(64)]) {
    assert.ok(!(slugRegex.test(slug) && slug.length >= 3 && slug.length <= 63), slug);
  }
  assert.match(proposal, /char_length\(normalized_hostname\) between 3 and 253/i);

  const hostnamePattern = proposal.match(/normalized_hostname ~ '([^']+)'/i)?.[1];
  assert.ok(hostnamePattern, "hostname constraint regex must be present");
  const hostnameRegex = new RegExp(hostnamePattern);
  const validHostname = (hostname: string) =>
    hostname.length >= 3 && hostname.length <= 253 && hostnameRegex.test(hostname);
  for (const hostname of ["store.celebix.site", "a-b.example", "xn--bcher-kva.celebix.site"]) {
    assert.equal(validHostname(hostname), true, hostname);
  }
  for (const hostname of [
    "",
    "localhost",
    "*.celebix.site",
    "https://store.celebix.site",
    "store.celebix.site/path",
    "store.celebix.site?query=1",
    "store.celebix.site#fragment",
    "store.celebix.site:443",
    "store .celebix.site",
    "user@store.celebix.site",
    "Store.celebix.site",
    "-store.celebix.site",
    "store-.celebix.site",
    `${"a".repeat(64)}.celebix.site`,
    `${"a.".repeat(126)}aa`,
  ]) {
    assert.equal(validHostname(hostname), false, hostname);
  }

  assert.match(proposal, /btrim\(idempotency_key\) <> ''/i);
  assert.match(proposal, /char_length\(idempotency_key\) <= 128/i);
  assert.match(proposal, /idempotency_key = btrim\(idempotency_key\)/i);
  const validIdempotencyKey = (key: string) => key.length > 0 && key.length <= 128 && key === key.trim();
  assert.equal(validIdempotencyKey("opaque-request-1"), true);
  for (const key of ["", " leading", "trailing ", "a".repeat(129)]) {
    assert.equal(validIdempotencyKey(key), false, key);
  }
});

test("proposal documents an atomic PostgreSQL claim and a separate bootstrap authority gate", () => {
  assert.match(proposal, /insert[^\n]+on conflict do nothing returning/is);
  assert.match(proposal, /exact select[^\n]+winning transaction[^\n]+committed row/is);
  assert.match(proposal, /CreateStarterTenant is a privileged internal bootstrap transaction/i);
  assert.match(proposal, /tenant RLS policies are not sufficient/i);
  assert.match(proposal, /tightly scoped SECURITY DEFINER transaction function/i);
  assert.match(proposal, /isolated internal bootstrap role[^\n]+BYPASSRLS/i);
  assert.match(proposal, /never be reachable from arbitrary tenant requests/i);
  assert.match(proposal, /does not approve or implement either option/i);

  const executableSql = proposal
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(executableSql, /\bcreate\s+role\b/i);
  assert.doesNotMatch(executableSql, /\bsecurity\s+definer\b/i);
  assert.doesNotMatch(executableSql, /\bbypassrls\b/i);
});

test("committed operations persist an exact immutable result snapshot and subscription reference", () => {
  assert.match(proposal, /result_subscription_id uuid/i);
  assert.match(proposal, /result_payload jsonb/i);
  assert.match(
    proposal,
    /foreign key \(result_store_id, result_subscription_id\)\s+references saas_subscriptions\(store_id, id\)/is,
  );
  assert.match(proposal, /status = 'committed'[^;]+result_subscription_id is not null/is);
  assert.match(proposal, /status = 'committed'[^;]+result_payload is not null/is);
  assert.match(proposal, /status in \('processing', 'failed'\)[^;]+result_subscription_id is null/is);
  assert.match(proposal, /status in \('processing', 'failed'\)[^;]+result_payload is null/is);
  assert.match(proposal, /jsonb_typeof\(result_payload\) = 'object'/i);
  assert.match(proposal, /result_payload @> '\{"schemaVersion":1\}'::jsonb/i);
  assert.match(proposal, /markCommitted[^\n]+result_payload[^\n]+same transaction/i);
  assert.match(proposal, /committed[^\n]+replay[^\n]+stored result_payload/i);
  assert.match(proposal, /result_payload is immutable/i);
  assert.match(proposal, /processing-only predicate/i);
  assert.match(proposal, /mutable[^\n]+rows[^\n]+not[^\n]+replay authority/i);
  assert.match(proposal, /saas_tenant_operations\s*\(result_store_id, result_subscription_id\)/i);
});

test("membership RLS supports principal discovery while mutations remain store scoped", () => {
  assert.match(
    proposal,
    /create policy saas_memberships_principal_read on saas_memberships\s+for select\s+using \(principal_id = nullif\(\(select current_setting\('app\.current_principal_id', true\)\), ''\)::uuid\)/is,
  );
  assert.match(
    proposal,
    /create policy saas_memberships_store_read on saas_memberships\s+for select\s+using \(store_id = nullif\(\(select current_setting\('app\.current_store_id', true\)\), ''\)::uuid\)/is,
  );
  assert.match(proposal, /create policy saas_memberships_store_insert[^;]+for insert[^;]+with check \(store_id =/is);
  assert.match(proposal, /create policy saas_memberships_store_update[^;]+for update[^;]+using \(store_id =[^;]+with check \(store_id =/is);
  assert.match(proposal, /create policy saas_memberships_store_delete[^;]+for delete[^;]+using \(store_id =/is);

  const membershipPolicies = proposal
    .match(/create policy saas_memberships_[^;]+;/gis)
    ?.join("\n") ?? "";
  assert.doesNotMatch(membershipPolicies, /using \(true\)|with check \(true\)/i);
  assert.doesNotMatch(membershipPolicies, /email/i);
  assert.match(proposal, /principal[^\n]+active memberships[^\n]+before[^\n]+activeStoreId/i);
});

test("public exact-host resolution remains a separate narrow authority gate", () => {
  assert.match(proposal, /public StoreDomainResolver[^\n]+exact normalized hostname[^\n]+before current_store_id exists/i);
  assert.match(proposal, /normal store-scoped saas_domains RLS cannot perform that initial lookup/i);
  assert.match(proposal, /separately reviewed narrowly scoped host-resolution authority/i);
  assert.match(proposal, /safe fields required for ResolvedStoreHost/i);
  assert.match(proposal, /exact store ID and slug/i);
  assert.match(proposal, /unknown, ambiguous, pending, disabled[^\n]+cross-store[^\n]+fail closed/i);
  assert.match(proposal, /no wildcard, suffix, or default-store resolution/i);
  assert.match(proposal, /no broad service-role client/i);
  assert.match(proposal, /no unrestricted BYPASSRLS access/i);
  assert.match(proposal, /does not implement or approve the resolver authority/i);

  const executableSql = proposal
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(executableSql, /\bsecurity\s+definer\b|\bbypassrls\b|\bcreate\s+role\b/i);
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
