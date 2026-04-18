import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

type AssetPayload = {
  body: Buffer;
  contentType: string | null;
  contentLength: string | null;
  etag: string | null;
  lastModified: string | null;
};

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || "";
const bucketName = process.env.R2_BUCKET_NAME || "celebix-assets";

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

function normalizeBaseUrl(value?: string | null) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().replace(/\/+$/, "")
    : null;
}

function getConfiguredBaseUrls() {
  const candidates = [
    process.env.R2_PUBLIC_URL,
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
    accountId && bucketName ? `https://${accountId}.r2.cloudflarestorage.com/${bucketName}` : null,
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
  if (!key || !bucketName || !accountId) {
    return null;
  }

  try {
    const response = await r2Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
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
    console.error("Storefront R2 asset fetch failed:", error);
    return null;
  }
}
