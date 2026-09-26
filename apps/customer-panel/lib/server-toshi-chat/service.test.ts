import assert from "node:assert/strict";
import test from "node:test";
import { sealMerchantProviderCredential } from "@celebix/saas-data";
import { createToshiChatService } from "./service.ts";
import { createToshiGenerationRegistry } from "../toshi-generation/registry.ts";

const ID = "72000000-0000-4000-8000-000000000012";
const NOW = new Date("2026-09-26T12:00:00.000Z");
const SECRET = "synthetic-test-key-never-a-merchant-key";
const tenant: any = { store: { id: ID, slug: "fixture", status: "active" }, principal: { id: ID }, membership: { role: "store_owner", status: "active" } };
const conversation: any = { id: ID, title: "Yardım", provider: "deepseek", model: "deepseek-flash", version: 0, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), messages: [] };
function fixture(generate: (input: any) => Promise<any>, overrides: any = {}) {
  const key = new Uint8Array(32).fill(7);
  const keyring: any = Object.freeze({ activeKeyId: "test", keys: Object.freeze([Object.freeze({ keyId: "test", key })]) });
  const envelope = sealMerchantProviderCredential({ plaintext: new TextEncoder().encode(SECRET), profileId: ID, storeId: ID, providerCode: "deepseek", capability: "ai_assistant", credentialVersion: 1, keyring });
  const completed: any[] = [], failed: any[] = [], snapshots: Uint8Array[] = [], begun: any[] = [];
  const connections = [{ provider: "deepseek", status: "active", isDefault: true, selectedModel: "deepseek-flash", availableModels: [{ id: "deepseek-flash", label: "Flash" }] }];
  const service = createToshiChatService({
    conversations: {
      async list() { return []; }, async get() { return conversation; },
      async beginTurn(input: any) { begun.push(input); return overrides.replay ? { kind: "replayed", conversation } : { kind: "ready", operationId: ID, conversation, configId: ID, credentialVersion: 1 }; },
      async completeTurn(input: any) { completed.push(input); if (overrides.completeTurn) return overrides.completeTurn(input); return { ...conversation, version: 1, messages: [{ id: ID, role: "assistant", text: input.assistantText, sources: input.sources, createdAt: NOW.toISOString() }] }; },
      async failTurn(input: any) { failed.push(input); if (overrides.failUnknown) throw Error("UNKNOWN_COMMIT"); },
    } as any,
    providers: { async list() { return connections; }, async getAuthority() { return { configId: ID, provider: "deepseek", selectedModel: "deepseek-flash", sealedCredentials: envelope, credentialVersion: overrides.credentialVersion ?? 1, version: 1 }; } } as any,
    keyring() { const copy = key.slice(); snapshots.push(copy); return Object.freeze({ activeKeyId: "test", keys: Object.freeze([Object.freeze({ keyId: "test", key: copy })]) }); },
    generations: overrides.generations ?? { get(provider: string) { assert.equal(provider, "deepseek"); return { generate }; } } as any,
    repositories: overrides.repositories ?? {}, now: overrides.now ?? (() => NOW),
  });
  return { service, completed, failed, snapshots, begun };
}
const send = { tenantContext: tenant, now: NOW, operationId: ID, conversationId: null, expectedVersion: null, text: "Gram nasıl eklenir?", signal: new AbortController().signal };

test("configured chat actually generates, persists final answer and wipes temporary credential bytes", async () => {
  let held: Uint8Array | undefined;
  const f = fixture(async input => { held = input.secret; assert.equal(new TextDecoder().decode(input.secret), SECRET); assert.equal(input.history.at(-1).text, send.text); return { text: "Ağırlık alanına 14,89 g yazabilirsiniz.", toolCalls: [], continuation: null }; });
  const answer = await f.service.send(send);
  assert.equal(answer.version, 1); assert.equal(f.completed.length, 1); assert.equal(f.failed.length, 0);
  assert.ok(held!.every(byte => byte === 0)); assert.ok(f.snapshots.every(key => key.every(byte => byte === 0)));
});

test("real help tool results and server sources round trip into the provider", async () => {
  let count = 0;
  const f = fixture(async input => {
    count++;
    if (count === 1) return { text: "", toolCalls: [{ callId: "help1", name: "panel_help", arguments: { query: "gram ağırlık" } }], continuation: { private: true } };
    assert.equal(input.continuation.private, true); assert.ok(JSON.stringify(input.toolResults).includes("14,89"));
    return { text: "İsteğe bağlı Ağırlık alanından g seçip 14,89 g girebilirsiniz.", toolCalls: [], continuation: null };
  });
  await f.service.send(send); assert.equal(count, 2); assert.ok(f.completed[0].sources.some((source: any) => source.href === "/products/new"));
});

test("completed operation replays without an upstream charge or credential access", async () => {
  const f = fixture(async () => { throw Error("must not generate"); }, { replay: true });
  assert.equal(await f.service.send(send), conversation); assert.equal(f.snapshots.length, 0);
});

test("changed credentials fail before generation", async () => {
  const f = fixture(async () => { throw Error("must not generate"); }, { credentialVersion: 2 });
  await assert.rejects(f.service.send(send), (error: any) => error.code === "connection_revoked");
  assert.equal(f.failed[0].code, "connection_revoked"); assert.equal(f.completed.length, 0);
});

test("duplicate tool calls stop the bounded loop and no secret can become an answer", async () => {
  let count = 0;
  const f = fixture(async () => { count++; return { text: "", toolCalls: [{ callId: "same", name: "panel_help", arguments: { query: "gram" } }], continuation: null }; });
  await assert.rejects(f.service.send(send), (error: any) => error.code === "provider_unavailable"); assert.equal(count, 2); assert.equal(f.completed.length, 0);
  const echo = fixture(async () => ({ text: SECRET, toolCalls: [], continuation: null }));
  await assert.rejects(echo.service.send(send), (error: any) => error.code === "provider_unavailable"); assert.equal(echo.completed.length, 0);
});

test("quota failure records a safe code and never automatically retries", async () => {
  let count = 0;
  const f = fixture(async () => { count++; throw Object.assign(Error("RAW_PROVIDER_SECRET"), { code: "quota_exceeded" }); });
  await assert.rejects(f.service.send(send), (error: any) => error.code === "quota_exceeded" && !error.message.includes("RAW"));
  assert.equal(count, 1); assert.equal(f.failed[0].code, "quota_exceeded");
});

test("actual DeepSeek adapter accepts real catalog DTO optionals through a grounded tool round trip", async () => {
  let count = 0;
  const generations = createToshiGenerationRegistry({ deepseek: async (_url, init) => {
    count++; const request = JSON.parse(init!.body as string);
    if (count === 1) return Response.json({ choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id: "products1", type: "function", function: { name: "products_search", arguments: JSON.stringify({ query: "bilezik", status: null, stock: null }) } }] } }] });
    const tool = request.messages.find((message: any) => message.role === "tool");
    assert.equal(JSON.parse(tool.content).items[0].title, "Bilezik");
    assert.equal(JSON.parse(tool.content).items[0].sellingPriceMinor, null);
    return Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Bilezik bulundu; güncel satış fiyatı alınamadı." } }] });
  } });
  let tick = NOW.getTime();
  const f = fixture(async () => { throw Error("unused"); }, { generations, now: () => new Date(tick++), repositories: { catalog: { async listProducts() { return { items: [{ id: ID, title: "Bilezik", currency: "TRY", status: "active" }], catalogTotal: 1 }; } } } });
  await f.service.send(send); assert.equal(count, 2); assert.equal(f.completed.length, 1); assert.deepEqual(f.completed[0].sources, [{ label: "Ürünler", href: "/products" }]);
});

test("recognizable pasted credentials never enter a durable reservation or a model request", async () => {
  for (const text of ["Anahtarım sk-0123456789abcdef0123456789abcdef", "AIza0123456789ABCDEFGHIJKLMNOPQRST", "-----BEGIN PRIVATE KEY-----", "postgresql://user:password@db.test/main"]) {
    const f = fixture(async () => { throw Error("must not generate"); });
    await assert.rejects(f.service.send({ ...send, text }), (error: any) => error.code === "sensitive_input");
    assert.equal(f.begun.length, 0); assert.equal(f.snapshots.length, 0);
  }
});

test("recorded unknown failure is definitive while an uncertain failure commit remains replayable", async () => {
  const f = fixture(async () => { throw Error("DATABASE_SECRET"); });
  await assert.rejects(f.service.send(send), (error: any) => error.code === "operation_failed");
  assert.equal(f.failed[0].code, "operation_failed");
  const uncertain = fixture(async () => { throw Error("DATABASE_SECRET"); }, { failUnknown: true });
  await assert.rejects(uncertain.service.send(send), (error: any) => error.code === "unavailable");
  assert.equal(uncertain.failed[0].code, "operation_failed");
});

test("cancellation during an uncertain completion preserves same-operation recovery", async () => {
  const controller = new AbortController();
  const f = fixture(async () => ({ text: "Yanıt tamamlandı.", toolCalls: [], continuation: null }), {
    failUnknown: true,
    completeTurn() { controller.abort(); throw Object.assign(Error("UNKNOWN_COMMIT"), { code: "unavailable" }); },
  });
  await assert.rejects(f.service.send({ ...send, signal: controller.signal }), (error: any) => error.code === "unavailable");
  assert.equal(f.completed.length, 1); assert.equal(f.failed[0].code, "operation_failed");
});
