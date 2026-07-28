import assert from "node:assert/strict";
import test from "node:test";

type ProductDescriptionModule = typeof import("./product-description-rich-text");

const moduleUrl = new URL("./product-description-rich-text.ts", import.meta.url).href;
const {
  extractPlainTextFromProductDescription,
  normalizeProductDescriptionHtml,
} = await import(moduleUrl) as ProductDescriptionModule;

test("renders supported product Markdown through the safe semantic allowlist", () => {
  const html = normalizeProductDescriptionHtml(`# Deri Çanta

**Dayanıklı** ve *hafif*.

- Birinci özellik
- İkinci özellik

| Ölçü | Değer |
| --- | --- |
| En | 30 cm |

~~Eski bilgi~~ ve \`stok kodu\`.`);

  assert.match(html, /<h2>Deri Çanta<\/h2>/);
  assert.match(html, /<strong>Dayanıklı<\/strong>/);
  assert.match(html, /<em>hafif<\/em>/);
  assert.match(html, /<ul>[\s\S]*<li>Birinci özellik<\/li>/);
  assert.match(html, /<table>[\s\S]*<th>Ölçü<\/th>[\s\S]*<td>30 cm<\/td>/);
  assert.match(html, /<del>Eski bilgi<\/del>/);
  assert.match(html, /<code>stok kodu<\/code>/);
});

test("keeps safe links and removes executable product-description authority", () => {
  const links = normalizeProductDescriptionHtml(`[Kılavuz](https://docs.example.com/product?q=1)

[Göreli](/yardim) [Tehlikeli](javascript:alert(1))`);
  const attack = normalizeProductDescriptionHtml(
    '<script>alert("x")</script><img src=x onerror=alert(1)>',
  );

  assert.match(
    links,
    /href="https:\/\/docs[.]example[.]com\/product[?]q=1" target="_blank" rel="noopener noreferrer nofollow"/,
  );
  assert.match(links, /href="\/yardim"/);
  assert.doesNotMatch(links, /href="javascript:/i);
  assert.doesNotMatch(attack, /<script|<img|onerror=/i);
});

test("extracts readable plain text from Markdown without presentation punctuation", () => {
  const plain = extractPlainTextFromProductDescription(
    "## Başlık\n\n- **Bir**\n- İki\n\n[Detay](/detay)",
  );

  assert.match(plain, /Başlık/);
  assert.match(plain, /• Bir/);
  assert.match(plain, /Detay/);
  assert.doesNotMatch(plain, /##|\*\*|\]\(/);
});

test("preserves existing plain text and sanitized legacy HTML behavior", () => {
  assert.equal(
    normalizeProductDescriptionHtml("Sade açıklama"),
    "<p>Sade açıklama</p>",
  );
  assert.equal(
    normalizeProductDescriptionHtml(
      '<p>Güvenli <strong>metin</strong></p><script>sil</script>',
    ),
    "<p>Güvenli <strong>metin</strong></p>",
  );
});
