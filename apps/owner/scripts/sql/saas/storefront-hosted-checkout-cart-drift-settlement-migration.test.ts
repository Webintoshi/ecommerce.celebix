import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608140110_storefront_hosted_checkout_cart_drift_settlement.up.sql",
  down: "202608140110_storefront_hosted_checkout_cart_drift_settlement.down.sql",
  assertions: "202608140110_storefront_hosted_checkout_cart_drift_settlement_assertions.sql",
  manifest: "phase5a-storefront-hosted-checkout-cart-drift-settlement-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

function transitionDefinition(sql: string): string {
  return sql.match(
    /CREATE OR REPLACE FUNCTION saas[.]storefront_hosted_checkout_terminal_transition[\s\S]+?(?=\nREVOKE|\nGRANT|\nCOMMIT;)/u,
  )?.[0] ?? "";
}

test("110 settles an immutable paid snapshot without consuming a drifted active cart", () => {
  const definition = transitionDefinition(source("up"));
  assert.notEqual(definition, "");
  assert.doesNotMatch(definition, /cart[.]version=selected_session[.]source_version[\s\S]+settlement_conflict/u);
  assert.match(
    definition,
    /UPDATE saas[.]storefront_carts SET status='converted'[\s\S]+version=selected_session[.]source_version/u,
  );
});

test("110 writes the admin order address contract and repairs earlier storefront rows", () => {
  const up = source("up");
  const definition = transitionDefinition(up);
  assert.match(
    definition,
    /'recipientName',selected_customer[.]first_name\|\|' '\|\|selected_customer[.]last_name/u,
  );
  assert.doesNotMatch(
    definition,
    /'confirmed','completed',selected_session[.]delivery_snapshot->'shippingAddress'/u,
  );
  assert.match(up, /UPDATE saas[.]orders AS order_row[\s\S]+NOT order_row[.]shipping_address \? 'recipientName'/u);
});

test("110 restores strict cart-version settlement only through an owner-gated rollback", () => {
  const down = source("down");
  assert.match(down, /STOREFRONT_HOSTED_CHECKOUT_CART_DRIFT_SETTLEMENT_DOWN_GUARD_REQUIRED/u);
  assert.match(
    transitionDefinition(down),
    /cart[.]status='active' AND cart[.]version=selected_session[.]source_version/u,
  );
});

test("110 artifacts are PostgreSQL 16 checksum pinned", () => {
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
    phase: "phase5a-storefront-hosted-checkout-cart-drift-settlement",
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
