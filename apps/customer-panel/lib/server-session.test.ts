import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the Next server-session bridge delegates durable cookie and direct Host authority only", () => {
  const source = readFileSync(new URL("./server-session.ts", import.meta.url), "utf8");
  assert.match(source, /import "server-only";/);
  assert.match(source, /resolveServerPanelSessionFromCookieStore/);
  assert.match(source, /resolveDefaultServerPanelAccess/);
  assert.doesNotMatch(source, /DisabledPanelSessionStore|resolvePanelSession|PANEL_LOCAL_TEST_SESSION_COOKIE_NAME/);
  assert.match(source, /headers\(\)/u);
  assert.match(source, /get\("host"\)/u);
  assert.doesNotMatch(source, /authorization|x-forwarded|forwarded|referer|origin/i);
});
