import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const sqlDir = join(process.cwd(), "apps/owner/scripts/sql");
const proposalSql = readFileSync(join(sqlDir, "self-serve-free-store-foundation-proposal.sql"), "utf8");
const rollbackSql = readFileSync(join(sqlDir, "self-serve-free-store-foundation-rollback.sql"), "utf8");

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
    "idempotency_key text not null",
    "creation_mode text not null default 'production_safe_pending'",
    "last_error_code text",
    "last_error_message text",
    "adapter text not null default 'persistent_db_adapter'",
    "safe_metadata jsonb not null default '{}'::jsonb",
  ]) {
    assert.match(proposalSql, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(proposalSql, /self_serve_store_registrations_email_slug_idempotency_key/);
  assert.match(proposalSql, /self_serve_store_registrations_idempotency_key/);
  assert.match(proposalSql, /self_serve_provisioning_jobs_adapter_check/);
});

test("self-serve proposal SQL never adds raw password token or secret columns", () => {
  assert.doesNotMatch(proposalSql, /^\s*(password|raw_password|token|secret)\s+/im);
  assert.match(proposalSql, /password_stored boolean not null default false/);
  assert.match(proposalSql, /self_serve_store_registrations_password_never_stored/);
});
