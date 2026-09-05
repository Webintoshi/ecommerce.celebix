import assert from "node:assert/strict";
import test from "node:test";

type InputResult = Readonly<{
  kind: string;
  operationId?: string;
  value?: Readonly<Record<string, unknown>>;
}>;
type InputModule = Readonly<{
  readPromotionGetInput: (request: Request, route: unknown) => InputResult;
  readPromotionMutationInput: (request: Request, route: unknown) => Promise<InputResult>;
}>;
const input = await import("./request-input.ts").catch(
  () => ({} as Partial<InputModule>),
) as Partial<InputModule>;

const PROMOTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BATCH_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OPERATION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const STORE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NOW = "2026-09-05T12:00:00.000Z";

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
  customerId: null,
  paidOrderCount: 0,
  customerSegmentIds: [],
  customerTagIds: [],
  cartLines: [],
  shippingMethodId: null,
  paymentMethodId: null,
  shippingBeforeDiscountMinor: 0,
  currency: "TRY",
  storeLocalTime: NOW,
  salesChannel: "storefront",
  submittedCodes: [],
  abandonedCart: null,
} as const;

const ROUTES = {
  list: { kind: "list", method: "GET", pathname: "/api/promotions" },
  create: { kind: "create", method: "POST", pathname: "/api/promotions" },
  detail: { kind: "detail", method: "GET", pathname: `/api/promotions/${PROMOTION_ID}`, promotionId: PROMOTION_ID },
  update: { kind: "update", method: "PATCH", pathname: `/api/promotions/${PROMOTION_ID}`, promotionId: PROMOTION_ID },
  publish: { kind: "publish", method: "POST", pathname: `/api/promotions/${PROMOTION_ID}/publish`, promotionId: PROMOTION_ID },
  pause: { kind: "pause", method: "POST", pathname: `/api/promotions/${PROMOTION_ID}/pause`, promotionId: PROMOTION_ID },
  resume: { kind: "resume", method: "POST", pathname: `/api/promotions/${PROMOTION_ID}/resume`, promotionId: PROMOTION_ID },
  duplicate: { kind: "duplicate", method: "POST", pathname: `/api/promotions/${PROMOTION_ID}/duplicate`, promotionId: PROMOTION_ID },
  archive: { kind: "archive", method: "POST", pathname: `/api/promotions/${PROMOTION_ID}/archive`, promotionId: PROMOTION_ID },
  simulate: { kind: "simulate", method: "POST", pathname: "/api/promotions/simulate" },
  conflicts: { kind: "conflicts", method: "POST", pathname: "/api/promotions/conflicts" },
  margin: { kind: "margin", method: "POST", pathname: "/api/promotions/margin" },
  target_list: { kind: "target_list", method: "GET", pathname: "/api/promotions/targets" },
  target_resolve: { kind: "target_resolve", method: "POST", pathname: "/api/promotions/targets/resolve" },
  code_batch_list: { kind: "code_batch_list", method: "GET", pathname: `/api/promotions/${PROMOTION_ID}/code-batches`, promotionId: PROMOTION_ID },
  code_batch_create: { kind: "code_batch_create", method: "POST", pathname: `/api/promotions/${PROMOTION_ID}/code-batches`, promotionId: PROMOTION_ID },
  code_batch_status: { kind: "code_batch_status", method: "POST", pathname: `/api/promotions/code-batches/${BATCH_ID}/status`, batchId: BATCH_ID },
  code_batch_csv: { kind: "code_batch_csv", method: "GET", pathname: `/api/promotions/code-batches/${BATCH_ID}/csv`, batchId: BATCH_ID },
  analytics: { kind: "analytics", method: "GET", pathname: `/api/promotions/${PROMOTION_ID}/analytics`, promotionId: PROMOTION_ID },
  legacy: { kind: "legacy", method: "GET", pathname: "/api/promotions/legacy" },
} as const;

type MutationRoute = (typeof ROUTES)[Exclude<keyof typeof ROUTES,
  "list" | "detail" | "target_list" | "code_batch_list" | "code_batch_csv" | "analytics" | "legacy"
>];
type GetRoute = (typeof ROUTES)["list" | "detail" | "target_list" | "code_batch_list" | "code_batch_csv" | "analytics" | "legacy"];

const DURABLE_MUTATIONS = new Set([
  "create", "update", "publish", "pause", "resume", "duplicate", "archive", "code_batch_create", "code_batch_status",
]);

function mutation(
  route: MutationRoute,
  body: BodyInit,
  options: Readonly<{
    contentType?: string | null;
    operationId?: string | null;
    contentLength?: string | null;
    headers?: HeadersInit;
  }> = {},
): Request {
  const headers = new Headers(options.headers);
  if (options.contentType !== null) headers.set("content-type", options.contentType ?? "application/json");
  const selectedOperation = options.operationId === undefined
    ? DURABLE_MUTATIONS.has(route.kind) ? OPERATION_ID : null
    : options.operationId;
  if (selectedOperation !== null) headers.set("idempotency-key", selectedOperation);
  if (options.contentLength !== undefined && options.contentLength !== null) headers.set("content-length", options.contentLength);
  return new Request(`http://internal${route.pathname}`, { method: route.method, headers, body });
}

function get(route: GetRoute, query = "", headers?: HeadersInit): Request {
  return new Request(`http://internal${route.pathname}${query}`, { method: "GET", headers });
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function paddedJson(value: unknown, byteLength: number): string {
  const json = JSON.stringify(value);
  const remaining = byteLength - utf8Length(json);
  assert.ok(remaining >= 0, `fixture exceeds ${byteLength} bytes`);
  const body = `${json}${" ".repeat(remaining)}`;
  assert.equal(utf8Length(body), byteLength);
  return body;
}

const CREATE = { name: "İndirim", ruleDocument: RULE } as const;
const UPDATE = { expectedVersion: 1, ...CREATE } as const;
const PUBLISH = { expectedVersion: 1, nextStatus: "active" } as const;
const PAUSE = { expectedVersion: 1 } as const;
const RESUME = { expectedVersion: 1, nextStatus: "scheduled" } as const;
const DUPLICATE = { expectedVersion: 1, name: "Kopya", codes: ["VIP1", "VIP2"] } as const;
const SIMULATE = { promotionId: PROMOTION_ID, expectedVersion: null, ...CREATE, context: PUBLIC_CONTEXT } as const;
const CHECK = { promotionId: PROMOTION_ID, expectedVersion: 1, ruleDocument: RULE } as const;
const TARGET_RESOLVE = { kind: "product", ids: [PROMOTION_ID] } as const;
const BATCH_CREATE = { count: 100, prefix: "VIP_", codeLength: 24, perCustomerUsage: 1, expiresAt: null } as const;
const BATCH_STATUS = { expectedVersion: 1, nextStatus: "paused" } as const;

test("accepts every exact mutation input and exposes idempotency only for durable mutations", async () => {
  assert.equal(typeof input.readPromotionMutationInput, "function");
  for (const [route, value, durable] of [
    [ROUTES.create, CREATE, true],
    [ROUTES.update, UPDATE, true],
    [ROUTES.publish, PUBLISH, true],
    [ROUTES.pause, PAUSE, true],
    [ROUTES.resume, RESUME, true],
    [ROUTES.duplicate, DUPLICATE, true],
    [ROUTES.archive, PAUSE, true],
    [ROUTES.simulate, SIMULATE, false],
    [ROUTES.conflicts, CHECK, false],
    [ROUTES.margin, CHECK, false],
    [ROUTES.target_resolve, TARGET_RESOLVE, false],
    [ROUTES.code_batch_create, BATCH_CREATE, true],
    [ROUTES.code_batch_status, BATCH_STATUS, true],
  ] as const) {
    const result = await input.readPromotionMutationInput?.(
      mutation(route, JSON.stringify(value)),
      route,
    );
    assert.deepEqual(result, {
      kind: "valid",
      ...(durable ? { operationId: OPERATION_ID } : {}),
      value,
    }, route.kind);
    assert.equal(Object.isFrozen(result), true, `${route.kind}:result`);
    assert.equal(Object.isFrozen(result?.value), true, `${route.kind}:value`);
  }
});

test("simulation input is store-less and permits only storefront or quick_order sales channels", async () => {
  for (const salesChannel of ["storefront", "quick_order"] as const) {
    const value = { ...SIMULATE, context: { ...PUBLIC_CONTEXT, salesChannel } };
    const result = await input.readPromotionMutationInput?.(
      mutation(ROUTES.simulate, JSON.stringify(value)), ROUTES.simulate,
    );
    assert.deepEqual(result, { kind: "valid", value });
    assert.equal(Object.hasOwn(result?.value?.context as object, "storeId"), false);
  }

  assert.deepEqual(await input.readPromotionMutationInput?.(
    mutation(ROUTES.simulate, JSON.stringify({
      ...SIMULATE,
      context: { ...PUBLIC_CONTEXT, storeId: STORE_ID },
    })),
    ROUTES.simulate,
  ), { kind: "invalid" });

  for (const salesChannel of ["online", "pos", "merchant_preview", "storefront "]) {
    assert.deepEqual(await input.readPromotionMutationInput?.(
      mutation(ROUTES.simulate, JSON.stringify({
        ...SIMULATE,
        context: { ...PUBLIC_CONTEXT, salesChannel },
      })),
      ROUTES.simulate,
    ), { kind: "invalid" }, salesChannel);
  }
});

test("rejects client store authority, unknown fields, malformed JSON, and non-JSON transport", async () => {
  for (const body of [
    { ...CREATE, storeId: STORE_ID },
    { ...CREATE, tenantId: STORE_ID },
    { ...CREATE, principalId: STORE_ID },
    { ...CREATE, ruleDocument: { ...RULE, storeId: STORE_ID } },
  ]) {
    assert.deepEqual(await input.readPromotionMutationInput?.(
      mutation(ROUTES.create, JSON.stringify(body)), ROUTES.create,
    ), { kind: "invalid" });
  }

  for (const contentType of [
    null,
    "application/problem+json",
    "application/*+json",
    "text/json",
    "text/plain",
    "application/json, text/plain",
    "application/json; charset=iso-8859-1",
    "application/json; boundary=x",
  ]) {
    assert.deepEqual(await input.readPromotionMutationInput?.(
      mutation(ROUTES.create, JSON.stringify(CREATE), { contentType }), ROUTES.create,
    ), { kind: "invalid" }, String(contentType));
  }

  for (const body of ["", "[]", "{", "null", JSON.stringify({ name: "Missing rule" })]) {
    assert.deepEqual(await input.readPromotionMutationInput?.(
      mutation(ROUTES.create, body), ROUTES.create,
    ), { kind: "invalid" }, body);
  }
  assert.deepEqual(await input.readPromotionMutationInput?.(
    mutation(ROUTES.create, new Uint8Array([0xc3, 0x28])), ROUTES.create,
  ), { kind: "invalid" });
  assert.deepEqual(await input.readPromotionMutationInput?.(
    mutation(ROUTES.create, JSON.stringify(CREATE), { headers: { "transfer-encoding": "chunked" } }),
    ROUTES.create,
  ), { kind: "invalid" });
});

test("accepts only the finite JSON media types", async () => {
  for (const contentType of [
    "application/json",
    "application/json; charset=utf-8",
    "application/json;charset=\"utf-8\"",
  ]) {
    assert.equal((await input.readPromotionMutationInput?.(
      mutation(ROUTES.create, JSON.stringify(CREATE), { contentType }), ROUTES.create,
    ))?.kind, "valid", contentType);
  }
});

test("requires one canonical UUID idempotency key only on durable mutation routes", async () => {
  for (const operationId of [null, "", OPERATION_ID.toUpperCase(), `${OPERATION_ID},${PROMOTION_ID}`, "not-a-uuid"]) {
    assert.deepEqual(await input.readPromotionMutationInput?.(
      mutation(ROUTES.create, JSON.stringify(CREATE), { operationId }), ROUTES.create,
    ), { kind: "invalid" }, String(operationId));
  }
  assert.deepEqual(await input.readPromotionMutationInput?.(
    mutation(ROUTES.simulate, JSON.stringify(SIMULATE), { operationId: OPERATION_ID }), ROUTES.simulate,
  ), { kind: "invalid" });
});

test("enforces the exact per-route declared and actual UTF-8 body byte caps", async () => {
  for (const [route, value, maximum] of [
    [ROUTES.create, CREATE, 393_216],
    [ROUTES.update, UPDATE, 393_216],
    [ROUTES.conflicts, CHECK, 393_216],
    [ROUTES.margin, CHECK, 393_216],
    [ROUTES.simulate, SIMULATE, 655_360],
    [ROUTES.duplicate, DUPLICATE, 786_432],
    [ROUTES.code_batch_create, BATCH_CREATE, 16_384],
    [ROUTES.publish, PUBLISH, 8_192],
    [ROUTES.pause, PAUSE, 8_192],
    [ROUTES.resume, RESUME, 8_192],
    [ROUTES.archive, PAUSE, 8_192],
    [ROUTES.code_batch_status, BATCH_STATUS, 8_192],
    [ROUTES.target_resolve, TARGET_RESOLVE, 32_768],
  ] as const) {
    const under = paddedJson(value, maximum - 1);
    const exact = paddedJson(value, maximum);
    assert.equal((await input.readPromotionMutationInput?.(
      mutation(route, under), route,
    ))?.kind, "valid", `${route.kind}:actual-1`);
    assert.equal((await input.readPromotionMutationInput?.(
      mutation(route, exact, { contentLength: String(maximum) }), route,
    ))?.kind, "valid", `${route.kind}:exact`);
    assert.deepEqual(await input.readPromotionMutationInput?.(
      mutation(route, `${exact} `), route,
    ), { kind: "invalid" }, `${route.kind}:actual+1`);
    assert.deepEqual(await input.readPromotionMutationInput?.(
      mutation(route, JSON.stringify(value), { contentLength: String(maximum + 1) }), route,
    ), { kind: "invalid" }, `${route.kind}:declared+1`);
  }
});

test("compares declared length to actual UTF-8 bytes at the exact minus-one and plus-one boundaries", async () => {
  const body = JSON.stringify(CREATE);
  const actualBytes = utf8Length(body);
  assert.notEqual(actualBytes, body.length);
  assert.equal((await input.readPromotionMutationInput?.(
    mutation(ROUTES.create, body, { contentLength: String(actualBytes) }), ROUTES.create,
  ))?.kind, "valid");
  for (const declared of [actualBytes - 1, actualBytes + 1, body.length]) {
    assert.deepEqual(await input.readPromotionMutationInput?.(
      mutation(ROUTES.create, body, { contentLength: String(declared) }), ROUTES.create,
    ), { kind: "invalid" }, String(declared));
  }
  for (const declared of ["01", "+1", "1.0", " 1", "1, 1", "-1"]) {
    assert.deepEqual(await input.readPromotionMutationInput?.(
      mutation(ROUTES.create, body, { contentLength: declared }), ROUTES.create,
    ), { kind: "invalid" }, declared);
  }
});

test("GET routes are bodyless and reject every entity-body header", () => {
  assert.equal(typeof input.readPromotionGetInput, "function");
  for (const [route, query, expected] of [
    [ROUTES.list, "?limit=20", { kind: "valid", value: { limit: 20 } }],
    [ROUTES.detail, "", { kind: "valid" }],
    [ROUTES.target_list, "?kind=product&limit=20", { kind: "valid", value: { kind: "product", limit: 20 } }],
    [ROUTES.code_batch_list, "?limit=20", { kind: "valid", value: { limit: 20 } }],
    [ROUTES.code_batch_csv, "", { kind: "valid" }],
    [ROUTES.analytics, "", { kind: "valid" }],
    [ROUTES.legacy, "?limit=20", { kind: "valid", value: { limit: 20 } }],
  ] as const) {
    assert.deepEqual(input.readPromotionGetInput?.(get(route, query), route), expected, route.kind);
    const entityHeaders: readonly HeadersInit[] = [
      { "content-type": "application/json" },
      { "content-length": "0" },
      { "transfer-encoding": "chunked" },
    ];
    for (const headers of entityHeaders) {
      assert.deepEqual(input.readPromotionGetInput?.(get(route, query, headers), route), { kind: "invalid" }, `${route.kind}:${Object.keys(headers)[0]}`);
    }
  }

  const bodyCarrier = mutation(ROUTES.create, JSON.stringify(CREATE));
  assert.deepEqual(input.readPromotionGetInput?.(bodyCarrier, ROUTES.list), { kind: "invalid" });
});

test("GET routes reject idempotency headers instead of silently ignoring mutation authority", () => {
  for (const route of [
    ROUTES.list, ROUTES.detail, ROUTES.target_list, ROUTES.code_batch_list,
    ROUTES.code_batch_csv, ROUTES.analytics, ROUTES.legacy,
  ]) {
    assert.deepEqual(input.readPromotionGetInput?.(
      get(route, route.kind === "target_list" ? "?kind=product" : "", { "idempotency-key": OPERATION_ID }),
      route,
    ), { kind: "invalid" }, route.kind);
  }
});

test("GET query decoding accepts exactly 4096 raw bytes and rejects 4097", () => {
  const encoded = "%41".repeat(1_024);
  const rawAtMaximum = `cursor=${encoded}${"A".repeat(1_017)}`;
  const rawOverMaximum = `${rawAtMaximum}A`;
  assert.equal(utf8Length(rawAtMaximum), 4_096);
  assert.equal(utf8Length(rawOverMaximum), 4_097);
  assert.deepEqual(
    input.readPromotionGetInput?.(get(ROUTES.list, `?${rawAtMaximum}`), ROUTES.list),
    { kind: "valid", value: { limit: 20, cursor: "A".repeat(2_041) } },
  );
  assert.deepEqual(
    input.readPromotionGetInput?.(get(ROUTES.list, `?${rawOverMaximum}`), ROUTES.list),
    { kind: "invalid" },
  );
});

test("promotion list query accepts one comma-separated value per set and returns canonical sorted filters", () => {
  const scheduleFrom = "2026-09-05T00:00:00.000Z";
  const scheduleTo = "2026-10-05T00:00:00.000Z";
  const query = [
    "limit=50",
    "cursor=eyJ2IjoxfQ",
    "search=Atlas",
    "effectiveStatuses=paused%2Cactive",
    "triggerKinds=code%2Cautomatic",
    "benefitKinds=percentage%2Cgift",
    "audienceModes=masked_customers%2Ceveryone",
    `scheduleFrom=${encodeURIComponent(scheduleFrom)}`,
    `scheduleTo=${encodeURIComponent(scheduleTo)}`,
  ].join("&");

  assert.deepEqual(input.readPromotionGetInput?.(
    get(ROUTES.list, `?${query}`), ROUTES.list,
  ), {
    kind: "valid",
    value: {
      limit: 50,
      cursor: "eyJ2IjoxfQ",
      search: "Atlas",
      effectiveStatuses: ["active", "paused"],
      triggerKinds: ["automatic", "code"],
      benefitKinds: ["gift", "percentage"],
      audienceModes: ["everyone", "masked_customers"],
      scheduleFrom,
      scheduleTo,
    },
  });
});

test("promotion list query rejects aliases, repeated keys, whitespace, empty set tokens, duplicates, arrays, and one-sided schedules", () => {
  for (const query of [
    "?q=Atlas",
    "?pageSize=20",
    "?search=Atlas&search=Autumn",
    "?search=%20Atlas",
    "?search=Atlas%20",
    `?scheduleFrom=${encodeURIComponent("2026-09-05T00:00:00.000Z")}`,
    `?scheduleTo=${encodeURIComponent("2026-10-05T00:00:00.000Z")}`,
    `?scheduleFrom=${encodeURIComponent("2026-09-05T00:00:00.000Z")}&scheduleFrom=${encodeURIComponent("2026-09-06T00:00:00.000Z")}&scheduleTo=${encodeURIComponent("2026-10-05T00:00:00.000Z")}`,
  ]) assert.deepEqual(input.readPromotionGetInput?.(get(ROUTES.list, query), ROUTES.list), { kind: "invalid" }, query);

  for (const [key, first, second] of [
    ["effectiveStatuses", "active", "paused"],
    ["triggerKinds", "automatic", "code"],
    ["benefitKinds", "percentage", "gift"],
    ["audienceModes", "everyone", "masked_customers"],
  ] as const) {
    for (const value of [
      "",
      `${first},`,
      `,${first}`,
      `${first},,${second}`,
      `${first},${first}`,
      `%20${first}`,
      `${first}%20`,
      `${first},%20${second}`,
      encodeURIComponent(JSON.stringify([first, second])),
    ]) {
      const query = `?${key}=${value}`;
      assert.deepEqual(input.readPromotionGetInput?.(get(ROUTES.list, query), ROUTES.list), { kind: "invalid" }, query);
    }
    const repeated = `?${key}=${first}&${key}=${second}`;
    assert.deepEqual(input.readPromotionGetInput?.(get(ROUTES.list, repeated), ROUTES.list), { kind: "invalid" }, repeated);
  }
});

test("picker query accepts exactly kind limit cursor search while batch and legacy accept only limit cursor", () => {
  assert.deepEqual(input.readPromotionGetInput?.(
    get(ROUTES.target_list, "?kind=product&limit=50&cursor=eyJ2IjoxfQ&search=Atlas"),
    ROUTES.target_list,
  ), {
    kind: "valid",
    value: { kind: "product", limit: 50, cursor: "eyJ2IjoxfQ", search: "Atlas" },
  });
  for (const query of [
    "?limit=20",
    "?kind=product&kind=variant",
    "?kind=unknown",
    "?kind=product&limit=51",
    "?kind=product&pageSize=20",
    "?kind=product&q=Atlas",
    "?kind=product&search=%20Atlas",
    "?kind=product&effectiveStatuses=active",
    "?kind=product&scheduleFrom=2026-09-05T00%3A00%3A00.000Z",
  ]) assert.deepEqual(input.readPromotionGetInput?.(get(ROUTES.target_list, query), ROUTES.target_list), { kind: "invalid" }, query);

  for (const route of [ROUTES.code_batch_list, ROUTES.legacy]) {
    assert.deepEqual(input.readPromotionGetInput?.(
      get(route, "?limit=100&cursor=eyJ2IjoxfQ"), route,
    ), { kind: "valid", value: { limit: 100, cursor: "eyJ2IjoxfQ" } }, route.kind);
    for (const query of [
      "?pageSize=20",
      "?search=Atlas",
      "?kind=product",
      "?effectiveStatuses=active",
      "?limit=20&cursor=A&unknown=value",
      "?cursor=A&cursor=B",
    ]) assert.deepEqual(input.readPromotionGetInput?.(get(route, query), route), { kind: "invalid" }, `${route.kind}:${query}`);
  }
});

test("GET query syntax rejects duplicates, unknown authority, encoded keys, and forbidden route queries", () => {
  for (const query of [
    "?storeId=forged",
    "?tenantId=forged",
    "?limit=20&limit=20",
    "?limit=020",
    "?%6cimit=20",
    "?limit=20&",
    "?&limit=20",
    "?limit=20&&cursor=A",
    "?unknown=value",
  ]) assert.deepEqual(input.readPromotionGetInput?.(get(ROUTES.list, query), ROUTES.list), { kind: "invalid" }, query);

  for (const route of [ROUTES.detail, ROUTES.code_batch_csv, ROUTES.analytics]) {
    assert.deepEqual(input.readPromotionGetInput?.(get(route, "?limit=20"), route), { kind: "invalid" }, route.kind);
  }
  assert.deepEqual(input.readPromotionGetInput?.(get(ROUTES.target_list), ROUTES.target_list), { kind: "invalid" });
});
