import assert from "node:assert/strict";
import test from "node:test";

import { PromotionApiClient, PromotionListLoader, PromotionTargetPageLoader, promotionErrorMessage } from "./client.ts";
import { createPromotionDraft, promotionRuleDocument, updatePromotionDraft, type PromotionTarget } from "./model.ts";

const PROMOTION_ID = "00000000-0000-4000-8000-000000000001";
const SECOND_PROMOTION_ID = "00000000-0000-4000-8000-000000000002";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
}

test("invokes browser-style fetch without using the API client as its receiver", async () => {
  const browserFetch = function(this: unknown, _input: RequestInfo | URL, _init?: RequestInit) {
    if (this !== undefined) return Promise.reject(new TypeError("Illegal invocation"));
    return Promise.resolve(response({ items: [], nextCursor: null }));
  };
  const client = new PromotionApiClient(browserFetch);

  assert.deepEqual(await client.list({}), { items: [], nextCursor: null });
});

test("sends server-side search filters and a global cursor with no-store requests", async () => {
  const requests: Request[] = [];
  const client = new PromotionApiClient(async (input, init) => {
    requests.push(new Request(input, init));
    return response({ items: [], nextCursor: null });
  }, () => "00000000-0000-4000-8000-000000000099");

  await client.list({ cursor: "next-page", search: "bahar", effectiveStatuses: ["active", "draft"], scheduleFrom: "2026-09-01T00:00:00.000Z", scheduleTo: "2026-10-01T00:00:00.000Z" });

  const request = requests[0]!;
  const url = new URL(request.url);
  assert.equal(url.pathname, "/api/promotions");
  assert.equal(url.searchParams.get("cursor"), "next-page");
  assert.equal(url.searchParams.get("search"), "bahar");
  assert.equal(url.searchParams.get("effectiveStatuses"), "active,draft");
  assert.equal(url.searchParams.get("limit"), "25");
  assert.equal(url.searchParams.get("scheduleFrom"), "2026-09-01T00:00:00.000Z");
  assert.equal(url.searchParams.get("scheduleTo"), "2026-10-01T00:00:00.000Z");
  assert.equal(request.cache, "no-store");
  assert.equal(request.credentials, "same-origin");
});

test("accepts an exact empty target page without calling the non-empty resolve parser", async () => {
  const client = new PromotionApiClient(async () => response({ items: [], nextCursor: null }));
  assert.deepEqual(await client.targets("product", {}), { items: [], nextCursor: null });
});

test("duplicates through the dedicated durable endpoint without reusing client-side promotion authority", async () => {
  const requests: Request[] = [];
  const source = { id: SECOND_PROMOTION_ID, version: 1, name: "Kopya", status: "draft", ruleDocument: promotionRuleDocument(createPromotionDraft("free_shipping")), createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" } as const;
  const client = new PromotionApiClient(async (input, init) => { requests.push(new Request(input, init)); return response({ promotion: source, replayed: false }, 201); }, () => "00000000-0000-4000-8000-000000000099");
  const result = await client.duplicate(PROMOTION_ID, 7, "Kopya");
  assert.equal(result.kind, "saved");
  assert.equal(result.kind === "saved" ? result.promotion.id : null, SECOND_PROMOTION_ID);
  assert.equal(new URL(requests[0]!.url).pathname, `/api/promotions/${PROMOTION_ID}/duplicate`);
  assert.deepEqual(await requests[0]!.json(), { expectedVersion: 7, name: "Kopya", codes: [] });
  assert.equal(requests[0]!.headers.get("idempotency-key"), "00000000-0000-4000-8000-000000000099");
});

test("suppresses a stale list response when a newer filter request finishes first", async () => {
  let resolveOlder!: (result: Response) => void;
  const client = new PromotionApiClient((input) => {
    const search = new URL(String(input), "https://panel.example").searchParams.get("search");
    if (search === "eski") return new Promise<Response>((resolve) => { resolveOlder = resolve; });
    return Promise.resolve(response({ items: [], nextCursor: null }));
  }, () => "00000000-0000-4000-8000-000000000099");
  const loader = new PromotionListLoader(client);

  const older = loader.load({ search: "eski" });
  const newer = loader.load({ search: "yeni" });
  await newer;
  resolveOlder(response({ items: [], nextCursor: null }));

  assert.equal(await older, null);
});

test("suppresses a stale target page after the picker query changes and recovers after a current error", async () => {
  let resolveOld!: (result: Response) => void;
  let attempt = 0;
  const client = new PromotionApiClient((input) => {
    const cursor = new URL(String(input), "https://panel.example").searchParams.get("cursor");
    if (cursor === "old") return new Promise<Response>((resolve) => { resolveOld = resolve; });
    attempt += 1;
    if (attempt === 1) return Promise.reject(new TypeError("temporary"));
    return Promise.resolve(response({ items: [], nextCursor: null }));
  });
  const loader = new PromotionTargetPageLoader(client);

  const stale = loader.load("product", { cursor: "old", search: "eski" });
  loader.invalidate();
  resolveOld(response({ items: [], nextCursor: null }));
  assert.equal(await stale, null);
  await assert.rejects(loader.load("product", { cursor: "retry", search: "yeni" }), /temporary/);
  assert.deepEqual(await loader.load("product", { cursor: "retry", search: "yeni" }), { items: [], nextCursor: null });
});

test("keeps selected IDs across picker pages and leaves unresolved IDs removable", () => {
  const client = new PromotionApiClient(async () => response({ items: [], nextCursor: null }), () => "00000000-0000-4000-8000-000000000099");
  const selected = client.mergeTargetSelections(
    [{ kind: "product", id: "00000000-0000-4000-8000-000000000011", label: "İlk ürün", status: "active" }],
    [{ kind: "product", id: "00000000-0000-4000-8000-000000000012", label: "Yeni ürün", status: "active" }],
  );
  const displayed = client.displayTargetSelections(selected, []);

  assert.deepEqual(selected.map((item) => item.id), ["00000000-0000-4000-8000-000000000011", "00000000-0000-4000-8000-000000000012"]);
  assert.deepEqual(displayed.map((item) => item.label), ["Artık kullanılamıyor — kaldır", "Artık kullanılamıyor — kaldır"]);
});

test("keeps unresolved audience, payment, shipping, and gift selections visibly unavailable until removal", () => {
  const client = new PromotionApiClient(async () => response({ items: [], nextCursor: null }));
  const kinds = ["customer_segment", "payment_method", "shipping_method", "variant"] as const;
  const selected = kinds.map((kind, index) => ({ kind, id: `00000000-0000-4000-8000-0000000000${index + 10}`, label: "Eski seçim", status: "active" as const }));
  let displayed: readonly PromotionTarget[] = selected;
  for (const kind of kinds) displayed = client.reconcileTargetSelections(displayed, selected, kind, []);
  assert.deepEqual(displayed.map((item) => [item.kind, item.status, item.label]), kinds.map((kind) => [kind, "unavailable", "Artık kullanılamıyor — kaldır"]));
});

test("uses one idempotency key for a durable mutation and returns a safe conflict result", async () => {
  const keys: string[] = [];
  const client = new PromotionApiClient(async (_input, init) => {
    keys.push(new Headers(init?.headers).get("idempotency-key")!);
    return response({ code: "conflict" }, 409);
  }, () => "00000000-0000-4000-8000-000000000099");
  const result = await client.save(createPromotionDraft("free_shipping"));

  assert.deepEqual(result, { kind: "conflict", message: "Kampanya başka bir kampanyayla çakışıyor." });
  assert.deepEqual(keys, ["00000000-0000-4000-8000-000000000099"]);
});

test("maps finite server errors and never uses a mutation endpoint for simulation", async () => {
  const paths: string[] = [];
  const client = new PromotionApiClient(async (input) => {
    paths.push(new URL(String(input), "https://panel.example").pathname);
    return response({ mutated: false, evaluation: { eligiblePromotionIds: [], appliedPromotions: [], rejectedPromotions: [], lineEffects: [], shippingEffects: [], gifts: [], subtotalBeforeDiscountMinor: 0, lineDiscountTotalMinor: 0, shippingBeforeDiscountMinor: 0, shippingDiscountTotalMinor: 0, discountTotalMinor: 0, grandTotalMinor: 0, currency: "TRY", progressMessages: [], merchantExplanation: "evaluated" } });
  }, () => "00000000-0000-4000-8000-000000000099");

  await client.simulate(createPromotionDraft("free_shipping"), { promotionId: PROMOTION_ID, expectedVersion: null, context: { customerId: null, paidOrderCount: 0, customerSegmentIds: [], customerTagIds: [], cartLines: [], shippingMethodId: null, paymentMethodId: null, shippingBeforeDiscountMinor: 0, currency: "TRY", storeLocalTime: "2026-09-05T12:00:00.000Z", salesChannel: "storefront", submittedCodes: [], abandonedCart: null } });

  assert.deepEqual(paths, ["/api/promotions/simulate"]);
  assert.equal(promotionErrorMessage("feature_not_enabled"), "Kampanyalar bu paket için etkin değil.");
  assert.equal(promotionErrorMessage("anything_else"), "Şu anda işlem tamamlanamadı. Lütfen tekrar deneyin.");
});

test("reuses the idempotency key when an uncertain durable save is retried", async () => {
  const keys: string[] = []; let attempt = 0;
  const client = new PromotionApiClient(async (_input, init) => {
    keys.push(new Headers(init?.headers).get("idempotency-key")!); attempt += 1;
    return attempt === 1 ? response({ code: "promotion_unavailable" }, 503) : response({ code: "conflict" }, 409);
  }, () => "00000000-0000-4000-8000-000000000099");
  await assert.rejects(client.save(createPromotionDraft("free_shipping")), /promotion_unavailable/);
  await client.save(createPromotionDraft("free_shipping"));
  assert.deepEqual(keys, ["00000000-0000-4000-8000-000000000099", "00000000-0000-4000-8000-000000000099"]);
});

test("persists an unresolved create across reload, blocks changed intent, and clears after an exact retry", async () => {
  const storage = memoryStorage();
  const draft = createPromotionDraft("free_shipping");
  const operationId = "00000000-0000-4000-8000-000000000099";
  const first = new PromotionApiClient(async () => response({ code: "promotion_unavailable" }, 503), () => operationId, storage);

  await assert.rejects(first.save(draft), /promotion_unavailable/);
  assert.equal(storage.values.size, 1);

  const keys: string[] = [];
  const promotion = { id: PROMOTION_ID, version: 1, name: draft.name, status: "draft", ruleDocument: promotionRuleDocument(draft), createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" } as const;
  const reloaded = new PromotionApiClient(async (_input, init) => {
    keys.push(new Headers(init?.headers).get("idempotency-key")!);
    return response({ promotion, replayed: true }, 201);
  }, () => "00000000-0000-4000-8000-000000000100", storage);

  await assert.rejects(reloaded.save(updatePromotionDraft(draft, { name: "Değişmiş" })), /promotion_operation_unresolved/);
  const result = await reloaded.save(draft);
  assert.equal(result.kind, "saved");
  assert.deepEqual(keys, [operationId]);
  assert.equal(storage.values.size, 0);
});

test("retains one durable key when identical concurrent attempts settle success and uncertain", async () => {
  const keys: string[] = [];
  let call = 0;
  let generated = 0;
  const promotion = { id: PROMOTION_ID, version: 1, name: "Ücretsiz kargo", status: "draft", ruleDocument: promotionRuleDocument(createPromotionDraft("free_shipping")), createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" } as const;
  const client = new PromotionApiClient(async (_input, init) => {
    keys.push(new Headers(init?.headers).get("idempotency-key")!);
    call += 1;
    if (call === 2) throw new TypeError("network_lost");
    return response({ promotion, replayed: call === 3 }, 201);
  }, () => `00000000-0000-4000-8000-${String(++generated).padStart(12, "0")}`);
  const first = client.save(createPromotionDraft("free_shipping"));
  const second = client.save(createPromotionDraft("free_shipping"));
  const settled = await Promise.allSettled([first, second]);
  assert.deepEqual(settled.map((item) => item.status), ["fulfilled", "rejected"]);
  await client.save(createPromotionDraft("free_shipping"));
  assert.deepEqual(keys, Array(3).fill("00000000-0000-4000-8000-000000000001"));
});

test("rejects malformed list and mutation envelopes rather than casting unknown response bodies", async () => {
  const client = new PromotionApiClient(async () => response({ items: [{ id: "not-a-uuid" }], nextCursor: null }), () => "00000000-0000-4000-8000-000000000099");
  await assert.rejects(client.list({}), /promotion_unavailable/);
});

test("maps only exact finite safe error envelopes and rejects malformed conflict shapes", async () => {
  const unknown = new PromotionApiClient(async () => response({ code: "private_database_detail" }, 503));
  await assert.rejects(unknown.detail(PROMOTION_ID), (error: unknown) => error instanceof Error && error.message === "promotion_unavailable");
  const extra = new PromotionApiClient(async () => response({ code: "membership_denied", secret: "do-not-surface" }, 403));
  await assert.rejects(extra.detail(PROMOTION_ID), (error: unknown) => error instanceof Error && error.message === "promotion_unavailable");
  const malformedConflict = new PromotionApiClient(async () => response({ code: "version_conflict" }, 409));
  await assert.rejects(malformedConflict.save(createPromotionDraft("free_shipping"), PROMOTION_ID, 7), /promotion_unavailable/);
});

test("preserves the parsed current promotion on a version conflict", async () => {
  const current = { id: PROMOTION_ID, version: 8, name: "Güncel", status: "draft", ruleDocument: { schemaVersion: 1, benefit: { kind: "free_shipping" }, targets: { mode: "all", include: [], exclude: [] }, audience: { mode: "everyone" }, trigger: { kind: "automatic" }, schedule: { timezone: "Europe/Istanbul" }, limits: { totalUsage: null, perCustomerUsage: 1, budgetMinor: null, orderMaximumMinor: null }, conditions: { minimumBasketMinor: 0, minimumQuantity: 0, minimumProductQuantity: 0 }, combinationPolicy: { kind: "none" }, priority: 0, marginPolicy: { kind: "warn" }, progressMessagePolicy: { enabled: true } }, createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" };
  const client = new PromotionApiClient(async () => response({ code: "version_conflict", current }, 409));
  const result = await client.save(createPromotionDraft("free_shipping"), PROMOTION_ID, 7);
  assert.equal(result.kind, "version_conflict");
  assert.equal(result.current.version, 8);
});

test("binds detail and durable success envelopes to the requested resource and next version", async () => {
  const wrong = { id: SECOND_PROMOTION_ID, version: 9, name: "Yanlış", status: "draft", ruleDocument: promotionRuleDocument(createPromotionDraft("free_shipping")), createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" } as const;
  const detailClient = new PromotionApiClient(async () => response(wrong));
  await assert.rejects(detailClient.detail(PROMOTION_ID), /promotion_unavailable/);
  const saveClient = new PromotionApiClient(async () => response({ promotion: wrong, replayed: false }));
  await assert.rejects(saveClient.save(createPromotionDraft("free_shipping"), PROMOTION_ID, 7), /promotion_unavailable/);
});

test("resolves one exact legacy record and rejects a wrong-resource projection", async () => {
  const requests: Request[] = [];
  const client = new PromotionApiClient(async (input, init) => {
    requests.push(new Request(input, init));
    return response({ legacyRecordId: PROMOTION_ID, promotionId: SECOND_PROMOTION_ID, reason: "adopted" });
  });
  assert.deepEqual(await client.resolveLegacy(PROMOTION_ID), { legacyRecordId: PROMOTION_ID, promotionId: SECOND_PROMOTION_ID, reason: "adopted" });
  assert.equal(new URL(requests[0]!.url).pathname, `/api/promotions/legacy/${PROMOTION_ID}`);
  const wrong = new PromotionApiClient(async () => response({ legacyRecordId: SECOND_PROMOTION_ID, promotionId: null, reason: "invalid_code" }));
  await assert.rejects(wrong.resolveLegacy(PROMOTION_ID), /promotion_unavailable/);
});

test("binds save success to the exact requested name and ordered rule document", async () => {
  const requested = updatePromotionDraft(createPromotionDraft("quantity_tiers"), { name: "İstenen" });
  const wrong = { id: PROMOTION_ID, version: 1, name: "Başka", status: "draft", ruleDocument: promotionRuleDocument(requested), createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" } as const;
  const client = new PromotionApiClient(async () => response({ promotion: wrong, replayed: false }, 201));
  await assert.rejects(client.save(requested), /promotion_unavailable/);
});

test("rejects an update success that silently changes the lifecycle status", async () => {
  const draft = createPromotionDraft("free_shipping");
  const changed = { id: PROMOTION_ID, version: 8, name: draft.name, status: "active", ruleDocument: promotionRuleDocument(draft), createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:01.000Z" } as const;
  const client = new PromotionApiClient(async () => response({ promotion: changed, replayed: false }));
  await assert.rejects(client.save(draft, PROMOTION_ID, 7, "draft"), /promotion_unavailable/);
});

test("preserves publication readiness when an active promotion update is blocked", async () => {
  const readiness = { blocking: true, findings: [{ code: "schedule_ended", severity: "blocking", relatedPromotionId: null, relatedPromotionName: null }] } as const;
  const client = new PromotionApiClient(async () => response({ code: "publish_blocked", readiness }, 409));
  const result = await client.save(createPromotionDraft("free_shipping"), PROMOTION_ID, 7, "active");
  assert.equal(result.kind, "publish_blocked");
  assert.deepEqual(result.kind === "publish_blocked" ? result.readiness : null, readiness);
});

test("rejects a simulator-only not-eligible failure on create", async () => {
  const client = new PromotionApiClient(async () => response({ code: "not_eligible" }, 409));
  await assert.rejects(client.save(createPromotionDraft("free_shipping")), /promotion_unavailable/);
});

test("retains a durable key after a malformed wrong-resource version conflict", async () => {
  const keys: string[] = []; let attempt = 0;
  const wrong = { id: SECOND_PROMOTION_ID, version: 8, name: "Yanlış", status: "draft", ruleDocument: promotionRuleDocument(createPromotionDraft("free_shipping")), createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" } as const;
  const client = new PromotionApiClient(async (_input, init) => { keys.push(new Headers(init?.headers).get("idempotency-key")!); attempt += 1; return attempt === 1 ? response({ code: "version_conflict", current: wrong }, 409) : response({ code: "code_conflict" }, 409); }, () => "00000000-0000-4000-8000-000000000099");
  await assert.rejects(client.save(createPromotionDraft("free_shipping"), PROMOTION_ID, 7), /promotion_unavailable/);
  await client.save(createPromotionDraft("free_shipping"), PROMOTION_ID, 7);
  assert.deepEqual(keys, [keys[0], keys[0]]);
});

test("rejects specialized lifecycle errors outside their exact status and action family", async () => {
  const readiness = { blocking: true, findings: [{ code: "schedule_ended", severity: "blocking", relatedPromotionId: null, relatedPromotionName: null }] };
  const pause = new PromotionApiClient(async () => response({ code: "publish_blocked", readiness }, 409));
  await assert.rejects(pause.lifecycle(PROMOTION_ID, 7, "pause"), /promotion_unavailable/);
  const wrongStatus = new PromotionApiClient(async () => response({ code: "membership_denied" }, 500));
  await assert.rejects(wrongStatus.detail(PROMOTION_ID), /promotion_unavailable/);
});

test("preserves duplicate version conflicts and validates the source current projection", async () => {
  const current = { id: PROMOTION_ID, version: 8, name: "Güncel", status: "draft", ruleDocument: promotionRuleDocument(createPromotionDraft("free_shipping")), createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" } as const;
  const client = new PromotionApiClient(async () => response({ code: "version_conflict", current }, 409));
  const result = await client.duplicate(PROMOTION_ID, 7, "Kopya");
  assert.equal(result.kind, "version_conflict");
  assert.equal(result.kind === "version_conflict" ? result.current.version : null, 8);
});

test("clears a durable key after a definitive denial but retains it for an uncertain response", async () => {
  const keys: string[] = []; let attempt = 0;
  const ids = ["00000000-0000-4000-8000-000000000091", "00000000-0000-4000-8000-000000000092"];
  const client = new PromotionApiClient(async (_input, init) => { keys.push(new Headers(init?.headers).get("idempotency-key")!); attempt += 1; return attempt === 1 ? response({ code: "unauthenticated" }, 401) : response({ code: "conflict" }, 409); }, () => ids.shift()!);
  await assert.rejects(client.save(createPromotionDraft("free_shipping")), /unauthenticated/);
  await client.save(createPromotionDraft("free_shipping"));
  assert.notEqual(keys[0], keys[1]);
});

test("identifies an uncertain save by exact request bytes rather than UI-only draft metadata", async () => {
  const keys: string[] = []; let attempt = 0;
  const client = new PromotionApiClient(async (_input, init) => { keys.push(new Headers(init?.headers).get("idempotency-key")!); attempt += 1; return attempt === 1 ? response({ code: "promotion_unavailable" }, 503) : response({ code: "conflict" }, 409); }, () => "00000000-0000-4000-8000-000000000099");
  const first = createPromotionDraft("free_shipping");
  await assert.rejects(client.save(first), /promotion_unavailable/);
  await client.save({ ...first, templateId: "custom" });
  assert.equal(keys[0], keys[1]);
});

test("preserves parsed publication readiness instead of flattening a publish block", async () => {
  const client = new PromotionApiClient(async () => response({ code: "publish_blocked", readiness: { blocking: true, findings: [{ code: "schedule_ended", severity: "blocking", relatedPromotionId: null, relatedPromotionName: null }] } }, 409));
  const result = await client.lifecycle(PROMOTION_ID, 7, "publish");
  assert.equal(result.kind, "publish_blocked");
  assert.equal(result.readiness.blocking, true);
});

test("rejects a durable response with a non-json or oversized body before parsing", async () => {
  const client = new PromotionApiClient(async () => new Response("x", { headers: { "content-type": "text/plain" } }));
  await assert.rejects(client.list({}), /promotion_unavailable/);
});

test("reuses a lifecycle key only while the same logical attempt is uncertain", async () => {
  const requests: Request[] = [];
  let attempt = 0;
  const ids = ["00000000-0000-4000-8000-000000000098", "00000000-0000-4000-8000-000000000099"];
  const paused = { id: PROMOTION_ID, version: 3, name: "Durdu", status: "paused", ruleDocument: promotionRuleDocument(createPromotionDraft("free_shipping")), createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:01.000Z" } as const;
  const client = new PromotionApiClient(async (input, init) => { requests.push(new Request(input, init)); attempt += 1; return attempt === 1 ? response({ code: "promotion_unavailable" }, 503) : response({ promotion: paused, replayed: true }); }, () => ids.shift()!);
  await assert.rejects(client.lifecycle(PROMOTION_ID, 2, "pause"), /promotion_unavailable/);
  await client.lifecycle(PROMOTION_ID, 2, "pause");
  assert.deepEqual(requests.map((request) => new URL(request.url).pathname), [`/api/promotions/${PROMOTION_ID}/pause`, `/api/promotions/${PROMOTION_ID}/pause`]);
  assert.equal(requests[0]!.headers.get("idempotency-key"), requests[1]!.headers.get("idempotency-key"));
  assert.equal(await requests[0]!.clone().text(), await requests[1]!.clone().text());
});
