import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT=path.resolve(import.meta.dirname,"../../..");
const read=relative=>readFileSync(path.join(ROOT,relative),"utf8");
const migration=read("apps/owner/scripts/sql/saas/202608020075_complete_starter_retail_experience.up.sql");
const repository=read("packages/saas-data/src/storefront/newsletter-repository.ts");

test("newsletter table is forced-RLS and never directly granted",()=>{assert.match(migration,/storefront_newsletter_subscribers ENABLE ROW LEVEL SECURITY/);assert.match(migration,/storefront_newsletter_subscribers FORCE ROW LEVEL SECURITY/);assert.match(migration,/REVOKE ALL ON saas[.]storefront_newsletter_subscribers/);assert.doesNotMatch(migration,/GRANT (?:SELECT|INSERT|UPDATE|DELETE)[^;]+storefront_newsletter_subscribers/is);});
test("public and merchant newsletter roles cannot cross",()=>{
  assert.match(migration,/public_newsletter_subscribe[^;]+TO celebix_saas_host_resolver/s);
  assert.match(migration,/merchant_newsletter_list[^;]+TO celebix_saas_app/s);
  assert.match(repository,/SET LOCAL ROLE/);
  const publicSubscribe=repository.slice(repository.indexOf("async subscribe("),repository.indexOf("async list("));
  assert.doesNotMatch(publicSubscribe,/storeId|tenantContext|principalId|membershipId|planId/);
});
test("retail projections bind every private join to selected store",()=>{for(const pattern of [/r[.]store_id=p_store_id/,/p[.]store_id=p_store_id/,/rp[.]store_id=p_store_id/,/public_storefront_authorized\(p_store_id,p_hostname,p_now\)/])assert.match(migration,pattern);assert.match(migration,/r[.]status='approved'/);assert.match(migration,/p[.]status='active'/);});
test("migration contains no production authority or raw secret logging",()=>{
  assert.doesNotMatch(migration,/panel[.]celebix[.]site|DATABASE_URL|console[.]log/i);
  assert.doesNotMatch(migration,/RAISE (?:NOTICE|LOG)[^;]*(?:p_email|normalized_email|email_digest|token|cookie|\bsecret\b)/i);
  assert.doesNotMatch(repository,/console[.]|process[.]env|authorization|cookie/i);
});
