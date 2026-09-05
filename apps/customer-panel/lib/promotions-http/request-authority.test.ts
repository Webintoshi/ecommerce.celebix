import assert from "node:assert/strict";
import test from "node:test";

type AuthorityModule = typeof import("./request-authority.ts");
const authority = await import("./request-authority.ts").catch(
  () => ({} as Partial<AuthorityModule>),
);

const PANEL_ORIGIN = "https://panel.saas-staging.celebix.site";
const TENANT_ADMIN_ORIGIN = "https://atlas-store.admin.saas-staging.celebix.site";
const PROMOTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BATCH_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function request(
  pathname: string,
  method: string,
  options: Readonly<{ origin?: string | null; headers?: HeadersInit }> = {},
): Request {
  const headers = new Headers(options.headers);
  if (options.origin !== undefined && options.origin !== null) headers.set("origin", options.origin);
  return new Request(`http://customer-panel:3400${pathname}`, { method, headers });
}

test("classifies the exact promotions REST matrix with static routes before dynamic IDs", () => {
  assert.equal(typeof authority.classifyPromotionRequest, "function");
  const cases = [
    ["GET", "/api/promotions", { kind: "list", method: "GET", pathname: "/api/promotions" }],
    ["POST", "/api/promotions", { kind: "create", method: "POST", pathname: "/api/promotions" }],
    ["GET", `/api/promotions/${PROMOTION_ID}`, { kind: "detail", method: "GET", pathname: `/api/promotions/${PROMOTION_ID}`, promotionId: PROMOTION_ID }],
    ["PATCH", `/api/promotions/${PROMOTION_ID}`, { kind: "update", method: "PATCH", pathname: `/api/promotions/${PROMOTION_ID}`, promotionId: PROMOTION_ID }],
    ["POST", `/api/promotions/${PROMOTION_ID}/publish`, { kind: "publish", method: "POST", pathname: `/api/promotions/${PROMOTION_ID}/publish`, promotionId: PROMOTION_ID }],
    ["POST", `/api/promotions/${PROMOTION_ID}/pause`, { kind: "pause", method: "POST", pathname: `/api/promotions/${PROMOTION_ID}/pause`, promotionId: PROMOTION_ID }],
    ["POST", `/api/promotions/${PROMOTION_ID}/resume`, { kind: "resume", method: "POST", pathname: `/api/promotions/${PROMOTION_ID}/resume`, promotionId: PROMOTION_ID }],
    ["POST", `/api/promotions/${PROMOTION_ID}/duplicate`, { kind: "duplicate", method: "POST", pathname: `/api/promotions/${PROMOTION_ID}/duplicate`, promotionId: PROMOTION_ID }],
    ["POST", `/api/promotions/${PROMOTION_ID}/archive`, { kind: "archive", method: "POST", pathname: `/api/promotions/${PROMOTION_ID}/archive`, promotionId: PROMOTION_ID }],
    ["POST", "/api/promotions/simulate", { kind: "simulate", method: "POST", pathname: "/api/promotions/simulate" }],
    ["POST", "/api/promotions/conflicts", { kind: "conflicts", method: "POST", pathname: "/api/promotions/conflicts" }],
    ["POST", "/api/promotions/margin", { kind: "margin", method: "POST", pathname: "/api/promotions/margin" }],
    ["GET", "/api/promotions/targets", { kind: "target_list", method: "GET", pathname: "/api/promotions/targets" }],
    ["POST", "/api/promotions/targets/resolve", { kind: "target_resolve", method: "POST", pathname: "/api/promotions/targets/resolve" }],
    ["GET", `/api/promotions/${PROMOTION_ID}/code-batches`, { kind: "code_batch_list", method: "GET", pathname: `/api/promotions/${PROMOTION_ID}/code-batches`, promotionId: PROMOTION_ID }],
    ["POST", `/api/promotions/${PROMOTION_ID}/code-batches`, { kind: "code_batch_create", method: "POST", pathname: `/api/promotions/${PROMOTION_ID}/code-batches`, promotionId: PROMOTION_ID }],
    ["POST", `/api/promotions/code-batches/${BATCH_ID}/status`, { kind: "code_batch_status", method: "POST", pathname: `/api/promotions/code-batches/${BATCH_ID}/status`, batchId: BATCH_ID }],
    ["GET", `/api/promotions/code-batches/${BATCH_ID}/csv`, { kind: "code_batch_csv", method: "GET", pathname: `/api/promotions/code-batches/${BATCH_ID}/csv`, batchId: BATCH_ID }],
    ["GET", `/api/promotions/${PROMOTION_ID}/analytics`, { kind: "analytics", method: "GET", pathname: `/api/promotions/${PROMOTION_ID}/analytics`, promotionId: PROMOTION_ID }],
    ["GET", "/api/promotions/legacy", { kind: "legacy", method: "GET", pathname: "/api/promotions/legacy" }],
  ] as const;

  for (const [method, pathname, route] of cases) {
    assert.deepEqual(
      authority.classifyPromotionRequest?.(request(pathname, method)),
      { kind: "approved", route },
      `${method} ${pathname}`,
    );
  }
});

test("returns exact finite Allow values for every known route family", () => {
  const cases = [
    ["/api/promotions", "GET, POST"],
    [`/api/promotions/${PROMOTION_ID}`, "GET, PATCH"],
    [`/api/promotions/${PROMOTION_ID}/publish`, "POST"],
    [`/api/promotions/${PROMOTION_ID}/pause`, "POST"],
    [`/api/promotions/${PROMOTION_ID}/resume`, "POST"],
    [`/api/promotions/${PROMOTION_ID}/duplicate`, "POST"],
    [`/api/promotions/${PROMOTION_ID}/archive`, "POST"],
    ["/api/promotions/simulate", "POST"],
    ["/api/promotions/conflicts", "POST"],
    ["/api/promotions/margin", "POST"],
    ["/api/promotions/targets", "GET"],
    ["/api/promotions/targets/resolve", "POST"],
    [`/api/promotions/${PROMOTION_ID}/code-batches`, "GET, POST"],
    [`/api/promotions/code-batches/${BATCH_ID}/status`, "POST"],
    [`/api/promotions/code-batches/${BATCH_ID}/csv`, "GET"],
    [`/api/promotions/${PROMOTION_ID}/analytics`, "GET"],
    ["/api/promotions/legacy", "GET"],
  ] as const;

  for (const [pathname, allow] of cases) {
    assert.deepEqual(
      authority.classifyPromotionRequest?.(request(pathname, "DELETE")),
      { kind: "method_not_allowed", allow },
      pathname,
    );
  }
});

test("static promotion routes cannot be captured as promotion identifiers", () => {
  for (const [method, pathname, kind] of [
    ["POST", "/api/promotions/simulate", "simulate"],
    ["POST", "/api/promotions/conflicts", "conflicts"],
    ["POST", "/api/promotions/margin", "margin"],
    ["GET", "/api/promotions/targets", "target_list"],
    ["POST", "/api/promotions/targets/resolve", "target_resolve"],
    ["POST", `/api/promotions/code-batches/${BATCH_ID}/status`, "code_batch_status"],
    ["GET", `/api/promotions/code-batches/${BATCH_ID}/csv`, "code_batch_csv"],
    ["GET", "/api/promotions/legacy", "legacy"],
  ] as const) {
    const decision = authority.classifyPromotionRequest?.(request(pathname, method));
    assert.equal(decision?.kind, "approved", pathname);
    assert.equal(decision?.kind === "approved" ? decision.route.kind : null, kind, pathname);
    assert.equal(decision?.kind === "approved" && "promotionId" in decision.route, false, pathname);
  }
});

test("rejects unknown or noncanonical paths, identifiers, credentials, protocols, and fragments", () => {
  for (const candidate of [
    request("/api/promotions/", "GET"),
    request("/api/promotions-evil", "GET"),
    request(`/api/promotions/${PROMOTION_ID.toUpperCase()}`, "GET"),
    request(`/api/promotions/${PROMOTION_ID}/publish/`, "POST"),
    request(`/api/promotions/code-batches/${BATCH_ID}/unknown`, "GET"),
    request(`/api/promotions/${PROMOTION_ID}/code-batches/${BATCH_ID}`, "GET"),
  ]) {
    assert.deepEqual(authority.classifyPromotionRequest?.(candidate), { kind: "not_found" });
  }

  const credentialed = new Request("http://internal/api/promotions");
  Object.defineProperty(credentialed, "url", { value: "http://user:secret@internal/api/promotions" });
  for (const candidate of [
    new Request("ftp://internal/api/promotions"),
    credentialed,
    new Request("http://internal/api/promotions#private"),
  ]) {
    assert.deepEqual(authority.classifyPromotionRequest?.(candidate), { kind: "invalid" });
  }
});

test("mutation routes deny every query while GET query policy remains delegated to request input", () => {
  for (const [method, pathname] of [
    ["POST", "/api/promotions"],
    ["PATCH", `/api/promotions/${PROMOTION_ID}`],
    ["POST", `/api/promotions/${PROMOTION_ID}/publish`],
    ["POST", "/api/promotions/simulate"],
    ["POST", "/api/promotions/targets/resolve"],
    ["POST", `/api/promotions/${PROMOTION_ID}/code-batches`],
    ["POST", `/api/promotions/code-batches/${BATCH_ID}/status`],
  ] as const) {
    assert.deepEqual(
      authority.classifyPromotionRequest?.(request(`${pathname}?storeId=${PROMOTION_ID}`, method)),
      { kind: "invalid" },
      `${method} ${pathname}`,
    );
  }
  assert.equal(
    authority.classifyPromotionRequest?.(request("/api/promotions?pageSize=20", "GET"))?.kind,
    "approved",
  );
});

test("rejects the complete private-authority and forwarding-header superset", () => {
  const names = [
    "authorization",
    "forwarded",
    "x-panel-session-credential",
    "x-store-id",
    "x-tenant-id",
    "x-principal-id",
    "x-principal-subject",
    "x-membership-id",
    "x-membership-role",
    "x-plan-id",
    "x-plan-code",
    "x-plan-version",
    "x-store-slug",
    "x-database-role",
    "x-database-url",
    "x-celebix-anything",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-port",
    "x-forwarded-proto",
    "x-forwarded-server",
    "x-forwarded-uri",
    "x-forwarded-prefix",
    "x-forwarded-ssl",
  ] as const;
  for (const name of names) {
    const value = name === "authorization" ? "Bearer private" : "private";
    assert.deepEqual(
      authority.classifyPromotionRequest?.(request("/api/promotions", "GET", { headers: { [name]: value } })),
      { kind: "invalid" },
      name,
    );
  }
});

test("route preparation strips only known proxy transport headers and preserves Host and unknown forwarding headers", () => {
  assert.equal(typeof authority.preparePromotionRouteRequest, "function");
  const prepared = authority.preparePromotionRouteRequest?.(request("/api/promotions", "GET", {
    headers: {
      host: "customer-panel:3400",
      "x-forwarded-for": "127.0.0.1",
      "x-forwarded-host": "customer-panel:3400",
      "x-forwarded-port": "3400",
      "x-forwarded-proto": "http",
      "x-forwarded-server": "coolify-proxy",
      "x-forwarded-uri": "/api/promotions",
    },
  }));
  assert.equal(prepared?.headers.get("host"), "customer-panel:3400");
  for (const name of [
    "x-forwarded-for", "x-forwarded-host", "x-forwarded-port", "x-forwarded-proto", "x-forwarded-server",
  ]) assert.equal(prepared?.headers.has(name), false, name);
  assert.equal(prepared?.headers.get("x-forwarded-uri"), "/api/promotions");
  assert.deepEqual(authority.classifyPromotionRequest?.(prepared), { kind: "invalid" });
});

test("mutation Origin shape accepts panel, tenant-admin, and exact direct-custom origins only", () => {
  assert.equal(typeof authority.promotionOriginApproved, "function");
  assert.equal(authority.promotionOriginApproved?.(
    request("/api/promotions", "POST", { origin: PANEL_ORIGIN }), PANEL_ORIGIN,
  ), true);
  assert.equal(authority.promotionOriginApproved?.(
    request("/api/promotions", "POST", {
      origin: TENANT_ADMIN_ORIGIN,
      headers: {
        host: "customer-panel:3400",
        forwarded: "host=attacker.example;proto=https",
        "x-forwarded-host": "attacker.example",
      },
    }),
    PANEL_ORIGIN,
  ), true);
  assert.equal(authority.promotionOriginApproved?.(
    request("/api/promotions", "POST", { origin: "https://admin.merchant.example", headers: { host: "admin.merchant.example" } }),
    PANEL_ORIGIN,
  ), true);

  for (const [origin, headers] of [
    [null, {}],
    ["null", {}],
    ["https://attacker.example", {}],
    [`${PANEL_ORIGIN}/`, {}],
    [`${PANEL_ORIGIN}, https://attacker.example`, {}],
    ["http://merchant.example", { host: "merchant.example" }],
    ["https://merchant.example/path", { host: "merchant.example" }],
    ["https://merchant.example", { host: "different.example" }],
    ["https://merchant.example", { host: "merchant.example" }],
  ] as const) {
    assert.equal(
      authority.promotionOriginApproved?.(
        request("/api/promotions", "POST", { origin, headers }), PANEL_ORIGIN,
      ),
      false,
      String(origin),
    );
  }
});
