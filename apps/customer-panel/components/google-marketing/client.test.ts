import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

async function api(fetcher: typeof fetch) {
  assert.ok(existsSync(new URL("./client.ts", import.meta.url)), "Google marketing client must implement the agreed transport");
  const { createGoogleMarketingClient } = await import("./client.ts");
  return createGoogleMarketingClient(fetcher);
}

const connection = { service: "gtm", version: 2, status: "connected", googleEmail: "admin@example.test", selection: { accountId: "12", resourceId: "34", resourceName: "Store", tagId: "GTM-AB1234" }, lastCheckedAt: null, errorCode: null };

test("overview does not discover accounts and requests no-store same-origin data", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const client = await api(async (url, init) => {
    requests.push({ url: String(url), init });
    return Response.json({ storeDomain: "store.example.test", oauthConfigured: false, connections: [connection] });
  });
  const result = await client.overview();
  assert.equal(result.oauthConfigured, false);
  assert.deepEqual(requests.map(r => r.url), ["/api/marketing/google"]);
  assert.equal(requests[0].init?.credentials, "same-origin");
  assert.equal(requests[0].init?.cache, "no-store");
});

test("apply uses the caller's operation key so transport retries cannot start another operation", async () => {
  const keys: unknown[] = [];
  const bodies: unknown[] = [];
  const client = await api(async (_url, init) => {
    keys.push(new Headers(init?.headers).get("Idempotency-Key"));
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json(connection);
  });
  const input = { service: "gtm" as const, expectedVersion: 1, selection: connection.selection };
  const operationId = "431a9166-250c-45d1-9b75-af5b304512e4";
  await client.apply(input, operationId);
  await client.apply(input, operationId);
  assert.deepEqual(keys, [operationId, operationId]);
  assert.deepEqual(bodies, [input, input]);
});

test("resource discovery encodes only selected service and account", async () => {
  let requested = "";
  const client = await api(async url => {
    requested = String(url);
    return Response.json({ accounts: [], resources: [] });
  });
  await client.resources("ads", "1234567890");
  assert.equal(requested, "/api/marketing/google/resources?service=ads&accountId=1234567890");
});

test("provider failure details and unexpected response fields never reach user-facing errors", async () => {
  const client = await api(async () => Response.json({ code: "raw_secret_token", details: "sensitive provider response" }, { status: 502 }));
  await assert.rejects(client.overview(), (error: unknown) => {
    assert.equal((error as { code: string }).code, "unavailable");
    assert.doesNotMatch(String(error), /raw_secret_token|sensitive provider/);
    return true;
  });
});

test("authorization redirects are accepted only from Google's HTTPS authorization endpoint", async () => {
  const client = await api(async () => Response.json({ authorizationUrl: "https://attacker.example.test/collect" }));
  await assert.rejects(client.connect("ads", "431a9166-250c-45d1-9b75-af5b304512e4"));
});
