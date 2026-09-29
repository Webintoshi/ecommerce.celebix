import { createHash, randomUUID } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { checkServerIdentity } from "node:tls";

import { isPublicContentResearchAddress, validateContentResearchUrl } from "./authority.ts";
import { ContentResearchExtractError, extractContentResearchText, type ContentResearchMediaType } from "./extract.ts";

export interface ContentResearchAddress { readonly address: string; readonly family: 4 | 6 }
export interface ContentResearchRequestInput {
  readonly url: string;
  readonly address: string;
  readonly family: 4 | 6;
  readonly signal: AbortSignal;
  readonly headers: Readonly<Record<string, string>>;
}
export interface ContentResearchRawResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly body: AsyncIterable<Uint8Array>;
  readonly discard?: () => void;
}
export interface ContentResearchFetcherDependencies {
  readonly lookup?: (hostname: string) => Promise<readonly ContentResearchAddress[]>;
  readonly request?: (input: ContentResearchRequestInput) => Promise<ContentResearchRawResponse>;
  /** Monotonic milliseconds, matching the HTTP request's deadlineAt. */
  readonly now?: () => number;
}
export interface ContentResearchSource {
  readonly id: string;
  readonly originalUrl: string;
  readonly finalUrl: string;
  readonly title: string;
  readonly fetchedAt: string;
  readonly contentSha256: string;
  readonly extractedText: string;
  readonly byteCount: number;
}

export class ContentResearchError extends Error {
  constructor(readonly code:
    | "content_research_url_invalid"
    | "content_research_address_denied"
    | "content_research_redirect_invalid"
    | "content_research_response_invalid"
    | "content_research_response_too_large"
    | "content_research_extraction_invalid"
    | "content_research_extraction_too_large"
    | "content_research_timeout"
    | "content_research_unavailable") {
    super(code);
    this.name = "ContentResearchError";
  }
}

const MAX_RAW_BYTES = 524_288;
const MAX_REDIRECTS = 3;
const SOURCE_TIMEOUT_MS = 10_000;
const HEADERS = Object.freeze({ accept: "text/html, text/plain", "accept-encoding": "identity", "user-agent": "Celebix-Content-Research/1.0" });

function fail(code: ContentResearchError["code"]): never { throw new ContentResearchError(code); }

async function defaultLookup(hostname: string): Promise<readonly ContentResearchAddress[]> {
  const answers = await dnsLookup(hostname, { all: true, verbatim: true });
  return Object.freeze(answers.map((answer) => Object.freeze({ address: answer.address, family: answer.family as 4 | 6 })));
}

/** Connect to the verified numeric address; preserve the original host for Host, SNI and certificate verification. */
function defaultRequest(input: ContentResearchRequestInput): Promise<ContentResearchRawResponse> {
  return new Promise((resolve, reject) => {
    const selected = new URL(input.url);
    const request = httpsRequest({
      method: "GET",
      protocol: "https:",
      hostname: input.address,
      family: input.family,
      port: 443,
      path: `${selected.pathname}${selected.search}`,
      servername: selected.hostname,
      agent: false,
      headers: { ...input.headers, host: selected.host },
      signal: input.signal,
      rejectUnauthorized: true,
      checkServerIdentity: (_hostname, certificate) => checkServerIdentity(selected.hostname, certificate),
    }, (response) => {
      const headers = new Headers();
      for (let index = 0; index < response.rawHeaders.length; index += 2) headers.append(response.rawHeaders[index]!, response.rawHeaders[index + 1] ?? "");
      resolve({ status: response.statusCode ?? 0, headers, body: response, discard: () => response.destroy() });
    });
    request.once("error", reject);
    request.end();
  });
}

function discard(response: ContentResearchRawResponse | null): void {
  try { response?.discard?.(); } catch { /* best-effort connection eviction */ }
}

function mediaType(value: string | null): ContentResearchMediaType {
  if (!value || /[,\r\n]/.test(value)) return fail("content_research_response_invalid");
  const parts = value.split(";").map((part) => part.trim());
  if (parts.length > 2 || (parts.length === 2 && !/^charset=(?:utf-8|"utf-8")$/i.test(parts[1]!))) return fail("content_research_response_invalid");
  const selected = parts[0]?.toLowerCase();
  if (selected === "text/html" || selected === "text/plain") return selected;
  return fail("content_research_response_invalid");
}

async function readBody(response: ContentResearchRawResponse): Promise<Readonly<{ text: string; byteCount: number }>> {
  const encoding = response.headers.get("content-encoding");
  if (encoding !== null && encoding.toLowerCase() !== "identity") return fail("content_research_response_invalid");
  const length = response.headers.get("content-length");
  if (length !== null && !/^(?:0|[1-9][0-9]*)$/.test(length)) return fail("content_research_response_invalid");
  if (length !== null && Number(length) > MAX_RAW_BYTES) return fail("content_research_response_too_large");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for await (const raw of response.body) {
      if (!(raw instanceof Uint8Array)) return fail("content_research_response_invalid");
      total += raw.byteLength;
      if (total > MAX_RAW_BYTES) return fail("content_research_response_too_large");
      chunks.push(new Uint8Array(raw));
    }
  } catch (caught) {
    if (caught instanceof ContentResearchError) throw caught;
    return fail("content_research_unavailable");
  }
  if (total < 1 || (length !== null && Number(length) !== total)) return fail("content_research_response_invalid");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return Object.freeze({ text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), byteCount: total }); }
  catch { return fail("content_research_response_invalid"); }
}

export function createContentResearchFetcher(dependencies: ContentResearchFetcherDependencies = {}) {
  const lookup = dependencies.lookup ?? defaultLookup;
  const request = dependencies.request ?? defaultRequest;
  const now = dependencies.now ?? (() => performance.now());

  async function fetch(input: Readonly<{ url: string; signal: AbortSignal; deadlineAt: number }>): Promise<ContentResearchSource> {
    let originalUrl: string;
    try { originalUrl = validateContentResearchUrl(input?.url); }
    catch { return fail("content_research_url_invalid"); }
    const startedAt = now();
    if (!Number.isFinite(startedAt) || !Number.isFinite(input.deadlineAt)) return fail("content_research_timeout");
    const remaining = Math.min(SOURCE_TIMEOUT_MS, input.deadlineAt - startedAt);
    if (remaining <= 0 || input.signal.aborted) return fail("content_research_timeout");
    const endsAt = startedAt + remaining;
    const controller = new AbortController();
    const signal = AbortSignal.any([input.signal, controller.signal]);
    const active = () => { const current = now(); if (signal.aborted || !Number.isFinite(current) || current >= endsAt) fail("content_research_timeout"); };
    let activeResponse: ContentResearchRawResponse | null = null;
    let settled = false;
    const releaseActive = () => { const response = activeResponse; activeResponse = null; discard(response); };
    const abort = () => releaseActive();
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(), Math.ceil(remaining));
    let rejectAborted: (reason: ContentResearchError) => void = () => undefined;
    const aborted = new Promise<never>((_, reject) => { rejectAborted = reject; });
    const onAbort = () => rejectAborted(new ContentResearchError("content_research_timeout"));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) { abort(); onAbort(); }

    async function withinDeadline(): Promise<ContentResearchSource> {
      let currentUrl = originalUrl;
      for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
        active();
        let selected: string;
        try { selected = validateContentResearchUrl(currentUrl); }
        catch { return fail(redirect ? "content_research_redirect_invalid" : "content_research_url_invalid"); }
        const hostname = new URL(selected).hostname;
        let answers: readonly ContentResearchAddress[];
        try { answers = await lookup(hostname); }
        catch { return signal.aborted ? fail("content_research_timeout") : fail("content_research_unavailable"); }
        active();
        if (!Array.isArray(answers) || answers.length < 1 || answers.length > 32 || answers.some((answer) => !answer || (answer.family !== 4 && answer.family !== 6) || !isPublicContentResearchAddress(answer.address, answer.family))) return fail("content_research_address_denied");
        let response: ContentResearchRawResponse;
        try { response = await request({ url: selected, address: answers[0]!.address, family: answers[0]!.family, signal, headers: HEADERS }); }
        catch { return signal.aborted ? fail("content_research_timeout") : fail("content_research_unavailable"); }
        // Promise.race may have already returned on timeout while an injected transport ignored abort.
        if (settled || signal.aborted) { discard(response); return fail("content_research_timeout"); }
        activeResponse = response;
        active();
        if (!response || !(response.headers instanceof Headers) || !response.body || typeof response.body[Symbol.asyncIterator] !== "function") return fail("content_research_response_invalid");
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          releaseActive();
          if (redirect === MAX_REDIRECTS) return fail("content_research_redirect_invalid");
          const location = response.headers.get("location");
          if (!location || /[,\r\n]/.test(location)) return fail("content_research_redirect_invalid");
          try { currentUrl = new URL(location, selected).href; }
          catch { return fail("content_research_redirect_invalid"); }
          continue;
        }
        if (response.status !== 200) return fail("content_research_response_invalid");
        const type = mediaType(response.headers.get("content-type"));
        const body = await readBody(response);
        active();
        let extracted: ReturnType<typeof extractContentResearchText>;
        try { extracted = extractContentResearchText({ text: body.text, mediaType: type }); }
        catch (caught) {
          if (caught instanceof ContentResearchExtractError) return fail(caught.code);
          return fail("content_research_extraction_invalid");
        }
        active();
        return Object.freeze({
          id: randomUUID(),
          originalUrl,
          finalUrl: selected,
          title: extracted.title,
          fetchedAt: new Date().toISOString(),
          contentSha256: createHash("sha256").update(extracted.text, "utf8").digest("hex"),
          extractedText: extracted.text,
          byteCount: body.byteCount,
        });
      }
      return fail("content_research_redirect_invalid");
    }

    try {
      return await Promise.race([withinDeadline(), aborted]);
    } catch (caught) {
      if (signal.aborted) return fail("content_research_timeout");
      if (caught instanceof ContentResearchError) throw caught;
      return fail("content_research_unavailable");
    } finally {
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      signal.removeEventListener("abort", onAbort);
      releaseActive();
    }
  }

  return Object.freeze({ fetch });
}
