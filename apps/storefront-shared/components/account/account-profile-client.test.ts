import assert from "node:assert/strict";
import test from "node:test";

import { completeAccountProfile, createAccountProfileAttempt } from "./account-profile-client.ts";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const fields = { firstName: "Ada", lastName: "Yılmaz", returnTo: "/checkout" };

test("an uncertain save keeps its operation ID for unchanged names and rotates it when names change", () => {
  const initial = createAccountProfileAttempt(null, fields, () => firstId);
  assert.equal(createAccountProfileAttempt(initial, fields, () => secondId).operationId, firstId);
  assert.equal(createAccountProfileAttempt(initial, { ...fields, lastName: "Demir" }, () => secondId).operationId, secondId);
});

test("a completed save confirms the cookie through session before following the original safe target", async () => {
  const calls: string[] = [];
  const result = await completeAccountProfile(createAccountProfileAttempt(null, fields, () => firstId), "csrf-token", async (url, options) => {
    calls.push(String(url));
    if (String(url) === "/api/account/profile/complete") {
      assert.deepEqual(JSON.parse(String(options?.body)), { operationId: firstId, firstName: "Ada", lastName: "Yılmaz", returnTo: "/checkout" });
      return Response.json({ outcome: "completed", destination: "/checkout" });
    }
    assert.equal(options?.credentials, "same-origin");
    return Response.json({ outcome: "found", snapshot: { profile: { firstName: "Ada", lastName: "Yılmaz" }, version: 1 } });
  });
  assert.deepEqual(calls, ["/api/account/profile/complete", "/api/account/session"]);
  assert.deepEqual(result, { kind: "redirect", destination: "/checkout" });
});

test("a lost response with pending session keeps the form retryable with the same operation", async () => {
  const attempt = createAccountProfileAttempt(null, fields, () => firstId);
  const result = await completeAccountProfile(attempt, "csrf-token", async (url) => {
    if (String(url) === "/api/account/profile/complete") throw new TypeError("network lost");
    return Response.json({ outcome: "profile_required" });
  });
  assert.equal(result.kind, "retry");
  assert.equal(createAccountProfileAttempt(attempt, fields, () => secondId).operationId, firstId);
});

test("an expired registration session offers manual re-verification without sending a code", async () => {
  const calls: string[] = [];
  const result = await completeAccountProfile(createAccountProfileAttempt(null, fields, () => firstId), "csrf-token", async (url) => {
    calls.push(String(url));
    if (String(url) === "/api/account/profile/complete") throw new TypeError("network lost");
    return Response.json({ outcome: "unauthenticated" });
  });
  assert.deepEqual(calls, ["/api/account/profile/complete", "/api/account/session"]);
  assert.deepEqual(result, { kind: "reverify", href: "/account/login?returnTo=%2Fcheckout" });
});

test("session lookup failure preserves the form and reports a retryable error", async () => {
  const result = await completeAccountProfile(createAccountProfileAttempt(null, fields, () => firstId), "csrf-token", async (url) => {
    if (String(url) === "/api/account/profile/complete") return new Response("broken", { status: 200 });
    return Response.json({ code: "unavailable" }, { status: 503 });
  });
  assert.equal(result.kind, "error");
});

test("a known validation rejection keeps the names available to correct", async () => {
  let lookups = 0;
  const result = await completeAccountProfile(createAccountProfileAttempt(null, fields, () => firstId), "csrf-token", async (url) => {
    if (String(url) !== "/api/account/profile/complete") lookups++;
    return Response.json({ code: "invalid_input", message: "Bilgileri kontrol edin." }, { status: 400 });
  });
  assert.deepEqual(result, { kind: "error", message: "Bilgileri kontrol edin." });
  assert.equal(lookups, 0);
});

test("a missing CSRF cookie checks the session and offers re-verification when expired", async () => {
  const result = await completeAccountProfile(createAccountProfileAttempt(null, fields, () => firstId), "", async (url) => {
    if (String(url) === "/api/account/profile/complete") return Response.json({ code: "csrf_invalid", message: "Güvenlik doğrulaması başarısız." }, { status: 403 });
    return Response.json({ outcome: "unauthenticated" });
  });
  assert.deepEqual(result, { kind: "reverify", href: "/account/login?returnTo=%2Fcheckout" });
});
