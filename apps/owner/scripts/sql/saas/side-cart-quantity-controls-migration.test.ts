import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608040086_side_cart_quantity_controls.up.sql",
  down: "202608040086_side_cart_quantity_controls.down.sql",
  assertions: "202608040086_side_cart_quantity_controls_assertions.sql",
  manifest: "phase3-side-cart-quantity-controls-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

test("086 normalizes and validates the published quantity-selector authority", () => {
  const up = source("up");
  assert.match(up, /showQuantitySelector/);
  assert.match(up, /jsonb_set/);
  assert.match(up, /campaign_starter_composition_valid/);
  assert.match(up, /storefront_theme_default_composition/);
  assert.match(up, /storefront_theme_composition_upgrade_v2/);
});

test("086 rollback is guarded and verification covers defaults and publication", () => {
  const down = source("down");
  const assertions = source("assertions");
  assert.match(down, /celebix[.]allow_side_cart_quantity_controls_down/);
  assert.match(assertions, /SIDE_CART_QUANTITY_SELECTOR_DEFAULT_INVALID/);
  assert.match(assertions, /SIDE_CART_QUANTITY_SELECTOR_PUBLICATION_INVALID/);
});

test("086 artifacts are PostgreSQL 16 pinned and checksum verified", () => {
  for (const name of Object.values(files)) assert.equal(existsSync(new URL(name, root)), true, `${name} missing`);
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
    phase: "phase3-side-cart-quantity-controls",
    postgresqlMajor: 16,
    externalConnections: 0,
    productionMutations: 0,
  });
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [
    [files.up, "up"],
    [files.down, "down"],
    [files.assertions, "verify"],
  ]);
  for (const artifact of manifest.artifacts) {
    const bytes = readFileSync(new URL(artifact.file, root));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256, artifact.file);
  }
});
