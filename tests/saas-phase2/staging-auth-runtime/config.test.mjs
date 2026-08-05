import assert from "node:assert/strict";
import test from "node:test";
import { rootCertificates } from "node:tls";

import {
  createOwnerStagingDatabasePoolConfig,
  parseOwnerStagingAuthConfig,
  resolveOwnerStagingAuthMode,
} from "../../../apps/owner/lib/self-serve-auth-authority/config.ts";
import {
  parseCustomerPanelStagingAuthConfig,
  resolveCustomerPanelStagingAuthMode,
} from "../../../apps/customer-panel/lib/panel-auth-authority/config.ts";

const key = (byte) => Buffer.alloc(32, byte).toString("base64url");
const stagingDatabaseCa = Buffer.from(rootCertificates[0], "utf8").toString("base64");

function shared() {
  return {
    CELEBIX_SAAS_AUTH_MODE: "approved_staging",
    CELEBIX_DEPLOYMENT_TIER: "staging",
    CELEBIX_STAGING_ACTIVATION_ID: "staging_20260715_a1",
    CELEBIX_OWNER_ORIGIN: "https://owner-auth.staging.example.test",
    CELEBIX_PANEL_ORIGIN: "https://panel-auth.staging.example.test",
    CELEBIX_PLATFORM_DOMAIN_SUFFIX: "shops.staging.example.test",
    CELEBIX_SAAS_DATABASE_URL: "postgresql://staging_runtime:password@db.staging.example.test:5432/celebix_saas_staging_a1?sslmode=require",
    CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_staging_a1",
    CELEBIX_BROWSER_INTERNAL_KEY_ID: "browser.internal.staging.v1",
    CELEBIX_BROWSER_INTERNAL_KEY_B64URL: key(5),
    CELEBIX_CALLBACK_INTERNAL_KEY_ID: "callback.internal.staging.v1",
    CELEBIX_CALLBACK_INTERNAL_KEY_B64URL: key(6),
    CELEBIX_HANDOFF_KEY_ID: "handoff.staging.v1",
    CELEBIX_HANDOFF_KEY_B64URL: key(7),
    CELEBIX_SESSION_KEY_ID: "session.staging.v1",
    CELEBIX_SESSION_KEY_B64URL: key(8),
  };
}

function owner() {
  return {
    ...shared(),
    CELEBIX_SAAS_DATABASE_URL: "postgresql://staging_runtime:password@db.staging.example.test:5432/celebix_saas_staging_a1?sslmode=verify-full",
    CELEBIX_STAGING_DB_CA_B64: stagingDatabaseCa,
    CELEBIX_LOGTO_ISSUER: "https://identity.staging.example.test/oidc",
    CELEBIX_LOGTO_DISCOVERY_URL: "https://identity.staging.example.test/oidc/.well-known/openid-configuration",
    CELEBIX_LOGTO_CLIENT_ID: "celebix-staging-owner",
    CELEBIX_LOGTO_CLIENT_SECRET: "staging-client-secret",
    CELEBIX_LOGTO_TOKEN_AUTH_METHOD: "client_secret_basic",
    CELEBIX_LOGTO_ID_TOKEN_ALGS: "RS256",
    CELEBIX_IDENTITY_HMAC_KEY_B64URL: key(1),
    CELEBIX_IDENTITY_ENCRYPTION_KEY_ID: "identity.staging.v1",
    CELEBIX_IDENTITY_ENCRYPTION_KEY_B64URL: key(2),
    CELEBIX_BROWSER_BOOTSTRAP_KEY_ID: "browser.bootstrap.staging.v1",
    CELEBIX_BROWSER_BOOTSTRAP_KEY_B64URL: key(3),
    CELEBIX_BROWSER_BINDING_KEY_ID: "browser.binding.staging.v1",
    CELEBIX_BROWSER_BINDING_KEY_B64URL: key(4),
  };
}

function customer() {
  return {
    ...shared(),
    CELEBIX_LOGTO_END_SESSION_ENDPOINT: "https://identity.staging.example.test/oidc/session/end",
    CELEBIX_LOGTO_CLIENT_ID: "celebix-staging-panel",
  };
}

test("mode resolver reads only the two non-secret selectors and otherwise stays disabled", () => {
  for (const resolve of [resolveOwnerStagingAuthMode, resolveCustomerPanelStagingAuthMode]) {
    const reads = [];
    const source = new Proxy({}, {
      get(_target, property) {
        reads.push(property);
        if (property === "CELEBIX_SAAS_AUTH_MODE") return undefined;
        if (property === "CELEBIX_DEPLOYMENT_TIER") return undefined;
        throw new Error("secret read");
      },
    });
    assert.equal(resolve(source), "disabled");
    assert.deepEqual(reads, ["CELEBIX_SAAS_AUTH_MODE", "CELEBIX_DEPLOYMENT_TIER"]);
    assert.equal(resolve({ CELEBIX_SAAS_AUTH_MODE: "production", CELEBIX_DEPLOYMENT_TIER: "staging" }), "disabled");
  }
});

test("strict Owner staging parser returns frozen canonical authority and copied 32-byte keys", () => {
  const first = parseOwnerStagingAuthConfig(owner());
  const second = parseOwnerStagingAuthConfig(owner());
  assert.equal(Object.isFrozen(first), true);
  assert.equal(first.authority.panelCallbackUrl, "https://panel-auth.staging.example.test/auth/callback");
  assert.equal(first.database.name, "celebix_saas_staging_a1");
  assert.equal(first.database.ca, rootCertificates[0]);
  assert.deepEqual(first.logto.algorithms, ["RS256"]);
  assert.equal(first.keys.identityHmac.byteLength, 32);
  assert.notEqual(first.keys.identityHmac, second.keys.identityHmac);
  assert.notEqual(first.keys.browserInternal, second.keys.browserInternal);
});

test("Owner staging database pool uses the trusted CA without allowing URL sslmode to override it", () => {
  const config = parseOwnerStagingAuthConfig(owner());
  assert.deepEqual(createOwnerStagingDatabasePoolConfig(config.database), {
    connectionString: "postgresql://staging_runtime:password@db.staging.example.test:5432/celebix_saas_staging_a1",
    ssl: {
      ca: rootCertificates[0],
      rejectUnauthorized: true,
    },
  });
});

test("strict customer staging parser returns only the required matching runtime keys", () => {
  const config = parseCustomerPanelStagingAuthConfig(customer());
  assert.equal(Object.isFrozen(config), true);
  assert.deepEqual(Object.keys(config.keys), [
    "browserInternalKeyId", "browserInternal", "callbackInternalKeyId", "callbackInternal",
    "handoffKeyId", "handoff", "sessionKeyId", "session",
  ]);
  assert.equal(config.keys.session.byteLength, 32);
});

test("strict staging parsers reject missing, unknown, malformed, production, and noncanonical values", () => {
  const invalidOwner = [
    (() => { const value = owner(); delete value.CELEBIX_LOGTO_CLIENT_SECRET; return value; })(),
    { ...owner(), UNKNOWN_CONFIG: "forbidden" },
    { ...owner(), CELEBIX_OWNER_ORIGIN: "https://ecommerce.celebix.co" },
    { ...owner(), CELEBIX_SAAS_DATABASE_NAME: "production" },
    { ...owner(), CELEBIX_SAAS_DATABASE_URL: "postgresql://runtime:password@db.example.test/other" },
    { ...owner(), CELEBIX_SAAS_DATABASE_URL: "postgresql://staging_runtime:password@db.staging.example.test:5432/celebix_saas_staging_a1?sslmode=require" },
    { ...owner(), CELEBIX_SAAS_DATABASE_URL: "postgresql://staging_runtime:password@db.staging.example.test:5432/celebix_saas_staging_a1?sslmode=verify-full&application_name=forbidden" },
    (() => { const value = owner(); delete value.CELEBIX_STAGING_DB_CA_B64; return value; })(),
    { ...owner(), CELEBIX_STAGING_DB_CA_B64: "not_base64" },
    { ...owner(), CELEBIX_STAGING_DB_CA_B64: Buffer.from("not a certificate", "utf8").toString("base64") },
    { ...owner(), CELEBIX_IDENTITY_HMAC_KEY_B64URL: `${key(1)}=` },
    { ...owner(), CELEBIX_IDENTITY_ENCRYPTION_KEY_ID: "bad key id" },
    { ...owner(), CELEBIX_LOGTO_TOKEN_AUTH_METHOD: "none" },
    { ...owner(), CELEBIX_LOGTO_ID_TOKEN_ALGS: "HS256" },
  ];
  for (const value of invalidOwner) {
    assert.throws(() => parseOwnerStagingAuthConfig(value), /owner_staging_auth_config_invalid/);
  }
  for (const value of [
    { ...customer(), UNKNOWN_CONFIG: "forbidden" },
    { ...customer(), CELEBIX_SESSION_KEY_B64URL: key(9).slice(1) },
    { ...customer(), CELEBIX_DEPLOYMENT_TIER: "production" },
  ]) {
    assert.throws(() => parseCustomerPanelStagingAuthConfig(value), /customer_panel_staging_auth_config_invalid/);
  }
});

export { owner as validOwnerEnvironment, customer as validCustomerEnvironment };
