import assert from "node:assert/strict";
import test from "node:test";

import type { PromotionCodeBatch, PromotionDetail, PromotionEvaluatorContext, PromotionRuleDocument, TenantContext } from "@celebix/saas-contracts";
import type { QueryResult } from "pg";

import {
  PostgresPromotionRepository,
  promotionRepositoryError,
  promotionRepositoryErrorCode,
  type PromotionRepository,
} from "./index.ts";
import type { PostgresClientLike, PostgresPoolLike } from "../postgres/pool.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const PRINCIPAL = "10000000-0000-4000-8000-000000000002";
const MEMBERSHIP = "10000000-0000-4000-8000-000000000003";
const PLAN = "10000000-0000-4000-8000-000000000004";
const PROMOTION = "20000000-0000-4000-8000-000000000001";
const OPERATION = "30000000-0000-4000-8000-000000000001";
const BATCH = "40000000-0000-4000-8000-000000000001";
const DESTINATION = "50000000-0000-4000-8000-000000000001";
const TARGET = "60000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-09-05T12:00:00.000Z");

function tenant(role: TenantContext["membership"]["role"] = "store_owner"): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "private-request",
    principal: { id: PRINCIPAL, issuer: "https://id.test/oidc", subject: "private-subject" },
    store: { id: STORE, slug: "atlas", status: "active" },
    membership: { id: MEMBERSHIP, role, status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: PLAN,
      planCode: "growth",
      version: 7,
      status: "active",
      features: ["promotions"],
      limits: { products: 1_000, staff: 10, storageBytes: 1_000_000 },
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
  } as TenantContext;
}

function rule(): PromotionRuleDocument {
  return {
    schemaVersion: 1,
    benefit: { kind: "percentage", percentageBps: 1_500 },
    targets: { mode: "all", include: [], exclude: [] },
    audience: { mode: "everyone" },
    trigger: { kind: "code", codes: ["ATLAS15"] },
    schedule: { timezone: "Europe/Istanbul" },
    limits: { totalUsage: null, perCustomerUsage: null, budgetMinor: null, orderMaximumMinor: null },
    conditions: { minimumBasketMinor: 0, minimumQuantity: 0, minimumProductQuantity: 0 },
    combinationPolicy: { kind: "none" },
    priority: 0,
    marginPolicy: { kind: "warn" },
    progressMessagePolicy: { enabled: false },
  };
}

function detail(overrides: Partial<PromotionDetail> = {}): PromotionDetail {
  return {
    id: PROMOTION,
    version: 1,
    name: "Atlas kampanyası",
    status: "draft",
    ruleDocument: rule(),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function evaluatorContext(): PromotionEvaluatorContext {
  return {
    storeId: STORE, customerId: null, paidOrderCount: 0, customerSegmentIds: [], customerTagIds: [],
    cartLines: [], shippingMethodId: null, paymentMethodId: null, shippingBeforeDiscountMinor: 0,
    currency: "TRY", storeLocalTime: NOW.toISOString(), salesChannel: "storefront", submittedCodes: [], abandonedCart: null,
  };
}

function simulation() {
  return {
    evaluation: {
      eligiblePromotionIds: [], appliedPromotions: [], rejectedPromotions: [], lineEffects: [], shippingEffects: [], gifts: [],
      subtotalBeforeDiscountMinor: 0, lineDiscountTotalMinor: 0, shippingBeforeDiscountMinor: 0,
      shippingDiscountTotalMinor: 0, discountTotalMinor: 0, grandTotalMinor: 0, currency: "TRY",
      progressMessages: [], merchantExplanation: "evaluated",
    },
    mutated: false,
  } as const;
}

function batch(overrides: Partial<PromotionCodeBatch> = {}): PromotionCodeBatch {
  return {
    id: BATCH, promotionId: PROMOTION, version: 1, status: "active", count: 2, prefix: "VIP_", codeLength: 24,
    perCustomerUsage: 1, expiresAt: "2026-09-06T12:00:00.000Z", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function listItem(overrides: Record<string, unknown> = {}) {
  return {
    id: PROMOTION, version: 1, name: "Atlas kampanyası", status: "draft", effectiveStatus: "draft",
    triggerKind: "code", benefitKind: "percentage", audienceMode: "everyone", humanMechanic: "%15 indirim",
    startsAt: null, endsAt: null, usage: { used: 0, budgetMinor: 0 }, financials: [], activeCodeCount: 1,
    createdAt: "2026-09-05T12:00:00.000000Z", updatedAt: "2026-09-05T12:00:00.000000Z", ...overrides,
  };
}

type Row = Readonly<{ outcome: string; result_payload: unknown }>;
type QueryLog = Readonly<{ text: string; values: readonly unknown[] }>;

class Client implements PostgresClientLike {
  readonly queries: QueryLog[] = [];
  readonly releases: unknown[] = [];
  private readonly responder: (text: string, values: readonly unknown[]) => Row | undefined;
  private readonly failCommit: boolean;
  private readonly fail: ((text: string) => boolean) | undefined;
  constructor(
    responder: (text: string, values: readonly unknown[]) => Row | undefined,
    failCommit = false,
    fail?: (text: string) => boolean,
  ) { this.responder = responder; this.failCommit = failCommit; this.fail = fail; }
  async query(text: string, values: unknown[] = []): Promise<QueryResult<Record<string, unknown>>> {
    this.queries.push({ text, values });
    if (text === "COMMIT" && this.failCommit) throw new Error("private wire detail");
    if (this.fail?.(text)) throw new Error("private query detail");
    const selected = this.responder(text, values);
    const rows = selected ? [selected] : [];
    return { rows, rowCount: rows.length } as unknown as QueryResult<Record<string, unknown>>;
  }
  release(destroy?: boolean | Error): void { this.releases.push(destroy); }
}

class Pool implements PostgresPoolLike {
  index = 0;
  readonly clients: readonly Client[];
  constructor(clients: readonly Client[]) { this.clients = clients; }
  async connect(): Promise<PostgresClientLike> {
    const client = this.clients[this.index++];
    if (!client) throw new Error("private pool detail");
    return client;
  }
}

function repository(pool: PostgresPoolLike, audit: string[] = [], generatedId = PROMOTION): PromotionRepository {
  return new PostgresPromotionRepository({
    pool,
    role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 10, statementMs: 20, lockMs: 30, idleTransactionMs: 40 },
    uuid: () => generatedId,
    audit: (event) => { audit.push(event.type); },
  });
}

function authority() { return { tenantContext: tenant(), now: new Date(NOW) }; }

function operationQuery(client: Client, begin: string, terminal: string): QueryLog {
  assert.equal(client.queries[0]?.text, begin);
  assert.deepEqual(client.queries.slice(1, 5).map(({ text }) => text), [
    "SELECT pg_catalog.set_config('statement_timeout', $1, true)",
    "SELECT pg_catalog.set_config('lock_timeout', $1, true)",
    "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)",
    "SET LOCAL ROLE celebix_saas_app",
  ]);
  assert.equal(client.queries.at(-1)?.text, terminal);
  return client.queries[5]!;
}

test("promotion repository uses exact authority-bound read and mutation SQL", async () => {
  const timezoneClient = new Client((text) => text.includes("promotion_store_timezone_v1") ? {
    outcome: "listed", result_payload: { timezone: "Europe/Istanbul" },
  } : undefined);
  assert.equal(await repository(new Pool([timezoneClient])).timezone(authority()), "Europe/Istanbul");
  assert.equal(operationQuery(timezoneClient, "BEGIN READ ONLY", "COMMIT").text, "SELECT outcome,result_payload FROM saas.promotion_store_timezone_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)");

  const originClient = new Client((text) => text.includes("promotion_storefront_origin_v1") ? {
    outcome: "listed", result_payload: { origin: "https://shop.example.test" },
  } : undefined);
  assert.equal(await repository(new Pool([originClient])).storefrontOrigin(authority()), "https://shop.example.test");
  assert.equal(operationQuery(originClient, "BEGIN READ ONLY", "COMMIT").text, "SELECT outcome,result_payload FROM saas.promotion_storefront_origin_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)");

  const noOriginClient = new Client((text) => text.includes("promotion_storefront_origin_v1") ? {
    outcome: "listed", result_payload: { origin: null },
  } : undefined);
  assert.equal(await repository(new Pool([noOriginClient])).storefrontOrigin(authority()), null);

  const listClient = new Client((text) => text.includes("promotion_list_v1") ? {
    outcome: "listed",
    result_payload: { items: [], hasMore: false, snapshotAt: "2026-09-05T12:00:00.000000Z", cursorAnchor: null },
  } : undefined);
  const listed = await repository(new Pool([listClient])).list({
    ...authority(), pageSize: 25, effectiveStatuses: [], triggerKinds: [], benefitKinds: [], audienceModes: [],
  });
  assert.deepEqual(listed, { items: [], nextCursor: null });
  const listQuery = operationQuery(listClient, "BEGIN READ ONLY", "COMMIT");
  assert.equal(listQuery.text, "SELECT outcome,result_payload FROM saas.promotion_list_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::text,$9::text[],$10::text[],$11::text[],$12::text[],$13::timestamptz,$14::timestamptz,$15::integer,$16::timestamptz,$17::timestamptz,$18::uuid)");
  assert.deepEqual(listQuery.values, [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 7, NOW, null, [], [], [], [], null, null, 25, null, null, null]);

  const createClient = new Client((text, values) => text.includes("promotion_create_v1") ? {
    outcome: "created",
    result_payload: detail({ id: String(values[9]) }),
  } : undefined);
  const created = await repository(new Pool([createClient])).create({
    ...authority(), operationId: OPERATION, name: "Atlas kampanyası", ruleDocument: rule(),
  });
  assert.deepEqual(created, { promotion: detail(), replayed: false });
  const createQuery = operationQuery(createClient, "BEGIN ISOLATION LEVEL READ COMMITTED", "COMMIT");
  assert.equal(createQuery.text, "SELECT outcome,result_payload FROM saas.promotion_create_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::text,$12::jsonb)");
  assert.deepEqual(createQuery.values?.slice(0, 8), [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 7, NOW, OPERATION]);
  assert.match(String(createQuery.values?.[8]), /^[a-f0-9]{64}$/);
  assert.equal(createQuery.values?.[9], PROMOTION);
  assert.equal(createQuery.values?.[10], "Atlas kampanyası");
  assert.deepEqual(JSON.parse(String(createQuery.values?.[11])), rule());
  assert.equal(createQuery.values?.some((value) => value === "private-request" || value === "private-subject"), false);
});

test("promotion repository retains the validated role and denies mutation classes before checkout", async () => {
  const editorRead = new Client((text) => text.includes("promotion_detail_v1") ? {
    outcome: "found", result_payload: detail(),
  } : undefined);
  const read = await repository(new Pool([editorRead])).detail({
    tenantContext: tenant("editor"), now: new Date(NOW), promotionId: PROMOTION,
  });
  assert.equal(read.id, PROMOTION);

  for (const [role, method] of [
    ["analyst", "create"],
    ["analyst", "archive"],
  ] as const) {
    const empty = new Pool([]);
    const repo = repository(empty);
    const call = method === "create"
      ? () => repo.create({ tenantContext: tenant(role), now: new Date(NOW), operationId: OPERATION, name: "Atlas", ruleDocument: rule() })
      : () => repo.archive({ tenantContext: tenant(role), now: new Date(NOW), operationId: OPERATION, promotionId: PROMOTION, expectedVersion: 1 });
    await assert.rejects(call, (error: unknown) => promotionRepositoryErrorCode(error) === "membership_denied");
    assert.equal(empty.index, 0, `${role}:${method}`);
  }
});

test("promotion repository rejects browser authority and malformed inputs before pool checkout", async () => {
  const empty = new Pool([]);
  await assert.rejects(
    () => repository(empty).create({ ...authority(), operationId: OPERATION, name: "Atlas", ruleDocument: rule(), storeId: STORE } as never),
    (error: unknown) => promotionRepositoryErrorCode(error) === "invalid_input",
  );
  await assert.rejects(
    () => repository(empty).create({ ...authority(), operationId: "not-a-uuid", name: "Atlas", ruleDocument: rule() }),
    (error: unknown) => promotionRepositoryErrorCode(error) === "invalid_input",
  );
  await assert.rejects(
    () => repository(empty).simulate({ ...authority(), promotionId: PROMOTION, expectedVersion: 1, name: "Atlas", ruleDocument: rule(), context: { ...evaluatorContext(), salesChannel: "online" } }),
    (error: unknown) => promotionRepositoryErrorCode(error) === "invalid_input",
  );
  assert.equal(empty.index, 0);
});

test("promotion mutations recover once in a fresh transaction after unknown COMMIT", async () => {
  const audit: string[] = [];
  const writer = new Client((text) => text.includes("promotion_lifecycle_v1") ? {
    outcome: "updated",
    result_payload: detail({ status: "active", version: 2 }),
  } : undefined, true);
  const recovery = new Client((text) => text.includes("promotion_recover_operation_v1") ? {
    outcome: "operation_replayed",
    result_payload: detail({ status: "active", version: 2 }),
  } : undefined);
  const pool = new Pool([writer, recovery]);
  const result = await repository(pool, audit).publish({
    ...authority(), operationId: OPERATION, promotionId: PROMOTION, expectedVersion: 1, nextStatus: "active",
  });
  assert.deepEqual(result, { promotion: detail({ status: "active", version: 2 }), replayed: true });
  assert.deepEqual(audit, ["promotion_commit_unknown"]);
  assert.deepEqual(writer.releases, [true]);
  assert.equal(writer.queries.filter(({ text }) => text.includes("promotion_lifecycle_v1")).length, 1);
  const recoveryQuery = operationQuery(recovery, "BEGIN ISOLATION LEVEL READ COMMITTED", "COMMIT");
  assert.equal(recoveryQuery.text, "SELECT outcome,result_payload FROM saas.promotion_recover_operation_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::text)");
  assert.equal(recoveryQuery.values?.[8], "lifecycle");
  assert.match(String(recoveryQuery.values?.[9]), /^[a-f0-9]{64}$/);
});

test("promotion repository maps finite database outcomes to non-forgeable safe errors and rolls back", async () => {
  for (const [outcome, code] of [
    ["not_found", "resource_not_found"],
    ["operation_mismatch", "idempotency_mismatch"],
    ["private_driver_detail", "unavailable"],
  ] as const) {
    const client = new Client((text) => text.includes("promotion_lifecycle_v1") ? { outcome, result_payload: null } : undefined);
    await assert.rejects(
      () => repository(new Pool([client])).pause({ ...authority(), operationId: OPERATION, promotionId: PROMOTION, expectedVersion: 1 }),
      (error: unknown) => promotionRepositoryErrorCode(error) === code && error instanceof Error && !error.message.includes("private"),
    );
    operationQuery(client, "BEGIN ISOLATION LEVEL READ COMMITTED", "ROLLBACK");
  }

  const conflict = new Client((text) => text.includes("promotion_simulate_v1") ? { outcome: "conflict", result_payload: null } : undefined);
  await assert.rejects(
    () => repository(new Pool([conflict])).simulate({ ...authority(), promotionId: PROMOTION, expectedVersion: null, name: "Atlas", ruleDocument: rule(), context: evaluatorContext() }),
    (error: unknown) => promotionRepositoryErrorCode(error) === "conflict",
  );
  operationQuery(conflict, "BEGIN READ ONLY", "ROLLBACK");

  const activeBatch = new Client((text) => text.includes("promotion_update_v1") ? { outcome: "active_code_batches", result_payload: null } : undefined);
  await assert.rejects(
    () => repository(new Pool([activeBatch])).update({ ...authority(), operationId: OPERATION, promotionId: PROMOTION, expectedVersion: 1, name: "Atlas", ruleDocument: rule() }),
    (error: unknown) => promotionRepositoryErrorCode(error) === "active_code_batches",
  );
  operationQuery(activeBatch, "BEGIN ISOLATION LEVEL READ COMMITTED", "ROLLBACK");
});

test("promotion repository preserves only strictly parsed version and publish-blocked details", async () => {
  const current = detail({ version: 7 });
  const versionClient = new Client((text) => text.includes("promotion_update_v1") ? { outcome: "version_conflict", result_payload: current } : undefined);
  await assert.rejects(
    () => repository(new Pool([versionClient])).update({ ...authority(), operationId: OPERATION, promotionId: PROMOTION, expectedVersion: 1, name: "Atlas", ruleDocument: rule() }),
    (error: unknown) => {
      const safe = promotionRepositoryError(error);
      return safe?.code === "version_conflict" && "current" in safe && safe.current.id === PROMOTION && safe.current.version === 7;
    },
  );

  const readiness = { blocking: true, findings: [{ code: "schedule_ended", severity: "blocking", relatedPromotionId: null, relatedPromotionName: null }] } as const;
  const publishClient = new Client((text) => text.includes("promotion_lifecycle_v1") ? { outcome: "publish_blocked", result_payload: readiness } : undefined);
  await assert.rejects(
    () => repository(new Pool([publishClient])).publish({ ...authority(), operationId: OPERATION, promotionId: PROMOTION, expectedVersion: 1, nextStatus: "active" }),
    (error: unknown) => {
      const safe = promotionRepositoryError(error);
      return safe?.code === "publish_blocked" && "readiness" in safe && safe.readiness.blocking === true;
    },
  );

  const batchClient = new Client((text) => text.includes("promotion_code_batch_status_v1") ? { outcome: "version_conflict", result_payload: batch({ version: 9 }) } : undefined);
  await assert.rejects(
    () => repository(new Pool([batchClient])).updateCodeBatchStatus({ ...authority(), operationId: OPERATION, batchId: BATCH, expectedVersion: 1, nextStatus: "paused" }),
    (error: unknown) => {
      const safe = promotionRepositoryError(error);
      return safe?.code === "version_conflict" && "current" in safe && "promotionId" in safe.current && safe.current.id === BATCH;
    },
  );

  const corrupt = new Client((text) => text.includes("promotion_update_v1") ? { outcome: "version_conflict", result_payload: { private: "detail" } } : undefined);
  await assert.rejects(
    () => repository(new Pool([corrupt])).update({ ...authority(), operationId: OPERATION, promotionId: PROMOTION, expectedVersion: 1, name: "Atlas", ruleDocument: rule() }),
    (error: unknown) => promotionRepositoryErrorCode(error) === "unavailable",
  );
});

test("promotion repository rejects contradictory and accessor-backed database projections before COMMIT", async () => {
  const wrongId = new Client((text) => text.includes("promotion_detail_v1") ? {
    outcome: "found", result_payload: detail({ id: "20000000-0000-4000-8000-000000000099" }),
  } : undefined);
  await assert.rejects(
    () => repository(new Pool([wrongId])).detail({ ...authority(), promotionId: PROMOTION }),
    (error: unknown) => promotionRepositoryErrorCode(error) === "unavailable",
  );
  operationQuery(wrongId, "BEGIN READ ONLY", "ROLLBACK");

  let reads = 0;
  const hostile = { outcome: "found" } as Record<string, unknown>;
  Object.defineProperty(hostile, "result_payload", { enumerable: true, get() { reads += 1; return detail(); } });
  const client = new Client((text) => text.includes("promotion_detail_v1") ? hostile as Row : undefined);
  await assert.rejects(
    () => repository(new Pool([client])).detail({ ...authority(), promotionId: PROMOTION }),
    (error: unknown) => promotionRepositoryErrorCode(error) === "unavailable",
  );
  assert.equal(reads, 0);
  operationQuery(client, "BEGIN READ ONLY", "ROLLBACK");

  class ExoticListEnvelope {
    items: unknown[] = [];
    hasMore = false;
    snapshotAt = "2026-09-05T12:00:00.000000Z";
    cursorAnchor = null;
  }
  const exotic = new Client((text) => text.includes("promotion_list_v1") ? { outcome: "listed", result_payload: new ExoticListEnvelope() } : undefined);
  await assert.rejects(
    () => repository(new Pool([exotic])).list({ ...authority(), pageSize: 1 }),
    (error: unknown) => promotionRepositoryErrorCode(error) === "unavailable",
  );
  operationQuery(exotic, "BEGIN READ ONLY", "ROLLBACK");
});

test("each RPC rejects globally known outcomes that its SQL contract cannot emit", async () => {
  for (const [label, call, sqlName, outcome] of [
    ["detail/code_conflict", (repo: PromotionRepository) => repo.detail({ ...authority(), promotionId: PROMOTION }), "promotion_detail_v1", "code_conflict"],
    ["detail/feature_unavailable", (repo: PromotionRepository) => repo.detail({ ...authority(), promotionId: PROMOTION }), "promotion_detail_v1", "feature_unavailable"],
    ["list/invalid_transition", (repo: PromotionRepository) => repo.list({ ...authority(), pageSize: 1 }), "promotion_list_v1", "invalid_transition"],
    ["duplicate/publish_blocked", (repo: PromotionRepository) => repo.duplicate({ ...authority(), operationId: OPERATION, promotionId: PROMOTION, expectedVersion: 1, name: "Kopya", codes: ["VIP"] }), "promotion_duplicate_v1", "publish_blocked"],
    ["margin/publish_blocked", (repo: PromotionRepository) => repo.margin({ ...authority(), ruleDocument: rule() }), "promotion_margin_check_v1", "publish_blocked"],
  ] as const) {
    const client = new Client((text) => text.includes(sqlName) ? { outcome, result_payload: outcome === "publish_blocked" ? { blocking: false, findings: [] } : null } : undefined);
    await assert.rejects(() => call(repository(new Pool([client]))), (error: unknown) => promotionRepositoryErrorCode(error) === "unavailable", label);
  }
});

test("promotion repository calls the exact duplicate, simulator and check overloads", async () => {
  const duplicateClient = new Client((text) => text.includes("promotion_duplicate_v1") ? {
    outcome: "created", result_payload: detail({ id: DESTINATION, name: "Kopya" }),
  } : undefined);
  assert.deepEqual(await repository(new Pool([duplicateClient]), [], DESTINATION).duplicate({
    ...authority(), operationId: OPERATION, promotionId: PROMOTION, expectedVersion: 1, name: "Kopya", codes: ["VIP2", "VIP1"],
  }), { promotion: detail({ id: DESTINATION, name: "Kopya" }), replayed: false });
  const duplicateQuery = operationQuery(duplicateClient, "BEGIN ISOLATION LEVEL READ COMMITTED", "COMMIT");
  assert.equal(duplicateQuery.text, "SELECT outcome,result_payload FROM saas.promotion_duplicate_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::uuid,$12::bigint,$13::text,$14::text[])");
  assert.deepEqual(duplicateQuery.values?.slice(9), [DESTINATION, PROMOTION, 1, "Kopya", ["VIP1", "VIP2"]]);

  const simulateClient = new Client((text) => text.includes("promotion_simulate_v1") ? { outcome: "simulated", result_payload: simulation() } : undefined);
  assert.deepEqual(await repository(new Pool([simulateClient])).simulate({
    ...authority(), promotionId: PROMOTION, expectedVersion: 1, name: "Taslak", ruleDocument: rule(), context: evaluatorContext(),
  }), simulation());
  const simulateQuery = operationQuery(simulateClient, "BEGIN READ ONLY", "COMMIT");
  assert.equal(simulateQuery.text, "SELECT outcome,result_payload FROM saas.promotion_simulate_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::jsonb,$9::jsonb)");
  assert.deepEqual(JSON.parse(String(simulateQuery.values?.[7])), { id: PROMOTION, expectedVersion: 1, name: "Taslak", ruleDocument: rule() });
  assert.deepEqual(JSON.parse(String(simulateQuery.values?.[8])), evaluatorContext());

  for (const [method, sqlName, payload] of [
    ["conflicts", "promotion_conflicts_v1", { blocking: false, findings: [] }],
    ["margin", "promotion_margin_check_v1", { blocking: false, status: "clear", summary: { evaluatedVariantCount: 0, knownCostVariantCount: 0, unknownCostVariantCount: 0, atRiskVariantCount: 0 }, findings: [] }],
  ] as const) {
    const client = new Client((text) => text.includes(sqlName) ? { outcome: "checked", result_payload: payload } : undefined);
    const value = await repository(new Pool([client]))[method]({ ...authority(), promotionId: PROMOTION, expectedVersion: 1, ruleDocument: rule() });
    assert.deepEqual(value, payload);
    const query = operationQuery(client, "BEGIN READ ONLY", "COMMIT");
    assert.match(query.text, new RegExp(`${sqlName.replaceAll("_", "_")}\\(`));
    assert.deepEqual(query.values?.slice(7, 9), [PROMOTION, 1]);
    assert.deepEqual(JSON.parse(String(query.values?.[9])), rule());
  }
});

test("promotion repository calls exact picker, batch, CSV, analytics and legacy overloads", async () => {
  const picker = { kind: "product", id: TARGET, label: "Atlas ürün", status: "active" } as const;
  const pickerClient = new Client((text) => text.includes("promotion_picker_list_v1") ? {
    outcome: "listed", result_payload: { items: [picker], hasMore: false, cursorAnchor: null },
  } : undefined);
  assert.deepEqual(await repository(new Pool([pickerClient])).listTargets({ ...authority(), kind: "product", pageSize: 20, search: "Atlas" }), { items: [picker], nextCursor: null });
  const pickerQuery = operationQuery(pickerClient, "BEGIN READ ONLY", "COMMIT");
  assert.equal(pickerQuery.text, "SELECT outcome,result_payload FROM saas.promotion_picker_list_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::text,$9::text,$10::integer,$11::text,$12::uuid)");
  assert.deepEqual(pickerQuery.values?.slice(7), ["product", "Atlas", 20, null, null]);

  const resolveClient = new Client((text) => text.includes("promotion_picker_resolve_v1") ? { outcome: "resolved", result_payload: { items: [picker] } } : undefined);
  assert.deepEqual(await repository(new Pool([resolveClient])).resolveTargets({ ...authority(), kind: "product", ids: [TARGET] }), [picker]);
  assert.deepEqual(operationQuery(resolveClient, "BEGIN READ ONLY", "COMMIT").values?.slice(7), ["product", [TARGET]]);

  const createBatchClient = new Client((text) => text.includes("promotion_create_code_batch_v1") ? { outcome: "created", result_payload: batch() } : undefined);
  assert.deepEqual(await repository(new Pool([createBatchClient]), [], BATCH).createCodeBatch({
    ...authority(), operationId: OPERATION, promotionId: PROMOTION, count: 2, prefix: "VIP_", codeLength: 24,
    perCustomerUsage: 1, expiresAt: "2026-09-06T12:00:00.000Z",
  }), { batch: batch(), replayed: false });
  const createBatchQuery = operationQuery(createBatchClient, "BEGIN ISOLATION LEVEL READ COMMITTED", "COMMIT");
  assert.equal(createBatchQuery.text, "SELECT outcome,result_payload FROM saas.promotion_create_code_batch_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::uuid,$12::integer,$13::text,$14::integer,$15::integer,$16::timestamptz)");
  assert.deepEqual(createBatchQuery.values?.slice(9), [BATCH, PROMOTION, 2, "VIP_", 24, 1, new Date("2026-09-06T12:00:00.000Z")]);

  const statusClient = new Client((text) => text.includes("promotion_code_batch_status_v1") ? { outcome: "updated", result_payload: batch({ version: 2, status: "paused" }) } : undefined);
  assert.deepEqual(await repository(new Pool([statusClient])).updateCodeBatchStatus({
    ...authority(), operationId: OPERATION, batchId: BATCH, expectedVersion: 1, nextStatus: "paused",
  }), { batch: batch({ version: 2, status: "paused" }), replayed: false });
  const statusQuery = operationQuery(statusClient, "BEGIN ISOLATION LEVEL READ COMMITTED", "COMMIT");
  assert.equal(statusQuery.text, "SELECT outcome,result_payload FROM saas.promotion_code_batch_status_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::text)");
  assert.deepEqual(statusQuery.values?.slice(9), [BATCH, 1, "paused"]);

  const pageClient = new Client((text) => text.includes("promotion_code_batch_list_v1") ? { outcome: "listed", result_payload: { items: [], hasMore: false, snapshotAt: NOW.toISOString(), cursorAnchor: null } } : undefined);
  assert.deepEqual(await repository(new Pool([pageClient])).listCodeBatches({ ...authority(), promotionId: PROMOTION, pageSize: 25 }), { items: [], nextCursor: null });
  assert.equal(operationQuery(pageClient, "BEGIN READ ONLY", "COMMIT").text, "SELECT outcome,result_payload FROM saas.promotion_code_batch_list_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::integer,$10::timestamptz,$11::timestamptz,$12::uuid)");

  const csvClient = new Client((text) => text.includes("promotion_codes_csv_v1") ? { outcome: "exported", result_payload: { rows: [{ code: "VIP1", status: "active" }] } } : undefined);
  assert.deepEqual(await repository(new Pool([csvClient])).exportCodes({ ...authority(), batchId: BATCH }), { rows: [{ code: "VIP1", status: "active" }] });
  assert.deepEqual(operationQuery(csvClient, "BEGIN READ ONLY", "COMMIT").values?.slice(7), [BATCH]);

  const analyticsClient = new Client((text) => text.includes("promotion_analytics_v1") ? { outcome: "listed", result_payload: { items: [{ currency: "TRY", redemptions: 1, discountMinor: 10, revenueMinor: 90, conversionBps: 1_000 }] } } : undefined);
  assert.equal((await repository(new Pool([analyticsClient])).analytics({ ...authority(), promotionId: PROMOTION })).items[0]?.currency, "TRY");
  assert.deepEqual(operationQuery(analyticsClient, "BEGIN READ ONLY", "COMMIT").values?.slice(7), [PROMOTION]);

  const legacyClient = new Client((text) => text.includes("promotion_legacy_list_v1") ? { outcome: "listed", result_payload: { items: [{ legacyRecordId: TARGET, promotionId: null, reason: "invalid_code" }], hasMore: false, snapshotAt: NOW.toISOString(), cursorAnchor: null } } : undefined);
  assert.deepEqual(await repository(new Pool([legacyClient])).listLegacy({ ...authority(), pageSize: 10 }), { items: [{ legacyRecordId: TARGET, promotionId: null, reason: "invalid_code" }], nextCursor: null });
  assert.equal(operationQuery(legacyClient, "BEGIN READ ONLY", "COMMIT").text, "SELECT outcome,result_payload FROM saas.promotion_legacy_list_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::integer,$9::timestamptz,$10::timestamptz,$11::uuid)");

  const legacyResolveClient = new Client((text) => text.includes("promotion_legacy_resolve_v1") ? { outcome: "resolved", result_payload: { legacyRecordId: TARGET, promotionId: PROMOTION, reason: "adopted" } } : undefined);
  assert.deepEqual(await repository(new Pool([legacyResolveClient])).resolveLegacy({ ...authority(), legacyRecordId: TARGET }), { legacyRecordId: TARGET, promotionId: PROMOTION, reason: "adopted" });
  assert.deepEqual(operationQuery(legacyResolveClient, "BEGIN READ ONLY", "COMMIT").values?.slice(7), [TARGET]);
});

test("promotion list cursors bind the exact query and strict database snapshot", async () => {
  const firstClient = new Client((text) => text.includes("promotion_list_v1") ? {
    outcome: "listed",
    result_payload: {
      items: [listItem()], hasMore: true, snapshotAt: "2026-09-05T12:00:00.000000Z",
      cursorAnchor: { createdAt: "2026-09-05T12:00:00.000000Z", id: PROMOTION },
    },
  } : undefined);
  const first = await repository(new Pool([firstClient])).list({ ...authority(), pageSize: 1, search: "Atlas" });
  assert.match(first.nextCursor ?? "", /^[A-Za-z0-9_-]{1,2048}$/);

  const nextClient = new Client((text) => text.includes("promotion_list_v1") ? {
    outcome: "listed", result_payload: { items: [], hasMore: false, snapshotAt: "2026-09-05T12:00:00.000000Z", cursorAnchor: null },
  } : undefined);
  assert.deepEqual(await repository(new Pool([nextClient])).list({ ...authority(), pageSize: 1, search: "Atlas", cursor: first.nextCursor! }), { items: [], nextCursor: null });
  assert.deepEqual(operationQuery(nextClient, "BEGIN READ ONLY", "COMMIT").values?.slice(15), ["2026-09-05T12:00:00.000000Z", "2026-09-05T12:00:00.000000Z", PROMOTION]);

  for (const changed of [
    { ...authority(), pageSize: 2, search: "Atlas", cursor: first.nextCursor! },
    { ...authority(), pageSize: 1, search: "atlas", cursor: first.nextCursor! },
    { ...authority(), pageSize: 1, search: "Atlas", cursor: `${first.nextCursor!.slice(0, -1)}A` },
  ]) {
    const empty = new Pool([]);
    await assert.rejects(() => repository(empty).list(changed), (error: unknown) => promotionRepositoryErrorCode(error) === "invalid_input");
    assert.equal(empty.index, 0);
  }
});

test("promotion list projections reject corrupt ordering, aggregates, timestamps and snapshots", async () => {
  const corruptItems = [
    listItem({ createdAt: "2026-02-30T12:00:00.000000Z", updatedAt: "2026-02-30T12:00:00.000000Z" }),
    listItem({ financials: [{ currency: "USD", redemptions: 1, discountMinor: 1, revenueMinor: 1 }, { currency: "TRY", redemptions: 1, discountMinor: 1, revenueMinor: 1 }] }),
    listItem({ triggerKind: "automatic", activeCodeCount: 1 }),
    listItem({ createdAt: "2026-09-05T12:00:00.001000Z", updatedAt: "2026-09-05T12:00:00.001000Z" }),
  ];
  for (const item of corruptItems) {
    const client = new Client((text) => text.includes("promotion_list_v1") ? { outcome: "listed", result_payload: { items: [item], hasMore: false, snapshotAt: "2026-09-05T12:00:00.000000Z", cursorAnchor: null } } : undefined);
    await assert.rejects(() => repository(new Pool([client])).list({ ...authority(), pageSize: 10 }), (error: unknown) => promotionRepositoryErrorCode(error) === "unavailable");
  }
  for (const snapshotAt of ["2026-09-05T11:59:59.999999Z", "2026-09-05T12:00:00.001000Z"]) {
    const client = new Client((text) => text.includes("promotion_list_v1") ? { outcome: "listed", result_payload: { items: [], hasMore: false, snapshotAt, cursorAnchor: null } } : undefined);
    await assert.rejects(() => repository(new Pool([client])).list({ ...authority(), pageSize: 10 }), (error: unknown) => promotionRepositoryErrorCode(error) === "unavailable");
  }
});

test("interactive rule documents stop at 100 direct codes and reject invalid Unicode before checkout", async () => {
  const tooMany = { ...rule(), trigger: { kind: "code" as const, codes: Array.from({ length: 101 }, (_, index) => `C${String(index).padStart(3, "0")}`) } };
  for (const request of [
    { ...authority(), operationId: OPERATION, name: "Atlas", ruleDocument: tooMany },
    { ...authority(), operationId: OPERATION, name: "Atlas\ud800", ruleDocument: rule() },
  ]) {
    const empty = new Pool([]);
    await assert.rejects(() => repository(empty).create(request), (error: unknown) => promotionRepositoryErrorCode(error) === "invalid_input");
    assert.equal(empty.index, 0);
  }
  const codes100 = { ...rule(), trigger: { kind: "code" as const, codes: Array.from({ length: 100 }, (_, index) => `C${String(index).padStart(3, "0")}`) } };
  const client = new Client((text, values) => text.includes("promotion_create_v1") ? { outcome: "created", result_payload: detail({ id: String(values[9]), ruleDocument: codes100 }) } : undefined);
  assert.equal((await repository(new Pool([client])).create({ ...authority(), operationId: OPERATION, name: "Atlas", ruleDocument: codes100 })).promotion.ruleDocument.trigger.kind, "code");
});

test("duplicate preserves the frozen ten-thousand replacement-code contract", async () => {
  const codes = Array.from({ length: 10_000 }, (_, index) => `C${String(index).padStart(5, "0")}${"X".repeat(58)}`);
  const client = new Client((text) => text.includes("promotion_duplicate_v1") ? { outcome: "created", result_payload: detail({ id: DESTINATION, name: "Toplu kopya" }) } : undefined);
  const result = await repository(new Pool([client]), [], DESTINATION).duplicate({
    ...authority(), operationId: OPERATION, promotionId: PROMOTION, expectedVersion: 1, name: "Toplu kopya", codes,
  });
  assert.equal(result.promotion.id, DESTINATION);
  assert.equal((operationQuery(client, "BEGIN ISOLATION LEVEL READ COMMITTED", "COMMIT").values?.[13] as string[]).length, 10_000);
});

test("picker cursors preserve opaque PostgreSQL Unicode sort keys", async () => {
  const item = { kind: "product", id: TARGET, label: "İNDİRİM", status: "active" } as const;
  const client = new Client((text) => text.includes("promotion_picker_list_v1") ? {
    outcome: "listed", result_payload: { items: [item], hasMore: true, cursorAnchor: { sortKey: "indirim", id: TARGET } },
  } : undefined);
  const first = await repository(new Pool([client])).listTargets({ ...authority(), kind: "product", pageSize: 1 });
  assert.equal(first.items[0]?.label, "İNDİRİM");
  assert.ok(first.nextCursor);
});

test("margin unknown projections and paged batch or legacy envelopes remain exact", async () => {
  const unknownMargin = {
    blocking: false, status: "unknown",
    summary: { evaluatedVariantCount: 2, knownCostVariantCount: 1, unknownCostVariantCount: 1, atRiskVariantCount: 0 },
    findings: [{ code: "cost_unknown", severity: "warning", count: 1, sampleVariantIds: [TARGET] }],
  } as const;
  const marginClient = new Client((text) => text.includes("promotion_margin_check_v1") ? { outcome: "checked", result_payload: unknownMargin } : undefined);
  assert.deepEqual(await repository(new Pool([marginClient])).margin({ ...authority(), ruleDocument: rule() }), unknownMargin);

  const badBatch = new Client((text) => text.includes("promotion_code_batch_list_v1") ? { outcome: "listed", result_payload: { items: [], hasMore: true, snapshotAt: NOW.toISOString(), cursorAnchor: { createdAt: NOW.toISOString(), id: BATCH } } } : undefined);
  await assert.rejects(() => repository(new Pool([badBatch])).listCodeBatches({ ...authority(), promotionId: PROMOTION, pageSize: 2 }), (error: unknown) => promotionRepositoryErrorCode(error) === "unavailable");

  const badLegacy = new Client((text) => text.includes("promotion_legacy_list_v1") ? { outcome: "listed", result_payload: { items: [{ legacyRecordId: TARGET, promotionId: null, reason: "invalid_code" }, { legacyRecordId: TARGET, promotionId: null, reason: "invalid_code" }], hasMore: true, snapshotAt: NOW.toISOString(), cursorAnchor: { createdAt: NOW.toISOString(), id: TARGET } } } : undefined);
  await assert.rejects(() => repository(new Pool([badLegacy])).listLegacy({ ...authority(), pageSize: 2 }), (error: unknown) => promotionRepositoryErrorCode(error) === "unavailable");
});

test("unknown-commit recovery destroys every uncertain recovery client without retrying mutation", async () => {
  for (const [label, recovery] of [
    ["begin", new Client(() => undefined, false, (text) => text.startsWith("BEGIN"))],
    ["configure", new Client(() => undefined, false, (text) => text.includes("statement_timeout"))],
    ["query", new Client(() => undefined, false, (text) => text.includes("promotion_recover_operation_v1"))],
    ["not_found", new Client((text) => text.includes("promotion_recover_operation_v1") ? { outcome: "not_found", result_payload: null } : undefined)],
    ["projection", new Client((text) => text.includes("promotion_recover_operation_v1") ? { outcome: "operation_replayed", result_payload: { invalid: true } } : undefined)],
    ["commit", new Client((text) => text.includes("promotion_recover_operation_v1") ? { outcome: "operation_replayed", result_payload: detail({ status: "active", version: 2 }) } : undefined, true)],
    ["rollback", new Client(() => undefined, false, (text) => text.includes("promotion_recover_operation_v1") || text === "ROLLBACK")],
  ] as const) {
    const writer = new Client((text) => text.includes("promotion_lifecycle_v1") ? { outcome: "updated", result_payload: detail({ status: "active", version: 2 }) } : undefined, true);
    const pool = new Pool([writer, recovery]);
    await assert.rejects(
      () => repository(pool).publish({ ...authority(), operationId: OPERATION, promotionId: PROMOTION, expectedVersion: 1, nextStatus: "active" }),
      (error: unknown) => promotionRepositoryErrorCode(error) === "unavailable",
      label,
    );
    assert.equal(writer.queries.filter(({ text }) => text.includes("promotion_lifecycle_v1")).length, 1, label);
    assert.deepEqual(writer.releases, [true], label);
    assert.deepEqual(recovery.releases, [true], label);
  }
});

test("transaction setup and rollback failures have explicit reusable versus destroyed client outcomes", async () => {
  const begin = new Client(() => undefined, false, (text) => text === "BEGIN READ ONLY");
  await assert.rejects(() => repository(new Pool([begin])).detail({ ...authority(), promotionId: PROMOTION }), (error: unknown) => promotionRepositoryErrorCode(error) === "unavailable");
  assert.deepEqual(begin.releases, [true]);

  const rpc = new Client(() => undefined, false, (text) => text.includes("promotion_detail_v1"));
  await assert.rejects(() => repository(new Pool([rpc])).detail({ ...authority(), promotionId: PROMOTION }), (error: unknown) => promotionRepositoryErrorCode(error) === "unavailable");
  assert.deepEqual(rpc.releases, [undefined]);
  assert.equal(rpc.queries.at(-1)?.text, "ROLLBACK");

  const rollback = new Client(() => undefined, false, (text) => text.includes("promotion_detail_v1") || text === "ROLLBACK");
  await assert.rejects(() => repository(new Pool([rollback])).detail({ ...authority(), promotionId: PROMOTION }), (error: unknown) => promotionRepositoryErrorCode(error) === "unavailable");
  assert.deepEqual(rollback.releases, [true]);

  const readCommit = new Client((text) => text.includes("promotion_detail_v1") ? { outcome: "found", result_payload: detail() } : undefined, true);
  await assert.rejects(() => repository(new Pool([readCommit])).detail({ ...authority(), promotionId: PROMOTION }), (error: unknown) => promotionRepositoryErrorCode(error) === "unavailable");
  assert.deepEqual(readCommit.releases, [true]);
});
