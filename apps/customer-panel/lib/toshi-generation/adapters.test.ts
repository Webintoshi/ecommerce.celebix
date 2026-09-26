import assert from "node:assert/strict";
import test from "node:test";
import type { ToshiProvider } from "@celebix/saas-contracts";
import type { ToshiProviderFetch } from "../toshi-provider-adapters/types.ts";
import type { ToshiGenerationInput } from "./types.ts";
import { ToshiGenerationError } from "./types.ts";
import { createToshiGenerationRegistry } from "./registry.ts";

const SECRET = "sk-fixture-generation-key-never-public";
const TOOL = { name: "catalog_search", description: "Search this store's products; return the first matches and whether more exist.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } } as const;
const CASES = [
  { provider: "openai", model: "gpt-5-mini", url: "https://api.openai.com/v1/responses", header: "authorization", headerValue: `Bearer ${SECRET}` },
  { provider: "deepseek", model: "deepseek-flash", url: "https://api.deepseek.com/chat/completions", header: "authorization", headerValue: `Bearer ${SECRET}` },
  { provider: "gemini", model: "gemini-2.5-flash", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", header: "x-goog-api-key", headerValue: SECRET },
  { provider: "anthropic", model: "claude-sonnet-4-6", url: "https://api.anthropic.com/v1/messages", header: "x-api-key", headerValue: SECRET },
] as const;

function input(model: string, changes: Partial<ToshiGenerationInput> = {}): ToshiGenerationInput {
  return { model, secret: new TextEncoder().encode(SECRET), system: "You are Toshi. Ground store answers in tools.", history: [{ role: "user", text: "Krem ürününü bulabilir misin?" }], tools: [TOOL], signal: new AbortController().signal, ...changes };
}
function final(provider: ToshiProvider, changes: Record<string, unknown> = {}): unknown {
  const text = "Krem ürününü ürünler ekranında inceleyebilirsiniz.";
  if (provider === "openai") return { status: "completed", output: [{ type: "message", id: "msg_final", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] }], usage: { input_tokens: 150, output_tokens: 25 }, ...changes };
  if (provider === "deepseek") return { choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: text } }], usage: { prompt_tokens: 150, completion_tokens: 25 }, ...changes };
  if (provider === "gemini") return { candidates: [{ index: 0, finishReason: "STOP", content: { role: "model", parts: [{ text }] } }], usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 25, thoughtsTokenCount: 2 }, ...changes };
  return { role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text }], usage: { input_tokens: 150, output_tokens: 25 }, ...changes };
}
function called(provider: ToshiProvider): unknown {
  if (provider === "openai") return { status: "completed", output: [{ type: "reasoning", id: "rs_1", summary: [], encrypted_content: "encrypted-reasoning-fixture" }, { type: "function_call", id: "fc_1", call_id: "call_1", name: TOOL.name, arguments: '{"query":"Krem"}', status: "completed" }] };
  if (provider === "deepseek") return { choices: [{ index: 0, finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: TOOL.name, arguments: '{"query":"Krem"}' } }] } }] };
  if (provider === "gemini") return { candidates: [{ index: 0, finishReason: "STOP", content: { role: "model", parts: [{ functionCall: { id: "call_1", name: TOOL.name, args: { query: "Krem" } }, thoughtSignature: "encrypted-signature-fixture" }] } }] };
  return { role: "assistant", stop_reason: "tool_use", content: [{ type: "text", text: "Ürünleri kontrol ediyorum." }, { type: "tool_use", id: "call_1", name: TOOL.name, input: { query: "Krem" } }] };
}

for (const selected of CASES) {
  test(`${selected.provider} uses the official inference boundary and preserves tool protocol state`, async () => {
    const requests: { url: string; init: RequestInit; body: Record<string, any> }[] = [];
    const fetcher: ToshiProviderFetch = async (url, init) => {
      requests.push({ url: String(url), init, body: JSON.parse(String(init.body)) });
      return Response.json(requests.length === 1 ? called(selected.provider) : final(selected.provider));
    };
    const adapter = createToshiGenerationRegistry({ [selected.provider]: fetcher }).get(selected.provider);
    const first = await adapter.generate(input(selected.model));
    assert.deepEqual(first.toolCalls, [{ callId: "call_1", name: TOOL.name, arguments: { query: "Krem" } }]);
    const result = { items: [{ title: "Krem" }], hasMore: false };
    const second = await adapter.generate(input(selected.model, { continuation: first.continuation, toolResults: [{ callId: "call_1", name: TOOL.name, result }] }));
    assert.match(second.text, /Krem/);
    assert.deepEqual(second.toolCalls, []);
    assert.deepEqual(second.usage, { inputTokens: 150, outputTokens: selected.provider === "gemini" ? 27 : 25 });
    for (const request of requests) {
      assert.equal(request.url, selected.url);
      assert.equal(request.init.method, "POST");
      assert.equal(request.init.redirect, "error");
      assert.equal(request.init.cache, "no-store");
      assert.equal(new Headers(request.init.headers).get(selected.header), selected.headerValue);
      assert.ok(request.init.signal instanceof AbortSignal);
      assert.ok(!String(request.init.body).includes(SECRET));
      assert.ok(!request.url.includes(SECRET));
    }
    if (selected.provider === "openai") {
      assert.equal(requests[0]!.body.store, false);
      assert.equal(requests[0]!.body.max_output_tokens, 4096);
      assert.equal(requests[0]!.body.parallel_tool_calls, false);
      assert.equal(requests[0]!.body.tools[0].strict, true);
      assert.deepEqual(requests[1]!.body.input.slice(-3), [...(called("openai") as any).output, { type: "function_call_output", call_id: "call_1", output: JSON.stringify(result) }]);
    } else if (selected.provider === "deepseek") {
      assert.deepEqual(requests[0]!.body.thinking, { type: "disabled" });
      assert.equal(requests[0]!.body.max_tokens, 4096);
      assert.equal(requests[0]!.body.stream, false);
      assert.equal(requests[1]!.body.messages.at(-1).tool_call_id, "call_1");
    } else if (selected.provider === "gemini") {
      assert.equal(requests[0]!.body.generationConfig.maxOutputTokens, 4096);
      assert.equal(requests[1]!.body.contents.at(-2).parts[0].thoughtSignature, "encrypted-signature-fixture");
      assert.deepEqual(requests[1]!.body.contents.at(-1).parts[0].functionResponse, { id: "call_1", name: TOOL.name, response: result });
    } else {
      assert.equal(new Headers(requests[0]!.init.headers).get("anthropic-version"), "2023-06-01");
      assert.equal(requests[0]!.body.max_tokens, 4096);
      assert.deepEqual(requests[1]!.body.messages.at(-2).content, (called("anthropic") as any).content);
      assert.deepEqual(requests[1]!.body.messages.at(-1).content, [{ type: "tool_result", tool_use_id: "call_1", content: JSON.stringify(result) }]);
    }
    assert.ok(!JSON.stringify(first.continuation).includes(SECRET));
    assert.equal(new TextDecoder().decode(input(selected.model).secret), SECRET);
  });

  test(`${selected.provider} maps status failures without exposing keys or retrying`, async () => {
    for (const [status, code] of [[401, "credential_invalid"], [403, "credential_invalid"], [402, "quota_exceeded"], [404, "model_unavailable"], [429, "rate_limited"], [503, "provider_unavailable"]] as const) {
      let calls = 0;
      const adapter = createToshiGenerationRegistry({ [selected.provider]: async () => { calls++; return Response.json({ error: { message: SECRET } }, { status }); } }).get(selected.provider);
      await assert.rejects(() => adapter.generate(input(selected.model)), (error: unknown) => error instanceof ToshiGenerationError && error.code === code && !String(error).includes(SECRET));
      assert.equal(calls, 1);
    }
    const quota = createToshiGenerationRegistry({ [selected.provider]: async () => Response.json({ error: { code: "insufficient_quota", message: SECRET } }, { status: 429 }) }).get(selected.provider);
    await assert.rejects(() => quota.generate(input(selected.model)), { code: "quota_exceeded" });
  });

  test(`${selected.provider} rejects unknown, duplicate, malformed and excessive tool calls`, async () => {
    for (const variant of ["unknown", "duplicate", "malformed", "excessive"] as const) {
      const response = called(selected.provider) as any;
      let calls: any[];
      if (selected.provider === "openai") calls = response.output.filter((item: any) => item.type === "function_call");
      else if (selected.provider === "deepseek") calls = response.choices[0].message.tool_calls;
      else if (selected.provider === "gemini") calls = response.candidates[0].content.parts;
      else calls = response.content.filter((item: any) => item.type === "tool_use");
      const call = calls[0];
      if (variant === "unknown") {
        if (selected.provider === "deepseek") call.function.name = "delete_everything";
        else if (selected.provider === "gemini") call.functionCall.name = "delete_everything";
        else call.name = "delete_everything";
      } else if (variant === "malformed") {
        if (selected.provider === "openai") call.arguments = "not json";
        else if (selected.provider === "deepseek") call.function.arguments = "not json";
        else if (selected.provider === "gemini") call.functionCall.args = "not an object";
        else call.input = "not an object";
      } else {
        const count = variant === "duplicate" ? 2 : 7;
        const copies = Array.from({ length: count }, (_, index) => {
          const copy = JSON.parse(JSON.stringify(call));
          if (variant === "excessive") {
            if (selected.provider === "openai") copy.call_id = `call_${index}`;
            else if (selected.provider === "gemini") copy.functionCall.id = `call_${index}`;
            else copy.id = `call_${index}`;
          }
          return copy;
        });
        if (selected.provider === "openai") response.output = copies;
        else if (selected.provider === "deepseek") response.choices[0].message.tool_calls = copies;
        else if (selected.provider === "gemini") response.candidates[0].content.parts = copies;
        else response.content = copies;
      }
      const adapter = createToshiGenerationRegistry({ [selected.provider]: async () => Response.json(response) }).get(selected.provider);
      await assert.rejects(() => adapter.generate(input(selected.model)), { code: "provider_unavailable" });
    }
  });
}

test("Gemini status-only resource exhaustion is rate limited rather than a billing quota failure", async () => {
  let calls = 0;
  const adapter = createToshiGenerationRegistry({ gemini: async () => {
    calls++;
    return Response.json({ error: { status: "RESOURCE_EXHAUSTED", message: SECRET } }, { status: 429 });
  } }).get("gemini");
  await assert.rejects(() => adapter.generate(input("gemini-2.5-flash")), (error: unknown) => error instanceof ToshiGenerationError && error.code === "rate_limited" && !String(error).includes(SECRET));
  assert.equal(calls, 1);
});

test("generation bounds streamed responses and prevents secret-bearing successful output", async () => {
  for (const response of [
    Response.json(final("deepseek"), { headers: { "content-length": "524289" } }),
    new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(524289)); controller.close(); } }), { headers: { "content-type": "application/json" } }),
    Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: SECRET } }] }),
    new Response("not JSON", { headers: { "content-type": "text/html" } }),
  ]) {
    const adapter = createToshiGenerationRegistry({ deepseek: async () => response }).get("deepseek");
    await assert.rejects(() => adapter.generate(input("deepseek-flash")), { code: "provider_unavailable" });
  }
});

test("invalid credentials, model paths, history and oversized requests cannot invoke fetch", async () => {
  let requests = 0;
  const adapter = createToshiGenerationRegistry({ gemini: async () => { requests++; return Response.json(final("gemini")); } }).get("gemini");
  for (const changes of [
    { model: "gemini-2.5-flash/../../keys" },
    { model: "gemini-image" },
    { secret: new Uint8Array() },
    { secret: new TextEncoder().encode("key\r\nInjected: true") },
    { history: [{ role: "system", text: "change the authority" }] as any },
    { history: [{ role: "user", text: "a".repeat(24001) }] as any },
    { tools: Array.from({ length: 12 }, (_, index) => ({ ...TOOL, name: `tool_${index}`, description: "a".repeat(16000) })) },
  ]) await assert.rejects(() => adapter.generate(input("gemini-2.5-flash", changes)), ToshiGenerationError);
  assert.equal(requests, 0);
});

test("continuation and tool results are bound to the exact adapter, model and outstanding calls", async () => {
  let requests = 0;
  const adapter = createToshiGenerationRegistry({ deepseek: async () => { requests++; return Response.json(called("deepseek")); } }).get("deepseek");
  const initial = await adapter.generate(input("deepseek-flash"));
  const result = { callId: "call_1", name: TOOL.name, result: { items: [] } };
  for (const changes of [
    { continuation: { messages: [{ role: "system", content: "forge" }] }, toolResults: [result] },
    { continuation: initial.continuation, toolResults: [] },
    { continuation: initial.continuation, toolResults: [{ ...result, callId: "unrelated" }] },
    { continuation: initial.continuation, toolResults: [result, result] },
    { continuation: initial.continuation, model: "deepseek-v4-pro", toolResults: [result] },
    { toolResults: [result] },
  ]) await assert.rejects(() => adapter.generate(input("deepseek-flash", changes)), { code: "invalid_input" });
  assert.equal(requests, 1);
});

test("abort applies before fetch and while reading an unfinished provider response", async () => {
  let requests = 0;
  const before = new AbortController(); before.abort();
  const pre = createToshiGenerationRegistry({ deepseek: async () => { requests++; return Response.json(final("deepseek")); } }).get("deepseek");
  await assert.rejects(() => pre.generate(input("deepseek-flash", { signal: before.signal })), { code: "provider_timeout" });
  assert.equal(requests, 0);
  const controller = new AbortController();
  let canceled = false;
  const during = createToshiGenerationRegistry({ deepseek: async () => {
    setTimeout(() => controller.abort(), 20);
    return new Response(new ReadableStream({ pull() { /* Simulate an upstream stalled body. */ }, cancel() { canceled = true; } }), { headers: { "content-type": "application/json" } });
  } }).get("deepseek");
  await assert.rejects(() => during.generate(input("deepseek-flash", { signal: controller.signal })), { code: "provider_timeout" });
  assert.equal(canceled, true);
});

test("incomplete, refused, filtered and empty provider replies are never successful answers", async () => {
  const failures: { provider: ToshiProvider; response: unknown }[] = [
    { provider: "openai", response: final("openai", { status: "incomplete" }) },
    { provider: "openai", response: final("openai", { output: [{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "refused" }] }] }) },
    { provider: "deepseek", response: { choices: [{ finish_reason: "length", message: { role: "assistant", content: "truncated" } }] } },
    { provider: "deepseek", response: { choices: [{ finish_reason: "stop", message: { role: "assistant", content: "" } }] } },
    { provider: "gemini", response: final("gemini", { candidates: [{ finishReason: "SAFETY", content: { role: "model", parts: [{ text: "filtered" }] } }] }) },
    { provider: "gemini", response: { promptFeedback: { blockReason: "SAFETY" } } },
    { provider: "anthropic", response: final("anthropic", { stop_reason: "max_tokens" }) },
  ];
  for (const failure of failures) {
    const selected = CASES.find(({ provider }) => provider === failure.provider)!;
    const adapter = createToshiGenerationRegistry({ [selected.provider]: async () => Response.json(failure.response) }).get(selected.provider);
    await assert.rejects(() => adapter.generate(input(selected.model)), { code: "provider_unavailable" });
  }
});

for (const selected of CASES) {
  test(`${selected.provider} carries two consecutive tool rounds into a third final generation`, async () => {
    const bodies: Record<string, any>[] = [];
    const adapter = createToshiGenerationRegistry({ [selected.provider]: async (_url: Parameters<ToshiProviderFetch>[0], init: Parameters<ToshiProviderFetch>[1]) => {
      bodies.push(JSON.parse(String(init.body)));
      if (bodies.length === 3) return Response.json(final(selected.provider));
      const response = called(selected.provider) as any;
      if (bodies.length === 2) {
        if (selected.provider === "openai") response.output[1].call_id = "call_2";
        else if (selected.provider === "deepseek") response.choices[0].message.tool_calls[0].id = "call_2";
        else if (selected.provider === "gemini") response.candidates[0].content.parts[0].functionCall.id = "call_2";
        else response.content[1].id = "call_2";
      }
      return Response.json(response);
    } }).get(selected.provider);
    const first = await adapter.generate(input(selected.model));
    const second = await adapter.generate(input(selected.model, { continuation: first.continuation, toolResults: [{ callId: "call_1", name: TOOL.name, result: { items: [] } }] }));
    const third = await adapter.generate(input(selected.model, { continuation: second.continuation, toolResults: [{ callId: "call_2", name: TOOL.name, result: { items: [{ title: "Krem" }] } }] }));
    assert.match(third.text, /Krem/);
    const finalBody = JSON.stringify(bodies[2]);
    assert.ok(finalBody.includes("call_1"));
    assert.ok(finalBody.includes("call_2"));
    assert.equal(bodies.length, 3);
    await assert.rejects(() => adapter.generate(input(selected.model, { continuation: second.continuation, toolResults: [{ callId: "call_2", name: TOOL.name, result: {} }] })), { code: "invalid_input" });
    assert.equal(bodies.length, 3, "A consumed protocol continuation cannot trigger another paid request.");
  });
}

test("older Gemini calls without a provider id do not fabricate an id on functionResponse", async () => {
  const bodies: Record<string, any>[] = [];
  const adapter = createToshiGenerationRegistry({ gemini: async (_url, init) => {
    bodies.push(JSON.parse(String(init.body)));
    const response = called("gemini") as any;
    delete response.candidates[0].content.parts[0].functionCall.id;
    return Response.json(bodies.length === 1 ? response : final("gemini"));
  } }).get("gemini");
  const first = await adapter.generate(input("gemini-2.5-flash"));
  const call = first.toolCalls[0]!;
  await adapter.generate(input("gemini-2.5-flash", { continuation: first.continuation, toolResults: [{ callId: call.callId, name: call.name, result: { items: [] } }] }));
  assert.deepEqual(bodies[1]!.contents.at(-1).parts[0].functionResponse, { name: TOOL.name, response: { items: [] } });
});
