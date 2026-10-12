import assert from "node:assert/strict";
import test from "node:test";
import type { PublicStarterThemePresentationV3, RequiredPageKey } from "@celebix/saas-contracts";
import type { PublicContentLocales, PublicContentV2, PublicStorefrontContentRepository } from "@celebix/saas-data";

import { mergePublishedRequiredPageFooterGroups, readPublishedRequiredPageFooterLinks } from "./footer-required-pages.ts";

const HOST = "store.example.test";
const NOW = new Date("2026-10-12T10:00:00.000Z");
type FooterGroups = PublicStarterThemePresentationV3["footer"]["groups"];
const DEFAULT_LOCALES = { defaultLocale: "tr", enabledLocales: ["tr", "en-US"] };
function page(key: RequiredPageKey, values: Partial<PublicContentV2> = {}): PublicContentV2 {
  return {
    id: "71000000-0000-4000-8000-000000000001", kind: "page", requiredPageKey: key,
    slug: key === "about" ? "bizim-hikayemiz" : key === "contact" ? "bize-ulasin" : "magaza-haberleri",
    locale: "tr", title: key === "about" ? "Bizim hikâyemiz" : key === "contact" ? "Bize ulaşın" : "Mağazadan haberler",
    body: "<p>Mağazamızı keşfedin.</p>", bodyFormat: "normalized_html", excerpt: null,
    seoTitle: null, seoDescription: null, publishedAt: NOW.toISOString(), updatedAt: NOW.toISOString(), ...values,
  };
}
function repository(readers: Partial<Pick<PublicStorefrontContentRepository, "getLocales" | "getRequiredPage">> = {}): PublicStorefrontContentRepository {
  return {
    listPolicies: async () => [], getPolicy: async () => { throw new Error("not used"); },
    search: async () => { throw new Error("not used"); }, resolveProductIds: async () => [],
    getLocales: async () => DEFAULT_LOCALES,
    getRequiredPage: async ({ key }) => page(key), ...readers,
  };
}

test("published required footer links use current titles, adopted slugs and the Blog index", async () => {
  const result = await readPublishedRequiredPageFooterLinks(repository(), HOST, NOW);
  assert.deepEqual(result, [
    { label: "Bizim hikâyemiz", destination: "/pages/bizim-hikayemiz" },
    { label: "Bize ulaşın", destination: "/pages/bize-ulasin" },
    { label: "Mağazadan haberler", destination: "/blog" },
  ]);
  assert.equal(Object.isFrozen(result), true);
  assert.ok(result.every(Object.isFrozen));
});

test("the read is bounded to one locale and three parallel pages with the same trusted host and time", async () => {
  const calls: unknown[] = [];
  let active = 0, peak = 0;
  const source = repository({
    getLocales: async (input) => { calls.push(input); return { defaultLocale: "en-US", enabledLocales: ["en-US"] }; },
    getRequiredPage: async (input) => {
      calls.push(input); active++; peak = Math.max(peak, active);
      await new Promise<void>(resolve => setImmediate(resolve));
      active--;
      return page(input.key, { locale: "en-US" });
    },
  });
  assert.equal((await readPublishedRequiredPageFooterLinks(source, HOST, NOW)).length, 3);
  assert.deepEqual(calls, [
    { hostname: HOST, now: NOW },
    { hostname: HOST, now: NOW, key: "about", locale: "en-US" },
    { hostname: HOST, now: NOW, key: "contact", locale: "en-US" },
    { hostname: HOST, now: NOW, key: "blog", locale: "en-US" },
  ]);
  assert.equal(peak, 3);
});

test("older readers never invent fallback page links or perform partial reads", async () => {
  let calls = 0;
  for (const source of [
    repository({ getRequiredPage: undefined, getLocales: async () => { calls++; return DEFAULT_LOCALES; } }),
    repository({ getLocales: undefined, getRequiredPage: async ({ key }) => { calls++; return page(key); } }),
  ]) assert.deepEqual(await readPublishedRequiredPageFooterLinks(source, HOST, NOW), []);
  assert.equal(calls, 0);
});

test("failed, malformed or disabled default locales stop before required page reads", async () => {
  let pageReads = 0;
  for (const locales of [null, {}, { defaultLocale: "invalid_locale", enabledLocales: ["invalid_locale"] }, { defaultLocale: "tr", enabledLocales: ["en-US"] }]) {
    const source = repository({ getLocales: async () => locales as unknown as PublicContentLocales,
      getRequiredPage: async ({ key }) => { pageReads++; return page(key); } });
    assert.deepEqual(await readPublishedRequiredPageFooterLinks(source, HOST, NOW), []);
  }
  assert.deepEqual(await readPublishedRequiredPageFooterLinks(repository({ getLocales: async () => { throw new Error("unavailable"); } }), HOST, NOW), []);
  assert.equal(pageReads, 0);
});

test("one missing or unavailable page does not hide the other published pages", async () => {
  const source = repository({ getRequiredPage: async ({ key }) => {
    if (key === "about") throw new Error("unavailable");
    return page(key);
  } });
  assert.deepEqual(await readPublishedRequiredPageFooterLinks(source, HOST, NOW), [
    { label: "Bize ulaşın", destination: "/pages/bize-ulasin" },
    { label: "Mağazadan haberler", destination: "/blog" },
  ]);
});

test("draft, wrong identity, wrong locale, invalid path and missing labels are excluded", async () => {
  const wrong: Partial<PublicContentV2>[] = [
    { publishedAt: null }, { publishedAt: undefined }, { publishedAt: "" }, { publishedAt: " " },
    { publishedAt: "invalid" }, { kind: "blog_post" }, { requiredPageKey: "contact" },
    { requiredPageKey: undefined }, { locale: "en-US" }, { slug: "../../private" },
    { title: " \t" },
  ];
  for (const values of wrong) {
    const result = await readPublishedRequiredPageFooterLinks(repository({ getRequiredPage: async ({ key }) => page(key, key === "about" ? values : {}) }), HOST, NOW);
    assert.deepEqual(result.map(link => link.destination), ["/pages/bize-ulasin", "/blog"]);
  }
});

test("empty editor markup and whitespace entities do not advertise blank pages", async () => {
  for (const body of ["", " \n\t", "<p><br></p>", "<p>&nbsp;&#160;&#xA0;&ensp;&emsp;&thinsp;</p>", "<p>\u00a0\u2009\u200b</p>", "<script>private()</script>", '<p><a href="/other"></a></p>']) {
    const source = repository({ getRequiredPage: async ({ key }) => {
      if (key !== "about") throw new Error("not_found");
      return page(key, { body, bodyFormat: "legacy" });
    } });
    assert.deepEqual(await readPublishedRequiredPageFooterLinks(source, HOST, NOW), [], body);
  }
});

test("plain text, entity punctuation and safe rich content remain meaningful", async () => {
  for (const values of [
    { body: "İletişim bilgileri", bodyFormat: "legacy" as const },
    { body: "<p>&amp;</p>", bodyFormat: "normalized_html" as const },
    { body: "<p><strong>Mağaza</strong></p>", bodyFormat: "normalized_html" as const },
  ]) {
    const source = repository({ getRequiredPage: async ({ key }) => {
      if (key !== "about") throw new Error("not_found");
      return page(key, values);
    } });
    assert.deepEqual(await readPublishedRequiredPageFooterLinks(source, HOST, NOW), [{ label: "Bizim hikâyemiz", destination: "/pages/bizim-hikayemiz" }]);
  }
});

test("invalid saved body is isolated without propagating rendering errors", async () => {
  const result = await readPublishedRequiredPageFooterLinks(repository({ getRequiredPage: async ({ key }) => page(key, key === "about" ? { body: '<p onclick="private()">Invalid</p>' } : {}) }), HOST, NOW);
  assert.deepEqual(result.map(link => link.destination), ["/pages/bize-ulasin", "/blog"]);
});

test("automatic links append to Mağaza without changing custom links, policies or inputs", async () => {
  const groups: FooterGroups = [
    { heading: "Keşfet", links: [{ label: "Ürünler", destination: "/products" }] },
    { heading: "Mağaza", links: [{ label: "Özel bağlantı", destination: "/special" }] },
    { heading: "Politikalar", links: [{ label: "KVKK", destination: "/policies/kvkk" }] },
  ];
  const before = JSON.stringify(groups);
  const result = mergePublishedRequiredPageFooterGroups(groups, [{ label: "Hakkımızda", destination: "/pages/about" }, { label: "Blog", destination: "/blog" }]);
  assert.deepEqual(result, [
    groups[0], { heading: "Mağaza", links: [...groups[1]!.links, { label: "Hakkımızda", destination: "/pages/about" }, { label: "Blog", destination: "/blog" }] }, groups[2],
  ]);
  assert.equal(JSON.stringify(groups), before);
  assert.equal(Object.isFrozen(result), true);
  assert.ok(result.every(group => Object.isFrozen(group) && Object.isFrozen(group.links) && group.links.every(Object.isFrozen)));
});

test("existing destinations win across every group and duplicate automatic links are added once", async () => {
  const groups: FooterGroups = [{ heading: "Özel", links: [{ label: "Benim blogum", destination: "/blog" }] }];
  assert.deepEqual(mergePublishedRequiredPageFooterGroups(groups, [
    { label: "Blog", destination: "/blog" }, { label: "Hakkımızda", destination: "/pages/about" }, { label: "Tekrar", destination: "/pages/about" },
  ]), [...groups, { heading: "Mağaza", links: [{ label: "Hakkımızda", destination: "/pages/about" }] }]);
  assert.deepEqual(mergePublishedRequiredPageFooterGroups(groups, [{ label: "Blog", destination: "/blog" }]), groups);
  assert.deepEqual(mergePublishedRequiredPageFooterGroups([], []), []);
});
