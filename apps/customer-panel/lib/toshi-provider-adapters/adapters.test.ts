import assert from "node:assert/strict";
import test from "node:test";

import {
  ToshiProviderAdapterError,
  createAnthropicProviderAdapter,
  createGeminiProviderAdapter,
  createOpenAIProviderAdapter,
  createToshiProviderAdapterRegistry,
  type ToshiProviderFetch,
} from "./registry.ts";

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function captureJson(payload: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher: ToshiProviderFetch = async (url, init) => {
    calls.push({ url: String(url), init: { ...init } });
    return Response.json(payload, { status });
  };
  return Object.assign(fetcher, { calls });
}

test("OpenAI verifies only against the official models endpoint", async () => {
  const fetcher = captureJson({ data: [{ id: "gpt-5" }, { id: "whisper-1" }, { id: "text-embedding-3-small" }] });
  const result = await createOpenAIProviderAdapter(fetcher).verify(bytes("sk-test"), AbortSignal.timeout(1_000));
  assert.equal(fetcher.calls[0]?.url, "https://api.openai.com/v1/models");
  const headers = new Headers(fetcher.calls[0]?.init.headers);
  assert.equal(headers.get("authorization"), "Bearer sk-test");
  assert.equal(headers.get("accept"), "application/json");
  assert.equal(fetcher.calls[0]?.init.redirect, "error");
  assert.equal(fetcher.calls[0]?.init.cache, "no-store");
  assert.deepEqual(result.models.map(({ id }) => id), ["gpt-5"]);
  assert.equal(result.selectedModel, "gpt-5");
});

test("Gemini and Anthropic use their own authentication headers and normalized models", async () => {
  const geminiFetch = captureJson({ models: [
    { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", supportedGenerationMethods: ["generateContent"] },
    { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
  ] });
  const gemini = await createGeminiProviderAdapter(geminiFetch).verify(bytes("gemini-test"), AbortSignal.timeout(1_000));
  assert.equal(geminiFetch.calls[0]?.url, "https://generativelanguage.googleapis.com/v1beta/models");
  assert.equal(new Headers(geminiFetch.calls[0]?.init.headers).get("x-goog-api-key"), "gemini-test");
  assert.deepEqual(gemini.models.map(({ id }) => id), ["gemini-2.5-flash"]);

  const anthropicFetch = captureJson({ data: [
    { id: "claude-sonnet-4-20250514", display_name: "Claude Sonnet 4" },
    { id: "claude-haiku-4-20250514", display_name: "Claude Haiku 4" },
  ], has_more: false, first_id: null, last_id: null });
  const anthropic = await createAnthropicProviderAdapter(anthropicFetch).verify(bytes("claude-test"), AbortSignal.timeout(1_000));
  const headers = new Headers(anthropicFetch.calls[0]?.init.headers);
  assert.equal(anthropicFetch.calls[0]?.url, "https://api.anthropic.com/v1/models");
  assert.equal(headers.get("x-api-key"), "claude-test");
  assert.equal(headers.get("anthropic-version"), "2023-06-01");
  assert.equal(anthropic.selectedModel, "claude-sonnet-4-20250514");
});

test("provider HTTP failures map to safe stable codes", async () => {
  for (const [status, payload, code] of [
    [401, { error: { code: "invalid_api_key" } }, "credential_invalid"],
    [403, { error: { code: "permission_denied" } }, "credential_invalid"],
    [429, { error: { code: "rate_limit_exceeded" } }, "rate_limited"],
    [429, { error: { code: "insufficient_quota" } }, "quota_exceeded"],
    [503, { error: { code: "unavailable" } }, "provider_unavailable"],
  ] as const) {
    await assert.rejects(
      () => createOpenAIProviderAdapter(captureJson(payload, status)).verify(bytes("sk-test"), AbortSignal.timeout(1_000)),
      (error: unknown) => error instanceof ToshiProviderAdapterError && error.code === code,
    );
  }
});

test("timeout non-JSON oversized and empty allowed-model responses fail closed", async () => {
  const timeoutFetch: ToshiProviderFetch = async (_url, init) => await new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
  });
  await assert.rejects(
    () => createGeminiProviderAdapter(timeoutFetch).verify(bytes("key"), AbortSignal.timeout(5)),
    (error: unknown) => error instanceof ToshiProviderAdapterError && error.code === "provider_timeout",
  );

  const nonJson: ToshiProviderFetch = async () => new Response("not-json", { status: 200, headers: { "content-type": "text/plain" } });
  await assert.rejects(
    () => createAnthropicProviderAdapter(nonJson).verify(bytes("key"), AbortSignal.timeout(1_000)),
    (error: unknown) => error instanceof ToshiProviderAdapterError && error.code === "provider_unavailable",
  );

  const oversized: ToshiProviderFetch = async () => new Response("x", { status: 200, headers: { "content-length": "1048577", "content-type": "application/json" } });
  await assert.rejects(
    () => createOpenAIProviderAdapter(oversized).verify(bytes("key"), AbortSignal.timeout(1_000)),
    (error: unknown) => error instanceof ToshiProviderAdapterError && error.code === "provider_unavailable",
  );

  await assert.rejects(
    () => createOpenAIProviderAdapter(captureJson({ data: [{ id: "whisper-1" }] })).verify(bytes("key"), AbortSignal.timeout(1_000)),
    (error: unknown) => error instanceof ToshiProviderAdapterError && error.code === "model_unavailable",
  );
});

test("invalid keys and hostile provider JSON are rejected without network drift", async () => {
  let calls = 0;
  const fetcher: ToshiProviderFetch = async () => { calls += 1; return Response.json({ data: [{ id: "gpt-5" }] }); };
  for (const key of [bytes(""), bytes("bad\nkey"), new Uint8Array(16_385)]) {
    await assert.rejects(
      () => createOpenAIProviderAdapter(fetcher).verify(key, AbortSignal.timeout(1_000)),
      (error: unknown) => error instanceof ToshiProviderAdapterError && error.code === "credential_invalid",
    );
  }
  assert.equal(calls, 0);

  const hostile = Object.create({ data: [{ id: "gpt-5" }] }) as object;
  await assert.rejects(
    () => createOpenAIProviderAdapter(captureJson(hostile)).verify(bytes("key"), AbortSignal.timeout(1_000)),
    (error: unknown) => error instanceof ToshiProviderAdapterError && error.code === "provider_unavailable",
  );
});

test("registry is complete immutable and rejects provider drift", () => {
  const registry = createToshiProviderAdapterRegistry({
    openai: captureJson({ data: [{ id: "gpt-5" }] }),
    gemini: captureJson({ models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }] }),
    anthropic: captureJson({ data: [{ id: "claude-sonnet-4-20250514" }], has_more: false, first_id: null, last_id: null }),
  });
  assert.equal(Object.isFrozen(registry), true);
  assert.equal(registry.get("openai").provider, "openai");
  assert.throws(() => registry.get("other" as never), ToshiProviderAdapterError);
});
