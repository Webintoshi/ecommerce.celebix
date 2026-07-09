import assert from "node:assert/strict";
import test from "node:test";

import {
  createSelfServeDirectRegistration,
  listSelfServeOnboardingRequests,
} from "./self-serve-request-store";
import type { SelfServeRegistrationInput } from "./self-serve-registration";

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

const validRegistration: SelfServeRegistrationInput = {
  firstName: "Ada",
  lastName: "Lovelace",
  storeName: "Cicek Pazari",
  storeSlug: "cicek-pazari",
  phone: "+905551112233",
  email: "ada@example.test",
  password: "C0mpl3xPass!",
  marketingConsent: false,
  privacyConsent: true,
};

function resetSelfServeStore() {
  delete globalThis.__celebixSelfServeOnboardingStore;
}

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
    resetSelfServeStore();

    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("default self-serve registration remains safe pending and idempotent for same email and slug", () => {
  withSelfServeEnv({}, () => {
    resetSelfServeStore();

    const first = createSelfServeDirectRegistration(validRegistration);
    assert.equal(first.ok, true);
    assert.equal(first.creation.mode, "production_safe_pending");
    assert.equal(first.creation.status, "processing");
    assert.equal(first.idempotent, false);
    assert.equal(first.freeStarterStoreEnabled, false);
    assert.equal(first.storeCreateEnabled, false);
    assert.equal(first.provisioningEnabled, false);

    const repeated = createSelfServeDirectRegistration({
      ...validRegistration,
      firstName: " ADA ",
      lastName: " LOVELACE ",
      email: "ADA@EXAMPLE.TEST",
      storeSlug: " Çiçek Pazarı ",
    });

    assert.equal(repeated.ok, true);
    assert.equal(repeated.idempotent, true);
    assert.equal(repeated.request.id, first.request.id);
    assert.equal(listSelfServeOnboardingRequests().length, 1);
    assert.equal(JSON.stringify(repeated).includes(validRegistration.password), false);
  });
});

test("local mock creation mode creates safe store package domain membership and job artifacts", () => {
  withSelfServeEnv(
    {
      SELF_SERVE_FREE_STARTER_STORE_ENABLED: "true",
      SELF_SERVE_STORE_CREATE_ENABLED: "true",
      SELF_SERVE_PREVIEW_MODE: "true",
      SELF_SERVE_PROVISIONING_ENABLED: "false",
      SELF_SERVE_AUTO_PROVISIONING_ENABLED: "false",
    },
    () => {
      resetSelfServeStore();

      const result = createSelfServeDirectRegistration(validRegistration);
      assert.equal(result.ok, true);
      assert.equal(result.creation.mode, "local_mock_creation");
      assert.equal(result.creation.status, "mock_records_created");

      if (
        result.creation.mode !== "local_mock_creation" ||
        !result.creation.artifacts ||
        !("store" in result.creation.artifacts)
      ) {
        assert.fail("Expected local mock creation artifacts.");
      }

      const { artifacts } = result.creation;
      assert.equal(artifacts.store.slug, "cicek-pazari");
      assert.equal(artifacts.store.url, "https://cicek-pazari.celebix.site");
      assert.equal(artifacts.package.plan, "free_starter");
      assert.equal(artifacts.domain.hostname, "cicek-pazari.celebix.site");
      assert.equal(artifacts.adminDomain.hostname, "admin-cicek-pazari.celebix.site");
      assert.equal(artifacts.membership.role, "store_owner");
      assert.equal(artifacts.provisioningJob.adapter, "local_mock");
      assert.equal(artifacts.provisioningJob.status, "queued_mock");
      assert.equal(result.provisioningEnabled, false);
      assert.equal(JSON.stringify(result).includes(validRegistration.password), false);
    },
  );
});

test("self-serve registration blocks same email for a different slug while max stores per user is one", () => {
  withSelfServeEnv({}, () => {
    resetSelfServeStore();

    const first = createSelfServeDirectRegistration(validRegistration);
    assert.equal(first.ok, true);

    const second = createSelfServeDirectRegistration({
      ...validRegistration,
      storeName: "Baska Magaza",
      storeSlug: "baska-magaza",
    });

    assert.equal(second.ok, false);
    assert.equal(second.status, 409);
    assert.equal(second.code, "self_serve_email_has_existing_store");
    assert.equal(listSelfServeOnboardingRequests().length, 1);
  });
});

test("self-serve registration can raise the per-email store quota through explicit flag", () => {
  withSelfServeEnv({ SELF_SERVE_MAX_STORES_PER_USER: "2" }, () => {
    resetSelfServeStore();

    const first = createSelfServeDirectRegistration(validRegistration);
    assert.equal(first.ok, true);

    const second = createSelfServeDirectRegistration({
      ...validRegistration,
      storeName: "Ikinci Magaza",
      storeSlug: "ikinci-magaza",
    });

    assert.equal(second.ok, true);
    assert.equal(second.request.store.slug, "ikinci-magaza");
    assert.equal(listSelfServeOnboardingRequests().length, 2);
  });
});
