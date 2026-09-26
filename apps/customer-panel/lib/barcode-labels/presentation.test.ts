import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postcss, { type AtRule, type Container, type Document } from "postcss";

const ROOT = new URL("../../", import.meta.url);
const STYLESHEET = new URL("components/catalog-admin/barcode-label-studio.css", ROOT);

// The stylesheet is imported globally. A studio change must not restyle another
// catalog screen, the shell, or an unrelated .button/.field-row consumer.
test("barcode presentation rules stay inside their owning studio", async () => {
  const stylesheet = postcss.parse(await readFile(STYLESHEET, "utf8"));
  let rules = 0;
  stylesheet.walkRules((rule) => {
    let ancestor: Container | Document | undefined = rule.parent;
    while (ancestor) {
      if (ancestor.type === "atrule" && /keyframes$/i.test((ancestor as AtRule).name)) return;
      ancestor = ancestor.parent;
    }
    for (const selector of rule.selectors) {
      assert.match(
        selector.trim(),
        /^\.barcode-studio(?:$|\s+[^\s+~])/,
        `Rule escapes the barcode studio: ${selector}`,
      );
      assert.doesNotMatch(selector, /:global\(/, `Global escape: ${selector}`);
    }
    rules += 1;
  });
  assert.ok(rules > 0, "The studio stylesheet must contain presentation rules");
  stylesheet.walkAtRules((rule) => {
    assert.ok(!/^(?:import|font-face|property|page|counter-style)$/i.test(rule.name), `Global stylesheet side effect: @${rule.name}`);
  });
});

test("barcode workspace keeps one accessible page identity and avoids decorative glow", async () => {
  const [component, css] = await Promise.all([
    readFile(new URL("components/catalog-admin/BarcodeLabelStudio.tsx", ROOT), "utf8"),
    readFile(STYLESHEET, "utf8"),
  ]);
  const headings = component.match(/<h1\b[^>]*>/g) ?? [];
  assert.equal(headings.length, 1, "The workspace needs one semantic page heading");
  assert.match(headings[0]!, /className="barcode-sr-only"/);
  assert.doesNotMatch(headings[0]!, /aria-hidden(?:=|\s)/);
  const stylesheet = postcss.parse(css);
  stylesheet.walkDecls((declaration) => {
    assert.doesNotMatch(declaration.value, /(?:linear|radial|conic)-gradient\(|\bblur\(/i, `Decorative effect in ${declaration.prop}`);
  });
});
