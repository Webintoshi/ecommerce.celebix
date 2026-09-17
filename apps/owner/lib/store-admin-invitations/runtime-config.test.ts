import assert from "node:assert/strict";
import test from "node:test";
import { rootCertificates } from "node:tls";
import { parseInvitationRuntimeConfig } from "./runtime-config.ts";

const env = {
  CELEBIX_ADMIN_INVITATIONS_ENABLED: "true",
  CELEBIX_ADMIN_INVITATIONS_MODE: "approved_staging",
  CELEBIX_DEPLOYMENT_TIER: "staging",
  CELEBIX_ADMIN_INVITATIONS_RESEND_API_KEY: "re_fake123",
  CELEBIX_ADMIN_INVITATIONS_FROM: "sender@example.com",
  CELEBIX_ADMIN_INVITATIONS_ACCEPTANCE_ORIGIN: "https://accounts.example.com",
  CELEBIX_ADMIN_INVITATIONS_ALLOWED_STORE_ID: "123e4567-e89b-42d3-a456-426614174000",
  CELEBIX_ADMIN_INVITATIONS_ALLOWED_RECIPIENT: "recipient@example.com",
  CELEBIX_ADMIN_INVITATIONS_WORKER_ID: "invitation_worker",
  CELEBIX_ADMIN_INVITATIONS_PAYLOAD_ACTIVE_KEY_ID: "invite_01",
  CELEBIX_ADMIN_INVITATIONS_PAYLOAD_KEYRING: JSON.stringify({ invite_01: Buffer.alloc(32, 7).toString("base64") }),
};
const database = { name: "celebix_saas_staging_invitations", url: "postgresql://existing_owner_login:fixture@db.internal/celebix_saas_staging_invitations?sslmode=verify-full", ca: rootCertificates[0]! };
test("runtime is disabled by default and accepts only explicit approved staging with dedicated config", () => {
  assert.equal(parseInvitationRuntimeConfig({}), null);
  assert.equal(parseInvitationRuntimeConfig({ ...env, CELEBIX_ADMIN_INVITATIONS_ENABLED: "false" }), null);
  const config = parseInvitationRuntimeConfig(env, database)!;
  assert.equal(config.workerId, "invitation_worker"); assert.equal(config.delivery.allowedRecipient, "recipient@example.com");
  assert.deepEqual(config.keyring.keys.invite_01, Buffer.alloc(32, 7));
});
test("production, ambient secret fallback, unsafe DB target and malformed keys fail closed", () => {
  for (const override of [
    { CELEBIX_DEPLOYMENT_TIER: "production" }, { CELEBIX_ADMIN_INVITATIONS_MODE: undefined },
    { CELEBIX_ADMIN_INVITATIONS_WORKER_ID: "x".repeat(81) },
    { CELEBIX_ADMIN_INVITATIONS_PAYLOAD_ACTIVE_KEY_ID: "missing" },
    { CELEBIX_ADMIN_INVITATIONS_PAYLOAD_KEYRING: JSON.stringify({ invite_01: Buffer.alloc(31).toString("base64") }) },
    { CELEBIX_ADMIN_INVITATIONS_PAYLOAD_KEYRING: undefined, CELEBIX_ORDER_EMAIL_PAYLOAD_KEYRING: env.CELEBIX_ADMIN_INVITATIONS_PAYLOAD_KEYRING },
    { CELEBIX_ADMIN_INVITATIONS_RESEND_API_KEY: undefined, RESEND_API_KEY: "re_secret" },
  ]) assert.throws(() => parseInvitationRuntimeConfig({ ...env, ...override }, database), /^Error: store_admin_invitation_runtime_config_invalid$/);
  for (const db of [undefined, { ...database, name: "celebix_saas_production" }, { ...database, url: database.url.replace("verify-full", "disable") }, { ...database, ca: "invalid" }, { ...database, url: database.url.replace("staging_invitations?", "staging_other?") }]) {
    assert.throws(() => parseInvitationRuntimeConfig(env, db), /^Error: store_admin_invitation_runtime_config_invalid$/);
  }
  const config = parseInvitationRuntimeConfig(env, database)!;
  assert.equal(config.database.name, database.name); assert.equal(config.poolConfig.ssl.rejectUnauthorized, true);
  assert.equal(new URL(config.poolConfig.connectionString).search, "");
});
