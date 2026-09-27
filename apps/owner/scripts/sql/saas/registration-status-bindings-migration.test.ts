import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import test from "node:test";
test("migration creates distinct restricted status persistence with bounded cleanup",()=>{
 const file=new URL("./202609270168_registration_status_bindings.up.sql",import.meta.url);assert.ok(existsSync(file));const sql=readFileSync(file,"utf8");
 assert.match(sql,/create_panel_browser_bootstrap/);assert.match(sql,/registration_authority_scopes/);assert.match(sql,/FORCE ROW LEVEL SECURITY/);assert.match(sql,/interval '24 hours'/);assert.match(sql,/interval '1 hour'/);assert.doesNotMatch(sql,/DELETE FROM saas\.(?:registration_workflows|registration_verified_identities|registration_onboarding_jobs)/);
});
