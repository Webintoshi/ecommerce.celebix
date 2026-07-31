import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");
const SQL = "apps/owner/scripts/sql/saas/";

test("policy and search manifest pins every artifact", () => {
  const manifest = JSON.parse(read(`${SQL}phase4a-storefront-policy-search-manifest.json`));
  assert.equal(manifest.postgresqlMajor, 16);
  for (const artifact of [...manifest.artifacts, ...manifest.rollbackArtifacts]) {
    assert.equal(createHash("sha256").update(read(`${SQL}${artifact.file}`)).digest("hex"), artifact.sha256, artifact.file);
  }
});

test("public policy and search authority is hostname-only and fail closed", () => {
  const sql = read(`${SQL}202607310071_storefront_policy_search.up.sql`);
  assert.match(sql, /public_policy_index\(p_hostname text,p_now timestamptz\)/);
  assert.match(sql, /public_search_products\(p_hostname text,p_now timestamptz,p_query text,p_limit integer,p_cursor text\)/);
  assert.match(sql, /domain\.hostname=p_hostname/);
  assert.doesNotMatch(sql, /x-forwarded|document[.]cookie|cookie_header|localStorage|sessionStorage|searchParams|tenantId|membershipId/i);
});

test("seven policy keys and routes are finite immutable database authority", () => {
  const sql = read(`${SQL}202607310071_storefront_policy_search.up.sql`);
  for (const token of ["privacy_security", "distance_sales", "kvkk", "payment_delivery", "cookie_usage", "returns_exchanges", "membership"]) assert.match(sql, new RegExp(`'${token}'`));
  assert.match(sql, /guard_store_policy_pages/);
  assert.match(sql, /STORE_POLICY_PAGE_IMMUTABLE/);
});

test("runtime roles receive functions but no direct policy table DML", () => {
  const sql = read(`${SQL}202607310071_storefront_policy_search.up.sql`);
  assert.doesNotMatch(sql, /GRANT (?:SELECT|INSERT|UPDATE|DELETE)[^;]+store_policy_/is);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION[\s\S]+store_policy_list_admin[\s\S]+TO celebix_saas_app/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION[\s\S]+public_policy_index[\s\S]+TO celebix_saas_host_resolver/);
});

test("search and policy SQL contains no private or executable payload surface", () => {
  const sql = read(`${SQL}202607310071_storefront_policy_search.up.sql`);
  assert.doesNotMatch(sql, /costCents|objectKey|apiKey|secret|password|accessToken|refreshToken/i);
  assert.doesNotMatch(sql, /EXECUTE\s+format|dblink|COPY\s|lo_import|pg_read_file/i);
});
