import assert from "node:assert/strict";
import test from "node:test";
import { validateCatalogMigrationRequestAuthority } from "./request-authority.ts";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const PATH = "/api/catalog/admin/migrations/woocommerce";

function request(path = PATH, method = "POST", origin: string | null = ORIGIN, headers: HeadersInit = {}) {
  const selected = new Headers(headers);
  if (origin !== null) selected.set("origin", origin);
  return new Request(`http://customer-panel:3400${path}`, { method, headers: selected });
}

test("accepts the exact proxied path and server-configured same Origin", () => {
  assert.equal(validateCatalogMigrationRequestAuthority(request(), { method: "POST", pathname: PATH, panelOrigin: ORIGIN }), "allowed");
  assert.equal(validateCatalogMigrationRequestAuthority(request(PATH, "GET", null), { method: "GET", pathname: PATH, panelOrigin: ORIGIN }), "allowed");
});

test("rejects wrong origin method path query fragment and browser tenant authority", () => {
  for (const selected of [
    request(PATH, "POST", null), request(PATH, "POST", "https://attacker.test"), request(`${PATH}/child`),
    request(`${PATH}?storeId=55000000-0000-4000-8000-000000000001`),
    request(`${PATH}#fragment`), request(PATH, "PUT"), request(PATH, "POST", ORIGIN, { "x-store-id": "55000000-0000-4000-8000-000000000001" }),
    request(PATH, "POST", ORIGIN, { authorization: "Bearer private" }),
  ]) assert.notEqual(validateCatalogMigrationRequestAuthority(selected, { method: "POST", pathname: PATH, panelOrigin: ORIGIN }), "allowed");
});

test("configured public authority is canonical HTTPS and forwarded headers never rescue a denial", () => {
  for (const panelOrigin of ["http://panel.example.test", "https://panel.example.test/path", "https://panel.example.test/"]) {
    assert.equal(validateCatalogMigrationRequestAuthority(request(), { method: "POST", pathname: PATH, panelOrigin }), "unavailable");
  }
  assert.equal(validateCatalogMigrationRequestAuthority(request(`${PATH}/wrong`, "POST", "https://attacker.test", {
    forwarded: `host=panel.saas-staging.celebix.site;proto=https`,
    "x-forwarded-host": "panel.saas-staging.celebix.site", "x-forwarded-proto": "https",
  }), { method: "POST", pathname: PATH, panelOrigin: ORIGIN }), "invalid_input");
});
