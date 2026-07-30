import assert from "node:assert/strict";
import test from "node:test";
import { createServerStorefrontAssetRuntime } from "./runtime.ts";

const access = Object.freeze({ readiness: Object.freeze({ mode: "approved_staging" as const }), panelOrigin: "https://panel.saas-staging.celebix.site", async resolveCredential() { return Object.freeze({ kind: "unauthenticated" as const }); }, async rotateCredential() { return Object.freeze({ kind: "unavailable" as const }); }, async revokeCredential() { return Object.freeze({ kind: "unavailable" as const }); } });
const assets = Object.freeze({ async createAsset() { throw new Error(); }, async listAssets() { return []; }, async archiveAsset() { throw new Error(); }, async recoverOperation() { return Object.freeze({ kind: "absent" as const }); } });
const storage = Object.freeze({ publicUrl(key: string) { return `https://media.example.test/${key}`; }, async put() {}, async publish() {}, async unpublish() { return Object.freeze({ kind: "not_found" as const }); }, async head() { return Object.freeze({ kind: "not_found" as const }); }, async delete() {} });

test("storefront asset runtime requires approved staging access and exact bounded ports", () => {
  const runtime = createServerStorefrontAssetRuntime({ access, assets, storage });
  assert.equal(runtime.access, access);
  assert.equal(runtime.assets, assets);
  assert.equal(Object.isFrozen(runtime), true);
  assert.throws(() => createServerStorefrontAssetRuntime({ access: { ...access, readiness: { mode: "disabled" } }, assets, storage } as never), /server_storefront_asset_runtime_invalid/);
});
