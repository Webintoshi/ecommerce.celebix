import assert from "node:assert/strict";
import test from "node:test";
import { parseToshiConversation, parseToshiConversationListResponse } from "./conversations.ts";

const NOW = "2026-09-26T12:00:00.000Z";
const ID = "11111111-1111-4111-8111-111111111111";
const MSG = "22222222-2222-4222-8222-222222222222";
const summary = { id: ID, title: "Stok durumum", provider: "deepseek", model: "deepseek-flash", version: 1, createdAt: NOW, updatedAt: NOW };
const message = { id: MSG, role: "assistant", text: "İki ürünün stoğu tükenmiş.\nÜrünlerde görebilirsiniz.", sources: [{ label: "Ürünler", href: "/products" }], createdAt: NOW };
const conversation = { ...summary, messages: [message] };

test("conversation parses only bounded, secret-free public fields and freezes nested values", () => {
  const parsed = parseToshiConversation(conversation);
  assert.deepEqual(parsed, conversation);
  assert.equal(Object.isFrozen(parsed.messages[0]?.sources[0]), true);
  assert.equal(Object.isFrozen(parsed.messages), true);
  assert.deepEqual(parseToshiConversationListResponse({ conversations: [summary], defaultProvider: { provider: "deepseek", model: "deepseek-flash" } }), { conversations: [summary], defaultProvider: { provider: "deepseek", model: "deepseek-flash" } });
});

test("public conversation rejects hidden authority, duplicate messages, invalid chronology and oversized history", () => {
  for (const value of [
    { ...conversation, sealedCredentials: "secret" },
    { ...conversation, storeId: ID },
    { ...conversation, provider: "custom" },
    { ...conversation, version: -1 },
    { ...conversation, createdAt: "yesterday" },
    { ...conversation, updatedAt: "2026-01-01T00:00:00.000Z" },
    { ...conversation, messages: [message, message] },
    { ...conversation, messages: Array.from({ length: 41 }, (_, i) => ({ ...message, id: `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111` })) },
    { ...conversation, messages: [{ ...message, text: "a".repeat(12001) }] },
    { ...conversation, messages: [{ ...message, role: "system" }] },
    { ...conversation, messages: [{ ...message, apiKey: "secret" }] },
    { ...conversation, messages: [{ ...message, sources: [{ label: "X", href: "https://evil.test" }] }] },
    { ...conversation, messages: [{ ...message, sources: [{ label: "X", href: "//evil.test" }] }] },
    { ...conversation, messages: [{ ...message, sources: [{ label: "X", href: "/api/settings/artificial-intelligence/providers" }] }] },
  ]) assert.throws(() => parseToshiConversation(value));
});

test("hostile accessors, sparse arrays, hidden keys and list shape are fail closed", () => {
  let reads = 0;
  const hostile = { ...conversation };
  Object.defineProperty(hostile, "title", { enumerable: true, get() { reads++; return "secret"; } });
  assert.throws(() => parseToshiConversation(hostile));
  assert.equal(reads, 0);
  assert.throws(() => parseToshiConversation({ ...conversation, messages: [ , message ] }));
  const hidden = { ...message };
  Object.defineProperty(hidden, "cookie", { value: "secret" });
  assert.throws(() => parseToshiConversation({ ...conversation, messages: [hidden] }));
  assert.throws(() => parseToshiConversationListResponse({ conversations: [summary, summary], defaultProvider: null }));
  assert.throws(() => parseToshiConversationListResponse({ conversations: [], defaultProvider: { provider: "deepseek", model: "deepseek-flash", apiKey: "secret" } }));
});


test("full forty-message multilingual history stays valid at maximum text lengths", () => {
  const messages = Array.from({ length: 40 }, (_, i) => ({ id: `${String(i+100).padStart(8, "0")}-1111-4111-8111-111111111111`, role: i % 2 === 0 ? "user" : "assistant", text: "界".repeat(i % 2 === 0 ? 4000 : 12000), sources: [], createdAt: NOW }));
  const full = parseToshiConversation({ ...summary, version: 20, messages });
  assert.equal(full.messages.length, 40);
  const bytes = new TextEncoder().encode(JSON.stringify(full)).byteLength;
  assert.ok(bytes > 600000);
  assert.ok(bytes < 2097152);
});
