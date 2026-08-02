import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";
import { PostgresNewsletterRepository } from "./index.ts";
import type { PostgresPoolLike } from "../postgres/pool.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const PRINCIPAL = "20000000-0000-4000-8000-000000000001";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000001";
const PLAN = "40000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-02T09:00:00.000Z");

function tenant(): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "newsletter-list",
    principal: { id: PRINCIPAL, issuer: "https://identity.example.test/oidc", subject: "merchant" },
    store: { id: STORE, slug: "pilot-store", status: "active" },
    membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: PLAN,
      planCode: "growth",
      version: 2,
      status: "active",
      features: ["content"],
      limits: { products: 100, staff: 5, storageBytes: 1_024 },
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
  } as TenantContext;
}

function fixture() {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const client = {
    async query(text: string, values: unknown[] = []) {
      calls.push({ text, values });
      if (text.includes("saas.public_newsletter_subscribe")) return { rows: [{ outcome: "subscribed", result_payload: { outcome: "subscribed" } }] };
      if (text.includes("saas.merchant_newsletter_list")) return { rows: [{ outcome: "listed", result_payload: { items: [{ email: "ada@example.test", status: "subscribed", consentVersion: "starter-v1", consentedAt: "2026-08-02T09:00:00.000Z" }] } }] };
      return { rows: [] };
    },
    release() {},
  };
  const pool = { async connect() { return client; } } as unknown as PostgresPoolLike;
  return {
    calls,
    repository: new PostgresNewsletterRepository({
      pool,
      publicRole: "celebix_saas_host_resolver",
      merchantRole: "celebix_saas_app",
      timeouts: { poolCheckoutMs: 100, statementMs: 100, lockMs: 100, idleTransactionMs: 100 },
    }),
  };
}

test("newsletter subscription sends only hostname-derived store input and fixed consent", async () => {
  const selected = fixture();
  const result = await selected.repository.subscribe({ hostname: "shop.example.test", now: NOW, email: "Ada@Example.Test", consentVersion: "starter-v1" });
  assert.deepEqual(result, { outcome: "subscribed" });
  const call = selected.calls.find(({ text }) => text.includes("saas.public_newsletter_subscribe"));
  assert.ok(call);
  assert.deepEqual(call.values, ["shop.example.test", NOW, "Ada@Example.Test", "starter-v1"]);
  assert.equal(selected.calls.some(({ text }) => text === "SET LOCAL ROLE celebix_saas_host_resolver"), true);
  assert.equal(selected.calls.some(({ text }) => text.includes(STORE)), false);
});

test("merchant newsletter listing derives every authority field from TenantContext", async () => {
  const selected = fixture();
  const result = await selected.repository.list({ tenantContext: tenant(), now: NOW, limit: 100 });
  assert.deepEqual(result, [{ email: "ada@example.test", status: "subscribed", consentVersion: "starter-v1", consentedAt: "2026-08-02T09:00:00.000Z" }]);
  const call = selected.calls.find(({ text }) => text.includes("saas.merchant_newsletter_list"));
  assert.ok(call);
  assert.deepEqual(call.values, [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW, 100]);
  assert.equal(selected.calls.some(({ text }) => text === "SET LOCAL ROLE celebix_saas_app"), true);
});

test("newsletter inputs fail closed before pool checkout", async () => {
  const selected = fixture();
  await assert.rejects(() => selected.repository.subscribe({ hostname: "shop.example.test", now: NOW, email: "not-an-email", consentVersion: "starter-v1" }));
  await assert.rejects(() => selected.repository.subscribe({ hostname: "shop.example.test", now: NOW, email: "ada@example.test", consentVersion: "starter-v1", storeId: STORE } as never));
  assert.equal(selected.calls.length, 0);
});

test("public-only newsletter repository cannot execute merchant listing", async () => {
  let checkouts = 0;
  const publicOnly = new PostgresNewsletterRepository({
    pool: { connect: async () => { checkouts += 1; throw new Error("must_not_connect"); } } as unknown as PostgresPoolLike,
    publicRole: "celebix_saas_host_resolver",
    timeouts: { poolCheckoutMs: 100, statementMs: 100, lockMs: 100, idleTransactionMs: 100 },
  });
  await assert.rejects(() => publicOnly.list({ tenantContext: tenant(), now: NOW, limit: 100 }));
  assert.equal(checkouts, 0);
});
