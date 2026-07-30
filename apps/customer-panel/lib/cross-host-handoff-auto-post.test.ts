import assert from "node:assert/strict";
import test from "node:test";

import { createCrossHostHandoffAutoPostResponse } from "./cross-host-handoff-auto-post.ts";

const DESTINATION = "https://guzide-kuyumcu-4.admin.saas-staging.celebix.site";
const HANDOFF = `v1.panel-handoff.active.${Buffer.alloc(32, 0x44).toString("base64url")}`;

test("posts the handoff only in a CSP-bound request body", async () => {
  const response = createCrossHostHandoffAutoPostResponse({
    destinationOrigin: DESTINATION,
    handoffCredential: HANDOFF,
    randomBytes: (size) => { assert.equal(size, 18); return new Uint8Array(size).fill(0x52); },
  });
  const body = await response.text();
  const nonce = Buffer.alloc(18, 0x52).toString("base64url");

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("content-security-policy"), [
    "default-src 'none'",
    "base-uri 'none'",
    `form-action ${DESTINATION}`,
    "frame-ancestors 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "connect-src 'none'",
    "img-src 'none'",
    "object-src 'none'",
  ].join("; "));
  assert.match(body, new RegExp(`action="${DESTINATION}/auth/handoff"`));
  assert.match(body, /method="post"/);
  assert.match(body, new RegExp(`name="handoff" value="${HANDOFF.replaceAll(".", "\\.")}"`));
  assert.match(body, /<button type="submit">Devam et<\/button>/);
  assert.doesNotMatch(body, /<noscript>/);
  assert.match(body, new RegExp(`nonce="${nonce}"`));
  assert.doesNotMatch(`${DESTINATION}/auth/handoff`, /v1\./);
  assert.equal(response.headers.has("location"), false);
  assert.equal(response.headers.has("set-cookie"), false);
});

test("rejects non-canonical origins, malformed credentials, and weak randomness", () => {
  const randomBytes = (size: number) => new Uint8Array(size).fill(1);
  for (const destinationOrigin of [
    "http://guzide-kuyumcu-4.admin.saas-staging.celebix.site",
    "https://guzide-kuyumcu-4.admin.saas-staging.celebix.site/path",
    "https://evil.example",
  ]) assert.throws(() => createCrossHostHandoffAutoPostResponse({ destinationOrigin, handoffCredential: HANDOFF, randomBytes }));
  assert.throws(() => createCrossHostHandoffAutoPostResponse({ destinationOrigin: DESTINATION, handoffCredential: "v1.bad", randomBytes }));
  assert.throws(() => createCrossHostHandoffAutoPostResponse({
    destinationOrigin: DESTINATION,
    handoffCredential: HANDOFF,
    randomBytes: () => new Uint8Array(17),
  }));
});
