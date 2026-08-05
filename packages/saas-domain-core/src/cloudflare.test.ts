import assert from "node:assert/strict";
import test from "node:test";

import {
  CloudflareCustomHostnameError,
  createCloudflareCustomHostnameProvider,
} from "./index.ts";

const CONFIG = Object.freeze({
  zoneId: "zone_123",
  apiToken: "secret-token",
  apiBaseUrl: "https://api.cloudflare.com/client/v4",
  minimumTlsVersion: "1.2" as const,
  timeoutMs: 5_000,
});

function response(result: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: status < 400, errors: [], messages: [], result }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SNAPSHOT = Object.freeze({
  id: "cf-host-1",
  hostname: "www.example.com",
  status: "pending",
  ownership_verification: Object.freeze({
    type: "txt",
    name: "_cf-custom-hostname.www.example.com",
    value: "safe-token",
  }),
  ssl: Object.freeze({ status: "pending_validation", validation_records: [] }),
});

test("creates one exact custom hostname with TLS 1.2 and bearer authority", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const provider = createCloudflareCustomHostnameProvider(CONFIG, async (input, init) => {
    calls.push({ url: String(input), init });
    return response(SNAPSHOT, 201);
  });
  assert.deepEqual(await provider.create("www.example.com"), {
    providerHostnameId: "cf-host-1",
    hostname: "www.example.com",
    hostnameStatus: "pending",
    sslStatus: "pending",
    ownershipValidation: { type: "txt", name: "_cf-custom-hostname.www.example.com", value: "safe-token" },
    certificateValidation: [],
  });
  assert.equal(calls[0]?.url, "https://api.cloudflare.com/client/v4/zones/zone_123/custom_hostnames");
  assert.equal(new Headers(calls[0]?.init?.headers).get("authorization"), "Bearer secret-token");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    hostname: "www.example.com",
    ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } },
  });
});

test("gets finds and removes only bounded custom hostname authority", async () => {
  const methods: string[] = [];
  const provider = createCloudflareCustomHostnameProvider(CONFIG, async (input, init) => {
    methods.push(`${init?.method}:${String(input)}`);
    if (init?.method === "DELETE") return response({ id: "cf-host-1" });
    if (String(input).includes("?hostname=")) return response([SNAPSHOT]);
    return response({ ...SNAPSHOT, status: "active", ssl: { status: "active", validation_records: [] } });
  });
  assert.equal((await provider.get("cf-host-1")).hostnameStatus, "active");
  assert.equal((await provider.find("www.example.com"))?.providerHostnameId, "cf-host-1");
  assert.deepEqual(await provider.remove("cf-host-1"), { deleted: true });
  assert.deepEqual(methods.map((entry) => entry.split(":", 1)[0]), ["GET", "GET", "DELETE"]);
});

test("classifies rate limits duplicates not-found and transient failures without provider detail", async () => {
  const cases = [
    [429, "rate_limited", true],
    [409, "duplicate", false],
    [404, "not_found", false],
    [503, "unavailable", true],
  ] as const;
  for (const [status, code, retryable] of cases) {
    const provider = createCloudflareCustomHostnameProvider(CONFIG, async () => new Response(
      JSON.stringify({ success: false, errors: [{ code: 999, message: "secret-token safe-token private detail" }], messages: [], result: null }),
      { status, headers: { "content-type": "application/json" } },
    ));
    await assert.rejects(provider.create("www.example.com"), (caught: unknown) => {
      assert.ok(caught instanceof CloudflareCustomHostnameError);
      assert.equal(caught.code, code);
      assert.equal(caught.retryable, retryable);
      assert.doesNotMatch(`${caught.message}:${JSON.stringify(caught)}`, /secret-token|safe-token|private detail/u);
      return true;
    });
  }
});

test("rejects malformed success projections and contains network failures", async () => {
  const malformed = createCloudflareCustomHostnameProvider(CONFIG, async () => response({ ...SNAPSHOT, private_field: "leak" }));
  await assert.rejects(malformed.get("cf-host-1"), (caught: unknown) => caught instanceof CloudflareCustomHostnameError && caught.code === "malformed_response");

  const unavailable = createCloudflareCustomHostnameProvider(CONFIG, async () => { throw new Error("secret-token network detail"); });
  await assert.rejects(unavailable.get("cf-host-1"), (caught: unknown) => {
    assert.ok(caught instanceof CloudflareCustomHostnameError);
    assert.equal(caught.code, "unavailable");
    assert.equal(caught.retryable, true);
    assert.doesNotMatch(caught.message, /secret-token|network detail/u);
    return true;
  });
});

test("aborts a bounded provider call and exposes only retryable unavailability", async () => {
  const provider = createCloudflareCustomHostnameProvider({ ...CONFIG, timeoutMs: 100 }, async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
  }));
  await assert.rejects(provider.get("cf-host-1"), (caught: unknown) => {
    assert.ok(caught instanceof CloudflareCustomHostnameError);
    assert.equal(caught.code, "unavailable");
    assert.equal(caught.retryable, true);
    return true;
  });
});

test("rejects unsafe configuration and identifiers before fetch", async () => {
  assert.throws(() => createCloudflareCustomHostnameProvider({ ...CONFIG, apiBaseUrl: "http://api.cloudflare.com" }, fetch), /cloudflare_custom_hostname_invalid_input/u);
  const provider = createCloudflareCustomHostnameProvider(CONFIG, async () => { throw new Error("fetch_called"); });
  await assert.rejects(provider.get("../host"), /cloudflare_custom_hostname_invalid_input/u);
});
