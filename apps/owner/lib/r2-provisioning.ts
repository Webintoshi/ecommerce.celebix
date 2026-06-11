import "server-only";

import {
  updateStoreR2MediaConfig,
  type StoreConfig,
} from "@celebix/platform-config";
import {
  buildR2StorageConfigForStore,
  getR2AuthorityRequirements,
  toR2StorageJson,
  type GeneratedR2StorageConfig,
  type R2AuthorityRequirement,
} from "@/lib/r2-storage-config";

export interface R2MediaBootstrapStatus {
  configured: boolean;
  hasBucket: boolean;
  hasPublicBaseUrl: boolean;
  hasServerCredentials: boolean;
  requirements: R2AuthorityRequirement[];
  lastError?: string;
}

export interface R2MediaProvisioningResult {
  storageStatus: "ready" | "pending" | "failed";
  bucketName: string | null;
  publicBaseUrl: string | null;
  prefix: string;
  productImagesPrefix: string;
  pageImagesPrefix: string;
  brandingPrefix: string;
  configPath: string;
  config: GeneratedR2StorageConfig;
}

export function getR2MediaBootstrapStatus(): R2MediaBootstrapStatus {
  const requirements = getR2AuthorityRequirements();
  const hasBucket = requirements.find((entry) => entry.key === "R2_BUCKET_NAME")?.present ?? false;
  const hasPublicBaseUrl =
    requirements.find((entry) => entry.key === "R2_PUBLIC_URL")?.present ?? false;
  const hasServerCredentials = requirements
    .filter((entry) => entry.secret)
    .every((entry) => entry.present);

  return {
    configured: hasBucket && hasPublicBaseUrl && hasServerCredentials,
    hasBucket,
    hasPublicBaseUrl,
    hasServerCredentials,
    requirements,
    lastError:
      hasBucket && hasPublicBaseUrl
        ? hasServerCredentials
          ? undefined
          : "R2 server-side upload credential authority eksik; admin upload pending kalacak."
        : "R2 bucket/public URL authority eksik; media config pending apply modunda kalacak.",
  };
}

export function buildR2BootstrapStorageFile(store: StoreConfig): {
  path: string;
  storage: Record<string, unknown>;
} {
  const config = buildR2StorageConfigForStore(store);

  return {
    path: config.bootstrap.configPath,
    storage: toR2StorageJson(config),
  };
}

export async function provisionR2MediaForStore(
  store: StoreConfig,
): Promise<R2MediaProvisioningResult> {
  const config = buildR2StorageConfigForStore(store);
  const status = getR2MediaBootstrapStatus();
  const storageStatus = config.storage.status;

  updateStoreR2MediaConfig(store.slug, {
    status: storageStatus,
    provisioningStatus: storageStatus === "configured" ? "configured" : "pending-owner-env",
    bucketName: config.storage.bucket,
    publicUrl: config.storage.publicBaseUrl,
    endpoint: config.storage.endpoint,
    region: config.storage.region,
    prefix: config.storage.prefix,
    uploadPrefix: config.media.uploadPrefix,
    productImagesPrefix: config.media.productImagesPrefix,
    pageImagesPrefix: config.media.pageImagesPrefix,
    brandingPrefix: config.media.brandingPrefix,
    publicUrlTemplate: config.media.publicUrlTemplate,
    adminUploadStatus: config.adminUpload.status,
    storefrontReadStatus: config.storefrontRead.status,
    credentialsStatus: status.hasServerCredentials ? "configured" : "pending-owner-env",
    bootstrapConfigPath: config.bootstrap.configPath,
    bootstrapApplyState: config.bootstrap.applyState,
    noSupabaseStorage: true,
    lastProvisionError: storageStatus === "configured" && status.hasServerCredentials ? null : status.lastError ?? null,
  });

  return {
    storageStatus: storageStatus === "configured" ? "ready" : "pending",
    bucketName: config.storage.bucket,
    publicBaseUrl: config.storage.publicBaseUrl,
    prefix: config.storage.prefix,
    productImagesPrefix: config.media.productImagesPrefix,
    pageImagesPrefix: config.media.pageImagesPrefix,
    brandingPrefix: config.media.brandingPrefix,
    configPath: config.bootstrap.configPath,
    config,
  };
}
