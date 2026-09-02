import assert from "node:assert/strict";
import test from "node:test";

import type {
  BarcodePrintJob,
  StoreMembershipRole,
  TenantContext,
} from "@celebix/saas-contracts";
import {
  BarcodeLabelRepositoryError,
  type BarcodeLabelRepository,
} from "@celebix/saas-data";

import { createBarcodeLabelHttpHandlers } from "./handler.ts";
import type { ServerBarcodeLabelRuntime } from "../server-barcode-labels/runtime.ts";
import { getSystemBarcodeLabelTemplate } from "../barcode-labels/system-templates.ts";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const REQUEST_ID = "88888888-8888-4888-8888-888888888888";
const OPERATION_ID = "77777777-7777-4777-8777-777777777777";
const JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = new Date("2026-09-02T12:00:00.000Z");
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 0x31).toString("base64url")}`;
const TEMPLATE = getSystemBarcodeLabelTemplate("retail-50x30")!;

function printJob(outputType: "browser" | "pdf" | "zpl"): BarcodePrintJob {
  const row = Object.freeze({
    productId: "10000000-0000-4000-8000-000000000001",
    productVersion: 1,
    variantId: "20000000-0000-4000-8000-000000000001",
    variantVersion: 1,
    productTitle: "ATLAS QA Etiketi",
    variantTitle: "Standart",
    sku: "ATLAS-001",
    barcode: "000ATLAS001",
    priceCents: 12_345,
    currency: "TRY",
    stock: 3,
    trackInventory: true,
    attributes: Object.freeze({}),
    status: "active" as const,
    updatedAt: "2026-09-02T12:00:00.000Z",
  });
  return Object.freeze({
    id: JOB_ID,
    principalId: tenantContext().principal.id,
    storeName: "Güzide Kuyumcu",
    templateName: TEMPLATE.name,
    templateConfig: TEMPLATE.config,
    outputType,
    printerProfile: outputType === "zpl" ? "zebra-203" : "thermal",
    startCell: 0,
    variantCount: 1,
    labelCount: 1,
    status: "prepared" as const,
    items: Object.freeze([
      Object.freeze({ variantId: row.variantId, quantity: 1, snapshot: row }),
    ]),
    createdAt: "2026-09-02T12:00:00.000Z",
  });
}

function tenantContext(
  role: StoreMembershipRole = "store_owner",
): TenantContext {
  return Object.freeze({
    schemaVersion: 1,
    requestId: REQUEST_ID,
    principal: Object.freeze({
      id: "44444444-4444-4444-8444-444444444444",
      issuer: "https://identity.example/oidc",
      subject: "barcode-owner",
    }),
    store: Object.freeze({
      id: "33333333-3333-4333-8333-333333333333",
      slug: "atlas-store",
      status: "active",
    }),
    membership: Object.freeze({
      id: "55555555-5555-4555-8555-555555555555",
      role,
      status: "active",
    }),
    entitlements: Object.freeze({
      schemaVersion: 1,
      planId: "66666666-6666-4666-8666-666666666666",
      planCode: "free_starter",
      version: 1,
      status: "active",
      features: Object.freeze(["catalog"]),
      limits: Object.freeze({
        products: 100,
        staff: 1,
        storageBytes: 1_024,
        monthlyOrders: 100,
      }),
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
    }),
    locale: "tr-TR",
  }) as TenantContext;
}

function repository(
  overrides: Partial<BarcodeLabelRepository> = {},
): BarcodeLabelRepository {
  const reject = async (): Promise<never> => {
    throw new Error("unexpected repository call");
  };
  return Object.freeze({
    list: reject,
    listTemplates: reject,
    saveTemplate: reject,
    archiveTemplate: reject,
    generateInternal: reject,
    listJobs: reject,
    createJob: reject,
    getJob: reject,
    ...overrides,
  }) as BarcodeLabelRepository;
}

function access(
  role: StoreMembershipRole = "store_owner",
): ServerBarcodeLabelRuntime["access"] {
  return Object.freeze({
    readiness: Object.freeze({ mode: "approved_staging" as const }),
    panelOrigin: ORIGIN,
    async resolveCredential() {
      return Object.freeze({
        kind: "authenticated",
        session: Object.freeze({}),
        tenantContext: tenantContext(role),
      }) as never;
    },
    async rotateCredential() {
      return Object.freeze({ kind: "unavailable" as const });
    },
    async revokeCredential() {
      return Object.freeze({ kind: "unavailable" as const });
    },
  });
}

function handlers(
  labels: BarcodeLabelRepository,
  role: StoreMembershipRole = "store_owner",
) {
  return createBarcodeLabelHttpHandlers({
    async resolveRuntime() {
      return Object.freeze({ access: access(role), barcodeLabels: labels });
    },
    now() {
      return new Date(NOW);
    },
    requestId() {
      return REQUEST_ID;
    },
  });
}

function request(
  path: string,
  options: {
    method?: string;
    origin?: string;
    headers?: HeadersInit;
    body?: unknown;
  } = {},
) {
  const method = options.method ?? "GET";
  const headers = new Headers(options.headers);
  headers.set("cookie", `__Host-celebix_panel=${CREDENTIAL}`);
  if (method !== "GET") {
    headers.set("content-type", "application/json");
    headers.set("origin", options.origin ?? ORIGIN);
    headers.set("idempotency-key", OPERATION_ID);
  }
  return new Request(`http://customer-panel:3400${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(options.body ?? {}),
  });
}

test("list forwards one server-bound global query without browser tenant authority", async () => {
  const calls: unknown[] = [];
  const response = await handlers(
    repository({
      async list(input) {
        calls.push(input);
        return Object.freeze({
          items: Object.freeze([]),
          catalogTotal: 1_601,
          storeName: "Güzide Kuyumcu",
        });
      },
    }),
  ).list(
    request(
      "/api/catalog/barcode-labels?q=Y%C3%BCz%C3%BCk&pageSize=100&sort=sku-asc",
    ),
  );
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    tenantContext: tenantContext(),
    now: NOW,
    query: Object.freeze({ q: "Yüzük", sort: "sku-asc", pageSize: 100 }),
    cursor: undefined,
  });
  assert.doesNotMatch(
    JSON.stringify(await response.json()),
    /storeId|principalId|membershipId/i,
  );
});

test("private authority, cross-origin mutation and analyst output fail before repository access", async () => {
  const labels = repository();
  const privateResponse = await handlers(labels).list(
    request("/api/catalog/barcode-labels", {
      headers: { "x-store-id": "forged" },
    }),
  );
  assert.equal(privateResponse.status, 400);
  const crossOrigin = await handlers(labels).internal(
    request("/api/catalog/barcodes/internal", {
      method: "POST",
      origin: "https://evil.example",
      body: { targets: [{ variantId: JOB_ID, expectedVersion: 1 }] },
    }),
  );
  assert.equal(crossOrigin.status, 403);
  const analyst = await handlers(labels, "analyst").output(
    request(`/api/catalog/barcode-print-jobs/${JOB_ID}/pdf`),
    JOB_ID,
    "pdf",
  );
  assert.equal(analyst.status, 403);
});

test("another tenant job remains an opaque 404", async () => {
  const selected = handlers(
    repository({
      async getJob() {
        throw new BarcodeLabelRepositoryError("resource_not_found");
      },
    }),
  );
  const jobResponse = await selected.job(
    request(`/api/catalog/barcode-print-jobs/${JOB_ID}`),
    JOB_ID,
  );
  assert.equal(jobResponse.status, 404);
  assert.deepEqual(await jobResponse.json(), { code: "not_found" });
  for (const kind of ["pdf", "zpl"] as const) {
    const outputResponse = await selected.output(
      request(`/api/catalog/barcode-print-jobs/${JOB_ID}/${kind}`),
      JOB_ID,
      kind,
    );
    assert.equal(outputResponse.status, 404);
    assert.deepEqual(await outputResponse.json(), { code: "not_found" });
  }
});

test("isolated print response contains only the label document and print action", async () => {
  const response = await handlers(
    repository({ async getJob() { return printJob("browser"); } }),
  ).print(request(`/products/barcode-labels/print?jobId=${JOB_ID}`));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html/);
  const page = await response.text();
  assert.match(page, /ATLAS QA Etiketi/);
  assert.match(page, /window[.]print\(\)/);
  assert.match(page, /<main class="sheet">/);
  assert.doesNotMatch(page, /dashboard|sidebar|chatbot|<header/i);
});

test("isolated A4 print uses configured page capacity and resets blanks after page one", async () => {
  const source = printJob("browser");
  const templateConfig = {
    ...source.templateConfig,
    paperType: "a4" as const,
    widthMm: 90,
    heightMm: 30,
    rows: 2,
    columns: 2,
    marginsMm: { top: 2, right: 2, bottom: 2, left: 2 },
    gapMm: { horizontal: 1, vertical: 1 },
  };
  const job = {
    ...source,
    templateConfig,
    printerProfile: "a4" as const,
    startCell: 1,
    labelCount: 5,
    items: [{ ...source.items[0]!, quantity: 5 }],
  } as BarcodePrintJob;
  const response = await handlers(
    repository({ async getJob() { return job; } }),
  ).print(request(`/products/barcode-labels/print?jobId=${JOB_ID}`));
  assert.equal(response.status, 200);
  const page = await response.text();
  assert.equal((page.match(/<main class="sheet">/g) ?? []).length, 2);
  assert.equal((page.match(/class="label blank"/g) ?? []).length, 3);
  assert.match(page, /<\/main><main class="sheet"><article class="label"/);
  assert.match(page, /grid-template-rows:repeat\(2,30mm\)/);
  assert.match(page, /sheet:not\(:last-child\)\{break-after:page\}/);
});

test("output type mismatch remains an opaque 404", async () => {
  const response = await handlers(
    repository({ async getJob() { return printJob("browser"); } }),
  ).output(
    request(`/api/catalog/barcode-print-jobs/${JOB_ID}/pdf`),
    JOB_ID,
    "pdf",
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { code: "not_found" });
});

for (const [role, expected] of [
  ["store_owner", 200],
  ["admin", 200],
  ["editor", 200],
  ["analyst", 403],
] as const) {
  test(`${role} follows canonical catalog manage authority for internal barcode mutation`, async () => {
    let calls = 0;
    const result = await handlers(
      repository({
        async generateInternal() {
          calls += 1;
          return Object.freeze({
            succeeded: Object.freeze([]),
            failed: Object.freeze([]),
            replayed: false,
          });
        },
      }),
      role,
    ).internal(
      request("/api/catalog/barcodes/internal", {
        method: "POST",
        body: { targets: [{ variantId: JOB_ID, expectedVersion: 1 }] },
      }),
    );
    assert.equal(result.status, expected);
    assert.equal(calls, expected === 200 ? 1 : 0);
  });
}

for (const declaredLength of [undefined, "1"] as const) {
  test(`mutation body is stream-bounded with ${declaredLength ? "understated" : "absent"} Content-Length`, async () => {
    let pulls = 0;
    let cancelled = false;
    const chunks = [
      new TextEncoder().encode(`{"padding":"${"a".repeat(69_990)}`),
      new TextEncoder().encode("a".repeat(70_000)),
      new TextEncoder().encode('"}'),
      new TextEncoder().encode("must-not-be-consumed"),
    ];
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks[pulls++];
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const headers = new Headers({
      cookie: `__Host-celebix_panel=${CREDENTIAL}`,
      origin: ORIGIN,
      "content-type": "application/json",
      "idempotency-key": OPERATION_ID,
    });
    if (declaredLength) headers.set("content-length", declaredLength);
    const selected = new Request(
      "http://customer-panel:3400/api/catalog/barcodes/internal",
      { method: "POST", headers, body: stream, duplex: "half" } as RequestInit,
    );
    const result = await handlers(repository()).internal(selected);
    assert.equal(result.status, 400);
    assert.equal(cancelled, true);
    assert.ok(pulls <= 3, `the fourth chunk must not be consumed (pulls=${pulls})`);
  });
}
