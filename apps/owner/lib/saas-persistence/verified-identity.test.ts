import assert from "node:assert/strict";
import test from "node:test";

import { createCanonicalTenantFingerprint } from "@celebix/saas-data";

import {
  buildVerifiedTenantAuthority,
  parseVerifiedIdentitySnapshot,
} from "./verified-identity.ts";

const requestedAt = "2026-07-12T10:00:00.000Z";
const seed = {
  details: {
    storeName: "Safe Store",
    storeSlug: "safe-store",
    locale: "tr",
    currency: "TRY",
    themeKey: "starter",
    privacyAcceptedAt: requestedAt,
  },
  idempotencyKey: "ssik_A234567890123456",
  requestedAt,
};

const identity = {
  issuer: "https://identity.example.test",
  subject: "subject-123",
  email: "Owner@Example.Test",
  emailVerified: true,
  displayName: "Store Owner",
} as const;

test("verified identity payload accepts only the durable Tenant Core authority", () => {
  assert.deepEqual(parseVerifiedIdentitySnapshot(identity), {
    issuer: identity.issuer,
    subject: identity.subject,
    email: "owner@example.test",
    emailVerified: true,
    displayName: identity.displayName,
  });

  for (const rejected of [
    { ...identity, emailVerified: false },
    { ...identity, audience: ["customer-panel"] },
    { ...identity, nonce: "secret-nonce" },
    { ...identity, accessToken: "secret-token" },
    { ...identity, password: "secret-password" },
    { ...identity, issuer: "" },
    { ...identity, issuer: ` ${identity.issuer}` },
    { ...identity, subject: "" },
    { ...identity, email: "not-an-email" },
  ]) {
    assert.throws(() => parseVerifiedIdentitySnapshot(rejected), /identity_persistence_failed/);
  }
});

test("verified identity reconstruction produces the exact canonical Tenant Core input", async () => {
  const authority = await buildVerifiedTenantAuthority(parseVerifiedIdentitySnapshot(identity), seed);
  assert.deepEqual(authority.input, {
    schemaVersion: 1,
    idempotencyKey: seed.idempotencyKey,
    principal: {
      issuer: identity.issuer,
      subject: identity.subject,
      email: "owner@example.test",
      emailVerified: true,
    },
    store: {
      name: "Safe Store",
      slug: "safe-store",
      locale: "tr",
      currency: "TRY",
      themeKey: "starter",
    },
    consents: { privacyAcceptedAt: requestedAt },
    requestedAt,
  });
  assert.equal(authority.canonicalFingerprint, createCanonicalTenantFingerprint(authority.input));
  assert.match(authority.canonicalFingerprint, /^[a-f0-9]{64}$/);
});
