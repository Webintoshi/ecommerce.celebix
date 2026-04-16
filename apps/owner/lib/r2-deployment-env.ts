import crypto from "node:crypto";
import type { StoreConfig } from "@celebix/platform-config";

const PLACEHOLDER_PREFIX = "your-r2-";
const CLOUDFLARE_API_URL = "https://api.cloudflare.com/client/v4";

interface CloudflareEnvelope<T> {
  result: T;
  success: boolean;
  errors?: Array<{ message?: string | null }>;
}

interface CloudflareTokenVerifyResult {
  id: string;
  status: string;
}

function readTrimmedEnv(key: string): string {
  return process.env[key]?.trim() || "";
}

function sanitizeR2Value(value: string | undefined | null): string {
  const trimmed = value?.trim() || "";

  if (!trimmed) {
    return "";
  }

  if (trimmed.toLowerCase().startsWith(PLACEHOLDER_PREFIX)) {
    return "";
  }

  return trimmed;
}

async function verifyCloudflareTokenId(accountId: string, apiToken: string): Promise<string | null> {
  const response = await fetch(`${CLOUDFLARE_API_URL}/accounts/${accountId}/tokens/verify`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  const payload = (await response.json()) as CloudflareEnvelope<CloudflareTokenVerifyResult>;

  if (!response.ok || payload.success !== true) {
    return null;
  }

  return payload.result?.id?.trim() || null;
}

export async function resolveR2DeploymentEnv(
  store: StoreConfig,
  currentEnv: Record<string, string> = {},
): Promise<Record<string, string>> {
  const bucketName = store.r2?.bucketName?.trim() || sanitizeR2Value(currentEnv.R2_BUCKET_NAME);
  const publicUrl = store.r2?.publicUrl?.trim() || sanitizeR2Value(currentEnv.R2_PUBLIC_URL);
  const accountId =
    sanitizeR2Value(currentEnv.CLOUDFLARE_ACCOUNT_ID) ||
    sanitizeR2Value(currentEnv.R2_ACCOUNT_ID) ||
    readTrimmedEnv("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = readTrimmedEnv("CLOUDFLARE_API_TOKEN");

  let accessKeyId = sanitizeR2Value(currentEnv.R2_ACCESS_KEY_ID);
  let secretAccessKey = sanitizeR2Value(currentEnv.R2_SECRET_ACCESS_KEY);

  if ((!accessKeyId || !secretAccessKey) && accountId && apiToken) {
    const tokenId = await verifyCloudflareTokenId(accountId, apiToken).catch(() => null);

    if (tokenId) {
      accessKeyId = accessKeyId || tokenId;
      secretAccessKey =
        secretAccessKey || crypto.createHash("sha256").update(apiToken).digest("hex");
    }
  }

  const entries: Record<string, string> = {};

  if (accountId) {
    entries.CLOUDFLARE_ACCOUNT_ID = accountId;
    entries.R2_ACCOUNT_ID = accountId;
  }

  if (accessKeyId) {
    entries.R2_ACCESS_KEY_ID = accessKeyId;
  }

  if (secretAccessKey) {
    entries.R2_SECRET_ACCESS_KEY = secretAccessKey;
  }

  if (bucketName) {
    entries.R2_BUCKET_NAME = bucketName;
  }

  if (publicUrl) {
    entries.R2_PUBLIC_URL = publicUrl;
  }

  return entries;
}
