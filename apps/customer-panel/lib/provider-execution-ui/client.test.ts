import assert from "node:assert/strict";
import test from "node:test";

import { createProviderExecutionApi, ProviderExecutionApiError } from "./client.ts";

const PROFILE = "40000000-0000-4000-8000-000000000005";
const OPERATION = "70000000-0000-4000-8000-000000000001";
const NOW = "2026-07-25T12:00:00.000Z";
const descriptor = { providerCode: "fixture_provider", capability: "marketplace_sync", label: "Fixture", publicFields: [{ key: "account_reference", label: "Hesap" }], credentialFields: [{ key: "api_secret", label: "Secret", secret: true }] };
const profile = { id: PROFILE, providerCode: "fixture_provider", capability: "marketplace_sync", publicConfig: { account_reference: "merchant" }, maskedAccountReference: "••••chant", status: "active", credentialVersion: 1, version: 2, lastValidatedAt: NOW, createdAt: NOW, updatedAt: NOW };

test("provider client reads only parsed descriptors and profiles for one fixed capability", async () => {
  const paths: string[] = [];
  const api = createProviderExecutionApi(async (input) => {
    paths.push(String(input));
    const value = String(input).includes("definitions") ? { items: [descriptor] } : { items: [profile] };
    return Response.json(value);
  }, () => OPERATION);
  assert.equal((await api.definitions("marketplace_sync"))[0]?.providerCode, "fixture_provider");
  assert.equal((await api.profiles("marketplace_sync"))[0]?.maskedAccountReference, "••••chant");
  assert.deepEqual(paths, [
    "/api/merchant-providers/definitions?capability=marketplace_sync",
    "/api/merchant-providers/profiles?capability=marketplace_sync",
  ]);
});

test("provider client sends raw credential once but returns only a safe profile", async () => {
  let observed: RequestInit | undefined;
  const api = createProviderExecutionApi(async (_input, init) => { observed = init; return Response.json(profile); }, () => OPERATION);
  const saved = await api.save({ providerCode: "fixture_provider", capability: "marketplace_sync", publicConfig: { account_reference: "merchant" }, credential: { api_secret: "once" }, expectedVersion: 0 });
  assert.equal(saved.id, PROFILE);
  assert.equal(observed?.headers && new Headers(observed.headers).get("idempotency-key"), OPERATION);
  assert.match(String(observed?.body), /"api_secret":"once"/);
  assert.doesNotMatch(JSON.stringify(saved), /api_secret|ciphertext|credentialDigest|storeId/);
});

test("provider client maps only finite safe errors and rejects corrupt projections", async () => {
  const denied = createProviderExecutionApi(async () => Response.json({ code: "membership_denied" }, { status: 403 }), () => OPERATION);
  await assert.rejects(() => denied.profiles("marketplace_sync"), (error: unknown) => error instanceof ProviderExecutionApiError && error.code === "membership_denied");
  const corrupt = createProviderExecutionApi(async () => Response.json({ items: [{ ...profile, ciphertext: "private" }] }), () => OPERATION);
  await assert.rejects(() => corrupt.profiles("marketplace_sync"), (error: unknown) => error instanceof ProviderExecutionApiError && error.code === "unavailable");
});
