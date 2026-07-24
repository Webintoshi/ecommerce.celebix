import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

import type { SelfServeRegistrationInput } from "./self-serve-registration.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
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
  buildSelfServeRegistrationRecord,
  normalizeSelfServeRegistrationInput,
  validateSelfServeRegistrationInput,
} = await import("./self-serve-registration.ts");

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

test("normalizes direct registration slug, email and Turkish phone", () => {
  const normalized = normalizeSelfServeRegistrationInput({
    ...validRegistration,
    firstName: "  Ada  ",
    lastName: " Lovelace ",
    storeName: " Çiçek Pazarı ",
    storeSlug: " Çiçek Pazarı ",
    phone: "0555 111 22 33",
    email: "ADA@EXAMPLE.TEST ",
  });

  assert.equal(normalized.firstName, "Ada");
  assert.equal(normalized.lastName, "Lovelace");
  assert.equal(normalized.storeName, "Çiçek Pazarı");
  assert.equal(normalized.storeSlug, "cicek-pazari");
  assert.equal(normalized.phone, "+905551112233");
  assert.equal(normalized.email, "ada@example.test");
});

test("requires KVKK consent and safe password without echoing password", () => {
  const invalid = {
    ...validRegistration,
    password: "secret",
    privacyConsent: false,
  };
  const errors = validateSelfServeRegistrationInput(invalid);

  assert.ok(errors.some((error) => error.code === "privacy_consent_required"));
  assert.ok(errors.some((error) => error.code === "password_too_weak"));
  assert.ok(errors.every((error) => !error.message.includes(invalid.password)));
});

test("builds a safe pending direct registration record without storing password", () => {
  const record = buildSelfServeRegistrationRecord("ssr_test", validRegistration, {
    now: new Date("2026-07-08T00:00:00.000Z"),
    defaultDomainSuffix: "celebix.site",
    autoProvisioningEnabled: false,
  });

  assert.equal(record.id, "ssr_test");
  assert.equal(record.mode, "direct_registration");
  assert.equal(record.status, "processing_store_creation");
  assert.equal(record.store.slug, "cicek-pazari");
  assert.equal(record.store.proposedDomain, "cicek-pazari.celebix.site");
  assert.equal(record.store.plannedStoreUrl, "https://cicek-pazari.celebix.site");
  assert.equal(record.store.plannedAdminUrl, "https://admin-cicek-pazari.celebix.site");
  assert.equal(record.applicant.fullName, "Ada Lovelace");
  assert.equal(record.registration.plan, "free");
  assert.equal(record.registration.defaultDomainMode, "subdomain");
  assert.equal(record.registration.customDomainAtRegistration, false);
  assert.equal(record.registration.ownerApprovalRequired, false);
  assert.equal(record.ownerApprovalRequired, false);
  assert.equal(record.registration.marketingConsent, false);
  assert.equal("password" in record, false);
  assert.equal(JSON.stringify(record).includes(validRegistration.password), false);
});
