import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { StoreMembershipRole, TenantContext } from "@celebix/saas-contracts";
import type { PromotionRepository } from "@celebix/saas-data";
import { promotionFailure } from "../../../../packages/saas-data/src/promotions/errors.ts";

import type { ServerPromotionsRuntime } from "../server-promotions/runtime.ts";
import { createPromotionsHttpHandler } from "./handler.ts";
import { preparePromotionRouteRequest } from "./request-authority.ts";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const TENANT_ORIGIN = "https://atlas-store.admin.saas-staging.celebix.site";
const FOREIGN_ORIGIN = "https://other-store.admin.saas-staging.celebix.site";
const STORE = "10000000-0000-4000-8000-000000000001";
const PRINCIPAL = "10000000-0000-4000-8000-000000000002";
const MEMBERSHIP = "10000000-0000-4000-8000-000000000003";
const PLAN = "10000000-0000-4000-8000-000000000004";
const PROMOTION = "20000000-0000-4000-8000-000000000001";
const BATCH = "30000000-0000-4000-8000-000000000001";
const OPERATION = "40000000-0000-4000-8000-000000000001";
const REQUEST_ID = "50000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-09-05T12:00:00.000Z");
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 0x31).toString("base64url")}`;
const COOKIE = `__Host-celebix_panel=${CREDENTIAL}`;

const RULE = {
  schemaVersion: 1,
  benefit: { kind: "percentage", percentageBps: 1_500 },
  targets: { mode: "all", include: [], exclude: [] },
  audience: { mode: "everyone" },
  trigger: { kind: "automatic" },
  schedule: { timezone: "Europe/Istanbul" },
  limits: { totalUsage: null, perCustomerUsage: null, budgetMinor: null, orderMaximumMinor: null },
  conditions: { minimumBasketMinor: 0, minimumQuantity: 0, minimumProductQuantity: 0 },
  combinationPolicy: { kind: "none" },
  priority: 0,
  marginPolicy: { kind: "warn" },
  progressMessagePolicy: { enabled: false },
} as const;
const PUBLIC_CONTEXT = {
  customerId: null, paidOrderCount: 0, customerSegmentIds: [], customerTagIds: [], cartLines: [],
  shippingMethodId: null, paymentMethodId: null, shippingBeforeDiscountMinor: 0, currency: "TRY",
  storeLocalTime: NOW.toISOString(), salesChannel: "storefront", submittedCodes: [], abandonedCart: null,
} as const;

function tenant(role: StoreMembershipRole = "store_owner", promotions = true): TenantContext {
  return {
    schemaVersion: 1, requestId: REQUEST_ID,
    principal: { id: PRINCIPAL, issuer: "https://identity.test/oidc", subject: "private" },
    store: { id: STORE, slug: "atlas-store", status: "active" },
    membership: { id: MEMBERSHIP, role, status: "active" },
    entitlements: {
      schemaVersion: 1, planId: PLAN, planCode: "growth", version: 2, status: "active",
      features: promotions ? ["promotions"] : ["catalog"], limits: { products: 100, staff: 5, storageBytes: 1_024 },
      validFrom: "2026-01-01T00:00:00.000Z",
    }, locale: "tr-TR",
  } as TenantContext;
}

function detail(id = PROMOTION) {
  return { id, version: 1, name: "Atlas", status: "draft" as const, ruleDocument: RULE, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() };
}
function batch() {
  return { id: BATCH, promotionId: PROMOTION, version: 1, status: "active" as const, count: 1, prefix: "VIP_", codeLength: 24, perCustomerUsage: 1, expiresAt: null, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() };
}
const simulation = () => ({
  evaluation: {
    eligiblePromotionIds: [], appliedPromotions: [], rejectedPromotions: [], lineEffects: [], shippingEffects: [], gifts: [],
    subtotalBeforeDiscountMinor: 0, lineDiscountTotalMinor: 0, shippingBeforeDiscountMinor: 0,
    shippingDiscountTotalMinor: 0, discountTotalMinor: 0, grandTotalMinor: 0, currency: "TRY",
    progressMessages: [], merchantExplanation: "evaluated" as const,
  }, mutated: false as const,
});
const clearConflict = () => ({ blocking: false as const, findings: [] });
const clearMargin = () => ({ blocking: false as const, status: "clear" as const, summary: { evaluatedVariantCount: 0, knownCostVariantCount: 0, unknownCostVariantCount: 0, atRiskVariantCount: 0 }, findings: [] });
const picker = () => ({ kind: "product" as const, id: PROMOTION, label: "Atlas", status: "active" as const });

const METHODS = [
  "list", "detail", "create", "update", "publish", "pause", "resume", "duplicate", "archive",
  "simulate", "conflicts", "margin", "listTargets", "resolveTargets", "listCodeBatches",
  "createCodeBatch", "updateCodeBatchStatus", "exportCodes", "analytics", "listLegacy",
] as const;

function repository(overrides: Partial<PromotionRepository> = {}): PromotionRepository {
  const reject = async () => { throw new Error("unexpected repository call"); };
  return { ...Object.fromEntries(METHODS.map((method) => [method, reject])), ...overrides } as unknown as PromotionRepository;
}

function successfulRepository(called: (method: string) => void = () => undefined): PromotionRepository {
  return repository({
    async list() { called("list"); return { items: [], nextCursor: null }; },
    async detail() { called("detail"); return detail(); },
    async create() { called("create"); return { promotion: detail(), replayed: false }; },
    async update() { called("update"); return { promotion: { ...detail(), version: 2 }, replayed: false }; },
    async publish() { called("publish"); return { promotion: { ...detail(), version: 2, status: "active" }, replayed: false }; },
    async pause() { called("pause"); return { promotion: { ...detail(), version: 2, status: "paused" }, replayed: false }; },
    async resume() { called("resume"); return { promotion: { ...detail(), version: 2, status: "scheduled" }, replayed: false }; },
    async duplicate() { called("duplicate"); return { promotion: detail("20000000-0000-4000-8000-000000000002"), replayed: false }; },
    async archive() { called("archive"); return { promotion: { ...detail(), version: 2, status: "archived" }, replayed: false }; },
    async simulate() { called("simulate"); return simulation(); },
    async conflicts() { called("conflicts"); return clearConflict(); },
    async margin() { called("margin"); return clearMargin(); },
    async listTargets() { called("listTargets"); return { items: [], nextCursor: null }; },
    async resolveTargets() { called("resolveTargets"); return []; },
    async createCodeBatch() { called("createCodeBatch"); return { batch: batch(), replayed: false }; },
    async updateCodeBatchStatus() { called("updateCodeBatchStatus"); return { batch: { ...batch(), version: 2, status: "paused" }, replayed: false }; },
    async listCodeBatches() { called("listCodeBatches"); return { items: [], nextCursor: null }; },
    async exportCodes() { called("exportCodes"); return { rows: [{ code: "VIP_ABC", status: "active" }] }; },
    async analytics() { called("analytics"); return { items: [] }; },
    async listLegacy() { called("listLegacy"); return { items: [], nextCursor: null }; },
  });
}

function runtime(
  promotions: PromotionRepository,
  role: StoreMembershipRole = "store_owner",
  accessKind: "authenticated" | "unauthenticated" | "unauthorized" | "unavailable" = "authenticated",
  feature = true,
): ServerPromotionsRuntime {
  return {
    promotions,
    access: {
      readiness: { mode: "approved_staging" }, panelOrigin: ORIGIN,
      async resolveCredential() {
        return accessKind === "authenticated"
          ? { kind: "authenticated", session: {}, tenantContext: tenant(role, feature) } as never
          : { kind: accessKind };
      },
      async rotateCredential() { return { kind: "unavailable" }; },
      async revokeCredential() { return { kind: "unavailable" }; },
    },
  } as ServerPromotionsRuntime;
}

function handler(promotions: PromotionRepository, options: Readonly<{
  role?: StoreMembershipRole;
  accessKind?: "authenticated" | "unauthenticated" | "unauthorized" | "unavailable";
  feature?: boolean;
}> = {}) {
  return createPromotionsHttpHandler({
    async resolveRuntime() { return runtime(promotions, options.role, options.accessKind, options.feature); },
    now: () => new Date(NOW), requestId: () => REQUEST_ID,
  });
}

const DURABLE = new Set(["POST /api/promotions", "PATCH", "publish", "pause", "resume", "duplicate", "archive", "code-batches", "status"]);
function request(path: string, options: Readonly<{
  method?: string; body?: unknown; origin?: string | null; cookie?: string | null; headers?: HeadersInit;
}> = {}): Request {
  const method = options.method ?? "GET", headers = new Headers(options.headers);
  if (options.cookie !== null && !headers.has("cookie")) headers.set("cookie", options.cookie ?? COOKIE);
  if (method !== "GET") {
    if (options.origin !== null && !headers.has("origin")) headers.set("origin", options.origin ?? ORIGIN);
    headers.set("content-type", headers.get("content-type") ?? "application/json");
    const marker = path.split("/").at(-1) ?? "";
    if (DURABLE.has(`${method} ${path}`) || DURABLE.has(method) || DURABLE.has(marker) || (path.includes(`/${PROMOTION}/code-batches`) && method === "POST")) headers.set("idempotency-key", OPERATION);
  }
  return new Request(`http://internal:3400${path}`, { method, headers, body: method === "GET" ? undefined : JSON.stringify(options.body ?? {}) });
}

test("the finite REST matrix calls every repository method with only server-derived authority", async () => {
  const calls: Array<readonly [string, Record<string, unknown>]> = [];
  const capture = (name: string, input: unknown) => calls.push([name, input as Record<string, unknown>]);
  const promotions = repository({
    async list(input) { capture("list", input); return { items: [], nextCursor: null }; },
    async detail(input) { capture("detail", input); return detail(); },
    async create(input) { capture("create", input); return { promotion: detail(), replayed: false }; },
    async update(input) { capture("update", input); return { promotion: { ...detail(), version: 2 }, replayed: false }; },
    async publish(input) { capture("publish", input); return { promotion: { ...detail(), version: 2, status: "active" }, replayed: false }; },
    async pause(input) { capture("pause", input); return { promotion: { ...detail(), version: 2, status: "paused" }, replayed: false }; },
    async resume(input) { capture("resume", input); return { promotion: { ...detail(), version: 2, status: "scheduled" }, replayed: false }; },
    async duplicate(input) { capture("duplicate", input); return { promotion: detail("20000000-0000-4000-8000-000000000002"), replayed: false }; },
    async archive(input) { capture("archive", input); return { promotion: { ...detail(), version: 2, status: "archived" }, replayed: false }; },
    async simulate(input) { capture("simulate", input); return simulation(); },
    async conflicts(input) { capture("conflicts", input); return clearConflict(); },
    async margin(input) { capture("margin", input); return clearMargin(); },
    async listTargets(input) { capture("listTargets", input); return { items: [picker()], nextCursor: null }; },
    async resolveTargets(input) { capture("resolveTargets", input); return [picker()]; },
    async createCodeBatch(input) { capture("createCodeBatch", input); return { batch: batch(), replayed: false }; },
    async updateCodeBatchStatus(input) { capture("updateCodeBatchStatus", input); return { batch: { ...batch(), version: 2, status: "paused" }, replayed: false }; },
    async listCodeBatches(input) { capture("listCodeBatches", input); return { items: [], nextCursor: null }; },
    async exportCodes(input) { capture("exportCodes", input); return { rows: [{ code: "VIP_ABC", status: "active" }] }; },
    async analytics(input) { capture("analytics", input); return { items: [] }; },
    async listLegacy(input) { capture("listLegacy", input); return { items: [], nextCursor: null }; },
  });
  const handle = handler(promotions);
  const cases: readonly (readonly [string, string, unknown, number])[] = [
    ["GET", "/api/promotions?limit=50&cursor=abc&search=Atlas&effectiveStatuses=paused%2Cactive&triggerKinds=code%2Cautomatic&benefitKinds=percentage%2Cgift&audienceModes=masked_customers%2Ceveryone&scheduleFrom=2026-09-05T00%3A00%3A00.000Z&scheduleTo=2026-10-05T00%3A00%3A00.000Z", undefined, 200],
    ["GET", `/api/promotions/${PROMOTION}`, undefined, 200],
    ["POST", "/api/promotions", { name: "Atlas", ruleDocument: RULE }, 201],
    ["PATCH", `/api/promotions/${PROMOTION}`, { expectedVersion: 1, name: "Atlas", ruleDocument: RULE }, 200],
    ["POST", `/api/promotions/${PROMOTION}/publish`, { expectedVersion: 1, nextStatus: "active" }, 200],
    ["POST", `/api/promotions/${PROMOTION}/pause`, { expectedVersion: 1 }, 200],
    ["POST", `/api/promotions/${PROMOTION}/resume`, { expectedVersion: 1, nextStatus: "scheduled" }, 200],
    ["POST", `/api/promotions/${PROMOTION}/duplicate`, { expectedVersion: 1, name: "Kopya", codes: [] }, 201],
    ["POST", `/api/promotions/${PROMOTION}/archive`, { expectedVersion: 1 }, 200],
    ["POST", "/api/promotions/simulate", { promotionId: PROMOTION, expectedVersion: null, name: "Taslak", ruleDocument: RULE, context: PUBLIC_CONTEXT }, 200],
    ["POST", "/api/promotions/conflicts", { ruleDocument: RULE }, 200],
    ["POST", "/api/promotions/margin", { ruleDocument: RULE }, 200],
    ["GET", "/api/promotions/targets?kind=product&limit=50&cursor=abc&search=Atlas", undefined, 200],
    ["POST", "/api/promotions/targets/resolve", { kind: "product", ids: [PROMOTION] }, 200],
    ["GET", `/api/promotions/${PROMOTION}/code-batches?limit=20&cursor=abc`, undefined, 200],
    ["POST", `/api/promotions/${PROMOTION}/code-batches`, { count: 1, prefix: "VIP_", codeLength: 24, perCustomerUsage: 1, expiresAt: null }, 201],
    ["POST", `/api/promotions/code-batches/${BATCH}/status`, { expectedVersion: 1, nextStatus: "paused" }, 200],
    ["GET", `/api/promotions/code-batches/${BATCH}/csv`, undefined, 200],
    ["GET", `/api/promotions/${PROMOTION}/analytics`, undefined, 200],
    ["GET", "/api/promotions/legacy?limit=20&cursor=abc", undefined, 200],
  ];
  for (const [method, path, body, status] of cases) {
    const response = await handle(request(path, { method, body }));
    assert.equal(response.status, status, `${method} ${path}: ${await response.clone().text()}`);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
  assert.deepEqual(calls.map(([name]) => name), [...METHODS]);
  for (const [, input] of calls) {
    assert.deepEqual(input.tenantContext, tenant());
    assert.deepEqual(input.now, NOW);
    for (const forbidden of ["storeId", "principalId", "membershipId", "planId", "credential"]) assert.equal(forbidden in input, false);
  }
  assert.equal((calls.find(([name]) => name === "list")?.[1].pageSize), 50);
  assert.equal((calls.find(([name]) => name === "listTargets")?.[1].pageSize), 50);
  assert.equal(calls.find(([name]) => name === "simulate")?.[1].context instanceof Object, true);
  assert.equal((calls.find(([name]) => name === "simulate")?.[1].context as Record<string, unknown>).storeId, STORE);
  const byName = new Map(calls);
  assert.deepEqual(byName.get("create"), { tenantContext: tenant(), now: NOW, operationId: OPERATION, name: "Atlas", ruleDocument: RULE });
  assert.deepEqual(byName.get("update"), { tenantContext: tenant(), now: NOW, operationId: OPERATION, promotionId: PROMOTION, expectedVersion: 1, name: "Atlas", ruleDocument: RULE });
  assert.equal(byName.get("publish")?.promotionId, PROMOTION);
  assert.equal(byName.get("publish")?.operationId, OPERATION);
  assert.equal(byName.get("publish")?.nextStatus, "active");
  assert.equal(byName.get("resume")?.nextStatus, "scheduled");
  assert.deepEqual(byName.get("duplicate")?.codes, []);
  assert.equal(byName.get("codeBatchCreate")?.promotionId, undefined);
  assert.equal(byName.get("createCodeBatch")?.promotionId, PROMOTION);
  assert.equal(byName.get("updateCodeBatchStatus")?.batchId, BATCH);
  assert.equal(byName.get("exportCodes")?.batchId, BATCH);
  const inputs = Object.fromEntries(calls.map(([name, input]) => {
    const { tenantContext: _tenantContext, now: _now, ...publicInput } = input;
    return [name, publicInput];
  }));
  assert.deepEqual(inputs, {
    list: { pageSize: 50, cursor: "abc", search: "Atlas", effectiveStatuses: ["active", "paused"], triggerKinds: ["automatic", "code"], benefitKinds: ["gift", "percentage"], audienceModes: ["everyone", "masked_customers"], scheduleFrom: "2026-09-05T00:00:00.000Z", scheduleTo: "2026-10-05T00:00:00.000Z" },
    detail: { promotionId: PROMOTION },
    create: { operationId: OPERATION, name: "Atlas", ruleDocument: RULE },
    update: { operationId: OPERATION, promotionId: PROMOTION, expectedVersion: 1, name: "Atlas", ruleDocument: RULE },
    publish: { operationId: OPERATION, promotionId: PROMOTION, expectedVersion: 1, nextStatus: "active" },
    pause: { operationId: OPERATION, promotionId: PROMOTION, expectedVersion: 1 },
    resume: { operationId: OPERATION, promotionId: PROMOTION, expectedVersion: 1, nextStatus: "scheduled" },
    duplicate: { operationId: OPERATION, promotionId: PROMOTION, expectedVersion: 1, name: "Kopya", codes: [] },
    archive: { operationId: OPERATION, promotionId: PROMOTION, expectedVersion: 1 },
    simulate: { promotionId: PROMOTION, expectedVersion: null, name: "Taslak", ruleDocument: RULE, context: { ...PUBLIC_CONTEXT, storeId: STORE } },
    conflicts: { ruleDocument: RULE },
    margin: { ruleDocument: RULE },
    listTargets: { kind: "product", pageSize: 50, cursor: "abc", search: "Atlas" },
    resolveTargets: { kind: "product", ids: [PROMOTION] },
    listCodeBatches: { promotionId: PROMOTION, pageSize: 20, cursor: "abc" },
    createCodeBatch: { operationId: OPERATION, promotionId: PROMOTION, count: 1, prefix: "VIP_", codeLength: 24, perCustomerUsage: 1, expiresAt: null },
    updateCodeBatchStatus: { operationId: OPERATION, batchId: BATCH, expectedVersion: 1, nextStatus: "paused" },
    exportCodes: { batchId: BATCH },
    analytics: { promotionId: PROMOTION },
    listLegacy: { pageSize: 20, cursor: "abc" },
  });
});

test("mutation responses preserve exact replay envelopes and operation-family statuses", async () => {
  const copied = detail("20000000-0000-4000-8000-000000000002");
  const promotions = repository({
    async create() { return { promotion: detail(), replayed: true }; },
    async update() { return { promotion: { ...detail(), version: 2 }, replayed: true }; },
    async publish() { return { promotion: { ...detail(), version: 2, status: "active" }, replayed: true }; },
    async pause() { return { promotion: { ...detail(), version: 2, status: "paused" }, replayed: true }; },
    async resume() { return { promotion: { ...detail(), version: 2, status: "scheduled" }, replayed: true }; },
    async duplicate() { return { promotion: copied, replayed: true }; },
    async archive() { return { promotion: { ...detail(), version: 2, status: "archived" }, replayed: true }; },
    async createCodeBatch() { return { batch: batch(), replayed: true }; },
    async updateCodeBatchStatus() { return { batch: { ...batch(), version: 2, status: "paused" }, replayed: true }; },
  });
  const cases = [
    [request("/api/promotions", { method: "POST", body: { name: "Atlas", ruleDocument: RULE } }), 201, { promotion: detail(), replayed: true }],
    [request(`/api/promotions/${PROMOTION}`, { method: "PATCH", body: { expectedVersion: 1, name: "Atlas", ruleDocument: RULE } }), 200, { promotion: { ...detail(), version: 2 }, replayed: true }],
    [request(`/api/promotions/${PROMOTION}/publish`, { method: "POST", body: { expectedVersion: 1, nextStatus: "active" } }), 200, { promotion: { ...detail(), version: 2, status: "active" }, replayed: true }],
    [request(`/api/promotions/${PROMOTION}/pause`, { method: "POST", body: { expectedVersion: 1 } }), 200, { promotion: { ...detail(), version: 2, status: "paused" }, replayed: true }],
    [request(`/api/promotions/${PROMOTION}/resume`, { method: "POST", body: { expectedVersion: 1, nextStatus: "scheduled" } }), 200, { promotion: { ...detail(), version: 2, status: "scheduled" }, replayed: true }],
    [request(`/api/promotions/${PROMOTION}/duplicate`, { method: "POST", body: { expectedVersion: 1, name: "Kopya", codes: [] } }), 201, { promotion: copied, replayed: true }],
    [request(`/api/promotions/${PROMOTION}/archive`, { method: "POST", body: { expectedVersion: 1 } }), 200, { promotion: { ...detail(), version: 2, status: "archived" }, replayed: true }],
    [request(`/api/promotions/${PROMOTION}/code-batches`, { method: "POST", body: { count: 1, prefix: "VIP_", codeLength: 24, perCustomerUsage: 1, expiresAt: null } }), 201, { batch: batch(), replayed: true }],
    [request(`/api/promotions/code-batches/${BATCH}/status`, { method: "POST", body: { expectedVersion: 1, nextStatus: "paused" } }), 200, { batch: { ...batch(), version: 2, status: "paused" }, replayed: true }],
  ] as const;
  const handle = handler(promotions);
  for (const [candidate, status, body] of cases) {
    const response = await handle(candidate);
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), body);
  }
});

test("read and check responses expose only their exact public envelopes", async () => {
  const promotions = successfulRepository();
  const handle = handler(promotions);
  for (const [candidate, expected] of [
    [request("/api/promotions"), { items: [], nextCursor: null }],
    [request(`/api/promotions/${PROMOTION}`), detail()],
    [request("/api/promotions/simulate", { method: "POST", body: { promotionId: PROMOTION, expectedVersion: null, name: "Taslak", ruleDocument: RULE, context: PUBLIC_CONTEXT } }), simulation()],
    [request("/api/promotions/conflicts", { method: "POST", body: { ruleDocument: RULE } }), clearConflict()],
    [request("/api/promotions/margin", { method: "POST", body: { ruleDocument: RULE } }), clearMargin()],
    [request("/api/promotions/targets?kind=product"), { items: [], nextCursor: null }],
    [request("/api/promotions/targets/resolve", { method: "POST", body: { kind: "product", ids: [PROMOTION] } }), { items: [] }],
    [request(`/api/promotions/${PROMOTION}/code-batches`), { items: [], nextCursor: null }],
    [request(`/api/promotions/${PROMOTION}/analytics`), { items: [] }],
    [request("/api/promotions/legacy"), { items: [], nextCursor: null }],
  ] as const) {
    const response = await handle(candidate);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expected);
  }
});

test("malformed or extra repository success projections fail closed before serialization", async () => {
  const cases: readonly (readonly [Request, Partial<PromotionRepository>])[] = [
    [request("/api/promotions"), { async list() { return { items: [], nextCursor: null, private: STORE } as never; } }],
    [request(`/api/promotions/${PROMOTION}`), { async detail() { return { ...detail(), private: STORE } as never; } }],
    [request("/api/promotions/simulate", { method: "POST", body: { promotionId: PROMOTION, expectedVersion: null, name: "Taslak", ruleDocument: RULE, context: PUBLIC_CONTEXT } }), { async simulate() { return { ...simulation(), private: STORE } as never; } }],
    [request("/api/promotions/conflicts", { method: "POST", body: { ruleDocument: RULE } }), { async conflicts() { return { ...clearConflict(), private: STORE } as never; } }],
    [request("/api/promotions/margin", { method: "POST", body: { ruleDocument: RULE } }), { async margin() { return { ...clearMargin(), private: STORE } as never; } }],
    [request("/api/promotions/targets?kind=product"), { async listTargets() { return { items: [{ ...picker(), status: "unavailable" }], nextCursor: null } as never; } }],
    [request("/api/promotions/targets/resolve", { method: "POST", body: { kind: "product", ids: [PROMOTION] } }), { async resolveTargets() { return [{ ...picker(), kind: "variant" }] as never; } }],
    [request(`/api/promotions/${PROMOTION}/code-batches`), { async listCodeBatches() { return { items: [], nextCursor: null, private: STORE } as never; } }],
    [request(`/api/promotions/${PROMOTION}/analytics`), { async analytics() { return { items: [], private: STORE } as never; } }],
    [request("/api/promotions/legacy"), { async listLegacy() { return { items: [], nextCursor: null, private: STORE } as never; } }],
  ];
  for (const [candidate, override] of cases) {
    const response = await handler(repository(override))(candidate);
    assert.equal(response.status, 503, candidate.url);
    assert.deepEqual(await response.json(), { code: "promotion_unavailable" });
  }
});

test("valid-shaped success projections stay bound to their route identity, version and lifecycle target", async () => {
  const cases: readonly (readonly [Request, Partial<PromotionRepository>])[] = [
    [request("/api/promotions", { method: "POST", body: { name: "Atlas", ruleDocument: RULE } }), { async create() { return { promotion: { ...detail(), version: 2 }, replayed: false }; } }],
    [request(`/api/promotions/${PROMOTION}`), { async detail() { return detail(STORE); } }],
    [request(`/api/promotions/${PROMOTION}`, { method: "PATCH", body: { expectedVersion: 1, name: "Atlas", ruleDocument: RULE } }), { async update() { return { promotion: { ...detail(STORE), version: 2 }, replayed: false }; } }],
    [request(`/api/promotions/${PROMOTION}/publish`, { method: "POST", body: { expectedVersion: 1, nextStatus: "active" } }), { async publish() { return { promotion: { ...detail(), version: 2, status: "scheduled" }, replayed: false }; } }],
    [request(`/api/promotions/${PROMOTION}/pause`, { method: "POST", body: { expectedVersion: 1 } }), { async pause() { return { promotion: { ...detail(), version: 3, status: "paused" }, replayed: false }; } }],
    [request(`/api/promotions/${PROMOTION}/archive`, { method: "POST", body: { expectedVersion: 1 } }), { async archive() { return { promotion: { ...detail(), version: 2, status: "paused" }, replayed: false }; } }],
    [request(`/api/promotions/${PROMOTION}/duplicate`, { method: "POST", body: { expectedVersion: 1, name: "Kopya", codes: [] } }), { async duplicate() { return { promotion: detail(PROMOTION), replayed: false }; } }],
    [request(`/api/promotions/${PROMOTION}/code-batches`, { method: "POST", body: { count: 1, prefix: "VIP_", codeLength: 24, perCustomerUsage: 1, expiresAt: null } }), { async createCodeBatch() { return { batch: { ...batch(), promotionId: STORE }, replayed: false }; } }],
    [request(`/api/promotions/code-batches/${BATCH}/status`, { method: "POST", body: { expectedVersion: 1, nextStatus: "paused" } }), { async updateCodeBatchStatus() { return { batch: { ...batch(), id: STORE, version: 2, status: "paused" }, replayed: false }; } }],
  ];
  for (const [candidate, override] of cases) {
    const response = await handler(repository(override))(candidate);
    assert.equal(response.status, 503, candidate.url);
    assert.deepEqual(await response.json(), { code: "promotion_unavailable" });
  }
});

test("promotion role and feature gates reject before repository access", async () => {
  for (const role of ["editor", "analyst"] as const) {
    let calls = 0;
    const handle = handler(repository({
      async list() { calls += 1; return { items: [], nextCursor: null }; },
      async create() { calls += 1; return { promotion: detail(), replayed: false }; },
      async archive() { calls += 1; return { promotion: detail(), replayed: false }; },
      async simulate() { calls += 1; return simulation(); },
    }), { role });
    assert.equal((await handle(request("/api/promotions"))).status, 200, `${role}:read`);
    assert.equal((await handle(request("/api/promotions/simulate", { method: "POST", body: { promotionId: PROMOTION, expectedVersion: null, name: "Taslak", ruleDocument: RULE, context: PUBLIC_CONTEXT } }))).status, 200, `${role}:simulate`);
    assert.equal((await handle(request("/api/promotions", { method: "POST", body: { name: "Atlas", ruleDocument: RULE } }))).status, 403, `${role}:manage`);
    assert.equal((await handle(request(`/api/promotions/${PROMOTION}/archive`, { method: "POST", body: { expectedVersion: 1 } }))).status, 403, `${role}:archive`);
    assert.equal(calls, 2);
  }
  let featureCalls = 0;
  const noFeature = handler(repository({ async list() { featureCalls += 1; return { items: [], nextCursor: null }; } }), { feature: false });
  const response = await noFeature(request("/api/promotions"));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { code: "feature_not_enabled" });
  assert.equal(featureCalls, 0);

  for (const role of ["store_owner", "admin"] as const) {
    let calls = 0;
    const response = await handler(repository({ async archive() { calls += 1; return { promotion: { ...detail(), version: 2, status: "archived" }, replayed: false }; } }), { role })(
      request(`/api/promotions/${PROMOTION}/archive`, { method: "POST", body: { expectedVersion: 1 } }),
    );
    assert.equal(response.status, 200, role);
    assert.equal(calls, 1, role);
  }
});

test("editor and analyst route permissions cover every read family and deny every manage family including CSV", async () => {
  const readCases = [
    request("/api/promotions"),
    request(`/api/promotions/${PROMOTION}`),
    request("/api/promotions/simulate", { method: "POST", body: { promotionId: PROMOTION, expectedVersion: null, name: "Taslak", ruleDocument: RULE, context: PUBLIC_CONTEXT } }),
    request("/api/promotions/conflicts", { method: "POST", body: { ruleDocument: RULE } }),
    request("/api/promotions/margin", { method: "POST", body: { ruleDocument: RULE } }),
    request("/api/promotions/targets?kind=product"),
    request("/api/promotions/targets/resolve", { method: "POST", body: { kind: "product", ids: [PROMOTION] } }),
    request(`/api/promotions/${PROMOTION}/code-batches`),
    request(`/api/promotions/${PROMOTION}/analytics`),
    request("/api/promotions/legacy"),
  ];
  const manageCases = [
    request("/api/promotions", { method: "POST", body: { name: "Atlas", ruleDocument: RULE } }),
    request(`/api/promotions/${PROMOTION}`, { method: "PATCH", body: { expectedVersion: 1, name: "Atlas", ruleDocument: RULE } }),
    request(`/api/promotions/${PROMOTION}/publish`, { method: "POST", body: { expectedVersion: 1, nextStatus: "active" } }),
    request(`/api/promotions/${PROMOTION}/pause`, { method: "POST", body: { expectedVersion: 1 } }),
    request(`/api/promotions/${PROMOTION}/resume`, { method: "POST", body: { expectedVersion: 1, nextStatus: "scheduled" } }),
    request(`/api/promotions/${PROMOTION}/duplicate`, { method: "POST", body: { expectedVersion: 1, name: "Kopya", codes: [] } }),
    request(`/api/promotions/${PROMOTION}/archive`, { method: "POST", body: { expectedVersion: 1 } }),
    request(`/api/promotions/${PROMOTION}/code-batches`, { method: "POST", body: { count: 1, prefix: "VIP_", codeLength: 24, perCustomerUsage: 1, expiresAt: null } }),
    request(`/api/promotions/code-batches/${BATCH}/status`, { method: "POST", body: { expectedVersion: 1, nextStatus: "paused" } }),
    request(`/api/promotions/code-batches/${BATCH}/csv`),
  ];
  for (const role of ["editor", "analyst"] as const) {
    let calls = 0;
    const handle = handler(successfulRepository(() => { calls += 1; }), { role });
    for (const candidate of readCases) assert.equal((await handle(candidate.clone())).status, 200, `${role}:${candidate.url}`);
    assert.equal(calls, readCases.length);
    for (const candidate of manageCases) assert.equal((await handle(candidate.clone())).status, 403, `${role}:${candidate.url}`);
    assert.equal(calls, readCases.length);
  }
  for (const role of ["store_owner", "admin"] as const) {
    let calls = 0;
    const handle = handler(successfulRepository(() => { calls += 1; }), { role });
    for (const candidate of [...readCases, ...manageCases]) {
      assert.ok([200, 201].includes((await handle(candidate.clone())).status), `${role}:${candidate.url}`);
    }
    assert.equal(calls, readCases.length + manageCases.length);
  }
});

test("session and two-stage origin authority fail closed before repository access", async () => {
  let calls = 0;
  const promotions = repository({ async create() { calls += 1; return { promotion: detail(), replayed: false }; } });
  const body = { name: "Atlas", ruleDocument: RULE };
  for (const accessKind of ["unauthenticated", "unauthorized", "unavailable"] as const) {
    const response = await handler(promotions, { accessKind })(request("/api/promotions", { method: "POST", body }));
    assert.equal(response.status, accessKind === "unauthenticated" ? 401 : accessKind === "unauthorized" ? 403 : 503, accessKind);
    assert.deepEqual(await response.json(), { code: accessKind === "unauthenticated" ? "unauthenticated" : accessKind === "unauthorized" ? "membership_denied" : "promotion_unavailable" });
  }
  for (const origin of [null, FOREIGN_ORIGIN]) {
    const response = await handler(promotions)(request("/api/promotions", { method: "POST", body, origin }));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { code: "origin_denied" });
  }
  assert.equal((await handler(promotions)(request("/api/promotions", { method: "POST", body, origin: TENANT_ORIGIN }))).status, 201);
  const missing = await handler(promotions)(request("/api/promotions", { method: "POST", body, cookie: null }));
  assert.equal(missing.status, 401);
  assert.deepEqual(await missing.json(), { code: "unauthenticated" });
  assert.equal(calls, 1);

  let runtimeCalls = 0;
  const missingSession = createPromotionsHttpHandler({
    async resolveRuntime() { runtimeCalls += 1; return runtime(promotions); },
    now: () => new Date(NOW), requestId: () => REQUEST_ID,
  });
  const response = await missingSession(request("/api/promotions", { cookie: null }));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { code: "unauthenticated" });
  assert.equal(runtimeCalls, 0);
});

test("every POST and PATCH route applies both origin stages before repository access", async () => {
  const candidates = [
    request("/api/promotions", { method: "POST", body: { name: "Atlas", ruleDocument: RULE } }),
    request(`/api/promotions/${PROMOTION}`, { method: "PATCH", body: { expectedVersion: 1, name: "Atlas", ruleDocument: RULE } }),
    request(`/api/promotions/${PROMOTION}/publish`, { method: "POST", body: { expectedVersion: 1, nextStatus: "active" } }),
    request(`/api/promotions/${PROMOTION}/pause`, { method: "POST", body: { expectedVersion: 1 } }),
    request(`/api/promotions/${PROMOTION}/resume`, { method: "POST", body: { expectedVersion: 1, nextStatus: "scheduled" } }),
    request(`/api/promotions/${PROMOTION}/duplicate`, { method: "POST", body: { expectedVersion: 1, name: "Kopya", codes: [] } }),
    request(`/api/promotions/${PROMOTION}/archive`, { method: "POST", body: { expectedVersion: 1 } }),
    request("/api/promotions/simulate", { method: "POST", body: { promotionId: PROMOTION, expectedVersion: null, name: "Taslak", ruleDocument: RULE, context: PUBLIC_CONTEXT } }),
    request("/api/promotions/conflicts", { method: "POST", body: { ruleDocument: RULE } }),
    request("/api/promotions/margin", { method: "POST", body: { ruleDocument: RULE } }),
    request("/api/promotions/targets/resolve", { method: "POST", body: { kind: "product", ids: [PROMOTION] } }),
    request(`/api/promotions/${PROMOTION}/code-batches`, { method: "POST", body: { count: 1, prefix: "VIP_", codeLength: 24, perCustomerUsage: 1, expiresAt: null } }),
    request(`/api/promotions/code-batches/${BATCH}/status`, { method: "POST", body: { expectedVersion: 1, nextStatus: "paused" } }),
  ];
  for (const origin of [null, FOREIGN_ORIGIN]) {
    let calls = 0;
    const handle = handler(successfulRepository(() => { calls += 1; }));
    for (const source of candidates) {
      const headers = new Headers(source.headers);
      if (origin === null) headers.delete("origin"); else headers.set("origin", origin);
      const candidate = new Request(source.clone(), { headers });
      const response = await handle(candidate);
      assert.equal(response.status, 403, `${source.method} ${source.url}`);
      assert.deepEqual(await response.json(), { code: "origin_denied" });
    }
    assert.equal(calls, 0);
  }
});

test("access resolution receives only the exact Host, cookie credential, request id and fresh server time", async () => {
  const seen: unknown[] = [];
  const promotions = repository({ async list() { return { items: [], nextCursor: null }; } });
  const base = runtime(promotions);
  const handle = createPromotionsHttpHandler({
    async resolveRuntime() {
      return { ...base, access: { ...base.access, async resolveCredential(input) { seen.push(input); return { kind: "authenticated", session: {}, tenantContext: tenant() } as never; } } } as ServerPromotionsRuntime;
    },
    now: () => NOW,
    requestId: () => REQUEST_ID,
  });
  const response = await handle(request("/api/promotions", { headers: { host: "admin.merchant.example" } }));
  assert.equal(response.status, 200);
  assert.equal(seen.length, 1);
  const authority = seen[0] as Record<string, unknown>;
  assert.deepEqual(Object.keys(authority).sort(), ["credential", "hostname", "now", "requestId"]);
  assert.equal(authority.credential, CREDENTIAL);
  assert.equal(authority.hostname, "admin.merchant.example");
  assert.equal(authority.requestId, REQUEST_ID);
  assert.deepEqual(authority.now, NOW);
  assert.notEqual(authority.now, NOW);
});

test("typed repository failures map to exact safe HTTP envelopes", async () => {
  const readiness = { blocking: true as const, findings: [{ code: "schedule_ended" as const, severity: "blocking" as const, relatedPromotionId: null, relatedPromotionName: null }] };
  for (const [caught, expectedStatus, expected] of [
    [promotionFailure("invalid_input"), 400, { code: "invalid_input" }],
    [promotionFailure("unauthenticated"), 401, { code: "unauthenticated" }],
    [promotionFailure("membership_denied"), 403, { code: "membership_denied" }],
    [promotionFailure("store_inactive"), 403, { code: "store_inactive" }],
    [promotionFailure("feature_not_enabled"), 403, { code: "feature_not_enabled" }],
    [promotionFailure("resource_not_found"), 404, { code: "not_found" }],
    [promotionFailure("idempotency_mismatch"), 409, { code: "operation_mismatch" }],
    [promotionFailure("conflict"), 409, { code: "conflict" }],
    [promotionFailure("invalid_reference"), 409, { code: "invalid_reference" }],
    [promotionFailure("code_conflict"), 409, { code: "code_conflict" }],
    [promotionFailure("active_code_batches"), 409, { code: "active_code_batches" }],
    [promotionFailure("invalid_transition"), 409, { code: "invalid_transition" }],
    [promotionFailure("promotion_limit_reached"), 409, { code: "promotion_limit_reached" }],
    [promotionFailure("version_conflict", { current: detail() }), 409, { code: "version_conflict", current: detail() }],
    [promotionFailure("publish_blocked", { readiness }), 409, { code: "publish_blocked", readiness }],
    [promotionFailure("unavailable"), 503, { code: "promotion_unavailable" }],
    [promotionFailure("durable_authority_invalid"), 503, { code: "promotion_unavailable" }],
    [promotionFailure("projection_unavailable"), 503, { code: "promotion_unavailable" }],
    [promotionFailure("operation_result_invalid"), 503, { code: "promotion_unavailable" }],
    [new Error(`SELECT private FROM ${STORE}`), 503, { code: "promotion_unavailable" }],
  ] as const) {
    const response = await handler(repository({ async detail() { throw caught; } }))(request(`/api/promotions/${PROMOTION}`));
    assert.equal(response.status, expectedStatus);
    const value = await response.json();
    assert.deepEqual(value, expected);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.doesNotMatch(JSON.stringify(value), /SELECT private|10000000-0000/i);
  }
});

test("malformed trusted conflict payloads fail closed and cross-tenant misses stay indistinguishable", async () => {
  const malformed = promotionFailure("version_conflict", { current: { ...detail(), id: STORE } as never });
  const malformedReadiness = promotionFailure("publish_blocked", { readiness: { blocking: false, findings: [{ code: "schedule_ended", severity: "blocking", relatedPromotionId: null, relatedPromotionName: null }] } as never });
  for (const caught of [malformed, malformedReadiness, promotionFailure("resource_not_found")]) {
    const response = await handler(repository({ async detail() { throw caught; } }))(request(`/api/promotions/${PROMOTION}`));
    if (caught === malformed || caught === malformedReadiness) assert.deepEqual(await response.json(), { code: "promotion_unavailable" });
    else assert.deepEqual(await response.json(), { code: "not_found" });
  }
});

test("version conflicts preserve a batch current projection without exposing technical detail", async () => {
  const response = await handler(repository({ async updateCodeBatchStatus() { throw promotionFailure("version_conflict", { current: batch() }); } }))(request(`/api/promotions/code-batches/${BATCH}/status`, { method: "POST", body: { expectedVersion: 1, nextStatus: "paused" } }));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { code: "version_conflict", current: batch() });
});

test("version conflict details reject the wrong resource family and valid cross-resource identities", async () => {
  for (const [candidate, current, override] of [
    [request(`/api/promotions/${PROMOTION}`, { method: "PATCH", body: { expectedVersion: 1, name: "Atlas", ruleDocument: RULE } }), batch(), { async update() { throw promotionFailure("version_conflict", { current: batch() }); } }],
    [request(`/api/promotions/code-batches/${BATCH}/status`, { method: "POST", body: { expectedVersion: 1, nextStatus: "paused" } }), detail(), { async updateCodeBatchStatus() { throw promotionFailure("version_conflict", { current: detail() }); } }],
    [request(`/api/promotions/${PROMOTION}`, { method: "PATCH", body: { expectedVersion: 1, name: "Atlas", ruleDocument: RULE } }), detail(STORE), { async update() { throw promotionFailure("version_conflict", { current: detail(STORE) }); } }],
  ] as const) {
    void current;
    const response = await handler(repository(override))(candidate);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: "promotion_unavailable" });
  }
});

test("CSV export is bounded, formula-safe and returned only as a no-store attachment", async () => {
  const response = await handler(repository({ async exportCodes() { return { rows: [{ code: "VIP_ABC", status: "active" }] }; } }))(request(`/api/promotions/code-batches/${BATCH}/csv`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.equal(response.headers.get("content-disposition"), "attachment; filename=\"promotion-codes.csv\"");
  assert.equal(await response.text(), "code,status\r\nVIP_ABC,active\r\n");
});

test("invalid route, input, private authority and method failures never reach access or repository", async () => {
  let runtimeCalls = 0, repositoryCalls = 0;
  const handle = createPromotionsHttpHandler({
    async resolveRuntime() { runtimeCalls += 1; return runtime(repository({ async list() { repositoryCalls += 1; return { items: [], nextCursor: null }; } })); },
    now: () => new Date(NOW), requestId: () => REQUEST_ID,
  });
  for (const [candidate, status] of [
    [request("/api/promotions/", { method: "GET" }), 404],
    [request("/api/promotions", { method: "DELETE" }), 405],
    [request("/api/promotions?pageSize=20", { method: "GET" }), 400],
    [request("/api/promotions", { method: "GET", headers: { "x-store-id": STORE } }), 400],
    [request("/api/promotions", { method: "POST", body: { name: "Atlas", ruleDocument: RULE, storeId: STORE } }), 400],
  ] as const) {
    const response = await handle(candidate);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    if (status === 405) assert.equal(response.headers.get("allow"), "GET, POST");
  }
  assert.equal(runtimeCalls, 0);
  assert.equal(repositoryCalls, 0);
});

test("route preparation strips known proxy transport while preserving Host and rejecting unknown forwarding authority", async () => {
  const observed: Array<string | null | undefined> = [];
  const selected = repository({ async list() { return { items: [], nextCursor: null }; } });
  const handle = createPromotionsHttpHandler({
    async resolveRuntime() {
      const base = runtime(selected);
      return { ...base, access: { ...base.access, async resolveCredential(input) { observed.push(input.hostname); return { kind: "authenticated", session: {}, tenantContext: tenant() } as never; } } } as ServerPromotionsRuntime;
    }, now: () => new Date(NOW), requestId: () => REQUEST_ID,
  });
  const prepared = preparePromotionRouteRequest(request("/api/promotions", { headers: { host: "admin.merchant.example", "x-forwarded-for": "127.0.0.1", "x-forwarded-host": "internal", "x-forwarded-port": "3400", "x-forwarded-proto": "http", "x-forwarded-server": "proxy" } }));
  assert.equal((await handle(prepared)).status, 200);
  assert.deepEqual(observed, ["admin.merchant.example"]);
  const unknown = preparePromotionRouteRequest(request("/api/promotions", { headers: { "x-forwarded-uri": "/api/promotions" } }));
  assert.equal((await handle(unknown)).status, 400);
});

test("disabled default runtime contains no database construction and route adapters expose the finite methods", () => {
  const defaultSource = readFileSync(new URL("./default.ts", import.meta.url), "utf8");
  assert.match(defaultSource, /resolveDefaultServerPanelAccessRuntime/u);
  assert.doesNotMatch(defaultSource, /new Pool|PostgresPromotionRepository|approved_staging/u);
  const rootRoute = readFileSync(new URL("../../app/api/promotions/route.ts", import.meta.url), "utf8");
  const childRoute = readFileSync(new URL("../../app/api/promotions/[...path]/route.ts", import.meta.url), "utf8");
  assert.match(rootRoute, /export const GET = handle/u);
  assert.match(rootRoute, /export const POST = handle/u);
  assert.match(childRoute, /export const GET = handle/u);
  assert.match(childRoute, /export const POST = handle/u);
  assert.match(childRoute, /export const PATCH = handle/u);
  assert.doesNotMatch(`${rootRoute}\n${childRoute}`, /storeId|tenantId|new Pool/u);
});
