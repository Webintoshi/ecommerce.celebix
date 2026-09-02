import assert from "node:assert/strict";
import test from "node:test";

import { createAdminDomainApiClient } from "./client.ts";
import { StoreDomainApiError } from "../store-domain-ui/client.ts";

const DOMAIN_ID = "77000000-0000-4000-8000-000000000120";
const OPERATION_ID = "79000000-0000-4000-8000-000000000120";
const DOMAIN = Object.freeze({
  schemaVersion: 1, id: DOMAIN_ID, hostname: "admin.example.com", kind: "custom_alias", status: "pending_verification",
  primary: false, fallback: false, hostnameStatus: "pending", sslStatus: "pending", dnsStatus: "pending", originStatus: "pending",
  uiStatus: "dns_pending", dnsInstructions: [{ type: "CNAME", name: "admin", value: "customers.saas-staging.celebix.site" }],
  verifiedAt: null, lastCheckedAt: null, version: 1, createdAt: "2026-09-02T10:00:00.000Z", updatedAt: "2026-09-02T10:00:00.000Z",
});

function fetcher(responses: unknown[]) {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  return Object.freeze({ calls, fetch: async (path: string | URL | Request, init?: RequestInit) => {
    calls.push({ path: String(path), init });
    return Response.json(responses.shift(), { status: 200 });
  } });
}

test("lists and creates exact admin-prefixed domains", async () => {
  const mock = fetcher([{ items: [DOMAIN] }, { domain: DOMAIN }]);
  const api = createAdminDomainApiClient(mock.fetch as typeof fetch, () => OPERATION_ID);
  assert.deepEqual(await api.list(), [DOMAIN]);
  assert.deepEqual(await api.create(" ADMIN.EXAMPLE.COM "), DOMAIN);
  assert.equal(mock.calls[0]?.path, "/api/admin-domains");
  assert.equal(mock.calls[0]?.init?.credentials, "same-origin");
  assert.equal(mock.calls[1]?.init?.method, "POST");
  assert.equal(new Headers(mock.calls[1]?.init?.headers).get("idempotency-key"), OPERATION_ID);
  assert.equal(mock.calls[1]?.init?.body, JSON.stringify({ hostname: "admin.example.com" }));
});

test("recheck primary and remove preserve durable version", async () => {
  const mock = fetcher([{ domain: DOMAIN }, { domain: DOMAIN }, { domain: { ...DOMAIN, status: "disabled", uiStatus: "disabled", version: 2 } }]);
  const api = createAdminDomainApiClient(mock.fetch as typeof fetch, () => OPERATION_ID);
  await api.recheck(DOMAIN_ID, 1);
  await api.makePrimary(DOMAIN_ID, 1);
  await api.remove(DOMAIN_ID, 1);
  assert.deepEqual(mock.calls.map(({ path, init }) => [path, init?.method, init?.body]), [
    [`/api/admin-domains/${DOMAIN_ID}/recheck`, "POST", JSON.stringify({ expectedVersion: 1 })],
    [`/api/admin-domains/${DOMAIN_ID}/primary`, "POST", JSON.stringify({ expectedVersion: 1 })],
    [`/api/admin-domains/${DOMAIN_ID}`, "DELETE", JSON.stringify({ expectedVersion: 1 })],
  ]);
});

test("invalid hostnames and malformed finite-state projections fail closed", async () => {
  const api = createAdminDomainApiClient(fetcher([]).fetch as typeof fetch, () => OPERATION_ID);
  assert.throws(() => api.create("panel.example.com"), (error: unknown) => error instanceof StoreDomainApiError && error.code === "invalid_input");
  const malformed = createAdminDomainApiClient(fetcher([{ items: [{ ...DOMAIN, sslStatus: "issued" }] }]).fetch as typeof fetch);
  await assert.rejects(() => malformed.list(), (error: unknown) => error instanceof StoreDomainApiError && error.code === "unavailable");
});
