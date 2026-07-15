import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { createOwnerPanelBootstrapAutoPostResponse } from "../../../apps/owner/lib/self-serve-browser-bound-registration/auto-post-html.ts";
import { applySecurityHeaders } from "../../../packages/platform-config/src/http-security.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const BOOTSTRAP = "https://panel.saas-staging.celebix.site/auth/bootstrap";

function securityRequest() {
  return {
    headers: new Headers({ "x-forwarded-proto": "https" }),
    nextUrl: new URL("http://owner-service.internal:3000/api/self-serve/register"),
  };
}

test("route-owned CSP mode preserves the exact registration bridge policy and every generic header", () => {
  const response = createOwnerPanelBootstrapAutoPostResponse({
    bootstrapCredential: `bs1.staging.${"a".repeat(43)}`,
    providerAuthorizationUrl: `https://identity.staging.example.test/authorize?state=${"s".repeat(32)}`,
    panelBootstrapAuthority: BOOTSTRAP,
    randomBytes: () => new Uint8Array(24).fill(7),
  });
  const exactCsp = response.headers.get("content-security-policy");
  assert.ok(exactCsp);
  assert.equal(
    exactCsp.split("; ").find((directive) => directive.startsWith("form-action ")),
    `form-action ${BOOTSTRAP}`,
  );
  assert.match(exactCsp, /(?:^|; )script-src 'nonce-[A-Za-z0-9_-]{32}'(?:;|$)/);

  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.equal(applySecurityHeaders(
      securityRequest(),
      response,
      "owner",
      { contentSecurityPolicy: "route-owned" },
    ), response);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }

  assert.equal(response.headers.get("content-security-policy"), exactCsp);
  assert.equal(response.headers.get("permissions-policy"), "camera=(), geolocation=(), microphone=()");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-dns-prefetch-control"), "off");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-permitted-cross-domain-policies"), "none");
  assert.equal(response.headers.get("strict-transport-security"), "max-age=15552000; includeSubDomains");

  const responseWithoutCsp = applySecurityHeaders(
    securityRequest(),
    new Response(),
    "owner",
    { contentSecurityPolicy: "route-owned" },
  );
  assert.equal(responseWithoutCsp.headers.has("content-security-policy"), false);
  assert.equal(responseWithoutCsp.headers.get("x-content-type-options"), "nosniff");
});

test("default Owner, admin, and storefront CSP behavior remains unchanged", () => {
  const owner = applySecurityHeaders(securityRequest(), new Response(), "owner");
  const admin = applySecurityHeaders(securityRequest(), new Response(), "admin");
  const storefront = applySecurityHeaders(securityRequest(), new Response(), "storefront");
  assert.equal(
    owner.headers.get("content-security-policy"),
    "base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self';",
  );
  assert.equal(admin.headers.get("content-security-policy"), owner.headers.get("content-security-policy"));
  assert.equal(
    storefront.headers.get("content-security-policy"),
    "base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self' https:;",
  );
});

test("Owner middleware delegates CSP only for the exact public registration pathname", () => {
  const source = readFileSync(resolve(ROOT, "apps/owner/middleware.ts"), "utf8");
  assert.match(source, /OWNER_PUBLIC_REGISTRATION_PATH\s*=\s*"\/api\/self-serve\/register"/);
  assert.match(source, /pathname\s*===\s*OWNER_PUBLIC_REGISTRATION_PATH[\s\S]{0,180}contentSecurityPolicy:\s*"route-owned"/);
  assert.doesNotMatch(source, /default-src 'none'|form-action 'none'|nonce-/);
});

test("Owner middleware delegates only the two exact internal HMAC paths before legacy auth", () => {
  const source = readFileSync(resolve(ROOT, "apps/owner/middleware.ts"), "utf8");
  assert.match(source, /import\s*\{[\s\S]*PANEL_BROWSER_BINDING_INTERNAL_PATH[\s\S]*SELF_SERVE_INTERNAL_CALLBACK_PATH[\s\S]*\}\s*from\s*"@celebix\/platform-config\/src\/saas"/);
  assert.match(
    source,
    /const INTERNAL_HMAC_PATHS\s*=\s*new Set\(\[[\s\S]*PANEL_BROWSER_BINDING_INTERNAL_PATH[\s\S]*SELF_SERVE_INTERNAL_CALLBACK_PATH[\s\S]*\]\)/,
  );
  assert.match(
    source,
    /function isInternalHmacRoute\(pathname:\s*string\)[\s\S]{0,160}INTERNAL_HMAC_PATHS\.has\(pathname\)/,
  );

  const bypassStart = source.indexOf("if (isInternalHmacRoute(pathname))");
  const legacyEnvironmentGate = source.indexOf("const missingPublicEnv");
  assert.notEqual(bypassStart, -1);
  assert.notEqual(legacyEnvironmentGate, -1);
  assert.ok(bypassStart < legacyEnvironmentGate);
  const bypass = source.slice(bypassStart, legacyEnvironmentGate);
  assert.match(bypass, /return withSecurity\([\s\S]{0,80}nextResponse\(request\)[\s\S]{0,80}\)/);
  const bypassBody = bypass.slice(bypass.indexOf("{") + 1);
  assert.doesNotMatch(bypassBody, /validateSameOriginRequest|Supabase|cookies?|headers\.get|HMAC|signature/i);

  const classifierStart = source.indexOf("function isInternalHmacRoute");
  const classifierEnd = source.indexOf("}", classifierStart);
  const classifier = source.slice(classifierStart, classifierEnd + 1);
  assert.doesNotMatch(classifier, /startsWith|includes|match|test\(|prefix/i);

  const publicPrefixesStart = source.indexOf("const SELF_SERVE_PUBLIC_PREFIXES");
  const publicPrefixesEnd = source.indexOf("];", publicPrefixesStart);
  const publicPrefixes = source.slice(publicPrefixesStart, publicPrefixesEnd + 2);
  assert.doesNotMatch(publicPrefixes, /PANEL_BROWSER_BINDING_INTERNAL_PATH|SELF_SERVE_INTERNAL_CALLBACK_PATH|\/api\/internal\/self-serve/);
});
