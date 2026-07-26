import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { checkServerIdentity } from "node:tls";

import { isPublicCatalogFeedAddress, validateCatalogFeedUrl } from "./feed-authority.ts";

export type CatalogFeedMediaType = "csv" | "json" | "xml";
export interface CatalogFeedAddress { readonly address: string; readonly family: 4 | 6 }
export interface CatalogFeedRequestInput {
  readonly url: string;
  readonly address: string;
  readonly family: 4 | 6;
  readonly signal: AbortSignal;
  readonly headers: Readonly<Record<string, string>>;
}
export interface CatalogFeedRawResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly body: AsyncIterable<Uint8Array>;
  readonly discard?: () => void;
}
export interface CatalogFeedFetcherDependencies {
  readonly lookup?: (hostname: string) => Promise<readonly CatalogFeedAddress[]>;
  readonly request?: (input: CatalogFeedRequestInput) => Promise<CatalogFeedRawResponse>;
  readonly timeoutMs?: number;
}

export class CatalogFeedError extends Error {
  constructor(readonly code: "catalog_feed_url_invalid" | "catalog_feed_address_denied" | "catalog_feed_redirect_invalid" | "catalog_feed_response_invalid" | "catalog_feed_response_too_large" | "catalog_feed_timeout" | "catalog_feed_unavailable") { super(code); this.name = "CatalogFeedError"; }
}

const MAX_BYTES = 524_288;
const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT = 10_000;
const ACCEPT = "text/csv, application/json, application/xml, text/xml";

function fail(code: CatalogFeedError["code"]): never { throw new CatalogFeedError(code); }

async function defaultLookup(hostname: string): Promise<readonly CatalogFeedAddress[]> {
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  return Object.freeze(addresses.filter((entry): entry is { address: string; family: 4 | 6 } => entry.family === 4 || entry.family === 6).map((entry) => Object.freeze({ address: entry.address, family: entry.family })));
}

function defaultRequest(input: CatalogFeedRequestInput): Promise<CatalogFeedRawResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(input.url);
    const request = httpsRequest({
      method: "GET",
      protocol: "https:",
      hostname: input.address,
      family: input.family,
      port: 443,
      path: `${url.pathname}${url.search}`,
      servername: url.hostname,
      agent: false,
      headers: { ...input.headers, host: url.host },
      signal: input.signal,
      rejectUnauthorized: true,
      checkServerIdentity: (_hostname, certificate) => checkServerIdentity(url.hostname, certificate),
    }, (response) => {
      const headers = new Headers();
      for (let index = 0; index < response.rawHeaders.length; index += 2) headers.append(response.rawHeaders[index]!, response.rawHeaders[index + 1] ?? "");
      resolve({ status: response.statusCode ?? 0, headers, body: response, discard: () => response.destroy() });
    });
    request.once("error", reject);
    request.end();
  });
}

function mediaType(value: string | null): CatalogFeedMediaType {
  if (!value || /[,\r\n]/.test(value)) fail("catalog_feed_response_invalid");
  const parts = value.split(";").map((part) => part.trim());
  if (parts.length > 2 || (parts[1] && !/^charset=(?:utf-8|"utf-8")$/i.test(parts[1]))) fail("catalog_feed_response_invalid");
  switch (parts[0]?.toLowerCase()) {
    case "text/csv":
    case "application/csv": return "csv";
    case "application/json": return "json";
    case "application/xml":
    case "text/xml": return "xml";
    default: return fail("catalog_feed_response_invalid");
  }
}

async function readBody(response: CatalogFeedRawResponse): Promise<string> {
  if (response.headers.get("content-encoding") !== null && response.headers.get("content-encoding")?.toLowerCase() !== "identity") fail("catalog_feed_response_invalid");
  const rawLength = response.headers.get("content-length");
  if (rawLength !== null && (!/^(?:0|[1-9]\d*)$/.test(rawLength) || Number(rawLength) > MAX_BYTES)) fail("catalog_feed_response_too_large");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const raw of response.body) {
    const chunk = raw instanceof Uint8Array ? new Uint8Array(raw) : fail("catalog_feed_response_invalid");
    total += chunk.byteLength;
    if (total > MAX_BYTES) fail("catalog_feed_response_too_large");
    chunks.push(chunk);
  }
  if (total < 1) fail("catalog_feed_response_invalid");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return fail("catalog_feed_response_invalid"); }
}

async function fetchWithinAuthority(urlValue: string, signal: AbortSignal, deps: Required<Pick<CatalogFeedFetcherDependencies, "lookup" | "request">>): Promise<Readonly<{ mediaType: CatalogFeedMediaType; body: string }>> {
  let current = urlValue;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    let selected: string;
    try { selected = validateCatalogFeedUrl(current); } catch { return fail(redirect ? "catalog_feed_redirect_invalid" : "catalog_feed_url_invalid"); }
    const hostname = new URL(selected).hostname;
    let addresses: readonly CatalogFeedAddress[];
    try { addresses = await deps.lookup(hostname); } catch { return fail("catalog_feed_unavailable"); }
    if (!Array.isArray(addresses) || addresses.length < 1 || addresses.length > 32 || addresses.some((entry) => !entry || ![4, 6].includes(entry.family) || !isPublicCatalogFeedAddress(entry.address))) fail("catalog_feed_address_denied");
    let response: CatalogFeedRawResponse;
    try {
      response = await deps.request({ url: selected, address: addresses[0]!.address, family: addresses[0]!.family, signal, headers: Object.freeze({ accept: ACCEPT, "user-agent": "Celebix-Catalog-Feed/1.0" }) });
    } catch (caught) {
      if (signal.aborted) return fail("catalog_feed_timeout");
      if (caught instanceof CatalogFeedError) throw caught;
      return fail("catalog_feed_unavailable");
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      response.discard?.();
      if (redirect === MAX_REDIRECTS) fail("catalog_feed_redirect_invalid");
      const location = response.headers.get("location");
      if (!location || /[,\r\n]/.test(location)) fail("catalog_feed_redirect_invalid");
      try { current = new URL(location, selected).href; } catch { fail("catalog_feed_redirect_invalid"); }
      continue;
    }
    if (response.status !== 200) { response.discard?.(); fail("catalog_feed_response_invalid"); }
    const selectedMediaType = mediaType(response.headers.get("content-type"));
    const body = await readBody(response);
    return Object.freeze({ mediaType: selectedMediaType, body });
  }
  return fail("catalog_feed_redirect_invalid");
}

export async function fetchCatalogFeed(value: unknown, dependencies: CatalogFeedFetcherDependencies = {}): Promise<Readonly<{ mediaType: CatalogFeedMediaType; body: string }>> {
  let url: string;
  try { url = validateCatalogFeedUrl(value); } catch { return fail("catalog_feed_url_invalid"); }
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > DEFAULT_TIMEOUT) fail("catalog_feed_unavailable");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await Promise.race([
      fetchWithinAuthority(url, controller.signal, { lookup: dependencies.lookup ?? defaultLookup, request: dependencies.request ?? defaultRequest }),
      new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new CatalogFeedError("catalog_feed_timeout")), { once: true })),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
