import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultStarterThemeComposition } from "@celebix/saas-contracts";
import { StorefrontDesignApiError, createStorefrontDesignApi } from "./client.ts";

const OPERATION = "60000000-0000-4000-8000-000000000001";
const NOW = "2026-08-03T09:00:00.000Z";
const TYPOGRAPHY = { headingFont: { family: "Manrope", category: "sans-serif", availableWeights: ["400", "500", "600", "700", "800"], source: "google" }, bodyFont: { family: "Manrope", category: "sans-serif", availableWeights: ["400", "500", "600", "700", "800"], source: "google" }, headingWeight: "700", bodyWeight: "400", headingSizePx: 40, bodySizePx: 16 } as const;
const DESIGN = { schemaVersion: 3, brand: { logo: null, favicon: null, primaryColor: "#FF5A00", accentColor: "#171717", backgroundColor: "#FFFFFF", textColor: "#171717", fontFamily: "manrope" }, typography: TYPOGRAPHY, hero: { enabled: true, slides: [{ headline: "Güzide Kuyumcu", body: "Zamansız tasarımlar", desktopImage: null, mobileImage: null, destination: { kind: "none" }, enabled: true }] }, promotion: { headline: "Yeni sezon", body: "", destination: { kind: "none" }, startsAt: null, endsAt: null, enabled: false }, announcement: { items: ["Ücretsiz kargo"], icon: "truck", speed: "normal", direction: "left", animation: "continuous", enabled: true }, composition: createDefaultStarterThemeComposition() } as const;
const PUBLIC = { schemaVersion: 2, publicationVersion: 1, publishedAt: NOW, brand: DESIGN.brand, hero: { enabled: true, slides: [{ headline: "Güzide Kuyumcu", body: "Zamansız tasarımlar", desktopImage: null, mobileImage: null, destination: null }] }, promotion: { ...DESIGN.promotion, destination: null }, announcement: DESIGN.announcement, typography: TYPOGRAPHY } as const;
const WORKSPACE = { schemaVersion: 3, draftVersion: 1, publishedVersion: 1, draftUpdatedAt: NOW, publishedAt: NOW, draft: DESIGN, published: PUBLIC, store: { name: "Güzide Kuyumcu", timezone: "Europe/Istanbul" }, media: [], destinations: [] } as const;

function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "cache-control": "no-store" } }); }

test("design API parses the workspace envelope and sends no tenant authority", async () => {
  let observed: { input: string; init?: RequestInit } | undefined;
  const api = createStorefrontDesignApi(async (input, init) => { observed = { input: String(input), init }; return json({ code: "ok", workspace: WORKSPACE }); }, () => OPERATION);
  const selected = await api.workspace();
  assert.equal(selected.store.name, "Güzide Kuyumcu");
  assert.equal(observed?.input, "/api/storefront-design");
  assert.equal(observed?.init?.method, "GET");
  assert.equal(JSON.stringify(observed).includes("storeId"), false);
});

test("design API binds idempotency to draft save and publication", async () => {
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  const api = createStorefrontDesignApi(async (input, init) => {
    requests.push({ path: String(input), init });
    if (String(input).endsWith("/draft")) return json({ code: "saved", result: { draftVersion: 2, draftUpdatedAt: NOW, draft: DESIGN } });
    return json({ code: "published", result: { draftVersion: 2, publishedVersion: 2, publishedAt: NOW, published: { ...PUBLIC, publicationVersion: 2 } } });
  }, () => OPERATION);
  assert.equal((await api.saveDraft({ expectedDraftVersion: 1, design: DESIGN })).draftVersion, 2);
  assert.equal((await api.publish({ expectedDraftVersion: 2, expectedPublishedVersion: 1 })).publishedVersion, 2);
  for (const request of requests) {
    assert.equal(new Headers(request.init?.headers).get("idempotency-key"), OPERATION);
    assert.equal(new Headers(request.init?.headers).has("x-store-id"), false);
  }
});

test("design API maps finite Turkish errors and rejects malformed success payloads", async () => {
  const conflict = createStorefrontDesignApi(async () => json({ code: "version_conflict" }, 409), () => OPERATION);
  await assert.rejects(conflict.publish({ expectedDraftVersion: 1, expectedPublishedVersion: 1 }), (error: unknown) => error instanceof StorefrontDesignApiError && error.code === "version_conflict" && error.message.includes("başka bir oturumda"));
  const malformed = createStorefrontDesignApi(async () => json({ code: "ok", workspace: { ...WORKSPACE, storeId: "unsafe" } }), () => OPERATION);
  await assert.rejects(malformed.workspace(), (error: unknown) => error instanceof StorefrontDesignApiError && error.code === "unavailable");
});
