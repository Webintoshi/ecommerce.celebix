import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  MerchantProviderCredentialKeyring,
  ToshiProviderRepository,
} from "@celebix/saas-data";

import { createToshiProviderAdapterRegistry } from "../toshi-provider-adapters/registry.ts";
import {
  registerServerToshiProviderRuntime,
  resolveServerToshiProviderRuntime,
} from "./runtime.ts";

function access(mode: "approved_staging" | "disabled" = "approved_staging") {
  return Object.freeze({
    readiness: Object.freeze({ mode }),
    panelOrigin: mode === "approved_staging" ? "https://panel.example.test" : null,
  }) as never;
}

const reject = async () => { throw new Error("unused"); };
const repository: ToshiProviderRepository = Object.freeze({
  list: reject,
  getConnectionIdentity: reject,
  connect: reject,
  selectModel: reject,
  setDefault: reject,
  revoke: reject,
  getAuthority: reject,
});

function keyring(): MerchantProviderCredentialKeyring {
  return Object.freeze({
    activeKeyId: "staging-key-01",
    keys: Object.freeze([
      Object.freeze({ keyId: "staging-key-01", key: new Uint8Array(32).fill(7) }),
    ]),
  });
}

function adapters() {
  const unused = async () => { throw new Error("unused"); };
  return createToshiProviderAdapterRegistry({ openai: unused, gemini: unused, anthropic: unused });
}

test("runtime registers one immutable provider authority beside panel access", () => {
  const approved = access();
  const runtime = registerServerToshiProviderRuntime(approved, repository, keyring(), adapters());
  assert.equal(runtime.readiness.mode, "approved_staging");
  assert.equal(runtime.access, approved);
  assert.equal(Object.isFrozen(runtime), true);
  assert.deepEqual(Object.keys(runtime.repository), ["list", "getConnectionIdentity", "connect", "selectModel", "setDefault", "revoke", "getAuthority"]);
  assert.equal(resolveServerToshiProviderRuntime(approved), runtime);
  const exposed = runtime.keyring;
  exposed.keys[0]!.key.fill(0);
  assert.equal(runtime.keyring.keys[0]!.key[0], 7);
  assert.throws(
    () => registerServerToshiProviderRuntime(approved, repository, keyring(), adapters()),
    /server_toshi_provider_runtime_invalid/,
  );
});

test("disabled access never registers or resolves", () => {
  const disabled = access("disabled");
  assert.throws(
    () => registerServerToshiProviderRuntime(disabled, repository, keyring(), adapters()),
    /server_toshi_provider_runtime_invalid/,
  );
  assert.equal(resolveServerToshiProviderRuntime(disabled), null);
});

test("runtime rejects missing repository methods mutable keyrings and incomplete registries", () => {
  assert.throws(
    () => registerServerToshiProviderRuntime(access(), { list: reject } as never, keyring(), adapters()),
    /server_toshi_provider_runtime_invalid/,
  );
  const mutable = { activeKeyId: "staging-key-01", keys: [{ keyId: "staging-key-01", key: new Uint8Array(32) }] } as MerchantProviderCredentialKeyring;
  assert.throws(
    () => registerServerToshiProviderRuntime(access(), repository, mutable, adapters()),
    /server_toshi_provider_runtime_invalid/,
  );
  assert.throws(
    () => registerServerToshiProviderRuntime(access(), repository, keyring(), Object.freeze({ get() { return null; } }) as never),
    /server_toshi_provider_runtime_invalid/,
  );
});

test("production composition reuses the merchant credential keyring and requires the Toshi migration", () => {
  const source = readFileSync(new URL("../server-panel-access/postgres-runtime.ts", import.meta.url), "utf8");
  assert.match(source, /new PostgresToshiProviderRepository/);
  assert.match(source, /createToshiProviderAdapterRegistry\(\{[\s\S]*openai:[\s\S]*gemini:[\s\S]*anthropic:/);
  const registration = /registerServerToshiProviderRuntime\(([\s\S]*?)\n\s*\);/.exec(source)?.[1] ?? "";
  assert.match(registration, /providerCredentialKeyring/);
  assert.doesNotMatch(registration, /quickLinksConfig[.]keyring/);
  assert.match(source, /AS toshi_provider_repository/);
  assert.match(source, /row[.]toshi_provider_repository !== true/);
});
