import assert from "node:assert/strict";
import test from "node:test";

import {
  TOSHI_PROVIDER_CONNECTION_STATUSES,
  TOSHI_PROVIDER_ERROR_CODES,
  TOSHI_PROVIDERS,
  parseToshiProviderConnection,
  parseToshiProviderConnectionList,
} from "./index.ts";

const NOW = "2026-08-02T12:00:00.000Z";

function fixture() {
  return {
    provider: "openai",
    label: "OpenAI",
    status: "active",
    isDefault: true,
    maskedKey: "••••abcd",
    selectedModel: "gpt-5",
    availableModels: [
      { id: "gpt-5", label: "GPT-5" },
      { id: "gpt-5-mini", label: "GPT-5 Mini" },
    ],
    version: 1,
    verifiedAt: NOW,
    updatedAt: NOW,
  };
}

test("Toshi provider contracts expose the four supported connection families", () => {
  assert.deepEqual(TOSHI_PROVIDERS, ["openai", "gemini", "anthropic", "deepseek"]);
  assert.deepEqual(TOSHI_PROVIDER_CONNECTION_STATUSES, ["active", "revoked"]);
  assert.equal(TOSHI_PROVIDER_ERROR_CODES.includes("credential_invalid"), true);
  assert.equal(TOSHI_PROVIDER_ERROR_CODES.includes("quota_exceeded"), true);
});

test("Toshi provider connection parser returns frozen secret-free public state", () => {
  const parsed = parseToshiProviderConnection(fixture());

  assert.equal(parsed.provider, "openai");
  assert.equal(parsed.selectedModel, "gpt-5");
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.availableModels), true);
  assert.equal(Object.isFrozen(parsed.availableModels[0]), true);
  assert.doesNotMatch(JSON.stringify(parsed), /apiKey|ciphertext|credentialDigest|sealedCredentials/);
});

test("Toshi provider connection parser rejects unknown secret fields and invalid model authority", () => {
  const valid = fixture();
  for (const hostile of [
    { ...valid, apiKey: "sk-private" },
    { ...valid, ciphertext: "private" },
    { ...valid, provider: "custom" },
    { ...valid, selectedModel: "gpt-not-listed" },
    { ...valid, maskedKey: "abcd" },
    { ...valid, version: 0 },
    { ...valid, availableModels: [{ id: "gpt-5", label: "GPT-5" }, { id: "gpt-5", label: "Duplicate" }] },
    { ...valid, availableModels: new Array(101).fill({ id: "gpt-5", label: "GPT-5" }) },
  ]) {
    assert.throws(() => parseToshiProviderConnection(hostile), /toshi_provider_contract_invalid/);
  }
});

test("Toshi provider list is exact bounded and contains at most one default", () => {
  const openai = fixture();
  const gemini = {
    ...fixture(),
    provider: "gemini",
    label: "Google Gemini",
    isDefault: false,
    maskedKey: "••••wxyz",
    selectedModel: "models/gemini-2.5-flash",
    availableModels: [{ id: "models/gemini-2.5-flash", label: "Gemini 2.5 Flash" }],
  };
  const parsed = parseToshiProviderConnectionList({ items: [openai, gemini] });

  assert.deepEqual(parsed.items.map(({ provider }) => provider), ["openai", "gemini"]);
  assert.equal(Object.isFrozen(parsed.items), true);
  assert.throws(() => parseToshiProviderConnectionList({ items: [openai, { ...gemini, isDefault: true }] }), /toshi_provider_contract_invalid/);
  assert.throws(() => parseToshiProviderConnectionList({ items: [openai, openai] }), /toshi_provider_contract_invalid/);
  assert.throws(() => parseToshiProviderConnectionList({ items: [], next: "secret" }), /toshi_provider_contract_invalid/);
});


test("DeepSeek public state accepts both model aliases with the exact official label", () => {
  const deepseek = { ...fixture(), provider: "deepseek", label: "DeepSeek", selectedModel: "deepseek-chat",
    availableModels: [{ id: "deepseek-chat", label: "DeepSeek Chat" }, { id: "deepseek-reasoner", label: "DeepSeek Reasoner" }] };
  assert.equal(parseToshiProviderConnection(deepseek).provider, "deepseek");
  assert.equal(parseToshiProviderConnection({ ...deepseek, selectedModel: "deepseek-reasoner" }).selectedModel, "deepseek-reasoner");
  assert.throws(() => parseToshiProviderConnection({ ...deepseek, label: "Anthropic Claude" }), /toshi_provider_contract_invalid/);
  const items = [fixture(), { ...fixture(), provider: "gemini", label: "Google Gemini", isDefault: false },
    { ...fixture(), provider: "anthropic", label: "Anthropic Claude", isDefault: false }, { ...deepseek, isDefault: false }];
  assert.equal(parseToshiProviderConnectionList({ items }).items.length, 4);
  assert.throws(() => parseToshiProviderConnectionList({ items: [...items, deepseek] }), /toshi_provider_contract_invalid/);
});
