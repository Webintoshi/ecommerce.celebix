import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tsSource = readFileSync(new URL("./light-postgres-compat.ts", import.meta.url), "utf8");
const cjsSource = readFileSync(new URL("./light-postgres-compat.cjs", import.meta.url), "utf8");

function getFunctionBlock(source, name) {
  const start = source.indexOf(name);
  assert.notEqual(start, -1, `${name} bulunamadi`);
  const nextFunction = source.indexOf("\n  private async", start + name.length);
  const nextCjsFunction = source.indexOf("\n  async", start + name.length);
  const candidates = [nextFunction, nextCjsFunction].filter((index) => index > start);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

test("light postgres product inserts surface database errors as Supabase-style errors", () => {
  assert.match(tsSource, /function normalizeCompatDbError/);
  assert.match(cjsSource, /function normalizeCompatDbError/);

  for (const [label, source] of [
    ["ts", tsSource],
    ["cjs", cjsSource],
  ]) {
    const block = getFunctionBlock(source, "insertRows()");
    assert.match(block, /try\s*\{/u, `${label} insertRows db query should be guarded`);
    assert.match(block, /catch\s*\(\s*error\s*\)/u, `${label} insertRows should catch db errors`);
    assert.match(block, /normalizeCompatDbError\(error\)/u, `${label} insertRows should normalize db errors`);
    assert.match(block, /data:\s*null/u, `${label} insertRows should return null data on db error`);
  }
});

test("light postgres product updates surface database errors as Supabase-style errors", () => {
  for (const [label, source] of [
    ["ts", tsSource],
    ["cjs", cjsSource],
  ]) {
    const block = getFunctionBlock(source, "updateRows()");
    assert.match(block, /try\s*\{/u, `${label} updateRows db query should be guarded`);
    assert.match(block, /catch\s*\(\s*error\s*\)/u, `${label} updateRows should catch db errors`);
    assert.match(block, /normalizeCompatDbError\(error\)/u, `${label} updateRows should normalize db errors`);
    assert.match(block, /data:\s*null/u, `${label} updateRows should return null data on db error`);
  }
});
