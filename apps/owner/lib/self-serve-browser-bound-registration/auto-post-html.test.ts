import assert from "node:assert/strict";
import test from "node:test";

import { createOwnerPanelBootstrapAutoPostResponse } from "./auto-post-html.ts";

const BS1 = `bs1.active.${Buffer.alloc(32, 7).toString("base64url")}`;
const PROVIDER = "https://identity.example.test/authorize?response_type=code&response_mode=query&state=opaque_state_1234567890&redirect_uri=https%3A%2F%2Fpanel.celebix.site%2Fauth%2Fcallback&nonce=x%22y%27z%3C%3E";
const STAGING_PROVIDER = "https://auth.saas-staging.celebix.site/oidc/auth?response_type=code&state=staging_state&code_challenge=challenge";
const PRODUCTION_PROVIDER = "https://auth.celebix.site/oidc/auth?response_type=code&state=production_state&code_challenge=challenge";

function decodeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

test("secure bridge HTML has one fixed POST form, exact fields, and one canonical 24-byte nonce", async () => {
  let randomCalls = 0;
  const response = createOwnerPanelBootstrapAutoPostResponse({
    bootstrapCredential: BS1,
    providerAuthorizationUrl: PROVIDER,
    randomBytes(size) {
      randomCalls += 1;
      assert.equal(size, 24);
      return new Uint8Array(Array.from({ length: 24 }, (_, index) => index));
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.has("location"), false);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("refresh"), false);

  const html = await response.text();
  assert.ok(Buffer.byteLength(html, "utf8") <= 131_072);
  assert.equal((html.match(/<form\b/g) ?? []).length, 1);
  assert.match(html, /<form method="post" action="https:\/\/panel\.celebix\.site\/auth\/bootstrap" enctype="application\/x-www-form-urlencoded" accept-charset="UTF-8" autocomplete="off">/);
  assert.equal((html.match(/type="hidden"/g) ?? []).length, 2);
  const fields = [...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)];
  assert.deepEqual(fields.map((match) => match[1]), ["bootstrapCredential", "providerAuthorizationUrl"]);
  assert.equal(decodeHtmlAttribute(fields[0][2]), BS1);
  assert.equal(decodeHtmlAttribute(fields[1][2]), PROVIDER);
  assert.equal(html.includes("<noscript><button type=\"submit\">Devam et</button></noscript>"), true);
  assert.equal(html.includes(`<a `), false);
  assert.equal(html.includes(PROVIDER), false, "raw provider URL must be entity escaped");

  const nonce = Buffer.from(Array.from({ length: 24 }, (_, index) => index)).toString("base64url");
  assert.equal(nonce.length, 32);
  assert.equal((html.match(/<script nonce=/g) ?? []).length, 1);
  assert.ok(html.includes(`<script nonce="${nonce}">document.forms[0].submit();</script>`));
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.equal(csp, `default-src 'none'; base-uri 'none'; form-action https://panel.celebix.site/auth/bootstrap https://identity.example.test; frame-ancestors 'none'; script-src 'nonce-${nonce}'; connect-src 'none'; img-src 'none'; style-src 'none'; object-src 'none'`);
  assert.equal(csp.includes(new URL(PROVIDER).search), false);
  assert.equal(csp.includes("response_type"), false);
  assert.equal(csp.includes("state="), false);
  assert.equal(csp.includes("code_challenge"), false);
  for (const forbidden of ["unsafe-inline", "unsafe-eval", "*", "data:", "blob:"]) {
    assert.equal(csp.includes(forbidden), false);
  }
  assert.doesNotMatch(csp, /(?:^|[ ;])https:(?:[ ;]|$)/);
  assert.equal(csp.includes("'self'"), false);
  assert.equal(randomCalls, 1);
});

test("bridge CSP permits exactly the panel bootstrap URL and canonical provider origin", async () => {
  for (const providerAuthorizationUrl of [STAGING_PROVIDER, PRODUCTION_PROVIDER]) {
    const response = createOwnerPanelBootstrapAutoPostResponse({
      bootstrapCredential: BS1,
      providerAuthorizationUrl,
      randomBytes: () => new Uint8Array(24),
    });
    const csp = response.headers.get("content-security-policy") ?? "";
    const formAction = csp.split("; ").find((directive) => directive.startsWith("form-action "));
    assert.equal(
      formAction,
      `form-action https://panel.celebix.site/auth/bootstrap ${new URL(providerAuthorizationUrl).origin}`,
    );
    assert.equal(csp.includes(new URL(providerAuthorizationUrl).search), false);

    const html = await response.text();
    const encodedProvider = [...html.matchAll(/<input type="hidden" name="providerAuthorizationUrl" value="([^"]*)">/g)];
    assert.equal(encodedProvider.length, 1);
    assert.equal(decodeHtmlAttribute(encodedProvider[0][1]), providerAuthorizationUrl);
  }
});

test("HTML bridge rejects control characters, wrong random length, and response overflow", () => {
  const validRandom = () => new Uint8Array(24);
  assert.throws(() => createOwnerPanelBootstrapAutoPostResponse({
    bootstrapCredential: `${BS1}\n`, providerAuthorizationUrl: PROVIDER, randomBytes: validRandom,
  }));
  assert.throws(() => createOwnerPanelBootstrapAutoPostResponse({
    bootstrapCredential: BS1, providerAuthorizationUrl: `${PROVIDER}\u007f`, randomBytes: validRandom,
  }));
  assert.throws(() => createOwnerPanelBootstrapAutoPostResponse({
    bootstrapCredential: BS1, providerAuthorizationUrl: PROVIDER, randomBytes: () => new Uint8Array(23),
  }));
  assert.throws(() => createOwnerPanelBootstrapAutoPostResponse({
    bootstrapCredential: BS1,
    providerAuthorizationUrl: `https://identity.example.test/${"a".repeat(131_072)}`,
    randomBytes: validRandom,
  }));
});

test("HTML bridge rejects non-canonical or unsafe provider authorization URLs", () => {
  const validRandom = () => new Uint8Array(24);
  for (const providerAuthorizationUrl of [
    "",
    "not-a-url",
    ` ${PROVIDER}`,
    `${PROVIDER}\n`,
    PROVIDER.replace("https://", "http://"),
    PROVIDER.replace("https://", "https://user:password@"),
    PROVIDER.replace("identity.example.test", "identity.example.test:8443"),
    PROVIDER.replace("identity.example.test", "identity.example.test:443"),
    `${PROVIDER}#fragment`,
    `https://identity.example.test/${"a".repeat(16_385)}`,
  ]) {
    assert.throws(
      () => createOwnerPanelBootstrapAutoPostResponse({
        bootstrapCredential: BS1,
        providerAuthorizationUrl,
        randomBytes: validRandom,
      }),
      /browser_bound_registration_bridge_unavailable/,
    );
  }
});
