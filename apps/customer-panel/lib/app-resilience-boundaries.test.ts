import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath: string): Promise<string> {
  try {
    return await readFile(new URL(relativePath, import.meta.url), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

const BOUNDARIES = [
  ["../app/error.tsx", "Panel geçici olarak açılamadı"],
  ["../app/not-found.tsx", "Aradığınız sayfa bulunamadı"],
] as const;

test("root resilience boundaries are standalone, branded, responsive, and authority-free", async () => {
  for (const [path, heading] of BOUNDARIES) {
    const boundary = await source(path);
    assert.notEqual(boundary, "", `${path} must exist`);
    assert.match(boundary, new RegExp(heading));
    assert.match(boundary, /var\(--panel-bg,\s*#F9F9F9\)/i);
    assert.match(boundary, /var\(--panel-sidebar,\s*#2A2A2A\)/i);
    assert.match(boundary, /var\(--panel-accent,\s*#FF6A00\)/i);
    assert.match(boundary, /@media \(max-width:\s*640px\)/);
    assert.match(boundary, /@media \(prefers-reduced-motion:\s*reduce\)/);
    assert.doesNotMatch(
      boundary,
      /PanelShell|server-access|createPanelChromeModel|TenantContext|cookies\(|headers\(|searchParams|process[.]env|localStorage|sessionStorage|dangerouslySetInnerHTML/i,
    );
  }
});

test("root loading stays absent so protected server redirects do not become streamed 200 responses", async () => {
  const loading = await source("../app/loading.tsx");
  assert.equal(loading, "");
});

test("error boundary is a client component with a safe reset and no error disclosure", async () => {
  const boundary = await source("../app/error.tsx");
  assert.match(boundary, /^"use client";/);
  assert.match(boundary, /error:\s*Error\s*&\s*\{\s*digest\?:\s*string\s*\}/);
  assert.match(boundary, /reset:\s*\(\)\s*=>\s*void/);
  assert.match(boundary, /type="button"/);
  assert.match(boundary, /onClick=\{reset\}/);
  assert.match(boundary, /href="\/"/);
  assert.match(boundary, /min-height:\s*48px/);
  assert.doesNotMatch(boundary, /console[.]|error[.](?:message|stack|cause)|\{error\}|\{error[.]/i);
});

test("not-found boundary exposes one truthful 404 recovery destination", async () => {
  const boundary = await source("../app/not-found.tsx");
  assert.match(boundary, />404</);
  assert.match(boundary, /href="\/"/);
  assert.match(boundary, /Panele dön/);
  assert.match(boundary, /min-height:\s*48px/);
  assert.doesNotMatch(boundary, /reset|window[.]history|router[.]back/);
});
