import assert from "node:assert/strict";
import test from "node:test";

import { FIXED_STOREFRONT_POLICIES } from "@celebix/saas-contracts";
import { normalizeProductDescriptionRichText } from "@celebix/platform-config/src/product-description-rich-text.ts";
import { act, createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compile, mounted } from "../../lib/mira-final-test-support.ts";
import { StorePolicyApiError } from "../../lib/store-policy-ui/client.ts";

type PreviewProps = Readonly<{ source?: string | null; emptyMessage?: string }>;
const richText = { normalizeProductDescriptionRichText };

function preview(): ComponentType<PreviewProps> {
  return compile("components/catalog/ProductDescriptionPreview.tsx", {
    "@celebix/platform-config/src/product-description-rich-text": richText,
  }).ProductDescriptionPreview;
}

test("HTML line breaks and separators render without invalid React children", () => {
  const html = renderToStaticMarkup(createElement(preview(), {
    source: "<p>İlk satır<br>İkinci satır</p><hr><p>Son paragraf</p>",
  }));
  assert.match(html, /İlk satır<br\s*\/>İkinci satır/);
  assert.match(html, /<hr\s*\/>/);
  assert.match(html, /<p>Son paragraf<\/p>/);
});

test("Markdown hard breaks and separators retain their document structure", () => {
  const html = renderToStaticMarkup(createElement(preview(), {
    source: "## Koşullar\n\nİlk satır\\\nİkinci satır\n\n---\n\n**Son paragraf**",
  }));
  assert.match(html, /<h2>Koşullar<\/h2>/);
  assert.match(html, /İlk satır<br\s*\/>\s*İkinci satır/);
  assert.match(html, /<hr\s*\/>/);
  assert.match(html, /<strong>Son paragraf<\/strong>/);
});

test("rendered preview preserves safe links and escaped text while excluding executable markup", async () => {
  const source = '<p onclick="alert(1)">&lt;script&gt; görünen metin <strong>kalın</strong></p>'
    + '<script>alert(1)</script><img src="/private.webp" onerror="alert(1)">'
    + '<p><a href="javascript:alert(1)">Güvensiz bağlantı</a> '
    + '<a href="/products">Ürünler</a> <a href="https://example.test/help">Yardım</a></p>';
  await mounted(preview(), { source }, async (host) => {
    assert.match(host.textContent ?? "", /<script> görünen metin kalın/);
    assert.equal(host.querySelector("script, img, [onclick], [onerror]"), null);
    assert.equal(host.querySelector('a[href^="javascript:"]'), null);
    assert.equal(host.querySelector('a[href="/products"]')?.getAttribute("target"), null);
    const external = host.querySelector('a[href="https://example.test/help"]');
    assert.equal(external?.getAttribute("target"), "_blank");
    assert.equal(external?.getAttribute("rel"), "noopener noreferrer nofollow");
    assert.equal(host.querySelector("strong")?.textContent, "kalın");
  });
});

test("empty content uses its supplied message", () => {
  const html = renderToStaticMarkup(createElement(preview(), { source: "", emptyMessage: "Henüz metin yok." }));
  assert.match(html, /Henüz metin yok[.]/);
  assert.doesNotMatch(html, /product-description-rich-text/);
});

test("policy console loads and switches real previews containing line breaks without saving", async () => {
  const Preview = preview();
  const now = "2026-11-02T09:00:00.000Z";
  const policies = FIXED_STOREFRONT_POLICIES.map((definition, index) => ({
    ...definition,
    ordinal: index + 1,
    status: "published",
    body: `<p>${definition.label}<br>İkinci satır</p><hr><p>Son paragraf</p>`,
    version: 2,
    createdAt: now,
    updatedAt: now,
  }));
  let saves = 0;
  const BodyField = ({ value }: { value: string }) => createElement("textarea", {
    "aria-label": "Politika metni", value, readOnly: true,
  });
  const { PolicyConsole } = compile("components/content/PolicyConsole.tsx", {
    "@celebix/platform-config/src/product-description-rich-text": richText,
    "@/components/catalog/ProductDescriptionPreview": { ProductDescriptionPreview: Preview },
    "@/lib/store-policy-ui/client": {
      StorePolicyApiError,
      storePolicyApi: { list: async () => policies, save: async () => { saves++; throw new Error("Unexpected policy save"); } },
    },
    "./PolicyAuthoringPanel": { PolicyAuthoringPanel: () => null },
    "next/dynamic": { __esModule: true, default: () => BodyField },
  });
  await mounted(PolicyConsole, { canManage: true, embedded: true, recoveryScope: "preview-void-elements-regression" }, async (host) => {
    assert.ok(host.querySelector('[aria-label="Politika çalışma alanı"]'));
    const first = host.querySelector("#policy-preview");
    assert.equal(first?.hidden, true, "the console also renders its initially hidden preview");
    assert.equal(first?.querySelectorAll("br").length, 1);
    assert.equal(first?.querySelectorAll("hr").length, 1);
    await act(async () => (host.querySelector('button[data-policy-key="distance_sales"]') as HTMLButtonElement).click());
    assert.match(host.querySelector("#policy-preview")?.textContent ?? "", /Mesafeli Satış Sözleşmesi/);
    assert.equal(host.querySelector("#policy-preview br")?.parentElement?.tagName, "P");
    assert.equal(host.querySelector("#policy-preview hr")?.tagName, "HR");
    assert.equal((host.querySelector('textarea[aria-label="Politika metni"]') as HTMLTextAreaElement).value, policies[1].body);
    assert.equal(saves, 0);
  });
});
