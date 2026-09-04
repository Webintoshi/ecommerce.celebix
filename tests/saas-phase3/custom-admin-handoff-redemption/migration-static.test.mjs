import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../../../", import.meta.url);
const read = (name) => readFile(new URL(`apps/owner/scripts/sql/saas/${name}`, ROOT), "utf8");

const UP = "202609040125_custom_admin_handoff_redemption.up.sql";
const DOWN = "202609040125_custom_admin_handoff_redemption.down.sql";
const ASSERTIONS = "202609040125_custom_admin_handoff_redemption_assertions.sql";

test("migration 125 permits redemption on an active custom admin alias", async () => {
  const up = await read(UP);
  assert.match(up, /CREATE OR REPLACE FUNCTION saas\.redeem_cross_host_panel_handoff/u);
  assert.match(up, /domain\.hostname = handoff\.destination_hostname/u);
  assert.match(up, /domain\.status = 'active'/u);
  assert.doesNotMatch(up, /domain\.canonical/u);
});

test("migration 125 is reversible only to the prior canonical-host policy", async () => {
  const down = await read(DOWN);
  assert.match(down, /CREATE OR REPLACE FUNCTION saas\.redeem_cross_host_panel_handoff/u);
  assert.match(down, /domain\.canonical/u);
  assert.doesNotMatch(down, /DROP (?:TABLE|SCHEMA)/u);
});

test("migration 125 preserves identity-only execution authority", async () => {
  const assertions = await read(ASSERTIONS);
  assert.match(assertions, /CUSTOM_ADMIN_HANDOFF_REDEMPTION_/u);
  assert.match(assertions, /celebix_saas_identity/u);
  assert.match(assertions, /has_function_privilege\('public'/u);
});
