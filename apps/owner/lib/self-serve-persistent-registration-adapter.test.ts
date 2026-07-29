import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

import { getSelfServeFeatureFlags } from "./self-serve-flags.ts";
import type { SelfServeRegistrationInput } from "./self-serve-registration.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/headers") {
      return nextResolve("next/headers.js", context);
    }
    if (specifier.startsWith("@/lib/")) {
      return {
        shortCircuit: true,
        url: new URL(`${specifier.slice("@/lib/".length)}.ts`, import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  createInMemorySelfServePersistentRegistrationAdapter,
  createSelfServeDirectPersistentRegistration,
  getSelfServePersistentAdapterReadiness,
} = await import("./self-serve-persistent-registration-adapter.ts");

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
  "NEXT_PUBLIC_OWNER_SUPABASE_URL",
  "NEXT_PUBLIC_OWNER_SUPABASE_ANON_KEY",
  "OWNER_SUPABASE_SERVICE_ROLE_KEY",
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

async function withSelfServeEnv<T>(env: Record<string, string | undefined>, callback: () => T | Promise<T>): Promise<T> {
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
    return await callback();
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

test("persistent DB adapter mode fails closed when owner DB config is missing", () => {
  return withSelfServeEnv({ SELF_SERVE_PERSISTENCE_MODE: "persistent_db_adapter" }, () => {
    const readiness = getSelfServePersistentAdapterReadiness();

    assert.equal(readiness.ok, false);
    assert.deepEqual(readiness.missingEnv.sort(), [
      "NEXT_PUBLIC_OWNER_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_OWNER_SUPABASE_URL",
      "OWNER_SUPABASE_SERVICE_ROLE_KEY",
    ]);
    assert.equal(JSON.stringify(readiness).includes("C0mpl3xPass!"), false);
  });
});

test("persistent DB adapter writes registration bundle without storing raw password", async () => {
  await withSelfServeEnv({ SELF_SERVE_PERSISTENCE_MODE: "persistent_db_adapter" }, async () => {
    const adapter = createInMemorySelfServePersistentRegistrationAdapter();
    const result = await createSelfServeDirectPersistentRegistration(validRegistration, {
      adapter,
      flags: getSelfServeFeatureFlags(),
    });

    assert.equal(result.ok, true);
    assert.equal(result.persistenceMode, "persistent_db_adapter");
    assert.equal(result.creation.mode, "persistent_db_adapter");
    assert.equal(result.creation.status, "persistent_records_prepared");
    assert.equal(result.creation.artifacts?.provisioningJob.adapter, "persistent_db_adapter");
    assert.equal(result.creation.artifacts?.provisioningJob.status, "queued");
    assert.equal(result.idempotent, false);
    assert.equal(adapter.snapshot().registrations.length, 1);
    assert.equal(adapter.snapshot().provisioningJobs.length, 1);
    assert.equal(JSON.stringify(adapter.snapshot()).includes(validRegistration.password), false);
    assert.equal(JSON.stringify(result).includes(validRegistration.password), false);
  });
});

test("persistent DB adapter is idempotent for same normalized email and slug", async () => {
  await withSelfServeEnv({ SELF_SERVE_PERSISTENCE_MODE: "persistent_db_adapter" }, async () => {
    const adapter = createInMemorySelfServePersistentRegistrationAdapter();
    const first = await createSelfServeDirectPersistentRegistration(validRegistration, {
      adapter,
      flags: getSelfServeFeatureFlags(),
    });
    const repeated = await createSelfServeDirectPersistentRegistration(
      {
        ...validRegistration,
        firstName: " ADA ",
        lastName: " LOVELACE ",
        email: "ADA@EXAMPLE.TEST",
        storeSlug: " Çiçek Pazarı ",
      },
      {
        adapter,
        flags: getSelfServeFeatureFlags(),
      },
    );

    assert.equal(first.ok, true);
    assert.equal(repeated.ok, true);
    assert.equal(repeated.idempotent, true);
    assert.equal(repeated.request.id, first.request.id);
    assert.equal(adapter.snapshot().registrations.length, 1);
  });
});

test("persistent DB adapter rejects duplicate slug for a different email", async () => {
  await withSelfServeEnv({ SELF_SERVE_PERSISTENCE_MODE: "persistent_db_adapter" }, async () => {
    const adapter = createInMemorySelfServePersistentRegistrationAdapter();
    const first = await createSelfServeDirectPersistentRegistration(validRegistration, {
      adapter,
      flags: getSelfServeFeatureFlags(),
    });
    const second = await createSelfServeDirectPersistentRegistration(
      {
        ...validRegistration,
        email: "grace@example.test",
      },
      {
        adapter,
        flags: getSelfServeFeatureFlags(),
      },
    );

    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    assert.equal(second.status, 409);
    assert.equal(second.code, "self_serve_slug_taken");
    assert.equal(adapter.snapshot().registrations.length, 1);
  });
});

test("persistent DB adapter blocks same email for a different slug while quota is one", async () => {
  await withSelfServeEnv({ SELF_SERVE_PERSISTENCE_MODE: "persistent_db_adapter" }, async () => {
    const adapter = createInMemorySelfServePersistentRegistrationAdapter();
    const first = await createSelfServeDirectPersistentRegistration(validRegistration, {
      adapter,
      flags: getSelfServeFeatureFlags(),
    });
    const second = await createSelfServeDirectPersistentRegistration(
      {
        ...validRegistration,
        storeName: "Baska Magaza",
        storeSlug: "baska-magaza",
      },
      {
        adapter,
        flags: getSelfServeFeatureFlags(),
      },
    );

    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    assert.equal(second.status, 409);
    assert.equal(second.code, "self_serve_email_has_existing_store");
    assert.equal(adapter.snapshot().registrations.length, 1);
  });
});
