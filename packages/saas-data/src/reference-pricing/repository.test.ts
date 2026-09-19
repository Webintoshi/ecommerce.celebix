import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";
import type { QueryResult } from "pg";

import { PostgresReferencePricingRepository, referencePricingRepositoryErrorCode } from "./index.ts";
import type { PostgresClientLike, PostgresPoolLike } from "../postgres/pool.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const PRINCIPAL = "10000000-0000-4000-8000-000000000002";
const MEMBERSHIP = "10000000-0000-4000-8000-000000000003";
const PLAN = "10000000-0000-4000-8000-000000000004";
const REFERENCE = "20000000-0000-4000-8000-000000000001";
const SET = "30000000-0000-4000-8000-000000000001";
const OPERATION = "40000000-0000-4000-8000-000000000001";
const VARIANT = "50000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-09-20T12:00:00.000Z");

function tenant(): TenantContext {
  return {
    schemaVersion: 1, requestId: "private", principal: { id: PRINCIPAL, issuer: "https://id.test/oidc", subject: "private" },
    store: { id: STORE, slug: "store", status: "active" }, membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
    entitlements: { schemaVersion: 1, planId: PLAN, planCode: "growth", version: 2, status: "active", features: ["catalog"], limits: { products: 100, staff: 5, storageBytes: 1024 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR",
  } as TenantContext;
}

const authority = () => ({ tenantContext: tenant(), now: new Date(NOW) });
type QueryLog = Readonly<{ text: string; values?: unknown[] }>;
class Client implements PostgresClientLike {
  readonly queries: QueryLog[] = [];
  readonly releases: Array<boolean | Error | undefined> = [];
  constructor(private readonly result: Readonly<{ outcome: string; result_payload: unknown }>) {}
  async query(text: string, values?: unknown[]): Promise<QueryResult<Record<string, unknown>>> {
    this.queries.push({ text, values });
    const rows = text.startsWith("SELECT outcome,result_payload FROM saas.") ? [this.result] : [];
    return { rows, rowCount: rows.length } as unknown as QueryResult<Record<string, unknown>>;
  }
  release(destroy?: boolean | Error): void { this.releases.push(destroy); }
}
class Pool implements PostgresPoolLike {
  constructor(private readonly client: Client) {}
  async connect(): Promise<PostgresClientLike> { return this.client; }
}
function repository(client: Client) {
  return new PostgresReferencePricingRepository({
    pool: new Pool(client), role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 10, statementMs: 20, lockMs: 30, idleTransactionMs: 40 },
    audit: () => undefined,
  });
}

test("impact preview is one read-only tenant-authorized SQL call with all auth7 values", async () => {
  const payload = {
    setId: SET, scopeDigest: "a".repeat(64), affectedProducts: 0, affectedVariants: 0,
    fixedOverrideVariants: 0, unavailableVariants: 0, entries: [], nextCursor: null,
  };
  const client = new Client({ outcome: "previewed", result_payload: payload });
  const result = await repository(client).preview({ ...authority(), setId: SET, channel: "storefront", pageSize: 20 });
  assert.deepEqual(result, payload);
  assert.equal(client.queries[0]?.text, "BEGIN READ ONLY");
  assert.deepEqual(client.queries.slice(1, 5).map(({ text }) => text), [
    "SELECT pg_catalog.set_config('statement_timeout', $1, true)",
    "SELECT pg_catalog.set_config('lock_timeout', $1, true)",
    "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)",
    "SET LOCAL ROLE celebix_saas_app",
  ]);
  assert.equal(client.queries[5]?.text,
    "SELECT outcome,result_payload FROM saas.pricing_reference_set_preview($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::integer,$11::uuid)");
  assert.deepEqual(client.queries[5]?.values, [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW, SET, "storefront", 20, null]);
  assert.equal(client.queries.at(-1)?.text, "COMMIT");
});

test("define sends immutable identity without a rate and validates the returned tenant-safe projection", async () => {
  const identity = { id: REFERENCE, kind: "gold_gram", label: "22 ayar gram satış", referencePurity: "0.916667", createdAt: "2026-09-20T12:00:00.000000Z" };
  const client = new Client({ outcome: "defined", result_payload: identity });
  const result = await repository(client).define({ ...authority(), operationId: OPERATION, referenceId: REFERENCE, kind: "gold_gram", label: "22 ayar gram satış", referencePurity: "0.916667" });
  assert.deepEqual(result, identity);
  assert.equal(client.queries[0]?.text, "BEGIN ISOLATION LEVEL READ COMMITTED");
  assert.equal(client.queries[5]?.text,
    "SELECT outcome,result_payload FROM saas.pricing_reference_define($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::text,$12::text,$13::text)");
  assert.deepEqual(client.queries[5]?.values?.slice(0, 8), [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW, OPERATION]);
  assert.match(String(client.queries[5]?.values?.[8]), /^[a-f0-9]{64}$/);
  assert.deepEqual(client.queries[5]?.values?.slice(9), [REFERENCE, "gold_gram", "22 ayar gram satış", "0.916667"]);
  assert.equal(client.queries.at(-1)?.text, "COMMIT");
});

test("preview rejects browser authority and duplicate cursor state before acquiring a connection", async () => {
  const client = new Client({ outcome: "previewed", result_payload: null });
  for (const input of [
    { ...authority(), setId: SET, channel: "storefront", pageSize: 20, storeId: STORE },
    { ...authority(), setId: SET, channel: "storefront", pageSize: 20, afterVariantId: "invalid" },
  ]) {
    await assert.rejects(() => repository(client).preview(input as never),
      (error: unknown) => referencePricingRepositoryErrorCode(error) === "invalid_input");
  }
  assert.equal(client.queries.length, 0);
});

test("set list and get stay read-only and parse the active version independently of mutable rates", async () => {
  const listing = { activeSetId: SET, stateVersion: 1, items: [{ setId: SET, version: 1, createdAt: "2026-09-20T12:00:00.000000Z", isActive: true }], nextCursor: null };
  const listed = new Client({ outcome: "listed", result_payload: listing });
  assert.deepEqual(await repository(listed).list({ ...authority(), pageSize: 20 }), listing);
  assert.equal(listed.queries[0]?.text, "BEGIN READ ONLY");
  assert.equal(listed.queries[5]?.text,
    "SELECT outcome,result_payload FROM saas.pricing_reference_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::integer,$9::bigint)");
  assert.deepEqual(listed.queries[5]?.values, [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW, 20, null]);

  const set = { setId: SET, version: 1, stateVersion: 1, isActive: true, createdAt: "2026-09-20T12:00:00.000000Z", values: [{ referenceId: REFERENCE, kind: "usd", label: "USD satış", rateTry: "40.00000000", active: true }] };
  const fetched = new Client({ outcome: "found", result_payload: set });
  assert.deepEqual(await repository(fetched).get({ ...authority(), setId: SET }), set);
  assert.equal(fetched.queries[5]?.text,
    "SELECT outcome,result_payload FROM saas.pricing_reference_get($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)");
  assert.deepEqual(fetched.queries[5]?.values?.slice(0, 7), [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW]);
});

test("immutable definitions are listed before any reference set exists", async () => {
  const definition = { id: REFERENCE, kind: "gold_gram", label: "22 ayar gram satış", referencePurity: "0.916667", createdAt: "2026-09-20T12:00:00.000000Z" };
  const client = new Client({ outcome: "listed", result_payload: { items: [definition] } });
  assert.deepEqual(await repository(client).listDefinitions(authority()), { items: [definition] });
  assert.equal(client.queries[0]?.text, "BEGIN READ ONLY");
  assert.equal(client.queries[5]?.text,
    "SELECT outcome,result_payload FROM saas.pricing_reference_definitions_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)");
  assert.deepEqual(client.queries[5]?.values, [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW]);
});

test("policy get accepts the strict policy JSON without a browser-computed TRY amount", async () => {
  const selected = { variantId: VARIANT, variantVersion: 2, version: 1, policy: { method: "usd", referenceId: REFERENCE, sourceAmount: "125.00000000" }, updatedAt: "2026-09-20T12:00:00.000000Z" };
  const client = new Client({ outcome: "found", result_payload: selected });
  assert.deepEqual(await repository(client).getPolicy({ ...authority(), variantId: VARIANT }), selected);
  assert.equal(client.queries[0]?.text, "BEGIN READ ONLY");
  assert.equal(client.queries[5]?.text,
    "SELECT outcome,result_payload FROM saas.pricing_variant_policy_get($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)");
});

test("candidate policy preview is a single read-only authorized database calculation", async () => {
  const policy = { method: "usd" as const, referenceId: REFERENCE, sourceAmount: "125.00000000" };
  const projection = { variantId: VARIANT, oldPriceCents: 10000, newPriceCents: 500000, sourceKind: "base",
    priceListId: null, activeSetId: SET, activeSetVersion: 2, referenceId: REFERENCE,
    referenceRateTry: "40.00000000", method: "usd", metalComponentTry: "5000.00000000", laborTry: "0.00000000",
    policyVersion: 0, variantVersion: 2, scopeDigest: "a".repeat(64) };
  const client = new Client({ outcome: "previewed", result_payload: projection });
  assert.deepEqual(await repository(client).previewPolicy({ ...authority(), variantId: VARIANT, channel: "storefront", policy }), projection);
  assert.equal(client.queries[0]?.text, "BEGIN READ ONLY");
  assert.equal(client.queries[5]?.text,
    "SELECT outcome,result_payload FROM saas.pricing_variant_policy_preview($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::jsonb,$10::text)");
  assert.deepEqual(client.queries[5]?.values?.slice(7), [VARIANT, JSON.stringify(policy), "storefront"]);
});

test("set save, activation, and policy save send expected versions through one write each", async () => {
  const values = [{ referenceId: REFERENCE, rateTry: "40.00000000", active: true }];
  const saved = { setId: SET, version: 1, stateVersion: 0, isActive: false, values: [{ ...values[0], kind: "usd", label: "USD satış" }], createdAt: "2026-09-20T12:00:00.000000Z" };
  const setClient = new Client({ outcome: "saved", result_payload: saved });
  assert.deepEqual(await repository(setClient).saveSet({ ...authority(), operationId: OPERATION, setId: SET, expectedStateVersion: 0, values }), saved);
  assert.equal(setClient.queries[0]?.text, "BEGIN ISOLATION LEVEL READ COMMITTED");
  assert.equal(setClient.queries[5]?.text,
    "SELECT outcome,result_payload FROM saas.pricing_reference_set_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::jsonb)");
  assert.deepEqual(setClient.queries[5]?.values?.slice(9, 11), [SET, 0]);

  const activated = { setId: SET, version: 1, stateVersion: 1, activatedAt: "2026-09-20T12:00:00.000000Z" };
  const activeClient = new Client({ outcome: "activated", result_payload: activated });
  assert.deepEqual(await repository(activeClient).activate({ ...authority(), operationId: OPERATION, setId: SET, expectedStateVersion: 0, expectedScopeDigest: "a".repeat(64) }), activated);
  assert.equal(activeClient.queries[5]?.text,
    "SELECT outcome,result_payload FROM saas.pricing_reference_set_activate($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::text)");
  assert.deepEqual(activeClient.queries[5]?.values?.slice(9), [SET, 0, "a".repeat(64)]);

  const policy = { method: "usd", referenceId: REFERENCE, sourceAmount: "125.00000000" };
  const projection = { variantId: VARIANT, version: 1, variantVersion: 2, policy, updatedAt: "2026-09-20T12:00:00.000000Z" };
  const policyClient = new Client({ outcome: "policy_saved", result_payload: projection });
  assert.deepEqual(await repository(policyClient).savePolicy({ ...authority(), operationId: OPERATION, variantId: VARIANT, expectedVariantVersion: 2, expectedPolicyVersion: 0, expectedScopeDigest: "a".repeat(64), policy }), projection);
  assert.equal(policyClient.queries[5]?.text,
    "SELECT outcome,result_payload FROM saas.pricing_variant_policy_save_v2($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::bigint,$13::jsonb,$14::text)");
  assert.deepEqual(policyClient.queries[5]?.values?.slice(9), [VARIANT, 2, 0, JSON.stringify(policy), "a".repeat(64)]);
});
