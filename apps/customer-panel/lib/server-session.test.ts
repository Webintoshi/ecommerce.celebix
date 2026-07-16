import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the Next server-session bridge delegates only to durable cookie access", () => {
  const source = readFileSync(new URL("./server-session.ts", import.meta.url), "utf8");
  assert.match(source, /import "server-only";/);
  assert.match(source, /resolveServerPanelSessionFromCookieStore/);
  assert.match(source, /resolveDefaultServerPanelAccess/);
  assert.doesNotMatch(source, /DisabledPanelSessionStore|resolvePanelSession|PANEL_LOCAL_TEST_SESSION_COOKIE_NAME/);
  assert.doesNotMatch(source, /headers\(|authorization|x-forwarded|forwarded|referer|origin|host/i);
});
