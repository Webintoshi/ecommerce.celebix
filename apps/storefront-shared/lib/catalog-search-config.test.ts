import assert from "node:assert/strict";
import test from "node:test";
async function parser() {
  const module = await import("./catalog-search-config.ts").catch(() => ({})) as { parseCatalogSearchConfig?: Function };
  assert.equal(typeof module.parseCatalogSearchConfig, "function"); return module.parseCatalogSearchConfig!;
}
const env = { CELEBIX_SEARCH_URL: "http://celebix-catalog-search:7700", CELEBIX_SEARCH_API_KEY: "s".repeat(64), CELEBIX_SEARCH_WRITE_API_KEY: "w".repeat(64), CELEBIX_SEARCH_WORKER_ENABLED: "true" };
test("search configuration separates search/write credentials and defaults shared index", async () => {
  const parse = await parser();
  assert.deepEqual(parse({}), null);
  assert.equal(parse(env).apiKey, env.CELEBIX_SEARCH_API_KEY);
  assert.equal(parse(env, "worker").apiKey, env.CELEBIX_SEARCH_WRITE_API_KEY);
  assert.equal(parse(env).index, "celebix_products_v1");
  assert.equal(parse({ ...env, CELEBIX_SEARCH_WORKER_ENABLED: "false" }, "worker"), null);
  assert.throws(() => parse({ ...env, CELEBIX_SEARCH_URL: "http://public.example.com" }));
  assert.throws(() => parse({ ...env, CELEBIX_SEARCH_URL: "http://user:secret@celebix-catalog-search:7700" }));
  assert.throws(() => parse({ ...env, CELEBIX_SEARCH_API_KEY: "" }));
});
