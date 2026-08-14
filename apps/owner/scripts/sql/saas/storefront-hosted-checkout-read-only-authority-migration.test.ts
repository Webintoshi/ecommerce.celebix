import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608140107_storefront_hosted_checkout_read_only_authority.up.sql",
  down: "202608140107_storefront_hosted_checkout_read_only_authority.down.sql",
  assertions: "202608140107_storefront_hosted_checkout_read_only_authority_assertions.sql",
  manifest: "phase4x-storefront-hosted-checkout-read-only-authority-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

test("107 makes hosted-checkout authority read-only safe without changing execution authority", () => {
  const up = source("up");
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]storefront_hosted_checkout_authority_projection/u);
  assert.match(up, /current_setting\('transaction_read_only'\)='on'/u);
  assert.match(up, /THEN saas[.]merchant_provider_execution_authority_visible/u);
  assert.match(up, /ELSE saas[.]merchant_provider_execution_authority_matches/u);
  assert.doesNotMatch(up, /CREATE OR REPLACE FUNCTION saas[.]merchant_provider_execution_authority_(?:matches|visible)/u);
});

test("107 preserves the hosted-checkout public contract and guards rollback", () => {
  const up = source("up");
  const down = source("down");
  const assertions = source("assertions");
  assert.match(up, /RETURNS jsonb[\s\S]+SECURITY DEFINER/u);
  assert.doesNotMatch(up, /GRANT EXECUTE|REVOKE ALL/u);
  assert.match(down, /STOREFRONT_HOSTED_CHECKOUT_READ_ONLY_AUTHORITY_DOWN_GUARD_REQUIRED/u);
  assert.match(assertions, /c89a8ab0d23d470a1603e6ceebf11b68/u);
  assert.match(assertions, /STOREFRONT_HOSTED_CHECKOUT_READ_ONLY_AUTHORITY_PROJECTION_INVALID/u);
});

test("107 artifacts are PostgreSQL 16 checksum pinned", () => {
  for (const name of Object.values(files)) {
    assert.equal(existsSync(new URL(name, root)), true, `${name} missing`);
  }
  const manifest = JSON.parse(source("manifest")) as {
    phase: string;
    postgresqlMajor: number;
    externalConnections: number;
    productionMutations: number;
    artifacts: Array<{ file: string; direction: string; sha256: string }>;
  };
  assert.deepEqual({
    phase: manifest.phase,
    postgresqlMajor: manifest.postgresqlMajor,
    externalConnections: manifest.externalConnections,
    productionMutations: manifest.productionMutations,
  }, {
    phase: "phase4x-storefront-hosted-checkout-read-only-authority",
    postgresqlMajor: 16,
    externalConnections: 0,
    productionMutations: 0,
  });
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [
    [files.up, "up"], [files.down, "down"], [files.assertions, "verify"],
  ]);
  for (const artifact of manifest.artifacts) {
    const bytes = readFileSync(new URL(artifact.file, root));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256, artifact.file);
  }
});
