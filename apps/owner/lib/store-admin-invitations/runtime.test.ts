import assert from "node:assert/strict";
import test from "node:test";
import { rootCertificates } from "node:tls";
import { initializeInvitationRuntime, preflightInvitationPool } from "./runtime.ts";
const database = { name: "celebix_saas_staging_auth01", url: "postgresql://fixture:fixture@db.example.test/celebix_saas_staging_auth01?sslmode=verify-full", ca: rootCertificates[0]! };
const owner = { database, authority: { panelOrigin: "https://panel.example.test" }, keys: { sessionKeyId: "test", session: Buffer.alloc(32, 3) } } as never;
const env = { CELEBIX_ADMIN_INVITATIONS_ENABLED: "true", CELEBIX_ADMIN_INVITATIONS_MODE: "approved_staging", CELEBIX_DEPLOYMENT_TIER: "staging", CELEBIX_ADMIN_INVITATIONS_RESEND_API_KEY: "re_fake123", CELEBIX_ADMIN_INVITATIONS_FROM: "sender@example.test", CELEBIX_ADMIN_INVITATIONS_ACCEPTANCE_ORIGIN: "https://panel.example.test", CELEBIX_ADMIN_INVITATIONS_ALLOWED_STORE_ID: "10000000-0000-4000-8000-000000000001", CELEBIX_ADMIN_INVITATIONS_ALLOWED_RECIPIENT: "recipient@example.test", CELEBIX_ADMIN_INVITATIONS_WORKER_ID: "test_worker", CELEBIX_ADMIN_INVITATIONS_PAYLOAD_ACTIVE_KEY_ID: "test_key", CELEBIX_ADMIN_INVITATIONS_PAYLOAD_KEYRING: JSON.stringify({ test_key: Buffer.alloc(32, 5).toString("base64") }) };
test("disabled invitation runtime does not construct a pool; enabled runtime requires verified TLS and exact staging DB", async () => {
  let pools = 0; const configs: any[] = [];
  const factory = (config: unknown) => { pools++; configs.push(config); return { async connect() { return { async query() { throw Error("missing capability"); }, release() {} }; }, async end() {} }; };
  assert.equal((await initializeInvitationRuntime({}, owner, { createPool: factory as never })).state, "disabled"); assert.equal(pools, 0);
  assert.equal((await initializeInvitationRuntime(env, owner, { createPool: factory as never })).state, "unavailable");
  assert.equal(pools, 1); assert.equal(configs[0].ssl.rejectUnauthorized, true); assert.equal(configs[0].ssl.ca, database.ca); assert.equal(new URL(configs[0].connectionString).search, "");
  assert.equal((await initializeInvitationRuntime(env, { ...owner as any, database: { ...database, name: "celebix_saas_staging_other" } }, { createPool: factory as never })).state, "unavailable"); assert.equal(pools, 1);
});
test("preflight checks exact functions and SET role and fails on absent capability", async () => {
  const queries: string[] = [];
  const pool = { async connect() { return { async query(text: string) { queries.push(text); return { rows: [{ version_num: 160014, database_name: database.name, is_superuser: false, ready: false }], rowCount: 1 }; }, release() {} }; } };
  await assert.rejects(() => preflightInvitationPool(pool as never, "identity"));
  assert.ok(queries.some(q => q.includes("to_regprocedure"))); assert.ok(queries.every(q => !q.includes("GRANT")));
});
test("ready runtime drains its pool once and wipes only invitation-owned payload keys", async () => {
  let ended = 0; const queries: string[] = [];
  const runtime = await initializeInvitationRuntime(env, owner, { createPool: (() => ({ async connect() { return { async query(text: string) { queries.push(text); return { rows: [{ version_num: 160014, database_name: database.name, is_superuser: false, ready: true }], rowCount: 1 }; }, release() {} }; }, async end() { ended++; } })) as never });
  assert.equal(runtime.state, "ready"); if (runtime.state !== "ready") return;
  const key = runtime.config.keyring.keys.test_key!; assert.equal(key[0], 5);
  assert.ok(queries.includes("SET LOCAL ROLE celebix_saas_identity"));
  await Promise.all([runtime.close(), runtime.close()]); assert.equal(ended, 1);
  assert.ok(key.every(byte => byte === 0)); assert.ok((owner as any).keys.session.every((byte: number) => byte === 3));
});
