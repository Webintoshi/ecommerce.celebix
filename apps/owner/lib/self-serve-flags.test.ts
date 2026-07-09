import assert from "node:assert/strict";
import test from "node:test";

import { getSelfServeFeatureFlags, getSelfServePersistenceMode } from "./self-serve-flags";

const SELF_SERVE_ENV_KEYS = [
  "SELF_SERVE_SIGNUP_ENABLED",
  "SELF_SERVE_DIRECT_REGISTRATION_ENABLED",
  "SELF_SERVE_FREE_STARTER_STORE_ENABLED",
  "SELF_SERVE_STORE_CREATE_ENABLED",
  "SELF_SERVE_PROVISIONING_ENABLED",
  "SELF_SERVE_AUTO_PROVISIONING_ENABLED",
  "SELF_SERVE_REQUIRE_OWNER_APPROVAL",
  "SELF_SERVE_PREVIEW_MODE",
  "SELF_SERVE_REQUIRE_PAYMENT_BEFORE_PUBLIC",
  "SELF_SERVE_MAX_STORES_PER_USER",
  "SELF_SERVE_REQUIRE_EMAIL_VERIFICATION",
  "SELF_SERVE_DEFAULT_DOMAIN_SUFFIX",
  "SELF_SERVE_PERSISTENCE_MODE",
] as const;

function withSelfServeEnv<T>(env: Record<string, string | undefined>, callback: () => T): T {
  const previous = new Map<string, string | undefined>();

  for (const key of SELF_SERVE_ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("self-serve free starter creation flags default to production-safe pending mode", () => {
  withSelfServeEnv({}, () => {
    const flags = getSelfServeFeatureFlags();

    assert.equal(flags.signupEnabled, true);
    assert.equal(flags.directRegistrationEnabled, true);
    assert.equal(flags.freeStarterStoreEnabled, false);
    assert.equal(flags.storeCreateEnabled, false);
    assert.equal(flags.provisioningEnabled, false);
    assert.equal(flags.autoProvisioningEnabled, false);
    assert.equal(flags.requireOwnerApproval, false);
    assert.equal(flags.previewMode, true);
    assert.equal(flags.maxStoresPerUser, 1);
    assert.equal(flags.defaultDomainSuffix, "celebix.site");
    assert.equal(getSelfServePersistenceMode(flags), "safe_memory_adapter");
  });
});

test("self-serve local mock creation mode requires explicit non-production-safe flags", () => {
  withSelfServeEnv(
    {
      SELF_SERVE_FREE_STARTER_STORE_ENABLED: "true",
      SELF_SERVE_STORE_CREATE_ENABLED: "true",
      SELF_SERVE_PREVIEW_MODE: "true",
      SELF_SERVE_PROVISIONING_ENABLED: "false",
      SELF_SERVE_AUTO_PROVISIONING_ENABLED: "false",
    },
    () => {
      const flags = getSelfServeFeatureFlags();

      assert.equal(flags.freeStarterStoreEnabled, true);
      assert.equal(flags.storeCreateEnabled, true);
      assert.equal(flags.provisioningEnabled, false);
      assert.equal(flags.autoProvisioningEnabled, false);
      assert.equal(flags.previewMode, true);
      assert.equal(getSelfServePersistenceMode(flags), "local_mock_adapter");
    },
  );
});

test("self-serve persistent DB adapter requires an explicit persistence mode flag", () => {
  withSelfServeEnv({ SELF_SERVE_PERSISTENCE_MODE: "persistent_db_adapter" }, () => {
    const flags = getSelfServeFeatureFlags();

    assert.equal(getSelfServePersistenceMode(flags), "persistent_db_adapter");
  });
});

test("self-serve unknown persistence mode values fail back to the safe memory adapter", () => {
  withSelfServeEnv({ SELF_SERVE_PERSISTENCE_MODE: "postgres" }, () => {
    const flags = getSelfServeFeatureFlags();

    assert.equal(getSelfServePersistenceMode(flags), "safe_memory_adapter");
  });
});
