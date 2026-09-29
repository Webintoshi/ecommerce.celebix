import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicBlogPage, publicContentSeo } from "./blog-page.ts";

const article = { id: "11000000-0000-4000-8000-000000000001", kind: "blog_post", slug: "duyuru", locale: "en-US", title: "News", body: "<p>Helpful content</p>", bodyFormat: "normalized_html", excerpt: "Short excerpt", seoTitle: "News | Store", seoDescription: "A saved description", publishedAt: "2026-09-29T00:00:00.000Z", updatedAt: "2026-09-29T00:00:00.000Z" } as const;
test("blog detail uses exact locale canonical, saved SEO and safe rich body", () => {
  const page = buildPublicBlogPage(article, "duyuru", "tr");
  assert.equal(page.route, "/blog/duyuru?lang=en-US");
  assert.match(page.html, /Helpful content/);
  assert.deepEqual(publicContentSeo(article, "Store"), { title: "News | Store", description: "A saved description" });
  assert.throws(() => buildPublicBlogPage(article, "other", "tr"));
});
test("content SEO strips markup from legacy text and adds brand once", () => {
  assert.deepEqual(publicContentSeo({ ...article, seoTitle: null, seoDescription: null, excerpt: null, body: "<p>Soft &amp; kind</p><script>secret()</script>" }, "Store"), { title: "News | Store", description: "Soft & kind" });
});
test("content SEO keeps a long rich body out of the meta description", () => {
  const body = `<p>${"kelime ".repeat(11_428)}</p>`;
  const seo = publicContentSeo({ ...article, seoDescription: null, excerpt: null, body }, "Store");
  assert.equal(seo.description, "kelime ".repeat(34).trim());
  assert.ok(seo.description.length <= 240);
});
test("content SEO leaves a saved description untouched when the body is long", () => {
  const saved = "Kaydedilmiş açıklama ".repeat(25).trim();
  assert.equal(publicContentSeo({ ...article, seoDescription: saved, body: "kelime ".repeat(11_428) }, "Store").description, saved);
});
test("V2 normalized blog HTML retains intentional empty paragraphs", () => {
  const body = "<p>A</p><p></p><p>B</p>";
  assert.equal(buildPublicBlogPage({ ...article, body }, "duyuru", "tr").html, body);
  assert.doesNotMatch(buildPublicBlogPage({ ...article, bodyFormat:"legacy",body:"<p>Old</p><script>secret()</script>" }, "duyuru", "tr").html,/script|secret/);
});
