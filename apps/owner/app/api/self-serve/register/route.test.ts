import assert from "node:assert/strict";
import test from "node:test";

import type { NextRequest } from "next/server";
import { POST } from "./route";
import type { SelfServeRegistrationInput } from "@/lib/self-serve-registration";

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

function resetSelfServeGlobals() {
  delete globalThis.__celebixSelfServeOnboardingStore;
  delete globalThis.__celebixSelfServeRegistrationRateLimit;
}

function makeRequest(input: SelfServeRegistrationInput, headers: Record<string, string> = {}) {
  const url = "https://ecommerce.celebix.co/api/self-serve/register";
  const request = new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(input),
  }) as Request & { nextUrl: URL };

  Object.defineProperty(request, "nextUrl", {
    value: new URL(url),
  });

  return request as unknown as NextRequest;
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

test("self-serve register rejects POST without Origin before reading creation flow", async () => {
  resetSelfServeGlobals();

  const response = await POST(makeRequest(validRegistration));
  const body = await readJson(response);

  assert.equal(response.status, 403);
  assert.equal(body.code, "self_serve_origin_required");
});

test("self-serve register returns validation error when KVKK consent is missing", async () => {
  resetSelfServeGlobals();

  const response = await POST(
    makeRequest(
      {
        ...validRegistration,
        privacyConsent: false,
      },
      { origin: "https://ecommerce.celebix.co" },
    ),
  );
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.code, "self_serve_registration_rejected");
  assert.equal(JSON.stringify(body).includes(validRegistration.password), false);
});

test("self-serve register default mode returns safe processing response with planned store/admin URLs", async () => {
  resetSelfServeGlobals();

  const response = await POST(makeRequest(validRegistration, { origin: "https://ecommerce.celebix.co" }));
  const body = await readJson(response);

  assert.equal(response.status, 202);
  assert.equal(body.code, "self_serve_store_creation_processing");
  assert.equal(body.adminRedirectUrl, null);
  assert.equal(body.plannedStoreUrl, "https://cicek-pazari.celebix.site");
  assert.equal(body.plannedAdminUrl, "https://admin-cicek-pazari.celebix.site");
  assert.equal(JSON.stringify(body).includes(validRegistration.password), false);

  const provisioning = body.provisioning as Record<string, unknown>;
  assert.equal(provisioning.freeStarterStoreEnabled, false);
  assert.equal(provisioning.storeCreateEnabled, false);
  assert.equal(provisioning.provisioningEnabled, false);

  const creation = body.creation as Record<string, unknown>;
  assert.equal(creation.mode, "production_safe_pending");
  assert.equal(creation.idempotent, false);
});
