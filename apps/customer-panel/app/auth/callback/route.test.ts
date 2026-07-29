import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as route from "./route.ts";

test("default callback route exports GET only and remains disabled without reading a body", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /createDisabledCustomerPanelSelfServeCallbackEdge/);
  assert.doesNotMatch(source, /registration-completion|session\.ts/);
  assert.equal(typeof route.GET, "function");
  assert.equal("POST" in route, false);
  let bodyReads = 0;
  const request = {
    method: "GET",
    url: "https://panel.celebix.site/auth/callback?state=state_0123456789abcdefghijklmnop&code=code",
    headers: new Headers(),
    text: async () => { bodyReads += 1; return "secret"; },
  } as Request;
  const response = await route.GET(request);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "panel_auth_disabled" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("location"), false);
  assert.equal(bodyReads, 0);
});
