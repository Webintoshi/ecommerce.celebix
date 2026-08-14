import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608140106_storefront_cart_read_only_authority.up.sql",
  down: "202608140106_storefront_cart_read_only_authority.down.sql",
  assertions: "202608140106_storefront_cart_read_only_authority_assertions.sql",
  manifest: "phase4w-storefront-cart-read-only-authority-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

test("106 keeps the execution authority immutable and makes storefront visibility read-only safe", () => {
  const up = source("up");
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]merchant_provider_execution_authority_visible/u);
  assert.match(up, /pg_advisory_xact_lock_shared/u);
  assert.match(up, /current_setting\('transaction_read_only'\)='on'/u);
  assert.match(up, /THEN saas[.]merchant_provider_execution_authority_visible/u);
  assert.match(up, /ELSE saas[.]merchant_provider_execution_authority_matches/u);
  assert.doesNotMatch(up, /CREATE OR REPLACE FUNCTION saas[.]merchant_provider_execution_authority_matches/u);
});

test("106 exposes no new runtime function authority and has a guarded rollback", () => {
  const up = source("up");
  const down = source("down");
  const assertions = source("assertions");
  assert.match(up, /REVOKE ALL ON FUNCTION[\s\S]+merchant_provider_execution_authority_visible/u);
  assert.doesNotMatch(up, /GRANT EXECUTE/u);
  assert.match(down, /STOREFRONT_CART_READ_ONLY_AUTHORITY_DOWN_GUARD_REQUIRED/u);
  assert.match(down, /DROP FUNCTION saas[.]merchant_provider_execution_authority_visible/u);
  assert.match(assertions, /c89a8ab0d23d470a1603e6ceebf11b68/u);
  assert.match(assertions, /STOREFRONT_CART_READ_ONLY_AUTHORITY_ACL_INVALID/u);
});

test("106 artifacts are PostgreSQL 16 checksum pinned", () => {
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
    phase: "phase4w-storefront-cart-read-only-authority",
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
