// Read-only observations through the existing documented cua_repl browser handle.
// This is isolated snapshot UI evidence, not a live tenant or CDN acceptance.
import assert from "node:assert/strict";

export async function measureResolvedPreview(tab) {
  assert.equal(new URL(await tab.url()).origin, "http://127.0.0.1:3427");
  assert.equal(new URL(await tab.url()).pathname, "/design-settings-fix");
  const result = await tab.playwright.evaluate(() => {
    const canvas = document.querySelector('[aria-label$="mağaza tasarım tuvali"]');
    const content = document.querySelector('[aria-label="Ana sayfa bölümleri önizlemesi"]');
    const rows = [...(content?.querySelectorAll('[data-campaign-product-row="true"]') ?? [])];
    return {
      width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      canvasWidth: canvas?.getBoundingClientRect().width,
      text: content?.textContent,
      rows: rows.map(row => ({
        heading: row.querySelector('h2')?.textContent,
        width: row.getBoundingClientRect().width,
        cards: [...row.querySelectorAll('article')].map(card => ({
          title: card.querySelector('h3')?.textContent,
          width: card.getBoundingClientRect().width,
          display: getComputedStyle(card).display,
        })),
      })),
      media: [...(content?.querySelectorAll('img') ?? [])].map(img => ({
        alt: img.alt, url: img.currentSrc, complete: img.complete,
        loaded: img.complete && img.naturalWidth > 0,
      })),
    };
  });
  assert.equal(result.scrollWidth, result.width, "No document horizontal overflow");
  assert.ok(result.canvasWidth > 0 && result.canvasWidth <= result.width);
  assert.equal(result.rows.length, 2, "Both synthetic PG-backed rows are retained");
  for (const row of result.rows) {
    assert.ok(row.width > 0 && row.width <= result.canvasWidth);
    assert.equal(row.cards.length, 1, "Exact exported PG snapshot has one product per row");
    assert.equal(row.cards[0].title, "Gerçek Kolye");
    assert.ok(row.cards[0].width > 0 && row.cards[0].display !== "none");
  }
  assert.ok(!result.text.includes("Örnek ürün"));
  // Deliberately report loaded=false rather than treating URL resolution as CDN success.
  return result;
}
