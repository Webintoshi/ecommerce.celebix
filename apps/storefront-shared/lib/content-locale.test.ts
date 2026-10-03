import assert from "node:assert/strict";
import test from "node:test";
import { blogIndexPath, contentPath, publicContentPath, selectContentLocale } from "./content-locale.ts";

const locales = { defaultLocale: "tr", enabledLocales: ["tr", "en-US"] } as const;
test("content locale chooses only exact enabled languages and canonical paths", () => {
  assert.equal(selectContentLocale(locales, undefined), "tr");
  assert.equal(selectContentLocale(locales, "en-US"), "en-US");
  for (const bad of ["en", "tr-TR", ["tr", "en-US"], "../tr", "<xml>"]) assert.equal(selectContentLocale(locales, bad), null);
  assert.equal(contentPath("page", "hakkimizda", "tr", "tr"), "/pages/hakkimizda");
  assert.equal(contentPath("page", "about", "en-US", "tr"), "/pages/about?lang=en-US");
  assert.equal(contentPath("blog_post", "news", "en-US", "tr"), "/blog/news?lang=en-US");
  assert.equal(blogIndexPath("tr", "tr"), "/blog");
  assert.equal(blogIndexPath("en-US", "tr", "abc"), "/blog?lang=en-US&cursor=abc");
  assert.throws(() => contentPath("page", "../escape", "tr", "tr"));
});

test("only the server-owned Blog page maps to the localized blog index", () => {
  const page = { kind: "page", slug: "magazadan-haberler", locale: "en-US", requiredPageKey: "blog" } as const;
  assert.equal(publicContentPath(page, "tr"), "/blog?lang=en-US");
  assert.equal(publicContentPath({ ...page, locale: "tr" }, "tr"), "/blog");
  assert.equal(publicContentPath({ kind: "page", slug: "blog", locale: "tr" }, "tr"), "/pages/blog");
  assert.equal(publicContentPath({ ...page, requiredPageKey: "about" }, "tr"), "/pages/magazadan-haberler?lang=en-US");
  assert.equal(publicContentPath({ kind: "blog_post", slug: "news", locale: "en-US" }, "tr"), "/blog/news?lang=en-US");
  assert.throws(() => publicContentPath({ ...page, kind: "blog_post" }, "tr"));
  assert.throws(() => publicContentPath({ ...page, slug: "../news" }, "tr"));
});
