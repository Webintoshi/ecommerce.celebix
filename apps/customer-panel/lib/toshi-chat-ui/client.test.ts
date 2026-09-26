import assert from "node:assert/strict";
import test from "node:test";
import { createToshiChatApi, ToshiChatApiError } from "./client.ts";
import { getToshiFixture, postToshiFixture } from "../../../../tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/api/toshi-fixture.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const OP = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-09-26T12:00:00.000Z";
const SUMMARY = { id: ID, title: "Mağazam", provider: "deepseek", model: "deepseek-flash", version: 1, createdAt: NOW, updatedAt: NOW };
const CONVERSATION = { ...SUMMARY, messages: [{ id: OP, role: "assistant", text: "Mağazanızın özeti.", sources: [{ label: "Ürünler", href: "/products" }], createdAt: NOW }] };

test("chat client uses exact same-origin paths, public payloads, pin and stable operation replay", async () => {
  const calls: Array<[string, RequestInit]> = [];
  const api = createToshiChatApi(async (path, init) => {
    calls.push([String(path), init!]);
    return Response.json(String(path) === "/api/toshi/conversations"
      ? { conversations: [SUMMARY], defaultProvider: { provider: "deepseek", model: "deepseek-flash" } }
      : { conversation: CONVERSATION });
  });
  const signal = new AbortController().signal;
  assert.equal((await api.list(signal)).defaultProvider?.provider, "deepseek");
  assert.equal((await api.get(ID, signal)).id, ID);
  const input = { conversationId: ID, expectedVersion: 1, text: "Stok durumum nasıl?" };
  await api.send(input, OP, signal);
  await api.send(input, OP, signal);
  assert.deepEqual(calls.map(([path]) => path), ["/api/toshi/conversations", `/api/toshi/conversations/${ID}`, "/api/toshi/messages", "/api/toshi/messages"]);
  for (const [, init] of calls) { assert.equal(init.credentials, "same-origin"); assert.equal(init.cache, "no-store"); assert.equal(init.signal, signal); }
  assert.equal(calls[2]![1].body, JSON.stringify(input));
  assert.deepEqual(calls[2]![1].headers, { accept: "application/json", "content-type": "application/json", "idempotency-key": OP });
  assert.equal(calls[3]![1].body, calls[2]![1].body);
});

test("chat client distinguishes definitive safe provider errors from uncertain transport and never retries", async () => {
  let count = 0;
  const api = createToshiChatApi(async () => { count += 1; throw new Error("private-provider-secret"); });
  await assert.rejects(api.send({ conversationId: null, expectedVersion: null, text: "Merhaba" }, OP), (error: unknown) => error instanceof ToshiChatApiError && error.uncertain && !error.message.includes("secret"));
  assert.equal(count, 1);
  const quota = createToshiChatApi(async () => Response.json({ code: "quota_exceeded" }, { status: 402 }));
  await assert.rejects(quota.send({ conversationId: null, expectedVersion: null, text: "Merhaba" }, OP), (error: unknown) => error instanceof ToshiChatApiError && error.code === "quota_exceeded" && !error.uncertain && /bakiye/.test(error.message));
  const hostile = createToshiChatApi(async () => Response.json({ code: "provider_stack: secret" }, { status: 500 }));
  await assert.rejects(hostile.list(), (error: unknown) => error instanceof ToshiChatApiError && error.code === "unavailable" && !error.message.includes("secret"));
  const failed = createToshiChatApi(async () => Response.json({ code: "operation_failed" }, { status: 409 }));
  await assert.rejects(failed.send({ conversationId: null, expectedVersion: null, text: "Merhaba" }, OP), (error: unknown) => error instanceof ToshiChatApiError && error.code === "operation_failed" && !error.uncertain);
});

test("chat client rejects private response fields, unsafe sources, invalid payloads and oversized JSON", async () => {
  for (const value of [{ conversation: { ...CONVERSATION, sealedCredentials: "secret" } }, { conversation: { ...CONVERSATION, messages: [{ ...CONVERSATION.messages[0], sources: [{ label: "Yönlendirme", href: "https://evil.test" }] }] } }]) {
    await assert.rejects(createToshiChatApi(async () => Response.json(value)).get(ID), ToshiChatApiError);
  }
  const api = createToshiChatApi(async () => { throw Error("must_not_fetch"); });
  assert.throws(() => api.get("../settings"), ToshiChatApiError);
  assert.throws(() => api.send({ conversationId: null, expectedVersion: 1, text: "Merhaba" }, OP), ToshiChatApiError);
  assert.throws(() => api.send({ conversationId: null, expectedVersion: null, text: " " }, OP), ToshiChatApiError);
  assert.throws(() => api.send({ conversationId: null, expectedVersion: null, text: "a".repeat(4001) }, OP), ToshiChatApiError);
  const huge = createToshiChatApi(async () => new Response("x".repeat(2_097_153), { headers: { "content-type": "application/json" } }));
  await assert.rejects(huge.list(), ToshiChatApiError);
});

test("chat client accepts a durable empty conversation at version zero", async () => {
  let actual: unknown;
  const api = createToshiChatApi(async (_path, init) => { actual = JSON.parse(String(init?.body)); return Response.json({ conversation: CONVERSATION }); });
  await api.send({ conversationId: ID, expectedVersion: 0, text: "Önceki gönderimden sonra yeni soru" }, OP);
  assert.deepEqual(actual, { conversationId: ID, expectedVersion: 0, text: "Önceki gönderimden sonra yeni soru" });
});

test("chat client accepts a valid public Unicode conversation above one MiB within the two MiB bound", async () => {
  const value = { ...CONVERSATION, version: 40, messages: Array.from({ length: 40 }, (_, index) => ({
    id: `${String(index + 10).padStart(8, "0")}-1111-4111-8111-111111111111`, role: index % 2 === 0 ? "user" : "assistant",
    text: "字".repeat(index % 2 === 0 ? 4000 : 12000), createdAt: NOW,
    sources: index % 2 === 0 ? [] : Array.from({ length: 12 }, (_value, sourceIndex) => ({ label: "字".repeat(120), href: `/products/${"a".repeat(227)}${String(sourceIndex).padStart(3, "0")}` })),
  })) };
  const serialized = JSON.stringify({ conversation: value });
  assert.ok(new TextEncoder().encode(serialized).byteLength > 1_048_576);
  assert.ok(new TextEncoder().encode(serialized).byteLength < 2_097_152);
  const result = await createToshiChatApi(async () => new Response(serialized, { headers: { "content-type": "application/json" } })).get(ID);
  assert.equal(result.messages.length, 40);
  assert.equal(result.messages.at(-1)?.sources.length, 12);
});

test("chat client classifies rejected sensitive input as a definitive safe error", async () => {
  const api = createToshiChatApi(async () => Response.json({ code: "sensitive_input" }, { status: 400 }));
  await assert.rejects(api.send({ conversationId: null, expectedVersion: null, text: "Bir bağlantı sorusu" }, OP), (error: unknown) => error instanceof ToshiChatApiError && error.code === "sensitive_input" && !error.uncertain && /API anahtarı/.test(error.message));
});

test("chat client preserves abort identity for stop and unmount", async () => {
  const abort = new DOMException("Stopped", "AbortError");
  const api = createToshiChatApi(async () => { throw abort; });
  await assert.rejects(api.list(), (error) => error === abort);
});

test("synthetic browser fixture crosses the real chat client parsers and preserves operation replay", async () => {
  const api = createToshiChatApi(async (path, init) => {
    const slug = String(path).slice("/api/".length);
    if (init?.method === "POST") return postToshiFixture(new Request(`https://fixture.test${path}`, init), slug);
    return getToshiFixture(slug) ?? Response.json({ code: "not_found" }, { status: 404 });
  });
  const listed = await api.list();
  assert.equal(listed.defaultProvider?.provider, "deepseek");
  const current = await api.get(listed.conversations[0]!.id);
  assert.equal(current.messages.length, 2);
  const input = { conversationId: current.id, expectedVersion: current.version, text: "Tarayıcı testinde devam sorusu" };
  const generated = await api.send(input, OP);
  assert.equal(generated.messages.length, 4);
  assert.deepEqual(await api.send(input, OP), generated);
});
