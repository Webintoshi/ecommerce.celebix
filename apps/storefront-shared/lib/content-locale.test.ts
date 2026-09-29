import assert from "node:assert/strict";
import test from "node:test";
import { blogIndexPath, contentPath, selectContentLocale } from "./content-locale.ts";

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
