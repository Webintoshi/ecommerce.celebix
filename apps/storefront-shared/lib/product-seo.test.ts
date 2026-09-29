import assert from "node:assert/strict";
import test from "node:test";
import { resolveProductSeo } from "./product-seo.ts";
test("saved SEO feeds title and description with one exact brand suffix", () => {
  assert.deepEqual(resolveProductSeo({ title: "Visible", seoTitle: "Saved | Pilot", seoDescription: "Custom copy" }, "Pilot"), { title: "Saved | Pilot", description: "Custom copy" });
  assert.equal(resolveProductSeo({ title: "Visible", seoTitle: "Saved | Pilot | Pilot" }, "Pilot").title, "Saved | Pilot");
});
test("empty SEO falls back to safe plain text without active HTML", () => {
  assert.deepEqual(resolveProductSeo({ title: "Visible", seoTitle: "  ", seoDescription: null, description: '<p>Soft &amp; <strong>cotton</strong></p><script>secret()</script><p>Care</p>' }, "Pilot"), { title: "Visible | Pilot", description: "Soft & cotton Care" });
  assert.equal(resolveProductSeo({ title: "Visible", description: "<script>hidden</script>" }, "Pilot").description, "Visible ürün ayrıntıları");
});

test("description fallback normalizes the storefront Markdown before plain text", () => {
  assert.equal(resolveProductSeo({ title: "Visible", description: "**Soft** [cotton](https://example.test)" }, "Pilot").description, "Soft cotton");
});
