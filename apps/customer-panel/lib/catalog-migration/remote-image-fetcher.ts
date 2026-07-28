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
const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT = 10_000;
const HEADERS = Object.freeze({ accept: "image/webp,image/png,image/jpeg", "user-agent": "Celebix-Catalog-Migration/1.0" });

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
function mediaType(value: string | null): PublicImageMediaType {
  if (value === "image/jpeg" || value === "image/png" || value === "image/webp") return value;
  return fail("migration_image_response_invalid");
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
    const hostname = new URL(selected).hostname;
    let addresses: readonly MigrationImageAddress[];
    try { addresses = await dependencies.lookup(hostname); } catch { return fail("migration_image_unavailable"); }
    if (!Array.isArray(addresses) || addresses.length < 1 || addresses.length > 32
      || addresses.some((entry) => !entry || (entry.family !== 4 && entry.family !== 6) || !isPublicMigrationImageAddress(entry.address))) fail("migration_image_address_denied");
    let response: MigrationImageRawResponse;
    try { response = await dependencies.request({ url: selected, address: addresses[0]!.address, family: addresses[0]!.family, signal, headers: HEADERS }); }
    catch (error) {
      if (signal.aborted) return fail("migration_image_timeout");
      if (error instanceof MigrationImageError) throw error;
      return fail("migration_image_unavailable");
    }
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
      withinAuthority(url, controller.signal, { lookup: dependencies.lookup ?? defaultLookup, request: dependencies.request ?? defaultRequest }),
      new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new MigrationImageError("migration_image_timeout")), { once: true })),
    ]);
  } finally { clearTimeout(timeout); }
}
