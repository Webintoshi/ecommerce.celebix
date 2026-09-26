import assert from "node:assert/strict";
import test from "node:test";

import { createToshiProviderAdapterRegistry, ToshiProviderAdapterError, type ToshiProviderFetch } from "./registry.ts";

function fixture(payload: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher: ToshiProviderFetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(payload, { status });
  };
  const registry = createToshiProviderAdapterRegistry({ openai: fetcher, gemini: fetcher, anthropic: fetcher, deepseek: fetcher } as never);
  return { calls, adapter: registry.get("deepseek" as never) };
}

const key = () => new TextEncoder().encode("sk-fixture-only");

test("DeepSeek verifies credentials at the fixed official endpoint and prefers current Flash", async () => {
  const selected = fixture({ object: "list", data: [
    { id: "deepseek-v4-pro", name: "DeepSeek-V4-Pro", context_window: 1048576 },
    { id: "deepseek-flash", name: "DeepSeek-V4.1-Flash", output_modalities: ["text"] },
    { id: "untrusted-other-model" },
  ] });
  const secret = key();
  const result = await selected.adapter.verify(secret, AbortSignal.timeout(1000));
  assert.equal(selected.adapter.provider, "deepseek");
  assert.equal(selected.calls.length, 1);
  const call = selected.calls[0]!;
  assert.equal(call.url, "https://api.deepseek.com/models");
  assert.equal(call.init.method, "GET");
  assert.equal(call.init.redirect, "error");
  assert.equal(call.init.cache, "no-store");
  assert.equal(new Headers(call.init.headers).get("authorization"), "Bearer sk-fixture-only");
  assert.deepEqual(result.models.map(({ id }) => id), ["deepseek-flash", "deepseek-v4-pro"]);
  assert.equal(result.selectedModel, "deepseek-flash");
  assert.deepEqual(secret, key());
});

test("DeepSeek only selects a supported model actually returned for the account", async () => {
  const result = await fixture({ data: [{ id: "deepseek-v4-pro" }] }).adapter.verify(key(), AbortSignal.timeout(1000));
  assert.equal(result.selectedModel, "deepseek-v4-pro");
  await assert.rejects(() => fixture({ data: [{ id: "deepseek-chat" }, { id: "deepseek-flash-extra" }] }).adapter.verify(key(), AbortSignal.timeout(1000)),
    (error: unknown) => error instanceof ToshiProviderAdapterError && error.code === "model_unavailable");
});

test("DeepSeek credential balance and rate errors are safe and distinct", async () => {
  for (const [status, code] of [[401, "credential_invalid"], [402, "quota_exceeded"], [429, "rate_limited"], [503, "provider_unavailable"]] as const) {
    await assert.rejects(() => fixture({ error: { message: "PRIVATE KEY SHOULD NEVER ESCAPE", code: "remote_error" } }, status).adapter.verify(key(), AbortSignal.timeout(1000)),
      (error: unknown) => error instanceof ToshiProviderAdapterError && error.code === code && !error.message.includes("PRIVATE"));
  }
});

test("DeepSeek malformed model metadata and invalid credentials fail closed", async () => {
  await assert.rejects(() => fixture({ data: [{ id: "deepseek-flash", name: "bad\nname" }] }).adapter.verify(key(), AbortSignal.timeout(1000)),
    (error: unknown) => error instanceof ToshiProviderAdapterError && error.code === "provider_unavailable");
  const selected = fixture({ data: [{ id: "deepseek-flash" }] });
  await assert.rejects(() => selected.adapter.verify(new TextEncoder().encode("bad\nkey"), AbortSignal.timeout(1000)),
    (error: unknown) => error instanceof ToshiProviderAdapterError && error.code === "credential_invalid");
  assert.equal(selected.calls.length, 0);
});
