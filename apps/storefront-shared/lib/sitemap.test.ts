import assert from "node:assert/strict";
import test from "node:test";
import { renderSitemapIndex, renderSitemapPage } from "./sitemap.ts";

const time = "2026-09-29T12:00:00.000Z";
test("sitemap index and URL entries use the tenant origin and actual configured frequency", () => {
  assert.match(renderSitemapIndex("https://shop.example.test/", [{ kind: "products", page: 0 }, { kind: "content", page: 0 }]), /https:\/\/shop\.example\.test\/sitemaps\/content\/0/);
  const xml = renderSitemapPage("https://shop.example.test/", [{ path: "/pages/about?lang=en-US", updatedAt: time, changeFrequency: "monthly" }, { path: "/urun/ring", updatedAt: time, changeFrequency: "monthly" }]);
  assert.match(xml, /about\?lang=en-US/);
  assert.equal((xml.match(/<changefreq>monthly<\/changefreq>/g) ?? []).length, 2);
});
test("sitemap renderer rejects hostile paths, invalid frequency and duplicate entries", () => {
  for (const path of ["https://evil.test/", "/pages/x&<evil>", "//evil.test", "/pages/../secret"]) assert.throws(() => renderSitemapPage("https://shop.example.test/", [{ path, updatedAt: time, changeFrequency: "weekly" }]));
  assert.throws(() => renderSitemapPage("https://shop.example.test/", [{ path: "/pages/about", updatedAt: time, changeFrequency: "hostile<xml>" as never }]));
  assert.throws(() => renderSitemapPage("https://shop.example.test/", [{ path: "/pages/about", updatedAt: time, changeFrequency: "weekly" }, { path: "/pages/about", updatedAt: time, changeFrequency: "weekly" }]));
  assert.throws(() => renderSitemapIndex("http://shop.example.test/", []));
});
