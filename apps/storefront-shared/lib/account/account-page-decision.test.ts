import assert from "node:assert/strict";
import test from "node:test";

import { accountLoginDestination, accountProfileDestination } from "./account-page-decision.ts";

test("login sends complete sessions to the original destination without another code", () => {
  assert.equal(accountLoginDestination("found", "/checkout"), "/checkout");
  assert.equal(accountLoginDestination("found", "/account/login"), "/account");
});

test("login continues pending sessions at profile and expired sessions at phone", () => {
  assert.equal(accountLoginDestination("profile_required", "/checkout"), "/account/profile?returnTo=%2Fcheckout");
  assert.equal(accountLoginDestination("unauthenticated", "/checkout"), null);
});

test("a completed profile journey resumes its target while ordinary profile visits remain editable", () => {
  assert.equal(accountProfileDestination("found", "/checkout"), "/checkout");
  assert.equal(accountProfileDestination("found", undefined), null);
  assert.equal(accountProfileDestination("found", "/account/profile"), "/account");
  assert.equal(accountProfileDestination("profile_required", "/checkout"), null);
});
