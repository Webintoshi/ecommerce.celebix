import assert from "node:assert/strict";
import test from "node:test";
import type { PriceList } from "@celebix/saas-contracts";
import {
  buildPriceListIntent,
  canAddPricingRule,
  createPricingApi,
  createPricingMutationController,
  createPricingRequestLifecycle,
  formatPricingUtcLocal,
  parsePricingUtcLocal,
  pricingErrorState,
  pricingRuleDraft,
  PricingApiError,
} from "./client.ts";

const ID = "20000000-0000-4000-8000-000000000001";
const VARIANT = "30000000-0000-4000-8000-000000000001";
const OP = "50000000-0000-4000-8000-000000000001";
const NOW = "2026-07-23T12:00:00.000Z";
const list = (status: "draft" | "active" | "archived" = "draft", version = 1): PriceList => ({ id: ID, name: "VIP", status, items: [{ variantId: VARIANT, priceCents: 1000 }], rules: [{ channel: "storefront", startsAt: NOW, priority: 1 }], version, createdAt: NOW, updatedAt: NOW, ...(status === "active" ? { activatedAt: NOW } : {}), ...(status === "archived" ? { archivedAt: NOW } : {}) });

test("pricing client exposes only five finite same-origin operations with one generated operation ID per mutation", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const api = createPricingApi(async (input, init) => { const path = String(input); calls.push([path, init]); if (init?.method !== "POST") return Response.json(path.endsWith(ID) ? list() : { items: [list()] }); if (path.endsWith("activate")) return Response.json(list("active", 2)); if (path.endsWith("archive")) return Response.json(list("archived", 2)); return Response.json(list()); }, () => OP);
  await api.list(); await api.get(ID); await api.save({ name: "VIP", items: list().items, rules: list().rules }); await api.activate(ID, 1); await api.archive(ID, 1);
  assert.deepEqual(calls.map(([path]) => path), ["/api/pricing/price-lists", `/api/pricing/price-lists/${ID}`, "/api/pricing/price-lists", `/api/pricing/price-lists/${ID}/activate`, `/api/pricing/price-lists/${ID}/archive`]);
  for (const [, init] of calls) { assert.equal(init?.credentials, "same-origin"); assert.equal(init?.cache, "no-store"); if (init?.method === "POST") { const body = JSON.parse(String(init.body)); assert.equal(body.operationId, OP); for (const forbidden of ["storeId", "currency", "customerId"]) assert.equal(forbidden in body, false); } }
});

test("pricing client rejects hostile inputs and malformed responses before authority can be confused", async () => {
  let calls = 0; const api = createPricingApi(async () => { calls += 1; return Response.json({ ...list(), storeId: "private" }); }, () => OP);
  await assert.rejects(api.get("invalid"), /pricing_client_invalid/);
  await assert.rejects(api.save({ name: "VIP", items: list().items, rules: list().rules, currency: "TRY" } as never), /pricing_client_invalid/);
  await assert.rejects(() => api.get(ID), (error: unknown) => error instanceof PricingApiError && error.code === "unavailable");
  assert.equal(calls, 1);
});

test("pricing client bounds exact JSON and maps only stable errors", async () => {
  for (const response of [new Response("{}", { headers: { "content-type": "text/plain" } }), new Response(new Uint8Array([0xc3, 0x28]), { headers: { "content-type": "application/json" } }), Response.json({ code: "private", detail: "sql" }, { status: 500 })]) {
    await assert.rejects(() => createPricingApi(async () => response, () => OP).list(), (error: unknown) => error instanceof PricingApiError && error.code === "unavailable");
  }
  await assert.rejects(() => createPricingApi(async () => Response.json({ code: "conflict" }, { status: 409 }), () => OP).activate(ID, 1), (error: unknown) => error instanceof PricingApiError && error.code === "conflict" && error.status === 409);
});

for (const lifecycle of ["save", "activate", "archive"] as const) {
  test(`pricing ${lifecycle} owns one synchronous pending submission and rejects a duplicate locally`, async () => {
    let requests = 0;
    let complete!: (response: Response) => void;
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requests += 1;
      assert.equal(JSON.parse(String(init?.body)).operationId, OP);
      return new Promise<Response>((resolve) => { complete = resolve; });
    };
    const controller = createPricingMutationController(createPricingApi(fetcher, () => OP));
    const first = lifecycle === "save"
      ? controller.save({ name: "VIP", items: list().items, rules: list().rules })
      : lifecycle === "activate" ? controller.activate(ID, 1) : controller.archive(ID, 1);
    const second = lifecycle === "save"
      ? controller.save({ name: "VIP", items: list().items, rules: list().rules })
      : lifecycle === "activate" ? controller.activate(ID, 1) : controller.archive(ID, 1);
    assert.notStrictEqual(first, second);
    await assert.rejects(second, (error: unknown) => error instanceof PricingApiError && error.code === "mutation_pending");
    assert.equal(controller.state(), "pending");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(requests, 1);
    complete(Response.json(list(lifecycle === "archive" ? "archived" : lifecycle === "activate" ? "active" : "draft", lifecycle === "save" ? 1 : 2)));
    assert.equal((await first).status, lifecycle === "archive" ? "archived" : lifecycle === "activate" ? "active" : "draft");
    assert.equal(controller.state(), "idle");
  });
}

test("a pending pricing action rejects every cross-action submission without awaiting or sending it", async () => {
  let requests = 0;
  let complete!: (response: Response) => void;
  const controller = createPricingMutationController(createPricingApi(async () => {
    requests += 1;
    return new Promise<Response>((resolve) => { complete = resolve; });
  }, () => OP));
  const first = controller.save({ name: "VIP", items: list().items, rules: list().rules });
  const activate = controller.activate(ID, 1);
  const archive = controller.archive(ID, 1);
  await assert.rejects(activate, (error: unknown) => error instanceof PricingApiError && error.code === "mutation_pending");
  await assert.rejects(archive, (error: unknown) => error instanceof PricingApiError && error.code === "mutation_pending");
  assert.equal(controller.state(), "pending");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests, 1);
  complete(Response.json(list()));
  await first;
});

test("ambiguous mutation and unmount lock verification until a full reload without a second POST", async () => {
  let requests = 0;
  const unavailable = createPricingMutationController(createPricingApi(async () => {
    requests += 1;
    return Response.json({ code: "unavailable" }, { status: 503 });
  }, () => OP));
  await assert.rejects(unavailable.save({ name: "VIP", items: list().items, rules: list().rules }), (error: unknown) => error instanceof PricingApiError && error.code === "verification_unavailable");
  assert.equal(unavailable.state(), "verification_unavailable");
  await assert.rejects(unavailable.save({ name: "VIP", items: list().items, rules: list().rules }), (error: unknown) => error instanceof PricingApiError && error.code === "verification_unavailable");
  assert.equal(requests, 1);

  let aborts = 0;
  const pending = createPricingMutationController(createPricingApi(async (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => { aborts += 1; reject(new DOMException("aborted", "AbortError")); }, { once: true });
  }), () => OP));
  const result = pending.activate(ID, 1);
  await new Promise((resolve) => setImmediate(resolve));
  pending.dispose();
  await assert.rejects(result, (error: unknown) => error instanceof PricingApiError && error.code === "verification_unavailable");
  pending.dispose();
  assert.equal(aborts, 1);
});

test("price-list intent preserves every persisted rule and treats datetime-local values as explicit UTC", () => {
  const previous = process.env.TZ;
  process.env.TZ = "Europe/Istanbul";
  try {
    assert.equal(parsePricingUtcLocal("2026-07-23T12:30"), "2026-07-23T12:30:00.000Z");
    assert.equal(formatPricingUtcLocal("2026-07-23T12:30:00.000Z"), "2026-07-23T12:30");
    const intent = buildPriceListIntent({
      name: "VIP", items: list().items,
      rules: [
        { channel: "storefront", customerTagId: "", startsAt: "2026-07-23T12:30", endsAt: "", priority: "1" },
        { channel: "quick_order", customerTagId: "40000000-0000-4000-8000-000000000001", startsAt: "", endsAt: "", priority: "2" },
      ],
    });
    assert.deepEqual(intent.rules, [
      { channel: "storefront", startsAt: "2026-07-23T12:30:00.000000Z", priority: 1 },
      { channel: "quick_order", customerTagId: "40000000-0000-4000-8000-000000000001", priority: 2 },
    ]);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test("unchanged minute controls preserve each persisted canonical microsecond timestamp while deliberate edits use exact UTC", () => {
  const first = pricingRuleDraft({ channel: "storefront", startsAt: "2026-07-23T12:30:45.123456Z", endsAt: "2026-07-23T13:30:59.654321Z", priority: 1 });
  const second = pricingRuleDraft({ channel: "quick_order", startsAt: "2026-07-24T09:05:01.000007Z", priority: 2 });
  assert.deepEqual([first.startsAt, first.endsAt, second.startsAt], ["2026-07-23T12:30", "2026-07-23T13:30", "2026-07-24T09:05"]);
  const unchanged = buildPriceListIntent({ name: "VIP", items: list().items, rules: [first, second] });
  assert.deepEqual(unchanged.rules.map((rule) => [rule.startsAt, rule.endsAt]), [
    ["2026-07-23T12:30:45.123456Z", "2026-07-23T13:30:59.654321Z"],
    ["2026-07-24T09:05:01.000007Z", undefined],
  ]);
  const edited = buildPriceListIntent({
    name: "VIP", items: list().items,
    rules: [first, { ...second, startsAt: "2026-07-24T10:15", persistedStartsAt: "" }],
  });
  assert.equal(edited.rules[0]?.startsAt, "2026-07-23T12:30:45.123456Z");
  assert.equal(edited.rules[1]?.startsAt, "2026-07-24T10:15:00.000000Z");
});

test("pricing request lifecycle rejects stale list/detail generations and every completion after unmount", () => {
  const lifecycle = createPricingRequestLifecycle();
  const cleanup = lifecycle.setup();
  const listRequest = lifecycle.begin();
  const detailRequest = lifecycle.begin();
  assert.equal(listRequest.current(), false);
  assert.equal(detailRequest.current(), true);
  detailRequest.cancel();
  assert.equal(detailRequest.current(), false);
  const mutation = lifecycle.begin();
  assert.equal(mutation.current(), true);
  cleanup();
  assert.equal(mutation.current(), false);
  assert.throws(() => lifecycle.begin(), /pricing_lifecycle_disposed/);
});

test("pricing request lifecycle survives Strict Mode setup cleanup setup with a fresh generation", () => {
  const lifecycle = createPricingRequestLifecycle();
  const firstCleanup = lifecycle.setup();
  const first = lifecycle.begin();
  firstCleanup();
  assert.equal(first.current(), false);
  const secondCleanup = lifecycle.setup();
  const second = lifecycle.begin();
  assert.equal(second.current(), true);
  secondCleanup();
  assert.equal(second.current(), false);
});

test("price-list rules have a hard local maximum of one hundred", () => {
  assert.equal(canAddPricingRule(99), true);
  assert.equal(canAddPricingRule(100), false);
  assert.throws(() => canAddPricingRule(-1), /pricing_client_invalid/);
  assert.throws(() => canAddPricingRule(101), /pricing_client_invalid/);
});

test("pricing client contains hostile exact-root and dense-item descriptors without invoking them", async () => {
  let rootReads = 0;
  const hostileRoot = {} as Record<string, unknown>;
  Object.defineProperty(hostileRoot, "name", { enumerable: true, get() { rootReads += 1; return "VIP"; } });
  Object.assign(hostileRoot, { items: list().items, rules: list().rules });
  await assert.rejects(createPricingApi(async () => { throw new Error("fetch forbidden"); }, () => OP).save(hostileRoot as never), /pricing_client_invalid/);
  assert.equal(rootReads, 0);

  let itemReads = 0;
  const hostileItems: unknown[] = [];
  Object.defineProperty(hostileItems, "0", { enumerable: true, get() { itemReads += 1; return list().items[0]; } });
  await assert.rejects(createPricingApi(async () => { throw new Error("fetch forbidden"); }, () => OP).save({ name: "VIP", items: hostileItems, rules: list().rules } as never), /pricing_client_invalid/);
  assert.equal(itemReads, 0);
});

test("pricing errors map to distinct durable UI truth states", () => {
  assert.equal(pricingErrorState(new PricingApiError("forbidden", 403)), "denied");
  assert.equal(pricingErrorState(new PricingApiError("conflict", 409)), "conflict");
  assert.equal(pricingErrorState(new PricingApiError("not_found", 404)), "not_found");
  assert.equal(pricingErrorState(new PricingApiError("unavailable", 503)), "unavailable");
  assert.equal(pricingErrorState(new PricingApiError("verification_unavailable", 503)), "verification_unavailable");
  assert.equal(pricingErrorState(new Error("private")), "error");
});
