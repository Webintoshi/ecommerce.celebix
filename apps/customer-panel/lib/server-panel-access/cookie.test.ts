import assert from "node:assert/strict";
import test from "node:test";

import { SUPPORT_COOKIE_NAME } from "../platform-support/policy.ts";
import { PANEL_SESSION_COOKIE_NAME } from "../session.ts";
import { resolveServerPanelSessionFromCookieStore } from "./cookie.ts";

const NOW = new Date("2026-07-16T10:00:00.000Z");
const CREDENTIAL = `v1.session.v1.${"A".repeat(43)}`;

test("server session reads only the exact persistent panel cookie and forwards it unchanged", async () => {
  const cookieReads: string[] = [];
  const resolutions: unknown[] = [];
  const result = await resolveServerPanelSessionFromCookieStore({
    cookieStore: {
      get(name) {
        cookieReads.push(name);
        return name === PANEL_SESSION_COOKIE_NAME ? { value: CREDENTIAL } : undefined;
      },
    },
    requestId: "request-cookie",
    now: NOW,
    hostname: "admin.example.test",
    async resolve(input) {
      resolutions.push(input);
      return Object.freeze({ kind: "unauthenticated" as const });
    },
  });
  assert.deepEqual(result, { kind: "unauthenticated" });
  assert.deepEqual(cookieReads, ["__Host-celebix_support", "__Host-celebix_panel"]);
  assert.deepEqual(resolutions, [{ credential: CREDENTIAL, requestId: "request-cookie", now: NOW, hostname: "admin.example.test" }]);
});

test("missing, Owner, alternate, and local cookies do not initialize or reach durable authority", async () => {
  const resolutions: unknown[] = [];
  await resolveServerPanelSessionFromCookieStore({
    cookieStore: {
      get(name) {
        assert.ok([PANEL_SESSION_COOKIE_NAME, SUPPORT_COOKIE_NAME].includes(name));
        return undefined;
      },
    },
    requestId: "request-isolation",
    now: NOW,
    async resolve(input) {
      resolutions.push(input);
      return Object.freeze({ kind: "unauthenticated" as const });
    },
  });
  assert.deepEqual(resolutions, []);
});

 test("support cookie takes a separate server authority path and wins over merchant session",async()=>{let forwarded:unknown;await resolveServerPanelSessionFromCookieStore({cookieStore:{get(name){return {value:name===SUPPORT_COOKIE_NAME?'a'.repeat(64):CREDENTIAL};}},requestId:'support-request',hostname:'admin.example.test',now:NOW,async resolve(input){forwarded=input;return {kind:'unauthorized'};}});assert.deepEqual(forwarded,{credential:'support:'+'a'.repeat(64),requestId:'support-request',hostname:'admin.example.test',now:NOW});});
