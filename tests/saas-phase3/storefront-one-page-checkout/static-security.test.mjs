import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const storefrontRoot = path.join(repositoryRoot, "apps/storefront-shared");

async function present(relative) {
  try {
    await access(path.join(repositoryRoot, relative));
    return true;
  } catch {
    return false;
  }
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const values = await Promise.all(entries.map(async (entry) => {
    const selected = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(selected);
    if (!entry.isFile() || !/[.](?:ts|tsx|css)$/.test(entry.name) || /[.]test[.]/.test(entry.name)) {
      return [];
    }
    return [selected];
  }));
  return values.flat();
}

test("fixed checkout owns every exact page and API route", async () => {
  for (const relative of [
    "apps/storefront-shared/app/odeme/page.tsx",
    "apps/storefront-shared/app/odeme/sonuc/page.tsx",
    "apps/storefront-shared/app/api/checkout/quote/route.ts",
    "apps/storefront-shared/app/api/checkout/delivery/route.ts",
    "apps/storefront-shared/app/api/checkout/submit/route.ts",
    "apps/storefront-shared/app/api/checkout/status/route.ts",
  ]) {
    assert.equal(await present(relative), true, relative);
  }
});

test("fixed checkout production surface has no legacy, theme, or browser database dependency", async () => {
  const roots = [
    path.join(storefrontRoot, "app/odeme"),
    path.join(storefrontRoot, "app/api/checkout"),
    path.join(storefrontRoot, "components/checkout"),
  ];
  const files = (await Promise.all(roots.map(sourceFiles))).flat();
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /\bsupabase\b/i, file);
    assert.doesNotMatch(source, /apps\/storefront-base/, file);
    assert.doesNotMatch(source, /\b(?:Header|Footer)\b/, file);
    assert.doesNotMatch(source, /\bthemeKey\b/, file);
    assert.doesNotMatch(source, /postgres(?:ql)?:\/\/|CELEBIX_SAAS_DATABASE_URL/, file);
    assert.doesNotMatch(source, /dangerouslySetInnerHTML/, file);
    for (const inline of source.matchAll(/<script\b([^>]*)>/gi)) {
      assert.match(inline[1] ?? "", /\bnonce=/, file);
    }
  }
});

test("result page never reads query-supplied payment or order state", async () => {
  const source = await readFile(
    path.join(storefrontRoot, "app/odeme/sonuc/page.tsx"),
    "utf8",
  );
  assert.doesNotMatch(source, /searchParams|URLSearchParams|[?&](?:paid|status|order)=/);
  assert.match(source, /resolveCheckoutResult/);
});

test("proxy gives checkout HTML and APIs exact private response protections", async () => {
  const [{ createStorefrontProxy }, { NextRequest }] = await Promise.all([
    import(path.join(storefrontRoot, "proxy.ts")),
    import("next/server.js"),
  ]);
  const handler = createStorefrontProxy({
    selectAuthority: () => ({ kind: "trusted", hostname: "shop.example.test" }),
    resolveMediaOrigin: () => "https://media.example.test",
    authorizePaytrIframe: async () => false,
    now: () => new Date("2026-07-29T12:00:00.000Z"),
    resolveAnalytics: async () => ({
      scriptOrigin: "https://analytics.example.test",
      collectorOrigin: "https://analytics.example.test",
    }),
  });

  for (const pathname of [
    "/odeme",
    "/odeme/sonuc",
    "/api/checkout/quote",
    "/api/checkout/delivery",
    "/api/checkout/submit",
    "/api/checkout/status",
  ]) {
    const response = await handler(new NextRequest(`https://internal.example${pathname}`));
    assert.equal(response.headers.get("cache-control"), "no-store", pathname);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow", pathname);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer", pathname);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff", pathname);
    assert.equal(response.headers.get("x-frame-options"), "DENY", pathname);
    const csp = response.headers.get("content-security-policy") ?? "";
    assert.match(csp, /script-src 'nonce-[^']+' 'strict-dynamic'/, pathname);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/, pathname);
    assert.match(csp, /frame-ancestors 'none'/, pathname);
  }

  const catalog = await handler(new NextRequest("https://internal.example/products"));
  assert.equal(
    catalog.headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
  );

  const denied = createStorefrontProxy({
    selectAuthority: () => ({ kind: "invalid" }),
    resolveMediaOrigin: () => { throw new Error("must not be called"); },
    authorizePaytrIframe: async () => false,
    now: () => new Date("2026-07-29T12:00:00.000Z"),
  });
  for (const pathname of ["/odeme", "/api/checkout/status"]) {
    const response = await denied(new NextRequest(`https://internal.example${pathname}`));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store", pathname);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow", pathname);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer", pathname);
    assert.match(
      response.headers.get("content-security-policy") ?? "",
      /frame-ancestors 'none'/,
      pathname,
    );
  }
});
