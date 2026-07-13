import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as route from "./route.ts";

test("default Owner internal callback route is disabled and constructs no authority", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /createDisabledOwnerInternalSelfServeCallbackGateway/);
  assert.doesNotMatch(source, /createOwnerInternalCallbackGatewayApproval|createOwnerInternalSelfServeCallbackGateway|process\.env|\bPool\b|\bfetch\b|secret|keyMap|keys/);
  assert.equal(typeof route.GET, "function");
  assert.equal(typeof route.POST, "function");
  assert.equal((await route.GET(new Request("https://owner.example/api/internal/self-serve/oidc-callback"))).status, 405);
  let bodyReads = 0;
  const request = {
    method: "POST",
    url: "https://owner.example/api/internal/self-serve/oidc-callback",
    headers: new Headers(),
    text: async () => { bodyReads += 1; return "secret"; },
  } as Request;
  const response = await route.POST(request);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "self_serve_internal_callback_disabled" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("location"), false);
  assert.equal(bodyReads, 0);
});
