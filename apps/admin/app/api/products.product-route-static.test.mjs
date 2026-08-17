import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(new URL("./products/route.ts", import.meta.url), "utf8");

function getSetInitializer(source, name) {
  const match = source.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(match, `${name} set initializer bulunamadi`);
  return match[1];
}

test("product create retries can strip storefront badge columns for older light postgres stores", () => {
  const optionalColumns = getSetInitializer(routeSource, "OPTIONAL_PRODUCT_COLUMNS");

  for (const column of ["is_featured", "is_bestseller"]) {
    assert.match(
      optionalColumns,
      new RegExp(`"${column}"`),
      `${column} eksik kolon hatasinda payload'dan dusurulebilmeli`,
    );
  }
});
