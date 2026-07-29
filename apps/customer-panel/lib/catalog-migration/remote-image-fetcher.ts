import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { checkServerIdentity } from "node:tls";

import type { PublicImageMediaType } from "../../../../packages/saas-contracts/src/storefront/index.ts";
import { validateProductImage } from "../server-media/image-validation.ts";
import { isPublicMigrationImageAddress, validateMigrationImageUrl } from "./remote-image-authority.ts";

export interface MigrationImageAddress { readonly address: string; readonly family: 4 | 6 }
export interface MigrationImageRequestInput {
  readonly url: string;
  readonly address: string;
  readonly family: 4 | 6;
  readonly signal: AbortSignal;
  readonly headers: Readonly<Record<string, string>>;
}
export interface MigrationImageRawResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly body: AsyncIterable<Uint8Array>;
  readonly discard?: () => void;
}
export interface MigrationImageFetcherDependencies {
  readonly lookup?: (hostname: string) => Promise<readonly MigrationImageAddress[]>;
  readonly request?: (input: MigrationImageRequestInput) => Promise<MigrationImageRawResponse>;
  readonly timeoutMs?: number;
}
export interface MigrationImage {
  readonly bytes: Uint8Array;
  readonly mediaType: PublicImageMediaType;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
}

export class MigrationImageError extends Error {
  constructor(readonly code:
    | "migration_image_url_invalid"
    | "migration_image_address_denied"
    | "migration_image_redirect_invalid"
    | "migration_image_response_invalid"
    | "migration_image_response_too_large"
    | "migration_image_timeout"
    | "migration_image_unavailable") {
    super(code); this.name = "MigrationImageError";
  }
}

const MAX_BYTES = 5_242_880;
const MAX_WORDPRESS_METADATA_BYTES = 131_072;
const MAX_WORDPRESS_METADATA_ITEMS = 10;
const MAX_WORDPRESS_DERIVATIVES = 8;
const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT = 10_000;
const HEADERS = Object.freeze({ accept: "image/webp,image/png,image/jpeg", "user-agent": "Celebix-Catalog-Migration/1.0" });
const WORDPRESS_HEADERS = Object.freeze({ accept: "application/json", "user-agent": "Celebix-Catalog-Migration/1.0" });

function fail(code: MigrationImageError["code"]): never { throw new MigrationImageError(code); }
async function defaultLookup(hostname: string): Promise<readonly MigrationImageAddress[]> {
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  return Object.freeze(addresses.filter((entry): entry is { address: string; family: 4 | 6 } => entry.family === 4 || entry.family === 6).map((entry) => Object.freeze({ address: entry.address, family: entry.family })));
}
function defaultRequest(input: MigrationImageRequestInput): Promise<MigrationImageRawResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(input.url);
    const request = httpsRequest({
      method: "GET", protocol: "https:", hostname: input.address, family: input.family, port: 443,
      path: `${url.pathname}${url.search}`, servername: url.hostname, agent: false,
      headers: { ...input.headers, host: url.host }, signal: input.signal,
      rejectUnauthorized: true, checkServerIdentity: (_hostname, certificate) => checkServerIdentity(url.hostname, certificate),
    }, (response) => {
      const headers = new Headers();
      for (let index = 0; index < response.rawHeaders.length; index += 2) headers.append(response.rawHeaders[index]!, response.rawHeaders[index + 1] ?? "");
      resolve({ status: response.statusCode ?? 0, headers, body: response, discard: () => response.destroy() });
    });
    request.once("error", reject); request.end();
  });
}
function discard(response: MigrationImageRawResponse): void { try { response.discard?.(); } catch {} }
async function pinnedRequest(urlValue: string, signal: AbortSignal, headers: Readonly<Record<string, string>>, dependencies: Required<Pick<MigrationImageFetcherDependencies, "lookup" | "request">>): Promise<MigrationImageRawResponse> {
  let selected: string;
  try { selected = validateMigrationImageUrl(urlValue); } catch { return fail("migration_image_url_invalid"); }
  const hostname = new URL(selected).hostname;
  let addresses: readonly MigrationImageAddress[];
  try { addresses = await dependencies.lookup(hostname); } catch { return fail("migration_image_unavailable"); }
  if (!Array.isArray(addresses) || addresses.length < 1 || addresses.length > 32
    || addresses.some((entry) => !entry || (entry.family !== 4 && entry.family !== 6) || !isPublicMigrationImageAddress(entry.address))) fail("migration_image_address_denied");
  try { return await dependencies.request({ url: selected, address: addresses[0]!.address, family: addresses[0]!.family, signal, headers }); }
  catch (error) {
    if (signal.aborted) return fail("migration_image_timeout");
    if (error instanceof MigrationImageError) throw error;
    return fail("migration_image_unavailable");
  }
}
function mediaType(value: string | null): PublicImageMediaType {
  if (value === "image/jpeg" || value === "image/png" || value === "image/webp") return value;
  return fail("migration_image_response_invalid");
}
async function wordpressMetadataBody(response: MigrationImageRawResponse): Promise<unknown> {
  const contentType = response.headers.get("content-type");
  if (contentType === null || contentType.includes(",") || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) fail("migration_image_response_invalid");
  const encoding = response.headers.get("content-encoding");
  if (encoding !== null && encoding.toLowerCase() !== "identity") fail("migration_image_response_invalid");
  const length = response.headers.get("content-length");
  if (length !== null && (!/^(?:0|[1-9][0-9]*)$/.test(length) || Number(length) > MAX_WORDPRESS_METADATA_BYTES)) fail("migration_image_response_invalid");
  const chunks: Uint8Array[] = []; let total = 0;
  for await (const raw of response.body) {
    if (!(raw instanceof Uint8Array)) fail("migration_image_response_invalid");
    const chunk = new Uint8Array(raw); total += chunk.byteLength;
    if (total > MAX_WORDPRESS_METADATA_BYTES) fail("migration_image_response_invalid");
    chunks.push(chunk);
  }
  if (total < 2) fail("migration_image_response_invalid");
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { return fail("migration_image_response_invalid"); }
}
function wordpressMetadataUrl(sourceUrl: string): string | null {
  const source = new URL(sourceUrl);
  if (source.search) return null;
  const match = source.pathname.match(/^\/wp-content\/uploads\/(?:[0-9]{4}\/[0-9]{2}\/)?([A-Za-z0-9][A-Za-z0-9._-]{0,220})\.(jpe?g|png|webp)$/i);
  if (!match) return null;
  const metadata = new URL("/wp-json/wp/v2/media", source.origin);
  metadata.searchParams.set("search", match[1]!);
  metadata.searchParams.set("per_page", String(MAX_WORDPRESS_METADATA_ITEMS));
  metadata.searchParams.set("_fields", "source_url,media_details");
  return metadata.href;
}
function wordpressDerivativeUrls(value: unknown, sourceUrl: string): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_WORDPRESS_METADATA_ITEMS) return [];
  const source = new URL(sourceUrl);
  const sourceName = source.pathname.split("/").at(-1)!;
  const dot = sourceName.lastIndexOf(".");
  if (dot < 1) return [];
  const sourceStem = sourceName.slice(0, dot), extension = sourceName.slice(dot + 1).toLowerCase();
  const directory = source.pathname.slice(0, source.pathname.length - sourceName.length);
  const matches = value.filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null && !Array.isArray(entry) && (entry as Record<string, unknown>).source_url === sourceUrl);
  if (matches.length !== 1) return [];
  const details = matches[0]!.media_details;
  if (typeof details !== "object" || details === null || Array.isArray(details)) return [];
  const sizes = (details as Record<string, unknown>).sizes;
  if (typeof sizes !== "object" || sizes === null || Array.isArray(sizes) || Object.keys(sizes).length > 32) return [];
  const candidates: Array<Readonly<{ url: string; area: number }>> = [];
  for (const selected of Object.values(sizes)) {
    if (typeof selected !== "object" || selected === null || Array.isArray(selected)) continue;
    const size = selected as Record<string, unknown>;
    if (!Number.isInteger(size.width) || !Number.isInteger(size.height)
      || (size.width as number) < 1 || (size.width as number) > 8192 || (size.height as number) < 1 || (size.height as number) > 8192
      || typeof size.source_url !== "string") continue;
    let candidate: string;
    try { candidate = validateMigrationImageUrl(size.source_url); } catch { continue; }
    const parsed = new URL(candidate);
    const expectedPath = `${directory}${sourceStem}-${String(size.width)}x${String(size.height)}.${extension}`;
    if (parsed.origin !== source.origin || parsed.pathname !== expectedPath || parsed.search || candidate === sourceUrl) continue;
    candidates.push(Object.freeze({ url: candidate, area: (size.width as number) * (size.height as number) }));
  }
  return Object.freeze([...new Map(candidates.sort((left, right) => right.area - left.area || left.url.localeCompare(right.url)).map((candidate) => [candidate.url, candidate.url])).values()].slice(0, MAX_WORDPRESS_DERIVATIVES));
}
async function recoverWordPressDerivative(sourceUrl: string, signal: AbortSignal, dependencies: Required<Pick<MigrationImageFetcherDependencies, "lookup" | "request">>): Promise<MigrationImage | null> {
  const metadataUrl = wordpressMetadataUrl(sourceUrl);
  if (!metadataUrl) return null;
  let response: MigrationImageRawResponse;
  try { response = await pinnedRequest(metadataUrl, signal, WORDPRESS_HEADERS, dependencies); }
  catch { return null; }
  if (response.status !== 200) { discard(response); return null; }
  let metadata: unknown;
  try { metadata = await wordpressMetadataBody(response); }
  catch { discard(response); return null; }
  for (const candidate of wordpressDerivativeUrls(metadata, sourceUrl)) {
    try { return await withinAuthority(candidate, signal, dependencies); }
    catch (error) {
      if (signal.aborted || (error instanceof MigrationImageError && error.code === "migration_image_timeout")) throw error;
    }
  }
  return null;
}
async function body(response: MigrationImageRawResponse): Promise<Uint8Array> {
  const encoding = response.headers.get("content-encoding");
  if (encoding !== null && encoding.toLowerCase() !== "identity") fail("migration_image_response_invalid");
  const length = response.headers.get("content-length");
  if (length !== null && (!/^(?:0|[1-9][0-9]*)$/.test(length) || Number(length) > MAX_BYTES)) fail("migration_image_response_too_large");
  const chunks: Uint8Array[] = []; let total = 0;
  for await (const raw of response.body) {
    if (!(raw instanceof Uint8Array)) fail("migration_image_response_invalid");
    const chunk = new Uint8Array(raw); total += chunk.byteLength;
    if (total > MAX_BYTES) fail("migration_image_response_too_large");
    chunks.push(chunk);
  }
  if (total < 24) fail("migration_image_response_invalid");
  const result = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
function fileName(url: string, selected: PublicImageMediaType): string {
  const name = new URL(url).pathname.split("/").at(-1) ?? "";
  if (name.length >= 1 && name.length <= 255) return name;
  return selected === "image/jpeg" ? "source.jpg" : selected === "image/png" ? "source.png" : "source.webp";
}
async function withinAuthority(urlValue: string, signal: AbortSignal, dependencies: Required<Pick<MigrationImageFetcherDependencies, "lookup" | "request">>): Promise<MigrationImage> {
  let current = urlValue;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    let selected: string;
    try { selected = validateMigrationImageUrl(current); }
    catch { return fail(redirect === 0 ? "migration_image_url_invalid" : "migration_image_redirect_invalid"); }
    const response = await pinnedRequest(selected, signal, HEADERS, dependencies);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      discard(response);
      if (redirect === MAX_REDIRECTS) fail("migration_image_redirect_invalid");
      const location = response.headers.get("location");
      if (!location || /[,\r\n]/.test(location)) fail("migration_image_redirect_invalid");
      try { current = new URL(location, selected).href; } catch { fail("migration_image_redirect_invalid"); }
      try { validateMigrationImageUrl(current); } catch { fail("migration_image_redirect_invalid"); }
      continue;
    }
    if (response.status !== 200) { discard(response); fail("migration_image_response_invalid"); }
    try {
      const selectedMediaType = mediaType(response.headers.get("content-type"));
      const bytes = await body(response);
      let validated: ReturnType<typeof validateProductImage>;
      try { validated = validateProductImage({ bytes, mediaType: selectedMediaType, fileName: fileName(selected, selectedMediaType) }); }
      catch { return fail("migration_image_response_invalid"); }
      return Object.freeze({ bytes, mediaType: validated.mediaType, width: validated.width, height: validated.height, byteSize: validated.byteSize });
    } catch (error) { discard(response); throw error; }
  }
  return fail("migration_image_redirect_invalid");
}

export async function fetchMigrationImage(value: unknown, dependencies: MigrationImageFetcherDependencies = {}): Promise<MigrationImage> {
  let url: string; try { url = validateMigrationImageUrl(value); } catch { return fail("migration_image_url_invalid"); }
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > DEFAULT_TIMEOUT) fail("migration_image_unavailable");
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await Promise.race([
      (async () => {
        const selectedDependencies = { lookup: dependencies.lookup ?? defaultLookup, request: dependencies.request ?? defaultRequest };
        try { return await withinAuthority(url, controller.signal, selectedDependencies); }
        catch (error) {
          if (!(error instanceof MigrationImageError) || !["migration_image_response_invalid", "migration_image_response_too_large"].includes(error.code)) throw error;
          const recovered = await recoverWordPressDerivative(url, controller.signal, selectedDependencies);
          if (recovered) return recovered;
          throw error;
        }
      })(),
      new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new MigrationImageError("migration_image_timeout")), { once: true })),
    ]);
  } finally { clearTimeout(timeout); }
}
