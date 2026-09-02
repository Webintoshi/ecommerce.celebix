import assert from "node:assert/strict";
import test from "node:test";

import { PostgresAdminDomainRepository } from "./admin-domain-repository.ts";

const NOW = new Date("2026-07-30T12:00:00.000Z");
const BRAND = Object.freeze({
  storeSlug: "guzide-kuyumcu-4",
  displayName: "Güzide Kuyumcu",
  logoUrl: null,
  accentColor: "#ff5a00",
  canonicalAdminOrigin: "https://guzide-kuyumcu-4.admin.saas-staging.celebix.site",
});

type Result = { rows: Record<string, unknown>[]; rowCount: number | null };

function empty(): Result { return { rows: [], rowCount: 0 }; }

function harness(result: Result, options: { failCommit?: boolean } = {}) {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const releases: unknown[] = [];
  const repository = new PostgresAdminDomainRepository({
    pool: {
      async connect() {
        return {
          async query(text: string, values: readonly unknown[] = []) {
            calls.push({ text, values });
            if (text === "COMMIT" && options.failCommit) throw new Error("private driver detail");
            if (/^BEGIN|^COMMIT$|^ROLLBACK$|set_config|SET LOCAL ROLE/.test(text)) return empty();
            return result;
          },
          release(destroy?: unknown) { releases.push(destroy); },
        };
      },
    },
    clock: () => new Date(NOW),
    timeouts: { poolCheckoutMs: 1000, statementMs: 1000, lockMs: 1000, idleTransactionMs: 1000 },
    audit: () => undefined,
  });
  return { repository, calls, releases };
}

test("resolves only the exact frozen public admin brand through host-resolver authority", async () => {
  const h = harness({ rows: [{ outcome: "resolved", authority: BRAND }], rowCount: 1 });
  const result = await h.repository.resolvePublicBrand({
    hostname: "guzide-kuyumcu-4.admin.saas-staging.celebix.site",
    now: NOW,
  });
  assert.deepEqual(result, { kind: "resolved", brand: BRAND });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.kind === "resolved" && Object.isFrozen(result.brand), true);
  assert.equal(h.calls.some(({ text }) => text === "BEGIN READ ONLY"), true);
  assert.equal(h.calls.some(({ text }) => text === "SET LOCAL ROLE celebix_saas_host_resolver"), true);
  const call = h.calls.find(({ text }) => text.includes("resolve_public_admin_brand"));
  assert.match(call?.text ?? "", /^SELECT outcome, authority FROM saas\.resolve_public_admin_brand\(\$1,\$2\)$/);
  assert.deepEqual(call?.values, ["guzide-kuyumcu-4.admin.saas-staging.celebix.site", NOW]);
});

test("accepts a database-resolved custom primary admin origin without platform-suffix authority", async () => {
  const custom = Object.freeze({ ...BRAND, canonicalAdminOrigin: "https://admin.guzidekuyumcu.com.tr" });
  const h = harness({ rows: [{ outcome: "resolved", authority: custom }], rowCount: 1 });
  assert.deepEqual(await h.repository.resolvePublicBrand({ hostname: "admin.guzidekuyumcu.com.tr", now: NOW }), {
    kind: "resolved", brand: custom,
  });
});

test("maps unknown hosts without exposing database shape", async () => {
  const h = harness({ rows: [{ outcome: "admin_host_unknown", authority: null }], rowCount: 1 });
  assert.deepEqual(await h.repository.resolvePublicBrand({ hostname: "unknown.admin.celebix.site", now: NOW }), {
    kind: "admin_host_unknown",
  });
});

test("rejects malformed hostnames locally without database access", async () => {
  for (const hostname of [
    "GUZIDE.admin.celebix.site",
    "guzide.admin.celebix.site:443",
    "guzide.admin.celebix.site/path",
    "guzide admin.celebix.site",
    "güzide.admin.celebix.site",
    "",
  ]) {
    const h = harness({ rows: [{ outcome: "resolved", authority: BRAND }], rowCount: 1 });
    assert.deepEqual(await h.repository.resolvePublicBrand({ hostname, now: NOW }), { kind: "durable_authority_invalid" });
    assert.equal(h.calls.length, 0);
  }
});

test("fails closed on extra rows, extra authority keys, invalid canonical origins, and commit failure", async () => {
  for (const result of [
    { rows: [], rowCount: 0 },
    { rows: [{ outcome: "resolved", authority: BRAND }, { outcome: "resolved", authority: BRAND }], rowCount: 2 },
    { rows: [{ outcome: "resolved", authority: { ...BRAND, storeId: "secret" } }], rowCount: 1 },
    { rows: [{ outcome: "resolved", authority: { ...BRAND, canonicalAdminOrigin: "http://evil.example.test" } }], rowCount: 1 },
  ]) {
    const h = harness(result);
    assert.deepEqual(await h.repository.resolvePublicBrand({ hostname: "guzide.admin.celebix.site", now: NOW }), { kind: "unavailable" });
  }
  const commit = harness({ rows: [{ outcome: "resolved", authority: BRAND }], rowCount: 1 }, { failCommit: true });
  assert.deepEqual(await commit.repository.resolvePublicBrand({ hostname: "guzide.admin.celebix.site", now: NOW }), { kind: "unavailable" });
  assert.deepEqual(commit.releases, [true]);
});
