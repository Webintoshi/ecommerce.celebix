import assert from "node:assert/strict";
import test from "node:test";

import { renderStarterProductDescription } from "./product-description.ts";

test("starter product descriptions use the shared safe Markdown renderer", () => {
  const html = renderStarterProductDescription(
    "## Ürün bilgileri\\n\\n- **14 ayar** altın\\n- 2.16 gram",
    "Altın Yüzük",
  );
  const attack = renderStarterProductDescription("<script>alert('x')</script>");

  assert.match(html, /<h2>Ürün bilgileri<\/h2>/);
  assert.match(html, /<strong>14 ayar<\/strong>/);
  assert.match(html, /<li>2[.]16 gram<\/li>/);
  assert.doesNotMatch(html, /<script|\\n/i);
  assert.doesNotMatch(attack, /<script|alert/i);
});
