import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const up = readFileSync(new URL("202609290177_public_merchant_content.up.sql", import.meta.url), "utf8");
const down = readFileSync(new URL("202609290177_public_merchant_content.down.sql", import.meta.url), "utf8");
test("177 adds host-only public content readers without replacing existing V1 or product write functions", () => {
  for (const name of ["public_content_locale_get", "public_content_page_get_v2", "public_blog_get", "public_blog_list", "public_content_sitemap_index", "public_content_sitemap_page"]) {
    assert.match(up, new RegExp(`CREATE FUNCTION saas\\.${name}\\(`));
    assert.match(down, new RegExp(`DROP FUNCTION saas\\.${name}\\(`));
  }
  assert.doesNotMatch(up, /CREATE OR REPLACE FUNCTION saas\.(?:public_content_page_get|public_list_products|merchant_content_save)\(/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION[\s\S]*TO celebix_saas_host_resolver;/);
});

test("177 disposable Postgres exercises public SQL to repository to XML", { skip: process.env.PUBLIC_MERCHANT_CONTENT_NATIVE_POSTGRES !== "1" }, () => {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-transform-types", new URL("../../../../../tests/saas-phase3/public-merchant-content/postgres-harness.mjs", import.meta.url).pathname], { encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
  process.stdout.write(result.stdout);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS native public merchant content: [0-9]+ scenarios/);
});
