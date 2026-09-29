import assert from "node:assert/strict";
import test from "node:test";
import { createToshiGenerationRegistry } from "./registry.ts";
import * as generationPolicy from "./policy.ts";
import { ToshiGenerationError, type ToshiGenerationInput } from "./types.ts";

const base = (changes: Partial<ToshiGenerationInput> = {}): ToshiGenerationInput => ({
  authoringProfile: "content_resource",
  outputFormat: "json_object",
  maxOutputTokens: 8192,
  model: "deepseek-flash",
  secret: new TextEncoder().encode("resource-test-key"),
  system: "Return JSON with the requested content.",
  history: [{ role: "user", text: "Türkçe ürün içeriği ".repeat(3600) }],
  tools: [],
  signal: new AbortController().signal,
  ...changes,
});

test("resource capability is explicitly restricted to evaluated DeepSeek Flash", () => {
  const contentResourceGenerationCapability = (generationPolicy as typeof generationPolicy & { contentResourceGenerationCapability(provider: string, model: string): unknown }).contentResourceGenerationCapability;
  assert.equal(typeof contentResourceGenerationCapability, "function");
  assert.deepEqual(contentResourceGenerationCapability("deepseek", "deepseek-flash"), { maxInputBytes: 131072, maxOutputTokens: 8192 });
  for (const [provider, model] of [["deepseek", "deepseek-v4-pro"], ["openai", "gpt-5-mini"], ["gemini", "gemini-2.5-flash"], ["anthropic", "claude-sonnet-4-6"]] as const) {
    assert.equal(contentResourceGenerationCapability(provider, model), null);
  }
});

test("resource profile sends large Unicode JSON input and preserves measured usage", async () => {
  const requests: Record<string, unknown>[] = [];
  const adapter = createToshiGenerationRegistry({ deepseek: async (_url, init) => {
    requests.push(JSON.parse(String(init.body)));
    return Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: '{"sections":[]}' } }], usage: { prompt_tokens: 30000, completion_tokens: 123 } });
  } }).get("deepseek");
  const result = await adapter.generate(base());
  assert.equal(result.text, '{"sections":[]}');
  assert.deepEqual(result.usage, { inputTokens: 30000, outputTokens: 123 });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]!.max_tokens, 8192);
  assert.deepEqual(requests[0]!.response_format, { type: "json_object" });
  assert.ok(new TextEncoder().encode(JSON.stringify(requests[0])).byteLength > 32768);
});

test("resource profile rejects tools, continuation, unsupported model and oversized input before dispatch", async () => {
  let calls = 0;
  const adapter = createToshiGenerationRegistry({ deepseek: async () => { calls++; return Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "{}" } }] }); } }).get("deepseek");
  const invalid: Partial<ToshiGenerationInput>[] = [
    { model: "deepseek-v4-pro" },
    { outputFormat: undefined },
    { tools: [{ name: "search", description: "Search", parameters: { type: "object" } }] },
    { continuation: {} },
    { toolResults: [] },
    { history: [{ role: "user", text: "ğ".repeat(66000) }] },
    { maxOutputTokens: 8193 },
  ];
  for (const value of invalid) await assert.rejects(() => adapter.generate(base(value)), ToshiGenerationError);
  assert.equal(calls, 0);
});

test("resource profile rejects truncated JSON with no automatic retry", async () => {
  let calls = 0;
  const adapter = createToshiGenerationRegistry({ deepseek: async () => {
    calls++;
    return Response.json({ choices: [{ finish_reason: "length", message: { role: "assistant", content: '{"partial":' } }] });
  } }).get("deepseek");
  await assert.rejects(() => adapter.generate(base()), { code: "provider_unavailable", outcome: "truncated" });
  assert.equal(calls, 1);
});
