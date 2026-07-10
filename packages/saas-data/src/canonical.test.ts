import assert from "node:assert/strict";
import test from "node:test";

import type { CreateStarterTenantInput } from "@celebix/saas-contracts";

import {
  assertNormalizedExactHostname,
  assertNormalizedSlug,
  canonicalCreateStarterTenantInput,
  createCanonicalTenantFingerprint,
  createPrincipalIdentityKey,
} from "./index.ts";

const input: CreateStarterTenantInput = {
  schemaVersion: 1,
  idempotencyKey: "request-1",
  principal: {
    issuer: "https://auth.example.test/oidc",
    subject: "subject-1",
    email: "owner@example.test",
    emailVerified: true,
  },
  store: {
    name: "Ornek Magaza",
    slug: "ornek-magaza",
    locale: "tr",
    currency: "TRY",
    themeKey: "starter",
  },
  consents: {
    privacyAcceptedAt: "2026-07-10T00:00:00.000Z",
  },
  requestedAt: "2026-07-10T00:00:00.000Z",
};

test("canonical serialization is stable and excludes the idempotency key", () => {
  const reordered = {
    requestedAt: input.requestedAt,
    consents: { ...input.consents },
    store: { ...input.store },
    principal: { ...input.principal },
    idempotencyKey: "another-key",
    schemaVersion: 1 as const,
  } satisfies CreateStarterTenantInput;

  assert.equal(canonicalCreateStarterTenantInput(input), canonicalCreateStarterTenantInput(reordered));
  assert.doesNotMatch(canonicalCreateStarterTenantInput(input), /request-1/);
});

test("canonical fingerprint is deterministic", () => {
  assert.equal(createCanonicalTenantFingerprint(input), createCanonicalTenantFingerprint(input));
  assert.match(createCanonicalTenantFingerprint(input), /^[a-f0-9]{64}$/);
});

test("principal, store, and consent changes alter the fingerprint", () => {
  const fingerprint = createCanonicalTenantFingerprint(input);
  const changes: CreateStarterTenantInput[] = [
    { ...input, principal: { ...input.principal, issuer: "https://other.example.test/oidc" } },
    { ...input, principal: { ...input.principal, subject: "subject-2" } },
    { ...input, store: { ...input.store, slug: "diger-magaza" } },
    {
      ...input,
      consents: {
        ...input.consents,
        marketingAcceptedAt: "2026-07-10T00:01:00.000Z",
      },
    },
  ];

  for (const changed of changes) {
    assert.notEqual(createCanonicalTenantFingerprint(changed), fingerprint);
  }
});

test("principal identity key uses issuer plus subject and never email", () => {
  const identity = createPrincipalIdentityKey(input.principal.issuer, input.principal.subject);
  assert.equal(identity, createPrincipalIdentityKey(input.principal.issuer, input.principal.subject));
  assert.notEqual(identity, createPrincipalIdentityKey(input.principal.issuer, "subject-2"));
  assert.doesNotMatch(identity, /owner@example\.test/);
});

test("normalized slug assertion rejects uppercase and malformed values", () => {
  assert.equal(assertNormalizedSlug("ornek-magaza"), "ornek-magaza");
  assert.throws(() => assertNormalizedSlug("Ornek-Magaza"));
  assert.throws(() => assertNormalizedSlug("ornek--magaza"));
  assert.throws(() => assertNormalizedSlug("ornek_magaza"));
});

test("exact hostname assertion rejects wildcards, ports, paths, and uppercase", () => {
  assert.equal(assertNormalizedExactHostname("ornek.celebix.site"), "ornek.celebix.site");
  assert.throws(() => assertNormalizedExactHostname("*.celebix.site"));
  assert.throws(() => assertNormalizedExactHostname("ornek.celebix.site:443"));
  assert.throws(() => assertNormalizedExactHostname("https://ornek.celebix.site"));
  assert.throws(() => assertNormalizedExactHostname("Ornek.celebix.site"));
});
