import crypto from "node:crypto";
import path from "node:path";
import {
  getRepoRoot,
  type StoreConfig,
  updateStoreR2Config,
  upsertStoreAdminEnvLocal
} from "@celebix/platform-config";
import { CreateBucketCommand, ListBucketsCommand, S3Client } from "@aws-sdk/client-s3";

const CLOUDFLARE_API_URL = "https://api.cloudflare.com/client/v4";

interface CloudflareTokenVerifyResult {
  id: string;
  status: string;
}

interface CloudflareEnvelope<T> {
  result: T;
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: Array<{ code: number; message: string }>;
}

interface CloudflareManagedDomainResult {
  bucketId: string;
  domain: string;
  enabled: boolean;
}

interface R2BootstrapStatus {
  configured: boolean;
  hasApiToken: boolean;
  hasAccountId: boolean;
  tokenId?: string;
  tokenStatus?: string;
  lastError?: string;
}

interface R2ProvisioningResult {
  bucketName: string;
  publicUrl: string;
  managedDomain: string;
  adminEnvLocalPath: string;
}

function getCloudflareApiToken(): string {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();

  if (!token) {
    throw new Error("CLOUDFLARE_API_TOKEN tanimli degil.");
  }

  return token;
}

function getCloudflareAccountId(): string {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();

  if (!accountId) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID tanimli degil.");
  }

  return accountId;
}

function buildCloudflareHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getCloudflareApiToken()}`,
    "Content-Type": "application/json"
  };
}

function buildBucketName(store: StoreConfig): string {
  return `${store.slug}-assets`
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);
}

async function cloudflareFetch<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${CLOUDFLARE_API_URL}${pathname}`, {
    ...init,
    headers: {
      ...buildCloudflareHeaders(),
      ...(init.headers ?? {})
    },
    cache: "no-store"
  });

  const payload = (await response.json()) as CloudflareEnvelope<T> | { success?: boolean; errors?: Array<{ message: string }> };

  if (!response.ok || !("success" in payload) || payload.success !== true) {
    const errorMessage =
      "errors" in payload && Array.isArray(payload.errors) && payload.errors.length > 0
        ? payload.errors.map((error) => error.message).join(" | ")
        : response.statusText;

    throw new Error(`Cloudflare API hatasi (${response.status}): ${errorMessage}`);
  }

  return (payload as CloudflareEnvelope<T>).result;
}

async function verifyCloudflareToken(): Promise<CloudflareTokenVerifyResult> {
  const accountId = getCloudflareAccountId();
  return cloudflareFetch<CloudflareTokenVerifyResult>(`/accounts/${accountId}/tokens/verify`);
}

function buildS3Credentials(tokenId: string) {
  const tokenValue = getCloudflareApiToken();

  return {
    accessKeyId: tokenId,
    secretAccessKey: crypto.createHash("sha256").update(tokenValue).digest("hex")
  };
}

function createR2S3Client(tokenId: string): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${getCloudflareAccountId()}.r2.cloudflarestorage.com`,
    credentials: buildS3Credentials(tokenId)
  });
}

async function ensureBucketExists(bucketName: string, tokenId: string): Promise<void> {
  const client = createR2S3Client(tokenId);
  const buckets = await client.send(new ListBucketsCommand({}));
  const exists = (buckets.Buckets ?? []).some((bucket) => bucket.Name === bucketName);

  if (exists) {
    return;
  }

  await client.send(new CreateBucketCommand({ Bucket: bucketName }));
}

async function ensureManagedDomain(bucketName: string): Promise<CloudflareManagedDomainResult> {
  const accountId = getCloudflareAccountId();
  const current = await cloudflareFetch<CloudflareManagedDomainResult>(
    `/accounts/${accountId}/r2/buckets/${bucketName}/domains/managed`
  );

  if (current.enabled) {
    return current;
  }

  return cloudflareFetch<CloudflareManagedDomainResult>(
    `/accounts/${accountId}/r2/buckets/${bucketName}/domains/managed`,
    {
      method: "PUT",
      body: JSON.stringify({ enabled: true })
    }
  );
}

export async function getR2BootstrapStatus(): Promise<R2BootstrapStatus> {
  const hasApiToken = Boolean(process.env.CLOUDFLARE_API_TOKEN);
  const hasAccountId = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID);

  if (!hasApiToken || !hasAccountId) {
    return {
      configured: false,
      hasApiToken,
      hasAccountId
    };
  }

  try {
    const token = await verifyCloudflareToken();
    return {
      configured: token.status.toLowerCase() === "active",
      hasApiToken: true,
      hasAccountId: true,
      tokenId: token.id,
      tokenStatus: token.status
    };
  } catch (error) {
    return {
      configured: false,
      hasApiToken: true,
      hasAccountId: true,
      lastError: error instanceof Error ? error.message : "Cloudflare token dogrulanamadi."
    };
  }
}

export async function provisionR2ForStore(store: StoreConfig): Promise<R2ProvisioningResult> {
  const token = await verifyCloudflareToken();
  const bucketName = store.r2?.bucketName?.trim() || buildBucketName(store);

  await ensureBucketExists(bucketName, token.id);
  const managedDomain = await ensureManagedDomain(bucketName);
  const publicUrl = `https://${managedDomain.domain}`;
  const credentials = buildS3Credentials(token.id);

  try {
    const adminEnvLocalPath = upsertStoreAdminEnvLocal(store.slug, {
      NEXT_PUBLIC_STORE_DOMAIN: store.domains.storefront,
      NEXT_PUBLIC_ADMIN_DOMAIN: store.domains.admin,
      CLOUDFLARE_ACCOUNT_ID: getCloudflareAccountId(),
      R2_ACCESS_KEY_ID: credentials.accessKeyId,
      R2_SECRET_ACCESS_KEY: credentials.secretAccessKey,
      R2_BUCKET_NAME: bucketName,
      R2_PUBLIC_URL: publicUrl
    });

    updateStoreR2Config(store.slug, {
      bucketName,
      publicUrl,
      managedDomain: managedDomain.domain,
      provisioningStatus: "configured"
    });

    return {
      bucketName,
      publicUrl,
      managedDomain: managedDomain.domain,
      adminEnvLocalPath: path.relative(getRepoRoot(), adminEnvLocalPath).replace(/\\/g, "/")
    };
  } catch (error) {
    updateStoreR2Config(store.slug, {
      bucketName,
      publicUrl,
      managedDomain: managedDomain.domain,
      provisioningStatus: "failed",
      lastProvisionError: error instanceof Error ? error.message : "R2 provisioning basarisiz oldu."
    });

    throw error;
  }
}
