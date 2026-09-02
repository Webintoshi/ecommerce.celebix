import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const directory = new URL("./", import.meta.url);
const files = Object.freeze({
  up: "202609020122_domain_reconciliation_defer.up.sql",
  down: "202609020122_domain_reconciliation_defer.down.sql",
  assertions: "202609020122_domain_reconciliation_defer_assertions.sql",
  manifest: "phase5i-domain-reconciliation-defer-manifest.json",
});
const source = (name: keyof typeof files) => readFileSync(new URL(files[name], directory), "utf8");

test("122 adds workflow-only state-preserving defer functions", () => {
  const up = source("up");
  assert.match(up, /CREATE FUNCTION saas\.store_domain_work_defer/u);
  assert.match(up, /CREATE FUNCTION saas\.admin_domain_work_defer/u);
  assert.match(up, /attempt_count=greatest\(attempt_count-1,0\)/u);
  assert.doesNotMatch(up, /(?:status|verified_at|canonical|hostname_status|ssl_status|dns_status|origin_status|last_provider_error_code)=/u);
  assert.match(up, /TO celebix_saas_workflow/u);
  assert.doesNotMatch(up, /TO celebix_saas_app/u);
});

test("122 rollback is emergency-only and leaves prior lifecycle functions intact", () => {
  const down = source("down");
  assert.match(down, /Emergency\/pre-restore rollback only/u);
  assert.match(down, /DROP FUNCTION saas\.admin_domain_work_defer/u);
  assert.doesNotMatch(down, /DROP FUNCTION saas\.(?:admin|store)_domain_work_(?:claim|complete|fail)/u);
  assert.match(source("assertions"), /DOMAIN_RECONCILIATION_DEFER_BODY_ASSERTION_FAILED/u);
});

test("122 artifacts are checksum pinned for PostgreSQL 16", () => {
  const manifest = JSON.parse(source("manifest")) as { phase: string; postgresqlMajor: number; externalConnections: number; productionMutations: number; artifacts: Array<{ file: string; direction: string; sha256: string }> };
  assert.deepEqual([manifest.phase, manifest.postgresqlMajor, manifest.externalConnections, manifest.productionMutations], ["phase5i-domain-reconciliation-defer", 16, 0, 0]);
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [[files.up, "up"], [files.down, "down"], [files.assertions, "verify"]]);
  for (const artifact of manifest.artifacts) assert.equal(createHash("sha256").update(readFileSync(new URL(artifact.file, directory))).digest("hex"), artifact.sha256);
});
