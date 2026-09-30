import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const up = () => read("202609300178_section_homepage_v4.up.sql");
const down = () => read("202609300178_section_homepage_v4.down.sql");

test("178 reader migration preserves live documents and established mutation interfaces", () => {
  const source = up();
  assert.doesNotMatch(source, /UPDATE saas\.storefront_designs|CREATE(?: OR REPLACE)? FUNCTION saas\.storefront_design_(?:publish|save_draft)\(/);
  assert.match(source, /CHECK\(schema_version IN \(4,5\)\)/);
  assert.match(source, /pg_get_functiondef/);
});

test("178 rollback rejects lossy downgrade and restores exact deployed definitions", () => {
  assert.match(down(), /SECTION_HOMEPAGE_V4_DOWN_DATA_PRESENT/);
  assert.match(down(), /EXECUTE selected\.definition/);
  assert.ok(down().indexOf("SECTION_HOMEPAGE_V4_DOWN_DATA_PRESENT") < down().indexOf("EXECUTE selected.definition"));
  for (const sql of [up(), down()]) {
    assert.match(sql, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
    assert.match(sql, /LOCK TABLE saas\.storefront_designs IN EXCLUSIVE MODE/);
    assert.match(sql, /COMMIT;\s*$/);
  }
});

test("178 disposable verification exercises tenant references and no fixed count limit", () => {
  const source = read("../../../../../tests/saas-phase3/design-section-apply/postgres-harness.mjs");
  for (const term of ["length:50", "foreign products", "repeated categories", "legacy URL injection", "rollback refuses"]) assert.ok(source.includes(term), term);
  assert.match(read("202609300178_section_homepage_v4_assertions.sql"), /has_function_privilege/);
});
