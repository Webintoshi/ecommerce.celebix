import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
const upUrl = new URL("./202609260164_toshi_conversations.up.sql", import.meta.url), downUrl = new URL("./202609260164_toshi_conversations.down.sql", import.meta.url);
const up = existsSync(upUrl) ? readFileSync(upUrl, "utf8") : "", down = existsSync(downUrl) ? readFileSync(downUrl, "utf8") : "";
test("new conversation authority migration protects tenant, actor, lease, replay and private tables", () => {
 assert.ok(up.length > 0); assert.match(up, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/); assert.match(up, /COMMIT;\s*$/);
 for (const name of ["conversations", "messages", "generation_operations", "generation_events"]) {
  assert.match(up, new RegExp(`CREATE TABLE saas[.]toshi_${name}`));
  assert.match(up, new RegExp(`ALTER TABLE saas[.]toshi_${name} FORCE ROW LEVEL SECURITY`));
 }
 for (const name of ["list", "get", "begin_turn", "complete_turn", "fail_turn", "recover_turn"]) assert.match(up, new RegExp(`CREATE FUNCTION saas[.]toshi_conversation_${name}\\(`));
 assert.match(up, /toshi_provider_authority_error/); assert.match(up, /principal_id=p_principal_id/); assert.match(up, /interval '120 seconds'/); assert.match(up, /attempts >= 6/); assert.match(up, /version >= 100/);
 assert.match(up, /credential_version<>op[.]credential_version/); assert.match(up, /toshi_provider_model_available/); assert.match(up, /payload_fingerprint<>p_fingerprint/); assert.match(up, /LIMIT 40/); assert.match(up, /LIMIT 20/);
 assert.doesNotMatch(up, /ALTER TABLE saas[.]toshi_provider|DISABLE ROW LEVEL SECURITY|DROP TABLE/);
});
test("rollback refuses real conversation history and never cascades", () => {
 assert.ok(down.length > 0); assert.match(down, /TOSHI_CONVERSATIONS_ROLLBACK_DATA_PRESENT/); assert.doesNotMatch(down, /CASCADE|DELETE FROM|TRUNCATE/i);
 for (const name of ["conversations", "messages", "generation_operations", "generation_events"]) assert.match(down, new RegExp(`FROM saas[.]toshi_${name}`));
});
