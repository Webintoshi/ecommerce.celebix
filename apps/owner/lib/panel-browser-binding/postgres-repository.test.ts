import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

import { createPanelBrowserBindingAuthorityCodec } from "./credential-codec.ts";
import { createPostgresPanelBrowserBindingRepository } from "./postgres-repository.ts";

const NOW = new Date("2026-07-14T12:00:00.000Z");
const PROVIDER_URL = "https://identity.example.test/authorize?b=2&state=state_0123456789abcdefghijklmnop&a=1&redirect_uri=https%3A%2F%2Fpanel.celebix.site%2Fauth%2Fcallback";
const STATE = "state_0123456789abcdefghijklmnop";
const BOOTSTRAP = `bs1.bootstrap.${Buffer.alloc(32, 0x11).toString("base64url")}`;
const BINDING = `pb1.${Buffer.alloc(32, 0x22).toString("base64url")}`;
const BOOTSTRAP_KEY = Buffer.alloc(32, 0x31);
const ACTIVE_KEY = Buffer.alloc(32, 0x32);
const OLD_KEY = Buffer.alloc(32, 0x33);
const BINDING_ID = "123e4567-e89b-42d3-a456-426614174000";

function hmac(key: Uint8Array, domain: string, value: string): string {
  return createHmac("sha256", key).update(`${domain}\n${value}`).digest("hex");
}

function harness(rows: Record<string, unknown>[], commitFails = false, functionError?: Error & { code?: string; constraint?: string }) {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const releases: unknown[] = [];
  const client = {
    async query(text: string, values?: readonly unknown[]) {
      queries.push({ text, values });
      if (text === "COMMIT" && commitFails) throw new Error("connection_lost");
      if (text.startsWith("SELECT outcome, authority FROM saas.")) {
        if (functionError) throw functionError;
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    },
    release(value?: unknown) { releases.push(value); },
  };
  return { pool: { async connect() { return client; } }, queries, releases };
}

function repository(db: ReturnType<typeof harness>, overrides: {
  stateDigester?: { digest(value: string): string };
  oidcStateDigester?: { digest(value: string): string };
  audit?: (event: unknown) => void;
} = {}) {
  const codec = createPanelBrowserBindingAuthorityCodec({
    bootstrapKeys: new Map([["bootstrap", BOOTSTRAP_KEY]]),
    activeBootstrapKeyId: "bootstrap",
    browserBindingKeys: new Map([["old", OLD_KEY], ["active", ACTIVE_KEY]]),
    activeBrowserBindingKeyId: "active",
    randomBytes: () => Buffer.alloc(32, 0x11),
  });
  return createPostgresPanelBrowserBindingRepository({
    pool: db.pool,
    stateDigester: overrides.stateDigester ?? { digest(value: string) { return createHash("sha256").update(`state\n${value}`).digest("hex"); } },
    oidcStateDigester: overrides.oidcStateDigester ?? { digest(value: string) { return createHash("sha256").update(`oidc\n${value}`).digest("hex"); } },
    credentialCodec: codec,
    clock: () => new Date(NOW),
    timeouts: { poolCheckoutMs: 1_000, statementMs: 1_000, lockMs: 1_000, idleTransactionMs: 1_000 },
    audit: overrides.audit ?? (() => undefined),
  });
}

test("create persists only state/bootstrap/provider digests and exact candidate authority", async () => {
  const stateDigest = createHash("sha256").update(`state\n${STATE}`).digest("hex");
  const oidcStateDigest = createHash("sha256").update(`oidc\n${STATE}`).digest("hex");
  const urlDigest = createHash("sha256").update(PROVIDER_URL, "utf8").digest("hex");
  const bootstrapDigest = hmac(BOOTSTRAP_KEY, "celebix-panel-browser-bootstrap-digest-v1", BOOTSTRAP);
  const authority = {
    bindingId: BINDING_ID, attemptId: "attempt_0123456789abcdef", stateDigest, oidcStateDigest,
    bootstrapTokenKeyId: "bootstrap", bootstrapTokenDigest: bootstrapDigest,
    authorizationUrlDigest: urlDigest, issuedAt: NOW.toISOString(),
    bootstrapExpiresAt: new Date(NOW.getTime() + 300_000).toISOString(), version: 1,
  };
  const db = harness([{ outcome: "browser_bootstrap_created", authority }]);
  const result = await repository(db).createBootstrap({
    rawState: STATE, bootstrapCredential: BOOTSTRAP, providerAuthorizationUrl: PROVIDER_URL,
    bindingId: BINDING_ID, issuedAt: NOW, expiresAt: new Date(NOW.getTime() + 300_000),
  });
  assert.deepEqual(result, { kind: "browser_bootstrap_created", expiresAt: authority.bootstrapExpiresAt });
  const call = db.queries.find((query) => query.text.includes("create_panel_browser_bootstrap"));
  assert.ok(call);
  assert.deepEqual(call.values, [stateDigest, oidcStateDigest, "bootstrap", bootstrapDigest, urlDigest, BINDING_ID, NOW, new Date(NOW.getTime() + 300_000)]);
  assert.doesNotMatch(JSON.stringify(call.values), new RegExp(`${STATE}|${BOOTSTRAP.replaceAll(".", "\\.")}|identity\\.example`));
});

test("bind hashes the exact provider URL string and persists only the active binding digest", async () => {
  const urlDigest = createHash("sha256").update(PROVIDER_URL, "utf8").digest("hex");
  const bootstrapDigest = hmac(BOOTSTRAP_KEY, "celebix-panel-browser-bootstrap-digest-v1", BOOTSTRAP);
  const bindingDigest = hmac(ACTIVE_KEY, "celebix-panel-browser-binding-digest-v1", BINDING);
  const expiresAt = new Date(NOW.getTime() + 900_000).toISOString();
  const db = harness([{ outcome: "browser_binding_created", authority: {
    authorizationUrlDigest: urlDigest, browserBindingKeyId: "active", browserBindingDigest: bindingDigest,
    browserBindingExpiresAt: expiresAt, version: 2,
  } }]);
  const result = await repository(db).bindBrowserCredential({
    bootstrapCredential: BOOTSTRAP, providerAuthorizationUrl: PROVIDER_URL,
    browserBindingCredential: BINDING, now: NOW, expiresAt: new Date(expiresAt),
  });
  assert.deepEqual(result, { kind: "browser_binding_created", providerAuthorizationUrl: PROVIDER_URL, expiresAt });
  const call = db.queries.find((query) => query.text.includes("bind_panel_browser_credential"));
  assert.deepEqual(call?.values, ["bootstrap", bootstrapDigest, urlDigest, "active", bindingDigest, NOW, new Date(expiresAt)]);
  const reordered = new URL(PROVIDER_URL); reordered.searchParams.sort();
  assert.notEqual(createHash("sha256").update(reordered.toString()).digest("hex"), urlDigest);
});

test("claim submits all rotation candidates in one atomic SQL function call", async () => {
  const stateDigest = createHash("sha256").update(`state\n${STATE}`).digest("hex");
  const oidcStateDigest = createHash("sha256").update(`oidc\n${STATE}`).digest("hex");
  const activeDigest = hmac(ACTIVE_KEY, "celebix-panel-browser-binding-digest-v1", BINDING);
  const oldDigest = hmac(OLD_KEY, "celebix-panel-browser-binding-digest-v1", BINDING);
  const db = harness([{ outcome: "browser_callback_claimed", authority: { callbackClaimedAt: NOW.toISOString(), version: 3 } }]);
  const result = await repository(db).claimCallback({ rawState: STATE, browserBindingCredential: BINDING, now: NOW });
  assert.deepEqual(result, { kind: "browser_callback_claimed" });
  const calls = db.queries.filter((query) => query.text.includes("claim_panel_browser_callback"));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].values, [stateDigest, oidcStateDigest, ["active", "old"], [activeDigest, oldDigest], NOW]);
});

test("every browser-binding write COMMIT uncertainty destroys the client and never retries", async () => {
  const db = harness([{ outcome: "browser_callback_claimed", authority: { callbackClaimedAt: NOW.toISOString(), version: 3 } }], true);
  const result = await repository(db).claimCallback({ rawState: STATE, browserBindingCredential: BINDING, now: NOW });
  assert.deepEqual(result, { kind: "commit_unknown" });
  assert.equal(db.queries.filter((query) => query.text.includes("claim_panel_browser_callback")).length, 1);
  assert.equal(db.queries.filter((query) => query.text === "ROLLBACK").length, 0);
  assert.deepEqual(db.releases, [true]);
});

test("SQL and check-constraint exceptions remain unavailable with secret-free diagnostics", async () => {
  const errors: Array<Error & { code: string; constraint?: string }> = [
    Object.assign(new Error("function detail must not escape"), { code: "42883" }),
    Object.assign(new Error("constraint detail must not escape"), { code: "23514", constraint: "private_constraint" }),
  ];
  for (const error of errors) {
    const audits: unknown[] = [];
    const db = harness([], false, error);
    const result = await repository(db, { audit(event) { audits.push(event); } }).createBootstrap({
      rawState: STATE,
      bootstrapCredential: BOOTSTRAP,
      providerAuthorizationUrl: PROVIDER_URL,
      bindingId: BINDING_ID,
      issuedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 300_000),
    });
    assert.deepEqual(result, { kind: "unavailable" });
    assert.deepEqual(audits, [{ operation: "create", result: "unavailable" }]);
    const diagnostic = JSON.stringify({ result, audits });
    for (const secret of [STATE, BOOTSTRAP, PROVIDER_URL, error.message, error.constraint ?? "private_constraint"]) {
      assert.equal(diagnostic.includes(secret), false);
    }
    assert.equal(db.queries.filter((query) => query.text.includes("create_panel_browser_bootstrap")).length, 1);
    assert.equal(db.queries.filter((query) => query.text === "ROLLBACK").length, 1);
    assert.deepEqual(db.releases, [true]);
  }
});

test("captures state digest functions so post-composition mutation cannot redirect durable authority", async () => {
  const stateDigester = { digest(value: string) { return createHash("sha256").update(`state\n${value}`).digest("hex"); } };
  const oidcStateDigester = { digest(value: string) { return createHash("sha256").update(`oidc\n${value}`).digest("hex"); } };
  const db = harness([{ outcome: "browser_callback_claimed", authority: { callbackClaimedAt: NOW.toISOString(), version: 3 } }]);
  const captured = repository(db, { stateDigester, oidcStateDigester });
  stateDigester.digest = () => { throw new Error("mutated"); };
  oidcStateDigester.digest = () => { throw new Error("mutated"); };
  assert.deepEqual(
    await captured.claimCallback({ rawState: STATE, browserBindingCredential: BINDING, now: NOW }),
    { kind: "browser_callback_claimed" },
  );
});
