import assert from "node:assert/strict";
import test from "node:test";

import type { OidcVerifiedIdentity } from "./self-serve-oidc";

type IdentityModule = typeof import("./self-serve-identity");
const identityBoundary = await import(new URL("./self-serve-identity.ts", import.meta.url).href).catch(
  () => ({} as Partial<IdentityModule>),
);

const verifiedIdentity: OidcVerifiedIdentity = {
  issuer: "https://identity.example.test/oidc",
  subject: "subject_123",
  audience: ["customer-panel"],
  nonce: "nonce_123",
  email: "OWNER@EXAMPLE.TEST",
  emailVerified: true,
};

const details = {
  storeName: "  Çiçek Pazarı  ",
  storeSlug: " Çiçek Pazarı ",
  locale: "tr",
  currency: "TRY",
  themeKey: "starter",
  privacyAcceptedAt: "2026-07-10T12:00:00+03:00",
  marketingAcceptedAt: "2026-07-10T12:05:00+03:00",
};

test("exports the verified identity boundary", () => {
  assert.equal(typeof identityBoundary.buildCreateStarterTenantInput, "function");
});

test("uses issuer plus subject as authority and emits canonical contract input", async () => {
  if (!identityBoundary.buildCreateStarterTenantInput) return;
  let fingerprint = "";
  const result = await identityBoundary.buildCreateStarterTenantInput(verifiedIdentity, details, {
    now: () => new Date("2026-07-10T10:00:00.000Z"),
    createIdempotencyKey: async (value: string) => {
      fingerprint = value;
      return "ssik_server_owned_123";
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.input.principal, {
    issuer: verifiedIdentity.issuer,
    subject: verifiedIdentity.subject,
    email: "owner@example.test",
    emailVerified: true,
  });
  assert.equal(result.input.store.slug, "cicek-pazari");
  assert.equal(result.input.store.name, "Çiçek Pazarı");
  assert.equal(result.input.requestedAt, "2026-07-10T10:00:00.000Z");
  assert.equal(result.input.consents.privacyAcceptedAt, "2026-07-10T09:00:00.000Z");
  assert.equal(result.input.consents.marketingAcceptedAt, "2026-07-10T09:05:00.000Z");
  assert.equal(result.input.idempotencyKey, "ssik_server_owned_123");
  assert.match(fingerprint, /identity\.example\.test/);
  assert.match(fingerprint, /subject_123/);
  assert.match(fingerprint, /cicek-pazari/);
});

test("maps unverified email identity to identity_unverified", async () => {
  if (!identityBoundary.buildCreateStarterTenantInput) return;
  const result = await identityBoundary.buildCreateStarterTenantInput(
    { ...verifiedIdentity, emailVerified: false },
    details,
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "identity_unverified");
});

test("requires privacy consent and rejects an invalid normalized slug", async () => {
  if (!identityBoundary.buildCreateStarterTenantInput) return;
  const noConsent = await identityBoundary.buildCreateStarterTenantInput(verifiedIdentity, {
    ...details,
    privacyAcceptedAt: "",
  });
  assert.equal(noConsent.ok, false);
  if (!noConsent.ok) assert.equal(noConsent.error.code, "invalid_input");

  const reserved = await identityBoundary.buildCreateStarterTenantInput(verifiedIdentity, {
    ...details,
    storeSlug: "admin",
  });
  assert.equal(reserved.ok, false);
  if (!reserved.ok) assert.equal(reserved.error.field, "store.slug");
});

test("never copies password, browser IDs, or provider tokens into Tenant Core input", async () => {
  if (!identityBoundary.buildCreateStarterTenantInput) return;
  const unsafeDetails = {
    ...details,
    password: "NeverCrossThisBoundary!",
    accessToken: "access-secret",
    refreshToken: "refresh-secret",
    storeId: "browser-store-id",
    membershipId: "browser-membership-id",
  } as typeof details;
  const unsafeIdentity = {
    ...verifiedIdentity,
    idToken: "id-secret",
  } as OidcVerifiedIdentity;

  const result = await identityBoundary.buildCreateStarterTenantInput(unsafeIdentity, unsafeDetails, {
    createIdempotencyKey: async () => "ssik_server_owned_456",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const serialized = JSON.stringify(result.input);
  for (const prohibited of [
    "NeverCrossThisBoundary",
    "access-secret",
    "refresh-secret",
    "id-secret",
    "browser-store-id",
    "browser-membership-id",
  ]) {
    assert.equal(serialized.includes(prohibited), false);
  }
});
