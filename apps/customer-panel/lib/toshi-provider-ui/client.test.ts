import assert from "node:assert/strict";
import test from "node:test";

import { createToshiProviderApi, ToshiProviderApiError } from "./client.ts";

const OPERATION = "72000000-0000-4000-8000-000000000001";
const NOW = "2026-08-02T12:00:00.000Z";
const CONNECTION = Object.freeze({
  provider: "openai" as const,
  label: "OpenAI",
  status: "active" as const,
  isDefault: true,
  maskedKey: "••••ture",
  selectedModel: "gpt-5",
  availableModels: Object.freeze([Object.freeze({ id: "gpt-5", label: "gpt-5" })]),
  version: 1,
  verifiedAt: NOW,
  updatedAt: NOW,
});

function capture(payload: unknown = CONNECTION, status = 200) {
  const calls: Array<{ path: string; init: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ path: String(input), init: { ...init } });
    return Response.json(payload, { status });
  };
  return Object.assign(fetcher, { calls });
}

test("provider client uses same-origin credentials and never adds the submitted key to URLs or headers", async () => {
  const fetcher = capture();
  const api = createToshiProviderApi(fetcher, () => OPERATION);
  await api.connect("openai", { apiKey: "sk-private", expectedVersion: 0 });
  assert.equal(fetcher.calls[0]?.path, "/api/settings/artificial-intelligence/providers/openai/connect");
  assert.equal(fetcher.calls[0]?.init.credentials, "same-origin");
  assert.equal(fetcher.calls[0]?.init.cache, "no-store");
  const headers = new Headers(fetcher.calls[0]?.init.headers);
  assert.equal(headers.get("idempotency-key"), OPERATION);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(fetcher.calls[0]?.path.includes("sk-private"), false);
  assert.equal(JSON.stringify([...headers]).includes("sk-private"), false);
});

test("list and all mutations use exact routes methods and strict public DTO parsing", async () => {
  const listFetcher = capture({ items: [CONNECTION] });
  const listApi = createToshiProviderApi(listFetcher, () => OPERATION);
  assert.deepEqual(await listApi.list(), [CONNECTION]);
  assert.equal(listFetcher.calls[0]?.path, "/api/settings/artificial-intelligence/providers");
  assert.equal(listFetcher.calls[0]?.init.method, "GET");

  for (const [kind, path, method, body] of [
    ["model", "/api/settings/artificial-intelligence/providers/openai/model", "PATCH", { selectedModel: "gpt-5", expectedVersion: 1 }],
    ["default", "/api/settings/artificial-intelligence/providers/openai/default", "POST", { expectedVersion: 1 }],
    ["revoke", "/api/settings/artificial-intelligence/providers/openai", "DELETE", { expectedVersion: 1 }],
  ] as const) {
    const fetcher = capture();
    const api = createToshiProviderApi(fetcher, () => OPERATION);
    if (kind === "model") await api.selectModel("openai", { model: "gpt-5", expectedVersion: 1 });
    else if (kind === "default") await api.setDefault("openai", 1);
    else await api.revoke("openai", 1);
    const call = fetcher.calls[0];
    assert.equal(call?.path, path);
    assert.equal(call?.init.method, method);
    assert.deepEqual(JSON.parse(String(call?.init.body)), body);
  }

  const unsafe = createToshiProviderApi(capture({ ...CONNECTION, sealedCredentials: { ciphertext: "private" } }), () => OPERATION);
  await assert.rejects(() => unsafe.connect("openai", { apiKey: "sk-private", expectedVersion: 0 }), (error: unknown) => error instanceof ToshiProviderApiError && error.code === "unavailable");
});

test("client maps only finite safe error codes and rejects non-JSON responses", async () => {
  const denied = createToshiProviderApi(capture({ code: "credential_invalid" }, 401), () => OPERATION);
  await assert.rejects(
    () => denied.connect("openai", { apiKey: "sk-wrong", expectedVersion: 0 }),
    (error: unknown) => error instanceof ToshiProviderApiError && error.code === "credential_invalid" && error.message === "API anahtarı doğrulanamadı.",
  );
  const hostile = createToshiProviderApi(capture({ code: "provider_stack_trace: secret" }, 500), () => OPERATION);
  await assert.rejects(
    () => hostile.list(),
    (error: unknown) => error instanceof ToshiProviderApiError && error.code === "unavailable" && !error.message.includes("secret"),
  );
  const textFetcher: typeof fetch = async () => new Response("private failure", { status: 500, headers: { "content-type": "text/plain" } });
  await assert.rejects(
    () => createToshiProviderApi(textFetcher, () => OPERATION).list(),
    (error: unknown) => error instanceof ToshiProviderApiError && error.code === "unavailable",
  );
});

test("client rejects provider input and UUID drift before fetch", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls += 1; return Response.json(CONNECTION); };
  const api = createToshiProviderApi(fetcher, () => "bad-operation");
  assert.throws(() => api.connect("other" as never, { apiKey: "sk-private", expectedVersion: 0 }), ToshiProviderApiError);
  assert.throws(() => api.connect("openai", { apiKey: "sk-private", expectedVersion: 0 }), ToshiProviderApiError);
  assert.equal(calls, 0);
});
