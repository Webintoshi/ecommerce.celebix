import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const up = readFileSync(new URL("202607300073_seed_guzide_pilot_admin_domain.up.sql", root), "utf8");
const down = readFileSync(new URL("202607300073_seed_guzide_pilot_admin_domain.down.sql", root), "utf8");
const assertions = readFileSync(new URL("202607300073_seed_guzide_pilot_admin_domain_assertions.sql", root), "utf8");

const slug = "guzide-kuyumcu-4";
const hostname = "guzide-kuyumcu-4.admin.saas-staging.celebix.site";
const seedId = "f3f8a04d-0af7-4de5-9b89-70a33d01f001";

test("Güzide pilot seed binds one exact active store to one exact staging admin host", () => {
  assert.match(up, new RegExp(`store\\.slug = '${slug}'`));
  assert.match(up, /store\.status = 'active'/);
  assert.match(up, new RegExp(hostname.replaceAll(".", "\\.")));
  assert.match(up, new RegExp(seedId));
  assert.match(up, /saas\.provision_canonical_admin_domain/);
  assert.match(up, /operation_replayed|provisioned/);
  assert.doesNotMatch(up, /\*\.admin|LIKE|ILIKE/i);
});

test("Güzide pilot seed is transactional, idempotent, and narrowly reversible", () => {
  for (const source of [up, down, assertions]) {
    assert.match(source, /^BEGIN;/);
    assert.match(source, /SET LOCAL ROLE celebix_saas_owner;/);
    assert.match(source, /COMMIT;\s*$/);
  }
  assert.match(up, /admin_domain_conflict/);
  assert.match(down, new RegExp(seedId));
  assert.match(down, new RegExp(hostname.replaceAll(".", "\\.")));
  assert.match(assertions, /guzide_pilot_admin_domain_missing/);
  assert.doesNotMatch(down, /DELETE\s+FROM\s+saas\.admin_domains\s*;/i);
});
