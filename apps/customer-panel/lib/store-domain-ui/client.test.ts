import assert from "node:assert/strict";
import test from "node:test";

import { createStoreDomainApiClient, StoreDomainApiError } from "./client.ts";

const DOMAIN_ID = "77000000-0000-4000-8000-000000000088";
const OPERATION_ID = "79000000-0000-4000-8000-000000000088";
const DOMAIN = Object.freeze({
  schemaVersion: 1, id: DOMAIN_ID, hostname: "shop.example.com", hostnameType: "custom_domain",
  status: "pending", primary: false, uiStatus: "dns_pending",
  dnsInstructions: [{ type: "CNAME", name: "shop", value: "custom.saas-staging.celebix.site" }],
  verifiedAt: null, version: 2, createdAt: "2026-08-05T10:00:00.000Z", updatedAt: "2026-08-05T10:00:00.000Z",
});

function fetcher(responses: unknown[]) {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  return Object.freeze({
    calls,
    fetch: async (path: string | URL | Request, init?: RequestInit) => {
      calls.push({ path: String(path), init });
      return Response.json(responses.shift(), { status: 200 });
    },
  });
}

test("lists and creates custom domains with exact browser requests", async () => {
  const mock = fetcher([{ items: [DOMAIN] }, { domain: DOMAIN }]);
  const api = createStoreDomainApiClient(mock.fetch as typeof fetch, () => OPERATION_ID);
  assert.deepEqual(await api.list(), [DOMAIN]);
  assert.deepEqual(await api.create("shop.example.com"), DOMAIN);
  assert.equal(mock.calls[0]?.path, "/api/store-domains");
  assert.equal(mock.calls[0]?.init?.credentials, "same-origin");
  assert.equal(mock.calls[1]?.init?.method, "POST");
  assert.equal(new Headers(mock.calls[1]?.init?.headers).get("idempotency-key"), OPERATION_ID);
  assert.equal(mock.calls[1]?.init?.body, JSON.stringify({ hostname: "shop.example.com" }));
});

test("recheck primary and remove carry the durable version", async () => {
  const mock = fetcher([{ domain: DOMAIN }, { domain: DOMAIN }, { domain: { ...DOMAIN, status: "disabled", uiStatus: "disabled", version: 3 } }]);
  const api = createStoreDomainApiClient(mock.fetch as typeof fetch, () => OPERATION_ID);
  await api.recheck(DOMAIN_ID, 2);
  await api.makePrimary(DOMAIN_ID, 2);
  await api.remove(DOMAIN_ID, 2);
  assert.deepEqual(mock.calls.map(({ path, init }) => [path, init?.method, init?.body]), [
    [`/api/store-domains/${DOMAIN_ID}/recheck`, "POST", JSON.stringify({ expectedVersion: 2 })],
    [`/api/store-domains/${DOMAIN_ID}/primary`, "POST", JSON.stringify({ expectedVersion: 2 })],
    [`/api/store-domains/${DOMAIN_ID}`, "DELETE", JSON.stringify({ expectedVersion: 2 })],
  ]);
});

test("malformed success responses and finite API errors fail closed", async () => {
  const malformed = fetcher([{ items: [{ ...DOMAIN, version: 0 }] }]);
  await assert.rejects(() => createStoreDomainApiClient(malformed.fetch as typeof fetch).list(), (error: unknown) => error instanceof StoreDomainApiError && error.code === "unavailable");
  const denied = createStoreDomainApiClient(async () => Response.json({ code: "feature_not_enabled" }, { status: 403 }));
  await assert.rejects(() => denied.list(), (error: unknown) => error instanceof StoreDomainApiError && error.code === "feature_not_enabled" && error.status === 403);
});
