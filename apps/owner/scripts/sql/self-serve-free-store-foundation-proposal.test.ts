import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const sqlDir = join(process.cwd(), "apps/owner/scripts/sql");
const proposalSql = readFileSync(join(sqlDir, "self-serve-free-store-foundation-proposal.sql"), "utf8");
const rollbackSql = readFileSync(join(sqlDir, "self-serve-free-store-foundation-rollback.sql"), "utf8");

function getProposedTables(sql: string) {
  return Array.from(sql.matchAll(/create\s+table\s+if\s+not\s+exists\s+([a-z0-9_]+)/gi)).map((match) => match[1]);
}

test("self-serve proposal SQL remains proposal-only and migration-unwired", () => {
  assert.match(proposalSql, /^-- PROPOSAL ONLY - DO NOT APPLY TO PRODUCTION YET\./);
  assert.match(proposalSql, /This file is not wired into any migration pipeline\./);
  assert.match(rollbackSql, /^-- PROPOSAL ONLY - DO NOT APPLY TO PRODUCTION YET\./);
  assert.doesNotMatch(proposalSql, /\bdrop\s+table\b/i);
  assert.doesNotMatch(proposalSql, /\bdelete\s+from\b/i);
  assert.doesNotMatch(proposalSql, /\btruncate\b/i);
});

test("self-serve proposal SQL has persistent adapter and idempotency columns", () => {
  for (const expected of [
    "normalized_email text not null",
    "store_slug text not null",
    "idempotency_key text not null",
    "creation_mode text not null default 'production_safe_pending'",
    "status text not null default 'processing'",
    "planned_store_url text not null",
    "planned_admin_url text not null",
    "admin_redirect_url text",
    "last_error_code text",
    "last_error_message text",
    "created_at timestamptz not null default now()",
    "updated_at timestamptz not null default now()",
    "adapter text not null default 'persistent_db_adapter'",
    "safe_metadata jsonb not null default '{}'::jsonb",
  ]) {
    assert.match(proposalSql, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(proposalSql, /Stores the normalized slug produced by normalizeSelfServeStoreSlug\(\)\./);
  assert.match(proposalSql, /self_serve_store_registrations_slug_key[\s\S]+on self_serve_store_registrations \(store_slug\)/);
  assert.match(proposalSql, /self_serve_store_registrations_email_slug_idempotency_key/);
  assert.match(
    proposalSql,
    /self_serve_store_registrations_email_slug_idempotency_key[\s\S]+on self_serve_store_registrations \(normalized_email, store_slug\)/,
  );
  assert.match(proposalSql, /self_serve_store_registrations_idempotency_key/);
  assert.match(
    proposalSql,
    /self_serve_store_registrations_idempotency_key[\s\S]+on self_serve_store_registrations \(idempotency_key\)/,
  );
  assert.match(proposalSql, /self_serve_store_registrations_email_key[\s\S]+on self_serve_store_registrations \(normalized_email\)/);
  assert.match(proposalSql, /self_serve_provisioning_jobs_adapter_check/);
});

test("self-serve proposal SQL never adds raw password token or secret columns", () => {
  assert.doesNotMatch(proposalSql, /^\s*(password|raw_password|token|secret)\s+/im);
  assert.match(proposalSql, /password_stored boolean not null default false/);
  assert.match(proposalSql, /self_serve_store_registrations_password_never_stored/);
});

test("self-serve proposal SQL includes required operational bundle tables", () => {
  for (const expectedTable of [
    "self_serve_store_registrations",
    "self_serve_store_packages",
    "self_serve_store_domains",
    "self_serve_store_memberships",
    "self_serve_provisioning_jobs",
  ]) {
    assert.ok(getProposedTables(proposalSql).includes(expectedTable), `missing table ${expectedTable}`);
  }

  assert.match(proposalSql, /plan text not null default 'free_starter'/);
  assert.match(proposalSql, /domain_type in \('platform_subdomain', 'admin_subdomain', 'custom'\)/);
  assert.match(proposalSql, /role text not null default 'store_owner'/);
  assert.match(proposalSql, /kind text not null default 'free_starter_store_creation'/);
  assert.match(proposalSql, /error_code text/);
  assert.match(proposalSql, /error_message text/);
});

test("self-serve rollback SQL is limited to proposed self_serve tables", () => {
  const proposedTables = getProposedTables(proposalSql).sort();
  const rollbackDrops = Array.from(rollbackSql.matchAll(/drop\s+table\s+if\s+exists\s+([a-z0-9_]+)/gi))
    .map((match) => match[1])
    .sort();

  assert.deepEqual(rollbackDrops, proposedTables);
  assert.ok(rollbackDrops.every((table) => table.startsWith("self_serve_")));
  assert.ok(rollbackDrops.every((table) => !table.startsWith("owner_")));
  assert.doesNotMatch(rollbackSql, /\bdelete\s+from\b/i);
  assert.doesNotMatch(rollbackSql, /\btruncate\b/i);
});
