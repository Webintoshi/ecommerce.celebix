import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { ContentResearchError, createContentResearchFetcher, verifyContentResearchServerIdentity, type ContentResearchAddress, type ContentResearchRawResponse, type ContentResearchRequestInput } from "./fetcher.ts";

const encoder = new TextEncoder();
const url = "https://research.example.com/article";
function response(status: number, contentType: string | null, body: string | Uint8Array, extra: HeadersInit = {}): ContentResearchRawResponse {
  const headers = new Headers(extra);
  if (contentType) headers.set("content-type", contentType);
  return { status, headers, body: (async function* () { yield typeof body === "string" ? encoder.encode(body) : body; })() };
}
function validOptions(raw: ContentResearchRawResponse = response(200, "text/plain", "Ankara ürün bilgisi")) {
  let requests = 0;
  const options = {
    async lookup(): Promise<readonly ContentResearchAddress[]> { return [{ address: "8.8.8.8", family: 4 }]; },
    async request(): Promise<ContentResearchRawResponse> { requests++; return raw; },
  };
  return { options, requests: () => requests };
}
function code(expected: ContentResearchError["code"]) {
  return (caught: unknown) => caught instanceof ContentResearchError && caught.code === expected;
}
function fetchWith(options: Parameters<typeof createContentResearchFetcher>[0], value = url, deadlineAt = performance.now() + 1_000) {
  return createContentResearchFetcher(options).fetch({ url: value, signal: new AbortController().signal, deadlineAt });
}

test("URL admission rejects credentials, local names, IP literals, alternate ports, fragments and noncanonical paths before DNS", async () => {
  const invalid = ["http://research.example.com/a", "https://u:p@research.example.com/a", "https://research.example.com:8443/a", "https://research.example.com/a#frag", "https://localhost/a", "https://box.local/a", "https://127.0.0.1/a", "https://[::ffff:8.8.8.8]/a", "https://research.example.com/%61", "https://research.example.com/a "];
  for (const candidate of invalid) {
    let lookups = 0;
    await assert.rejects(fetchWith({ async lookup() { lookups++; return [{ address: "8.8.8.8", family: 4 }]; }, async request() { throw Error("unexpected request"); } }, candidate), code("content_research_url_invalid"), candidate);
    assert.equal(lookups, 0, candidate);
  }
});

test("every DNS answer must be public and family-correct; transport gets one pinned address", async () => {
  for (const addresses of [[], [{ address: "8.8.8.8", family: 4 as const }, { address: "127.0.0.1", family: 4 as const }], [{ address: "::ffff:127.0.0.1", family: 6 as const }], [{ address: "8.8.8.8", family: 6 as const }], [{ address: "192.0.2.1", family: 4 as const }]]) {
    let calls = 0;
    await assert.rejects(fetchWith({ async lookup() { return addresses; }, async request() { calls++; return response(200, "text/plain", "x"); } }), code("content_research_address_denied"));
    assert.equal(calls, 0);
  }
  const selected: ContentResearchRequestInput[] = [];
  const result = await fetchWith({ async lookup() { return [{ address: "8.8.8.8", family: 4 }, { address: "1.1.1.1", family: 4 }]; }, async request(input) { selected.push(input); return response(200, "text/plain", "Türkçe kanıt"); } });
  assert.equal(selected.length, 1);
  assert.equal(selected[0]!.address, "8.8.8.8");
  assert.equal(selected[0]!.url, url);
  assert.equal(selected[0]!.headers.cookie, undefined);
  assert.equal(selected[0]!.headers.authorization, undefined);
  assert.equal(result.contentSha256, createHash("sha256").update(result.extractedText, "utf8").digest("hex"));
  assert.equal(result.byteCount, encoder.encode("Türkçe kanıt").byteLength);
  assert.equal(result.originalUrl, url);
  assert.equal(result.finalUrl, url);
  assert.match(result.fetchedAt, /^\d{4}-\d\d-\d\dT/);
});

test("TLS name validation rejects a certificate for the pinned address's other DNS name", () => {
  const otherName = { subjectaltname: "DNS:other.example.com" } as never;
  assert.ok(verifyContentResearchServerIdentity("research.example.com", otherName) instanceof Error);
  assert.equal(verifyContentResearchServerIdentity("other.example.com", otherName), undefined);
});

test("redirects revalidate and resolve every destination, cap at three hops, and discard intermediate responses", async () => {
  const resolved: string[] = [], sent: string[] = [];
  let discarded = 0;
  const responses = [
    { ...response(302, null, "", { location: "https://second.example.com/facts" }), discard() { discarded++; } },
    response(200, "text/html; charset=utf-8", "<title>Facts</title><p>Safe fact.</p>"),
  ];
  const result = await fetchWith({
    async lookup(hostname) { resolved.push(hostname); return [{ address: hostname === "research.example.com" ? "8.8.8.8" : "1.1.1.1", family: 4 }]; },
    async request(input) { sent.push(`${input.url}|${input.address}`); return responses.shift()!; },
  });
  assert.deepEqual(resolved, ["research.example.com", "second.example.com"]);
  assert.deepEqual(sent, [`${url}|8.8.8.8`, "https://second.example.com/facts|1.1.1.1"]);
  assert.equal(discarded, 1);
  assert.equal(result.finalUrl, "https://second.example.com/facts");
  assert.equal(result.title, "Facts");
  await assert.rejects(fetchWith({ async lookup(hostname) { return [{ address: hostname === "second.example.com" ? "10.0.0.1" : "8.8.8.8", family: 4 }]; }, async request() { return response(302, null, "", { location: "https://second.example.com/secret" }); } }), code("content_research_address_denied"));
  let lookups = 0, requests = 0;
  await assert.rejects(fetchWith({ async lookup() { lookups++; return [{ address: lookups === 1 ? "8.8.8.8" : "10.0.0.1", family: 4 }]; }, async request() { requests++; return response(302, null, "", { location: url }); } }), code("content_research_address_denied"));
  assert.equal(requests, 1);
  await assert.rejects(fetchWith({ async lookup() { return [{ address: "8.8.8.8", family: 4 }]; }, async request() { return response(302, null, "", { location: "https://127.0.0.1/secret" }); } }), code("content_research_redirect_invalid"));
  const many = Array.from({ length: 4 }, () => response(302, null, "", { location: url }));
  await assert.rejects(fetchWith({ async lookup() { return [{ address: "8.8.8.8", family: 4 }]; }, async request() { return many.shift()!; } }), code("content_research_redirect_invalid"));
});

test("rejects unsupported media, compression, misleading length, byte overflow, invalid UTF-8 and empty evidence", async () => {
  for (const [raw, expected] of [
    [response(200, null, "x"), "content_research_response_invalid"],
    [response(200, "application/json", "{}"), "content_research_response_invalid"],
    [response(200, "text/plain; charset=iso-8859-1", "x"), "content_research_response_invalid"],
    [response(200, "text/plain", "x", { "content-encoding": "gzip" }), "content_research_response_invalid"],
    [response(200, "text/plain", "x", { "content-length": "524289" }), "content_research_response_too_large"],
    [response(200, "text/plain", "abc", { "content-length": "2" }), "content_research_response_invalid"],
    [response(200, "text/plain", new Uint8Array(524_289)), "content_research_response_too_large"],
    [response(200, "text/plain", new Uint8Array([0xc3, 0x28])), "content_research_response_invalid"],
    [response(200, "text/plain", "  "), "content_research_extraction_invalid"],
    [response(200, "text/plain", "a".repeat(12_001)), "content_research_extraction_too_large"],
  ] as const) {
    let discarded = 0;
    await assert.rejects(fetchWith(validOptions({ ...raw, discard() { discarded++; } }).options), code(expected), expected);
    assert.equal(discarded, 1, expected);
  }
});

test("deadline bounds DNS, request and body stages even when a dependency never settles", async () => {
  const never = new Promise<never>(() => undefined);
  await assert.rejects(fetchWith({ async lookup() { return never; }, async request() { throw Error("not reached"); } }, url, performance.now() + 20), code("content_research_timeout"));
  await assert.rejects(fetchWith({ async lookup() { return [{ address: "8.8.8.8", family: 4 }]; }, async request() { return never; } }, url, performance.now() + 20), code("content_research_timeout"));
  let discarded = 0;
  await assert.rejects(fetchWith({ async lookup() { return [{ address: "8.8.8.8", family: 4 }]; }, async request() { return { status: 200, headers: new Headers({ "content-type": "text/plain" }), body: (async function* () { await never; yield encoder.encode("late"); })(), discard() { discarded++; } }; } }, url, performance.now() + 20), code("content_research_timeout"));
  assert.equal(discarded, 1);
  const valid = validOptions();
  await assert.rejects(fetchWith(valid.options, url, performance.now() - 1), code("content_research_timeout"));
  assert.equal(valid.requests(), 0);
});

test("synchronous extraction cannot evade an already elapsed source deadline", async () => {
  let clock = 0;
  await assert.rejects(fetchWith({
    now: () => clock,
    async lookup() { return [{ address: "8.8.8.8", family: 4 }]; },
    async request() { return { status: 200, headers: new Headers({ "content-type": "text/plain" }), body: (async function* () { clock = 10_001; yield encoder.encode("text"); })() }; },
  }, url, 20_000), code("content_research_timeout"));
});

test("a request that ignores abort still discards its late response after timeout", async () => {
  let resolveLate: ((value: ContentResearchRawResponse) => void) | undefined;
  let discarded = 0;
  const pending = fetchWith({
    async lookup() { return [{ address: "8.8.8.8", family: 4 }]; },
    async request() { return new Promise<ContentResearchRawResponse>((resolve) => { resolveLate = resolve; }); },
  }, url, performance.now() + 20);
  await assert.rejects(pending, code("content_research_timeout"));
  assert.ok(resolveLate);
  resolveLate({ ...response(200, "text/plain", "late evidence"), discard() { discarded++; } });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(discarded, 1);
});

test("the exact raw byte boundary is accepted when hidden markup leaves small evidence", async () => {
  const prefix = "<style>", suffix = "</style><p>x</p>";
  const html = `${prefix}${"a".repeat(524_288 - prefix.length - suffix.length)}${suffix}`;
  const result = await fetchWith(validOptions(response(200, "text/html", html, { "content-length": "524288" })).options);
  assert.equal(result.byteCount, 524_288);
  assert.equal(result.extractedText, "x");
});
