import { GetObjectCommand } from "@aws-sdk/client-s3";
import { BUCKET_NAME, PUBLIC_URL, r2Client } from "@/lib/r2";

type AssetPayload = {
  body: Buffer;
  contentType: string | null;
  contentLength: string | null;
  etag: string | null;
  lastModified: string | null;
};

function normalizeBaseUrl(value?: string | null) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().replace(/\/+$/, "")
    : null;
}

function getConfiguredBaseUrls() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || "";
  const candidates = [
    PUBLIC_URL,
    process.env.R2_PUBLIC_URL,
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
    accountId && BUCKET_NAME
      ? `https://${accountId}.r2.cloudflarestorage.com/${BUCKET_NAME}`
      : null,
  ];

  return Array.from(
    new Set(
      candidates
        .map((value) => normalizeBaseUrl(value))
        .filter((value): value is string => Boolean(value))
    )
  );
}

function extractObjectKey(source: string) {
  const normalizedSource = normalizeBaseUrl(source);
  if (!normalizedSource) {
    return null;
  }

  for (const baseUrl of getConfiguredBaseUrls()) {
    if (normalizedSource === baseUrl || !normalizedSource.startsWith(`${baseUrl}/`)) {
      continue;
    }

    const key = decodeURIComponent(normalizedSource.slice(baseUrl.length + 1));
    return key.length > 0 ? key : null;
  }

  return null;
}

async function bodyToBuffer(body: unknown) {
  if (!body || typeof body !== "object") {
    return null;
  }

  if ("transformToByteArray" in body && typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }

  if ("arrayBuffer" in body && typeof body.arrayBuffer === "function") {
    return Buffer.from(await body.arrayBuffer());
  }

  return null;
}

export async function fetchCurrentStoreR2Asset(source: string): Promise<AssetPayload | null> {
  const key = extractObjectKey(source);
  if (!key || !BUCKET_NAME) {
    return null;
  }

  try {
    const response = await r2Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    const body = await bodyToBuffer(response.Body);
    if (!body) {
      return null;
    }

    return {
      body,
      contentType: response.ContentType ?? null,
      contentLength:
        typeof response.ContentLength === "number" ? String(response.ContentLength) : null,
      etag: response.ETag ?? null,
      lastModified: response.LastModified ? response.LastModified.toUTCString() : null,
    };
  } catch (error) {
    console.error("Admin R2 asset fetch failed:", error);
    return null;
  }
}
