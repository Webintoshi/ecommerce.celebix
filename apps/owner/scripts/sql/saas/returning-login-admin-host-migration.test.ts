import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const up = readFileSync(new URL("202607300071_returning_login_admin_host.up.sql", root), "utf8");
const down = readFileSync(new URL("202607300071_returning_login_admin_host.down.sql", root), "utf8");
const assertions = readFileSync(new URL("202607300071_returning_login_admin_host_assertions.sql", root), "utf8");

test("returning login is bound to one verified canonical admin host and active membership", () => {
  assert.match(up, /CREATE FUNCTION saas\.issue_returning_panel_session_for_admin_host/);
  assert.match(up, /domain\.hostname = p_destination_hostname/);
  assert.match(up, /domain\.status = 'active'/);
  assert.match(up, /domain\.canonical/);
  assert.match(up, /membership\.status = 'active'/);
  assert.match(up, /store\.status = 'active'/);
  assert.match(up, /saas\.issue_panel_session/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas\.issue_returning_panel_session_for_admin_host[^;]+TO celebix_saas_identity/);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*ON\s+(?:TABLE\s+)?saas\.admin_domains/i);
});

test("migration rollback and assertions cover only the new bounded functions", () => {
  assert.match(assertions, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
  assert.match(assertions, /COMMIT;\s*$/);
  assert.match(down, /DROP FUNCTION saas\.recover_returning_panel_session_for_admin_host/);
  assert.match(down, /DROP FUNCTION saas\.issue_returning_panel_session_for_admin_host/);
  assert.match(assertions, /returning_login_admin_host_functions_missing/);
  for (const source of [up, down]) {
    assert.match(source, /^BEGIN;/);
    assert.match(source, /COMMIT;\s*$/);
    assert.doesNotMatch(source, /postgres(?:ql)?:\/\//i);
  }
});
