import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./ProductWizard.tsx", import.meta.url), "utf8");

function getFunctionBlock(name) {
  const start = source.indexOf(`const ${name} =`);
  assert.notEqual(start, -1, `${name} bulunamadi`);
  const end = source.indexOf("\n  const ", start + name.length + 7);
  return source.slice(start, end > start ? end : source.length);
}

test("quick product creation requires a category before saving", () => {
  const block = getFunctionBlock("validateQuickCreate");

  assert.match(block, /if\s*\(\s*!formData\.category\s*\)/);
  assert.match(block, /Kategori secilmelidir|Kategori seçilmelidir/u);
});
