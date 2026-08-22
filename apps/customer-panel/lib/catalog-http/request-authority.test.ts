import assert from "node:assert/strict";
import test from "node:test";

type AuthorityModule = typeof import("./request-authority.ts");
const authority = await import("./request-authority.ts").catch(
  () => ({} as Partial<AuthorityModule>),
);

const PANEL_ORIGIN = "https://panel.saas-staging.celebix.site";
const TENANT_ADMIN_ORIGIN = "https://atlas-store.admin.saas-staging.celebix.site";
const PRODUCTS = "/api/catalog/products";
const SUMMARY = "/api/catalog/summary";
const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function request(options: {
  url?: string;
  method?: string;
  origin?: string | null;
  headers?: HeadersInit;
} = {}) {
  const headers = new Headers(options.headers);
  if (options.origin !== null) headers.set("origin", options.origin ?? PANEL_ORIGIN);
  return new Request(options.url ?? `http://customer-panel:3400${PRODUCTS}`, {
    method: options.method ?? "POST",
    headers,
  });
}

test("mutation authority accepts internal HTTP or HTTPS delivery only with exact public Origin and path", () => {
  assert.equal(typeof authority.createCatalogRequestAuthorityValidator, "function");
  const validator = authority.createCatalogRequestAuthorityValidator?.({ panelOrigin: PANEL_ORIGIN });
  for (const url of [
    `http://customer-panel:3400${PRODUCTS}`,
    `https://internal.service${PRODUCTS}`,
    `${PANEL_ORIGIN}${PRODUCTS}`,
  ]) {
    assert.equal(validator?.validate(request({ url }), {
      method: "POST",
      pathname: PRODUCTS,
      query: "forbidden",
    }), "approved");
  }
});

test("mutation authority accepts tenant admin Origin shape without trusting the proxy Host", () => {
  const validator = authority.createCatalogRequestAuthorityValidator?.({ panelOrigin: PANEL_ORIGIN });
  assert.equal(validator?.validate(request({
    url: `http://customer-panel:3400${PRODUCTS}`,
    origin: TENANT_ADMIN_ORIGIN,
    headers: {
      host: "customer-panel:3400",
      forwarded: "host=wrong.example;proto=https",
      "x-forwarded-host": "wrong.example",
      "x-forwarded-proto": "https",
    },
  }), { method: "POST", pathname: PRODUCTS, query: "forbidden" }), "approved");
});

test("mutation authority denies missing wrong malformed and forwarded Origin authority", () => {
  const validator = authority.createCatalogRequestAuthorityValidator?.({ panelOrigin: PANEL_ORIGIN });
  for (const origin of [
    null,
    "null",
    "https://wrong.example",
    `${PANEL_ORIGIN}:443`,
    `${PANEL_ORIGIN}, https://wrong.example`,
    "https://panel.saas-staging.celebix .site",
  ]) {
    assert.equal(validator?.validate(request({
      origin,
      headers: {
        host: "panel.saas-staging.celebix.site",
        forwarded: "host=panel.saas-staging.celebix.site;proto=https",
        "x-forwarded-host": "panel.saas-staging.celebix.site",
        "x-forwarded-proto": "https",
      },
    }), { method: "POST", pathname: PRODUCTS, query: "forbidden" }), "origin_denied");
  }
});

test("wrong method path query fragment and credentials fail before handler authority", () => {
  const validator = authority.createCatalogRequestAuthorityValidator?.({ panelOrigin: PANEL_ORIGIN });
  const cases = [
    request({ method: "GET" }),
    request({ url: `http://internal/api/catalog/products-child` }),
    request({ url: `http://internal${PRODUCTS}/` }),
    request({ url: `http://internal${PRODUCTS}?storeId=${PRODUCT_ID}` }),
    request({ url: `http://internal${PRODUCTS}#fragment` }),
    request({ url: `ftp://internal${PRODUCTS}` }),
  ];
  assert.equal(validator?.validate(cases[0], { method: "POST", pathname: PRODUCTS, query: "forbidden" }), "method_not_allowed");
  for (const candidate of cases.slice(1)) {
    assert.equal(validator?.validate(candidate, { method: "POST", pathname: PRODUCTS, query: "forbidden" }), "request_invalid");
  }
});

test("GET authority needs no Origin but permits query only for the collection route", () => {
  const validator = authority.createCatalogRequestAuthorityValidator?.({ panelOrigin: PANEL_ORIGIN });
  assert.equal(validator?.validate(request({
    method: "GET",
    origin: null,
    url: `http://internal${PRODUCTS}?limit=20&status=active`,
  }), { method: "GET", pathname: PRODUCTS, query: "allowed" }), "approved");
  assert.equal(validator?.validate(request({
    method: "GET",
    origin: null,
    url: `http://internal${PRODUCTS}/${PRODUCT_ID}?limit=20`,
  }), { method: "GET", pathname: `${PRODUCTS}/${PRODUCT_ID}`, query: "forbidden" }), "request_invalid");
  assert.equal(validator?.validate(request({
    method: "GET",
    origin: null,
    url: `http://internal${SUMMARY}`,
  }), { method: "GET", pathname: SUMMARY, query: "forbidden" }), "approved");
  for (const url of [
    `http://internal${SUMMARY}?storeId=forged`,
    `http://internal${SUMMARY}/`,
    `http://internal${SUMMARY}-evil`,
    `http://internal${SUMMARY}#fragment`,
  ]) {
    assert.equal(validator?.validate(request({ method: "GET", origin: null, url }), {
      method: "GET",
      pathname: SUMMARY,
      query: "forbidden",
    }), "request_invalid");
  }
});

test("validator construction accepts only a canonical HTTPS panel origin", () => {
  for (const value of ["http://panel.example", "https://panel.example/path", "https://panel.example:443", " https://panel.example"]) {
    assert.throws(() => authority.createCatalogRequestAuthorityValidator?.({ panelOrigin: value }), /catalog_request_authority_invalid/);
  }
});
