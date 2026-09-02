import assert from "node:assert/strict";
import test from "node:test";

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
  assert.deepEqual(cookieReads, ["__Host-celebix_panel"]);
  assert.deepEqual(resolutions, [{ credential: CREDENTIAL, requestId: "request-cookie", now: NOW, hostname: "admin.example.test" }]);
});

test("missing, Owner, alternate, and local cookies do not initialize or reach durable authority", async () => {
  const resolutions: unknown[] = [];
  await resolveServerPanelSessionFromCookieStore({
    cookieStore: {
      get(name) {
        assert.equal(name, PANEL_SESSION_COOKIE_NAME);
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
