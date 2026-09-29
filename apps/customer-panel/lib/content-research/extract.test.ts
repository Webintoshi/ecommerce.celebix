import assert from "node:assert/strict";
import test from "node:test";

import { ContentResearchExtractError, extractContentResearchText } from "./extract.ts";

function code(expected: ContentResearchExtractError["code"]) {
  return (caught: unknown) => caught instanceof ContentResearchExtractError && caught.code === expected;
}

test("HTML extraction keeps visible prose and a bounded title without executing markup", () => {
  (globalThis as { __researchExecuted?: boolean }).__researchExecuted = false;
  const result = extractContentResearchText({
    mediaType: "text/html",
    text: '<!doctype html><html><head><title>Türkçe &amp; Mücevher</title><style>.x{display:none}</style></head><body><nav>Catalog menu</nav><h1>14 ayar yüzük</h1><p>Gram: 14,89. &amp; bilgi.</p><script>globalThis.__researchExecuted=true</script><template>Template secret</template><form><label>Account secret</label></form><div hidden>Hidden note</div><div aria-hidden="true">Aria secret</div><div style="display:none">Styled secret</div><p>Görünür son satır.</p></body></html>',
  });
  assert.equal(result.title, "Türkçe & Mücevher");
  assert.match(result.text, /14 ayar yüzük/);
  assert.match(result.text, /Gram: 14,89\. & bilgi\./);
  assert.match(result.text, /Görünür son satır/);
  for (const excluded of ["Catalog menu", "Template secret", "Account secret", "Hidden note", "Aria secret", "Styled secret", "__researchExecuted", ".x{"]) assert.equal(result.text.includes(excluded), false);
  assert.equal((globalThis as { __researchExecuted?: boolean }).__researchExecuted, false);
});

test("plain text extraction preserves Unicode and rejects empty evidence", () => {
  const result = extractContentResearchText({ mediaType: "text/plain", text: "  Altın ürün bilgisi  \n\n  Ölçü 14,89 gram.  " });
  assert.equal(result.title, "Altın ürün bilgisi");
  assert.equal(result.text, "Altın ürün bilgisi\nÖlçü 14,89 gram.");
  assert.throws(() => extractContentResearchText({ mediaType: "text/plain", text: " \n\t " }), code("content_research_extraction_invalid"));
});

test("extraction rejects rather than truncates 12,000 UTF-8 bytes", () => {
  assert.equal(new TextEncoder().encode(extractContentResearchText({ mediaType: "text/plain", text: "a".repeat(12_000) }).text).byteLength, 12_000);
  assert.throws(() => extractContentResearchText({ mediaType: "text/plain", text: "a".repeat(12_001) }), code("content_research_extraction_too_large"));
  assert.throws(() => extractContentResearchText({ mediaType: "text/html", text: `<p>${"é".repeat(6_001)}</p>` }), code("content_research_extraction_too_large"));
  assert.throws(() => extractContentResearchText({ mediaType: "text/plain", text: "a".repeat(524_289) }), code("content_research_extraction_too_large"));
});

test("HTML parser rejects excessive depth, node count, and malformed Unicode", () => {
  assert.throws(() => extractContentResearchText({ mediaType: "text/html", text: `${"<div>".repeat(65)}x${"</div>".repeat(65)}` }), code("content_research_extraction_invalid"));
  assert.throws(() => extractContentResearchText({ mediaType: "text/html", text: `<p>${"<b></b>".repeat(20_001)}</p>` }), code("content_research_extraction_invalid"));
  assert.throws(() => extractContentResearchText({ mediaType: "text/plain", text: "bad\ud800" }), code("content_research_extraction_invalid"));
});

test("decoded HTML entities cannot smuggle control characters into title or evidence", () => {
  assert.throws(() => extractContentResearchText({ mediaType: "text/html", text: "<title>Shop&#x1b;Title</title><p>Visible.</p>" }), code("content_research_extraction_invalid"));
  assert.throws(() => extractContentResearchText({ mediaType: "text/html", text: "<title>Shop</title><p>Visible&#x1b; evidence.</p>" }), code("content_research_extraction_invalid"));
});

test("a whitespace-only HTML title falls back to the first visible heading", () => {
  const result = extractContentResearchText({ mediaType: "text/html", text: "<head><title>  &nbsp; </title></head><body><h1>14 ayar yüzük</h1><p>Ürün bilgisi.</p></body>" });
  assert.equal(result.title, "14 ayar yüzük");
});
