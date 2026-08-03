import { createHash, createHmac } from "node:crypto";
import type { PublicImageMediaType } from "../../../../packages/saas-contracts/src/storefront/index.ts";
import type { StagingProductMediaConfig } from "./config.ts";

export type ProductMediaStorageObject =
  | Readonly<{ kind: "not_found" }>
  | Readonly<{ kind: "found"; byteSize: number; mediaType: PublicImageMediaType; payloadSha256: string; publication: "pending" | "active" }>;
export interface ProductMediaStorage {
  publicUrl(objectKey: string): string;
  put(input: Readonly<{ objectKey: string; mediaType: PublicImageMediaType; bytes: Uint8Array; payloadSha256: string }>): Promise<void>;
  publish(input: Readonly<{ objectKey: string; mediaType: PublicImageMediaType; byteSize: number; payloadSha256: string }>): Promise<void>;
  unpublish(objectKey: string): Promise<ProductMediaStorageObject>;
  head(objectKey: string): Promise<ProductMediaStorageObject>;
  delete(objectKey: string): Promise<void>;
}
export type TenantMediaStorage = ProductMediaStorage;
export type ProductMediaStorageErrorCode = "write_unknown" | "write_rejected" | "unavailable" | "invalid";
export class ProductMediaStorageError extends Error {
  readonly code: ProductMediaStorageErrorCode;
  constructor(code: ProductMediaStorageErrorCode) { super(`product_media_storage_${code}`); this.name = "ProductMediaStorageError"; this.code = code; }
}
type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
const UUID_SEGMENT = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const OBJECT_KEY = new RegExp(`^stores/${UUID_SEGMENT}/(?:products/${UUID_SEGMENT}/${UUID_SEGMENT}|storefront/(?:logo|hero|social|favicon)/${UUID_SEGMENT}|design/${UUID_SEGMENT})[.](?:jpg|png|webp)$`);
const REQUEST_TIMEOUT_MS = 10_000;
function sha256(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex"); }
function hmac(key: Uint8Array | string, value: string): Buffer { return createHmac("sha256", key).update(value).digest(); }
function key(value: string): string { if (!OBJECT_KEY.test(value)) throw new Error("product_media_storage_invalid"); return value; }
function encodedPath(value: string): string { return value.split("/").map(encodeURIComponent).join("/"); }
function timestamp(now: Date): { short: string; long: string } { const long = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); return { short: long.slice(0, 8), long }; }
function storageError(code: ProductMediaStorageErrorCode): ProductMediaStorageError { return new ProductMediaStorageError(code); }

export function createR2ProductMediaStorage(config: StagingProductMediaConfig, options: Readonly<{ fetch: Fetch; now(): Date }> = { fetch: globalThis.fetch, now: () => new Date() }): ProductMediaStorage {
  if (!config || typeof options.fetch !== "function" || typeof options.now !== "function") throw new Error("product_media_storage_invalid");
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  async function request(method: "PUT" | "HEAD" | "DELETE", objectKey: string, mediaType?: PublicImageMediaType, bytes: Uint8Array = new Uint8Array(), payloadSha256?: string, publication?: "pending" | "active", copy = false, writeMayBeUnknown = false): Promise<Response> {
    const selectedKey = key(objectKey), payloadHash = sha256(bytes), now = options.now(); if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("product_media_storage_unavailable");
    const time = timestamp(now), canonicalUri = `/${encodeURIComponent(config.bucket)}/${encodedPath(selectedKey)}`;
    const headers: Record<string, string> = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": time.long };
    if (mediaType) headers["content-type"] = mediaType;
    if (payloadSha256) headers["x-amz-meta-celebix-sha256"] = payloadSha256;
    if (publication) headers["x-amz-meta-celebix-publication"] = publication;
    if (copy) {
      headers["x-amz-copy-source"] = `/${config.bucket}/${encodedPath(selectedKey)}`;
      headers["x-amz-metadata-directive"] = "REPLACE";
    }
    const names = Object.keys(headers).sort(), canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join(""), signedHeaders = names.join(";");
    const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const scope = `${time.short}/auto/s3/aws4_request`, stringToSign = ["AWS4-HMAC-SHA256", time.long, scope, sha256(canonicalRequest)].join("\n");
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, time.short), "auto"), "s3"), "aws4_request");
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${hmac(signingKey, stringToSign).toString("hex")}`;
    let response: Response; try { response = await options.fetch(`https://${host}${canonicalUri}`, { method, headers, body: method === "PUT" && !copy ? Buffer.from(bytes) : undefined, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }); } catch { throw storageError(writeMayBeUnknown ? "write_unknown" : "unavailable"); }
    if (response.headers.has("location")) throw storageError(writeMayBeUnknown ? "write_unknown" : "unavailable");
    return response;
  }
  function exactObject(
    selected: Awaited<ReturnType<ProductMediaStorage["head"]>>,
    input: Readonly<{ mediaType: PublicImageMediaType; byteSize: number; payloadSha256: string }>,
    publication: "pending" | "active",
  ): boolean {
    return selected.kind === "found" && selected.mediaType === input.mediaType && selected.byteSize === input.byteSize && selected.payloadSha256 === input.payloadSha256 && selected.publication === publication;
  }
  async function replacePublication(
    objectKey: string,
    input: Readonly<{ mediaType: PublicImageMediaType; byteSize: number; payloadSha256: string }>,
    publication: "pending" | "active",
    knownCurrent?: Awaited<ReturnType<ProductMediaStorage["head"]>>,
  ): Promise<void> {
    const current = knownCurrent ?? await storage.head(objectKey);
    if (exactObject(current, input, publication)) return;
    if (current.kind !== "found" || current.mediaType !== input.mediaType || current.byteSize !== input.byteSize || current.payloadSha256 !== input.payloadSha256) throw storageError("unavailable");
    let response: Response;
    try { response = await request("PUT", objectKey, input.mediaType, new Uint8Array(), input.payloadSha256, publication, true, true); }
    catch (error) {
      if ((error as { code?: unknown })?.code !== "write_unknown") throw error;
      if (exactObject(await storage.head(objectKey), input, publication)) return;
      throw error;
    }
    if (response.status !== 200) {
      if (response.status >= 500 && exactObject(await storage.head(objectKey), input, publication)) return;
      throw storageError(response.status >= 500 ? "write_unknown" : "write_rejected");
    }
    if (!exactObject(await storage.head(objectKey), input, publication)) throw storageError("unavailable");
  }
  const storage: ProductMediaStorage = {
    publicUrl(objectKey: string) { return `${config.publicOrigin}/${key(objectKey)}`; },
    async put(input) {
      if (!/^[a-f0-9]{64}$/.test(input.payloadSha256) || sha256(input.bytes) !== input.payloadSha256) throw storageError("invalid");
      const response = await request("PUT", input.objectKey, input.mediaType, input.bytes, input.payloadSha256, "pending", false, true);
      if (![200, 201, 204].includes(response.status)) throw storageError(response.status >= 500 ? "write_unknown" : "write_rejected");
    },
    async publish(input) {
      if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > 5_242_880 || !/^[a-f0-9]{64}$/.test(input.payloadSha256)) throw storageError("invalid");
      await replacePublication(input.objectKey, input, "active");
    },
    async unpublish(objectKey) {
      const current = await storage.head(objectKey);
      if (current.kind === "not_found" || current.publication === "pending") return current;
      await replacePublication(objectKey, current, "pending", current);
      return Object.freeze({ ...current, publication: "pending" as const });
    },
    async head(objectKey: string) {
      const response = await request("HEAD", objectKey);
      if (response.status === 404) return Object.freeze({ kind: "not_found" as const });
      if (response.status !== 200) throw storageError("unavailable");
      const length = response.headers.get("content-length");
      const mediaType = response.headers.get("content-type");
      const payloadSha256 = response.headers.get("x-amz-meta-celebix-sha256");
      const publication = response.headers.get("x-amz-meta-celebix-publication");
      if (!length || !/^\d+$/.test(length) || !["image/jpeg", "image/png", "image/webp"].includes(mediaType ?? "") || !payloadSha256 || !/^[a-f0-9]{64}$/.test(payloadSha256) || !["pending", "active"].includes(publication ?? "")) throw storageError("unavailable");
      const byteSize = Number(length);
      if (!Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > 5_242_880) throw storageError("unavailable");
      return Object.freeze({ kind: "found" as const, byteSize, mediaType: mediaType as PublicImageMediaType, payloadSha256, publication: publication as "pending" | "active" });
    },
    async delete(objectKey: string) {
      const response = await request("DELETE", objectKey);
      if (![200, 204, 404].includes(response.status)) throw storageError("unavailable");
      if (response.status !== 404 && (await storage.head(objectKey)).kind !== "not_found") throw storageError("unavailable");
    },
  };
  return Object.freeze(storage);
}
