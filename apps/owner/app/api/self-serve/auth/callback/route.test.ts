import assert from "node:assert/strict";
import test from "node:test";

type RouteModule = typeof import("./route");
const route = await import(new URL("./route.ts", import.meta.url).href).catch(
  () => ({} as Partial<RouteModule>),
);

test("legacy Owner callback is disabled without redirect or panel cookie", async () => {
  assert.equal(typeof route.GET, "function");
  if (!route.GET) return;
  const response = await route.GET(new Request(
    "https://ecommerce.celebix.co/api/self-serve/auth/callback?state=unsafe&code=unsafe",
  ));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "panel_callback_required" });
  assert.equal(response.headers.has("location"), false);
  assert.equal(response.headers.has("set-cookie"), false);
});
