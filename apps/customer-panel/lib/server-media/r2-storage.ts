import { createHash, createHmac } from "node:crypto";
import type { PublicImageMediaType } from "../../../../packages/saas-contracts/src/storefront/index.ts";
import type { StagingProductMediaConfig } from "./config.ts";

export interface ProductMediaStorage {
  publicUrl(objectKey: string): string;
  put(input: Readonly<{ objectKey: string; mediaType: PublicImageMediaType; bytes: Uint8Array }>): Promise<void>;
  delete(objectKey: string): Promise<void>;
}
type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
const OBJECT_KEY = /^stores\/[0-9a-f-]{36}\/products\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/;
function sha256(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex"); }
function hmac(key: Uint8Array | string, value: string): Buffer { return createHmac("sha256", key).update(value).digest(); }
function key(value: string): string { if (!OBJECT_KEY.test(value)) throw new Error("product_media_storage_invalid"); return value; }
function encodedPath(value: string): string { return value.split("/").map(encodeURIComponent).join("/"); }
function timestamp(now: Date): { short: string; long: string } { const long = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); return { short: long.slice(0, 8), long }; }

export function createR2ProductMediaStorage(config: StagingProductMediaConfig, options: Readonly<{ fetch: Fetch; now(): Date }> = { fetch: globalThis.fetch, now: () => new Date() }): ProductMediaStorage {
  if (!config || typeof options.fetch !== "function" || typeof options.now !== "function") throw new Error("product_media_storage_invalid");
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  async function request(method: "PUT" | "DELETE", objectKey: string, mediaType?: PublicImageMediaType, bytes: Uint8Array = new Uint8Array()): Promise<void> {
    const selectedKey = key(objectKey), payloadHash = sha256(bytes), now = options.now(); if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("product_media_storage_unavailable");
    const time = timestamp(now), canonicalUri = `/${encodeURIComponent(config.bucket)}/${encodedPath(selectedKey)}`;
    const headers: Record<string, string> = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": time.long };
    if (mediaType) headers["content-type"] = mediaType;
    const names = Object.keys(headers).sort(), canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join(""), signedHeaders = names.join(";");
    const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const scope = `${time.short}/auto/s3/aws4_request`, stringToSign = ["AWS4-HMAC-SHA256", time.long, scope, sha256(canonicalRequest)].join("\n");
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, time.short), "auto"), "s3"), "aws4_request");
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${hmac(signingKey, stringToSign).toString("hex")}`;
    let response: Response; try { response = await options.fetch(`https://${host}${canonicalUri}`, { method, headers, body: method === "PUT" ? Buffer.from(bytes) : undefined, redirect: "manual", cache: "no-store" }); } catch { throw new Error("product_media_storage_unavailable"); }
    if (![200, 201, 204].includes(response.status) || response.headers.has("location")) throw new Error("product_media_storage_unavailable");
  }
  const storage: ProductMediaStorage = { publicUrl(objectKey: string) { return `${config.publicOrigin}/${key(objectKey)}`; }, put(input: Readonly<{ objectKey: string; mediaType: PublicImageMediaType; bytes: Uint8Array }>) { return request("PUT", input.objectKey, input.mediaType, input.bytes); }, delete(objectKey: string) { return request("DELETE", objectKey); } };
  return Object.freeze(storage);
}
