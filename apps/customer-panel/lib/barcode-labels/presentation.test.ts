import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url);

test("Mira barcode workspace neutralizes operational controls and collapses at tablet width", async () => {
  const [component, css] = await Promise.all([
    readFile(new URL("components/catalog-admin/BarcodeLabelStudio.tsx", ROOT), "utf8"),
    readFile(new URL("components/catalog-admin/barcode-label-studio.css", ROOT), "utf8"),
  ]);
  assert.equal(component.match(/<h1\b/g)?.length, 1);
  assert.match(css, /--barcode-text:\s*#2B2B2B/);
  assert.match(css, /--barcode-canvas:\s*#F8F7F5/);
  assert.match(css, /--barcode-surface:\s*#FFFDFC/);
  assert.match(css, /--barcode-border:\s*#E7E2DD/);
  assert.match(css, /\.barcode-studio \.button-primary[\s\S]{0,180}background:\s*var\(--barcode-text\)/);
  assert.match(css, /@media\s*\(max-width:\s*1024px\)[\s\S]*\.barcode-workspace[\s\S]{0,100}flex-direction:\s*column/);
  assert.match(css, /\.barcode-workspace\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /\.barcode-table-shell\s*\{[^}]*max-width:\s*100%/);
  assert.match(css, /\.barcode-studio \.eyebrow[\s\S]{0,100}color:\s*#667085/i);
  assert.match(css, /@media\s*\(max-width:\s*480px\)[\s\S]*\.barcode-steps button\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /\.barcode-toolbar input,[\s\S]{0,300}min-height:\s*44px/);
  assert.doesNotMatch(css, /\.internal-report[\s\S]{0,180}#eef2ff/i);
});
