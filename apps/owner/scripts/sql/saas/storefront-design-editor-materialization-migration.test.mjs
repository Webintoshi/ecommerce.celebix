import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const stem = "202610020199_storefront_design_editor_materialization";
const file = (suffix) => new URL(`${stem}${suffix}`, root);
const source = (suffix) => existsSync(file(suffix)) ? readFileSync(file(suffix), "utf8") : "";
const baseline = readFileSync(new URL("202609300179_storefront_design_direct_apply.up.sql", root), "utf8");
const oldBody = baseline.match(/CREATE FUNCTION saas\.storefront_design_editor_payload\(p_store_id uuid\)[\s\S]*?AS \$f\$([\s\S]*?)\$f\$;/)[1];
const newBody = oldBody.replace("\n SELECT pg_catalog.jsonb_build_object(", "\n WITH workspace AS MATERIALIZED (SELECT saas.storefront_design_workspace_payload(p_store_id) payload)\n SELECT pg_catalog.jsonb_build_object(").replace(" CROSS JOIN LATERAL (SELECT saas.storefront_design_workspace_payload(p_store_id) payload) workspace", " CROSS JOIN workspace");
const hash = (body) => createHash("sha256").update(body).digest("hex");

test("199 ships a guarded reversible optimization for the existing private editor function", () => {
  for (const suffix of [".up.sql", ".down.sql", "_assertions.sql"]) assert.equal(existsSync(file(suffix)), true, `${suffix} is missing`);
  const up = source(".up.sql"), down = source(".down.sql");
  assert.ok(up.includes(hash(oldBody)), "up must reject any unexpected existing function source");
  assert.ok(up.includes(hash(newBody)), "up must verify the exact optimized source");
  assert.ok(down.includes(hash(newBody)), "down must refuse to overwrite subsequent changes");
  assert.ok(down.includes(hash(oldBody)), "down must restore the exact previous source");
  for (const sql of [up, down]) {
    assert.match(sql, /pg_catalog\.pg_get_functiondef\(target\)/);
    assert.match(sql, /to_jsonb\(before_function\)-'prosrc'/);
    assert.match(sql, /prosecdef/);
    assert.match(sql, /provolatile<>'s'/);
    assert.match(sql, /aclexplode/);
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|GRANT|REVOKE|ALTER TABLE)\b/i);
    assert.doesNotMatch(sql, /CREATE(?: OR REPLACE)? FUNCTION saas\.(?:resolve_effective_variant_price|storefront_design_workspace_payload)/);
  }
});

test("199 verification keeps the exact source and owner-only stable definer authority", () => {
  const sql = source("_assertions.sql");
  assert.ok(sql.includes(hash(newBody)));
  assert.match(sql, /^BEGIN READ ONLY;/);
  assert.match(sql, /proowner/);
  assert.match(sql, /proconfig/);
  assert.match(sql, /aclexplode/);
});
