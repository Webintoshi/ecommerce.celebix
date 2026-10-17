import assert from "node:assert/strict";
import test from "node:test";

import type { CreateStarterTenantInput, CreateStarterTenantResult } from "@celebix/saas-contracts";
import {COMMERCIAL_PACKAGES,PLAN_FEATURE_KEYS} from '@celebix/saas-contracts';

import { validateTenantCompletionResult } from "./tenant-completion-result.ts";

const NOW = "2026-07-28T10:00:00.000Z";
const input: CreateStarterTenantInput = {
  schemaVersion: 1,
  idempotencyKey: "tenant-media-readiness-proof",
  principal: {
    issuer: "https://identity.example.test/oidc",
    subject: "owner-subject",
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
  consents: { privacyAcceptedAt: NOW },
  requestedAt: NOW,
};

const result: CreateStarterTenantResult = {
  schemaVersion: 1,
  operationId: "10000000-0000-4000-8000-000000000001",
  replayed: false,
  store: {
    id: "20000000-0000-4000-8000-000000000001",
    slug: "ornek-magaza",
    status: "active",
  },
  primaryDomain: {
    schemaVersion: 1,
    hostname: "ornek-magaza.saas-staging.celebix.site",
    domainId: "30000000-0000-4000-8000-000000000001",
    domainType: "platform_subdomain",
    storeId: "20000000-0000-4000-8000-000000000001",
    storeSlug: "ornek-magaza",
    canonicalHostname: "ornek-magaza.saas-staging.celebix.site",
    status: "active",
    cacheVersion: 1,
  },
  membership: {
    schemaVersion: 1,
    id: "40000000-0000-4000-8000-000000000001",
    principalId: "50000000-0000-4000-8000-000000000001",
    storeId: "20000000-0000-4000-8000-000000000001",
    role: "store_owner",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  },
  plan: {
    schemaVersion: 1,
    planId: "60000000-0000-4000-8000-000000000001",
    planCode: "free_starter",
    version: 1,
    status: "active",
    features: ["catalog", "media"],
    limits: { products: 100, staff: 1, storageBytes: 1_000_000_000, monthlyOrders: 100, customDomains: 0 },
    validFrom: NOW,
  },
  mediaStorage: { schemaVersion: 1, status: "ready", version: 1 },
  provisioningStatus: "ready",
  panelUrl: "https://ornek-magaza.admin.saas-staging.celebix.site",
  storefrontUrl: "https://ornek-magaza.saas-staging.celebix.site",
};

const authorities = {
  panelOrigin: "https://panel.saas-staging.celebix.site",
  platformDomainSuffix: "saas-staging.celebix.site",
};

test('current Free result is exact while a prior Free v1 completion remains replayable',()=>{
 const free=COMMERCIAL_PACKAGES[0]!;
 const next={...result,plan:{...result.plan,planId:free.id,version:free.version,features:PLAN_FEATURE_KEYS.filter(key=>free.features.includes(key)),limits:{...free.limits}}};
 assert.equal(validateTenantCompletionResult(next,input,authorities),true);
 assert.equal(validateTenantCompletionResult(result,input,authorities),true);
 assert.equal(validateTenantCompletionResult({...next,plan:{...next.plan,planId:result.plan.planId}},input,authorities),false);
 assert.equal(validateTenantCompletionResult({...next,plan:{...next.plan,limits:{...next.plan.limits,monthlyOrders:100}}},input,authorities),false);
});

test("tenant completion accepts only the exact safe persisted media readiness proof", () => {
  assert.equal(validateTenantCompletionResult(result, input, authorities), true);

  const inheritedStatus = Object.assign(
    Object.create({ status: "ready" }) as Record<string, unknown>,
    { schemaVersion: 1, version: 1 },
  );

  for (const mediaStorage of [
    undefined,
    { schemaVersion: 1, status: "pending", version: 1 },
    { schemaVersion: 1, status: "ready", version: 0 },
    { schemaVersion: 1, status: "ready", version: 1, namespacePrefix: "stores/forged/" },
    inheritedStatus,
  ]) {
    assert.equal(
      validateTenantCompletionResult({ ...result, mediaStorage }, input, authorities),
      false,
    );
  }
});

test('Free v3 onboarding accepts the 25-product tariff and rejects a forged larger quota',()=>{
 const free=COMMERCIAL_PACKAGES[0]!;
 const next={...result,plan:{...result.plan,planId:'00000000-0000-4000-8000-000000000007',version:3,features:PLAN_FEATURE_KEYS.filter(key=>free.features.includes(key)),limits:{...free.limits,products:25}}};
 assert.equal(validateTenantCompletionResult(next,input,authorities),true);
 assert.equal(validateTenantCompletionResult({...next,plan:{...next.plan,limits:{...next.plan.limits,products:100}}},input,authorities),false);
 assert.equal(validateTenantCompletionResult({...next,plan:{...next.plan,version:4}},input,authorities),false);
});
