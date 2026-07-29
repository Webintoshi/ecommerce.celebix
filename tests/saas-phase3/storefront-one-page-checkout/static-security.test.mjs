import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  auditCheckoutSourceGraph,
  traceCheckoutSourceGraph,
} from "./static-source-graph.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const storefrontRoot = path.join(repositoryRoot, "apps/storefront-shared");

function cspDirective(value, name) {
  const selected = value
    .split(";")
    .map((directive) => directive.trim().split(/\s+/))
    .find(([directive]) => directive === name);
  assert.ok(selected, `missing CSP directive ${name}`);
  return selected.slice(1);
}

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

test("fixed checkout import closure has no forbidden server or browser dependency", async () => {
  const entrypoints = [
    "app/layout.tsx",
    "app/odeme/page.tsx",
    "app/odeme/sonuc/page.tsx",
    "app/api/checkout/quote/route.ts",
    "app/api/checkout/delivery/route.ts",
    "app/api/checkout/submit/route.ts",
    "app/api/checkout/status/route.ts",
  ].map((relative) => path.join(storefrontRoot, relative));
  const clientEntrypoints = [
    "components/checkout/CheckoutClient.tsx",
    "app/odeme/sonuc/CheckoutResultRefresh.tsx",
  ].map((relative) => path.join(storefrontRoot, relative));
  const graph = await traceCheckoutSourceGraph({
    rootDirectory: storefrontRoot,
    entrypoints,
    clientEntrypoints,
  });
  assert.equal(
    graph.sources.has(path.join(storefrontRoot, "lib/checkout/result-state.ts")),
    true,
  );
  assert.equal(
    graph.sources.has(path.join(storefrontRoot, "lib/analytics/events.ts")),
    true,
  );
  assert.deepEqual(auditCheckoutSourceGraph(graph), []);
});

test("import-closure gate catches forbidden mutations hidden behind local library imports", async () => {
  const virtualRoot = path.resolve("/virtual/checkout-storefront");
  const root = path.join(virtualRoot, "app/odeme/page.tsx");
  const hidden = path.join(virtualRoot, "lib/hidden.tsx");
  const cases = [
    {
      expectedCode: "forbidden_supabase_dependency",
      hiddenSource: 'import { createClient } from "@supabase/supabase-js"; export const value = createClient;',
    },
    {
      expectedCode: "forbidden_theme_dependency",
      hiddenSource: 'import Header from "@/theme/Header.tsx"; export const value = Header;',
    },
    {
      expectedCode: "forbidden_browser_database",
      hiddenSource: "export const databaseUrl = process.env.CELEBIX_SAAS_DATABASE_URL;",
    },
    {
      expectedCode: "unsafe_inline_script",
      hiddenSource: 'export function Hidden() { return <script>{"window.private = true"}</script>; }',
    },
    {
      expectedCode: "legacy_storefront_dependency",
      hiddenSource: 'import legacy from "apps/storefront-base/lib/checkout"; export const value = legacy;',
    },
    {
      expectedCode: "forbidden_theme_dependency",
      hiddenSource: 'import "@/styles/checkout.css"; export const value = true;',
      extraModules: [[
        path.join(virtualRoot, "styles/checkout.css"),
        '@import url("@/theme/global.css"); .checkout { color: black; }',
      ]],
    },
    {
      expectedCode: "unresolved_dynamic_dependency",
      hiddenSource: 'const moduleName = "./local"; export const load = () => import(moduleName);',
    },
    {
      expectedCode: "unresolved_dynamic_dependency",
      hiddenSource: 'const moduleName = "./local"; export const load = () => require(moduleName);',
    },
    {
      expectedCode: "unsafe_inline_script",
      hiddenSource: 'import React from "react"; export const node = React.createElement("script", { src: "/runtime.js" });',
    },
    {
      expectedCode: "unsafe_inline_script",
      hiddenSource: 'import React from "react"; declare const tag: string; export const node = React.createElement(tag, { src: "/runtime.js" });',
    },
    {
      expectedCode: "unsafe_inline_script",
      hiddenSource: 'import { jsx } from "react/jsx-runtime"; export const node = jsx("script", { src: "/runtime.js" });',
    },
    {
      expectedCode: "unsafe_inline_script",
      hiddenSource: 'import { jsx } from "react/jsx-runtime"; declare const tag: string; export const node = jsx(tag, { src: "/runtime.js" });',
    },
    {
      expectedCode: "unsafe_inline_script",
      hiddenSource: 'import { jsx as render } from "react/jsx-runtime"; export const node = render("script", { src: "/runtime.js" });',
    },
    {
      expectedCode: "unsafe_inline_script",
      hiddenSource: 'import React from "react"; export const node = React.createElement("script", { nonce: "fixed", src: "/runtime.js" });',
    },
    {
      expectedCode: "unsafe_inline_script",
      hiddenSource: 'import React from "react"; const nonce = "fixed"; export const node = React.createElement("script", { nonce, src: "/runtime.js" });',
    },
    {
      expectedCode: "forbidden_theme_dependency",
      hiddenSource: 'import SiteHeader from "@/layout/SiteHeader.tsx"; export const value = SiteHeader;',
    },
    {
      expectedCode: "forbidden_theme_dependency",
      hiddenSource: "export function SiteFooter() { return null; }",
    },
    {
      expectedCode: "forbidden_theme_dependency",
      hiddenSource: 'import MainHeader from "@/layout/MainHeader.tsx"; export const value = MainHeader;',
    },
    {
      expectedCode: "forbidden_theme_dependency",
      hiddenSource: "export function StoreHeader() { return null; }",
    },
    {
      expectedCode: "forbidden_theme_dependency",
      hiddenSource: 'import AppFooter from "@/layout/app-footer.tsx"; export const value = AppFooter;',
    },
    {
      expectedCode: "unresolved_dynamic_dependency",
      hiddenSource: 'import "@/styles/checkout.css"; export const value = true;',
      extraModules: [[
        path.join(virtualRoot, "styles/checkout.css"),
        "@import url(var(--runtime-theme));",
      ]],
    },
    {
      expectedCode: "unsafe_source_parse",
      hiddenSource: 'import "@/styles/invalid.css"; export const value = true;',
      extraModules: [[
        path.join(virtualRoot, "styles/invalid.css"),
        ".checkout { color: black;",
      ]],
    },
  ];
  for (const { expectedCode, hiddenSource, extraModules = [] } of cases) {
    const modules = new Map([
      [root, '"use client"; import "@/lib/hidden.tsx"; export default function Page() { return null; }'],
      [hidden, hiddenSource],
      ...extraModules,
    ]);
    const graph = await traceCheckoutSourceGraph({
      rootDirectory: virtualRoot,
      entrypoints: [root],
      clientEntrypoints: [],
      loadSource: async (file) => modules.get(file) ?? null,
    });
    assert.equal(graph.sources.has(hidden), true, expectedCode);
    assert.ok(
      auditCheckoutSourceGraph(graph).some((finding) => finding.code === expectedCode),
      expectedCode,
    );
  }
});

test("known non-script constructs and the audited Next Script component remain allowed", async () => {
  const virtualRoot = path.resolve("/virtual/checkout-safe-nonce");
  const root = path.join(virtualRoot, "app/odeme/page.tsx");
  const sources = [
    'import Script from "next/script"; declare const props: { nonce: string }; export const node = <Script nonce={props.nonce} src="/runtime.js" />;',
    'import React from "react"; export const node = React.createElement("div", { id: "safe" });',
    'import { jsx } from "react/jsx-runtime"; export const node = jsx("section", { children: "safe" });',
  ];
  for (const source of sources) {
    const graph = await traceCheckoutSourceGraph({
      rootDirectory: virtualRoot,
      entrypoints: [root],
      clientEntrypoints: [],
      loadSource: async (file) => (file === root ? source : null),
    });
    assert.equal(
      auditCheckoutSourceGraph(graph).some((finding) => finding.code === "unsafe_inline_script"),
      false,
    );
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
    if (pathname === "/odeme" || pathname === "/odeme/sonuc") {
      assert.deepEqual(
        cspDirective(csp, "connect-src"),
        ["'self'", "https://analytics.example.test"],
        pathname,
      );
    }
  }

  const withoutAnalytics = createStorefrontProxy({
    selectAuthority: () => ({ kind: "trusted", hostname: "shop.example.test" }),
    resolveMediaOrigin: () => "https://media.example.test",
    authorizePaytrIframe: async () => false,
    now: () => new Date("2026-07-29T12:00:00.000Z"),
    resolveAnalytics: async () => null,
  });
  for (const pathname of ["/odeme", "/odeme/sonuc"]) {
    const response = await withoutAnalytics(
      new NextRequest(`https://internal.example${pathname}`),
    );
    assert.deepEqual(
      cspDirective(response.headers.get("content-security-policy") ?? "", "connect-src"),
      ["'self'"],
      pathname,
    );
  }

  const catalog = await handler(new NextRequest("https://internal.example/products"));
  assert.deepEqual(
    cspDirective(catalog.headers.get("content-security-policy") ?? "", "connect-src"),
    ["https://analytics.example.test"],
  );
  assert.equal(
    catalog.headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
  );
  const inactiveCatalog = await withoutAnalytics(
    new NextRequest("https://internal.example/products"),
  );
  assert.deepEqual(
    cspDirective(
      inactiveCatalog.headers.get("content-security-policy") ?? "",
      "connect-src",
    ),
    ["'none'"],
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
