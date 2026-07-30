import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const up = readFileSync(new URL("202607300072_panel_store_options.up.sql", root), "utf8");
const down = readFileSync(new URL("202607300072_panel_store_options.down.sql", root), "utf8");
const assertions = readFileSync(new URL("202607300072_panel_store_options_assertions.sql", root), "utf8");

test("store option discovery is session-bound, entitlement-bound, canonical, and bounded", () => {
  assert.match(up, /CREATE FUNCTION saas\.list_panel_session_store_options/);
  assert.match(up, /session\.token_key_id = p_token_key_id/);
  assert.match(up, /membership\.principal_id = selected_session\.principal_id/);
  assert.match(up, /membership\.status = 'active'/);
  assert.match(up, /domain\.canonical/);
  assert.match(up, /subscription\.status = 'active'/);
  assert.match(up, /option_count > 100/);
  assert.match(up, /GRANT EXECUTE[^;]+TO celebix_saas_identity/);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|ALL)[^;]*ON\s+(?:TABLE\s+)?saas\./i);
});

test("store option migration is transactional and narrowly reversible", () => {
  for (const source of [up, down]) {
    assert.match(source, /^BEGIN;/);
    assert.match(source, /COMMIT;\s*$/);
  }
  assert.match(down, /DROP FUNCTION saas\.list_panel_session_store_options/);
  assert.match(assertions, /panel_store_options_function_missing/);
});
