import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./products/route.ts", import.meta.url), "utf8");

test("product route treats merchandising flags as optional staging DB columns", () => {
  const optionalColumnsMatch = source.match(/const OPTIONAL_PRODUCT_COLUMNS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(optionalColumnsMatch, "OPTIONAL_PRODUCT_COLUMNS set should exist");
  const optionalColumns = optionalColumnsMatch[1];
  assert.match(optionalColumns, /"is_featured"/);
  assert.match(optionalColumns, /"is_bestseller"/);
  assert.match(source, /stripUnsupportedTableColumn\([\s\S]+productInsertPayload[\s\S]+OPTIONAL_PRODUCT_COLUMNS/);
  assert.match(source, /stripUnsupportedTableColumn\([\s\S]+productUpdatePayload[\s\S]+OPTIONAL_PRODUCT_COLUMNS/);
});
