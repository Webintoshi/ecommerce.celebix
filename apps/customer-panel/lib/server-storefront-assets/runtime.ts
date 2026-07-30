import "server-only";
import type { StorefrontAssetRepository } from "@celebix/saas-data";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import type { ProductMediaStorage } from "../server-media/r2-storage.ts";

export type ServerStorefrontAssetRuntime = Readonly<{
  access: ServerPanelAccessRuntime & Readonly<{ readiness: Readonly<{ mode: "approved_staging" }>; panelOrigin: string }>;
  assets: StorefrontAssetRepository;
  storage: ProductMediaStorage;
}>;

export function createServerStorefrontAssetRuntime(input: Readonly<{ access: ServerPanelAccessRuntime; assets: StorefrontAssetRepository; storage: ProductMediaStorage }>): ServerStorefrontAssetRuntime {
  if (!input || input.access.readiness.mode !== "approved_staging" || typeof input.access.panelOrigin !== "string" || !input.assets || typeof input.assets.createAsset !== "function" || typeof input.assets.listAssets !== "function" || typeof input.assets.archiveAsset !== "function" || typeof input.assets.recoverOperation !== "function" || !input.storage || typeof input.storage.put !== "function" || typeof input.storage.publish !== "function" || typeof input.storage.unpublish !== "function" || typeof input.storage.head !== "function" || typeof input.storage.delete !== "function" || typeof input.storage.publicUrl !== "function") throw new Error("server_storefront_asset_runtime_invalid");
  return Object.freeze({ access: input.access as ServerStorefrontAssetRuntime["access"], assets: input.assets, storage: input.storage });
}
