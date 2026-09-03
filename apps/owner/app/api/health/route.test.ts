import assert from "node:assert/strict";
import test from "node:test";

test("Owner public health is cache-safe and reports the disabled optional dependency", async () => {
  const route = await import("./route.ts");
  const response = await route.GET(new Request("https://owner.celebix.site/api/health"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", dependencies: { redisCache: { status: "disabled", metrics: null } } });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("Owner health rejects query-bearing probes", async () => {
  const route = await import("./route.ts");
  assert.equal((await route.GET(new Request("https://owner.celebix.site/api/health?debug=1"))).status, 404);
});
