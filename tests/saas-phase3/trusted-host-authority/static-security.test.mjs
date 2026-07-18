import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../../../apps/storefront-shared/lib/storefront-app.ts", import.meta.url),
  "utf8",
);
const authoritySource = await readFile(
  new URL("../../../apps/storefront-shared/lib/trusted-host-authority.ts", import.meta.url),
  "utf8",
).catch(() => "");
const configSource = await readFile(
  new URL("../../../packages/platform-config/src/storefront-proxy.ts", import.meta.url),
  "utf8",
).catch(() => "");
const routeSource = await readFile(
  new URL("../../../apps/storefront-shared/app/[[...storefrontPath]]/route.ts", import.meta.url),
  "utf8",
);

test("storefront application no longer reads raw Host authority", () => {
  assert.doesNotMatch(appSource, /headers\.get\(["']host["']\)/i);
  assert.doesNotMatch(appSource, /selectTrustedHostHeader/);
  assert.match(appSource, /trustedHostAuthority/);
});

test("trusted adapter authenticates fixed proxy headers with constant-time token comparison", () => {
  assert.match(authoritySource, /x-celebix-storefront-proxy/i);
  assert.match(authoritySource, /x-forwarded-host/i);
  assert.match(authoritySource, /x-forwarded-proto/i);
  assert.match(authoritySource, /timingSafeEqual/);
  assert.doesNotMatch(authoritySource, /headers\.get\(["']host["']\)/i);
  assert.doesNotMatch(authoritySource, /["'](?:forwarded|x-original-host|x-host)["']/i);
});

test("authority implementation contains no logging or production activation", () => {
  const source = `${authoritySource}\n${configSource}`;
  assert.doesNotMatch(source, /console\.|logger\.|production.*approved_staging|NODE_ENV/);
  assert.doesNotMatch(source, /p1\.[A-Za-z0-9_-]{20,}/);
});

test("checkpoint route rejects every authenticated hostname through the exact resolver boundary", () => {
  assert.match(routeSource, /createStorefrontRequestHandler\s*\(\s*\{/);
  assert.match(routeSource, /StorefrontResolutionError\s*\(\s*["']host_not_found["']/);
  assert.doesNotMatch(routeSource, /InMemoryStoreDomainResolver|headers\.get\(["']host["']\)|console\./);
});
