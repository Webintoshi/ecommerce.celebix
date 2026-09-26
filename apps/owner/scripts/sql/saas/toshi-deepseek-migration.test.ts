import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
const root = new URL("./", import.meta.url);
const upName = "202609260163_toshi_deepseek_provider.up.sql";
const downName = "202609260163_toshi_deepseek_provider.down.sql";
const load = (name: string) => existsSync(new URL(name, root)) ? readFileSync(new URL(name, root), "utf8") : "";
const up = load(upName), down = load(downName);
const functions = ["public_payload", "connection_identity", "connect", "select_model", "set_default", "revoke", "get_authority", "list", "envelope_valid"];

test("DeepSeek migration widens only nine guarded Toshi functions and two provider constraints", () => {
  assert.ok(up.length > 0);
  assert.match(up, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
  assert.match(up, /COMMIT;\s*$/);
  for (const name of functions) assert.match(up, new RegExp(`saas[.]toshi_provider_${name}\\(`));
  assert.equal((up.match(/'[a-f0-9]{32}'/g) ?? []).length, 9);
  assert.match(up, /pg_catalog[.]md5\(definition\) <> target[.]expected_md5/);
  assert.match(up, /TOSHI_DEEPSEEK_PREDECESSOR_DRIFT/);
  assert.match(up, /TOSHI_DEEPSEEK_REPLACEMENT_COUNT_INVALID/);
  assert.match(up, /'openai','gemini','anthropic','deepseek'/);
  assert.match(up, /BETWEEN 2 AND 21846/);
  assert.match(up, /CREATE FUNCTION saas[.]toshi_provider_list_v2/);
  assert.match(up, /c[.]provider <> ''deepseek''/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas[.]toshi_provider_list_v2/);
  assert.match(up, /REVOKE ALL ON FUNCTION saas[.]toshi_provider_list_v2/);
  assert.match(up, /WHEN ''deepseek'' THEN ''DeepSeek''/);
  for (const table of ["configs", "events"]) assert.match(up, new RegExp(`ALTER TABLE saas[.]toshi_provider_${table} DROP CONSTRAINT toshi_provider_${table}_provider_check`));
  assert.doesNotMatch(up, /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO|FROM|saas\.)|DISABLE ROW LEVEL SECURITY/i);
});

test("DeepSeek rollback refuses persisted config, event and replay history before restoring exact predecessors", () => {
  assert.ok(down.length > 0);
  assert.match(down, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
  assert.match(down, /TOSHI_DEEPSEEK_ROLLBACK_DATA_PRESENT/);
  for (const table of ["configs", "events", "operations"]) assert.match(down, new RegExp(`FROM saas[.]toshi_provider_${table}`));
  assert.match(down, /result_payload->>'provider' = 'deepseek'/);
  assert.match(down, /TOSHI_DEEPSEEK_ROLLBACK_DRIFT/);
  assert.equal((down.match(/'[a-f0-9]{32}'/g) ?? []).length, 10);
  assert.doesNotMatch(down, /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO|FROM|saas\.)|DROP TABLE/i);
  assert.match(down, /DROP FUNCTION saas[.]toshi_provider_list_v2/);
  assert.match(down, /TOSHI_DEEPSEEK_ROLLBACK_V2_DRIFT/);
  assert.match(down, /COMMIT;\s*$/);
});

test("original Toshi vault migration stays unchanged", () => {
  assert.equal(createHash("sha256").update(load("202608020080_toshi_provider_connections.up.sql")).digest("hex"), "ec64900d106da8e052d266887fe3187a004dced54888b4fdcb331417b4ec04b8");
});
