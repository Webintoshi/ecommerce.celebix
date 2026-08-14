import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608140109_storefront_hosted_checkout_stale_session_guard.up.sql",
  down: "202608140109_storefront_hosted_checkout_stale_session_guard.down.sql",
  assertions: "202608140109_storefront_hosted_checkout_stale_session_guard_assertions.sql",
  manifest: "phase4z-storefront-hosted-checkout-stale-session-guard-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

function beginDefinition(sql: string): string {
  return sql.match(
    /CREATE OR REPLACE FUNCTION saas[.]public_storefront_hosted_checkout_begin[\s\S]+?(?=\nREVOKE|\nGRANT|\nCOMMIT;)/u,
  )?.[0] ?? "";
}

test("109 rejects every existing active-family source session before creating another attempt", () => {
  const definition = beginDefinition(source("up"));
  assert.notEqual(definition, "");
  assert.equal(
    definition.match(/session[.]status IN[(]'active','provider_ready','processing'[)]/gu)?.length,
    2,
  );
  assert.doesNotMatch(definition, /session[.]hold_expires_at>p_now/u);
  assert.match(definition, /RETURN QUERY SELECT 'attempt_in_progress',NULL::jsonb/u);
});

test("109 restores the prior bounded guard only through an owner-gated rollback", () => {
  const down = source("down");
  assert.match(down, /STOREFRONT_HOSTED_CHECKOUT_STALE_SESSION_GUARD_DOWN_GUARD_REQUIRED/u);
  assert.match(beginDefinition(down), /session[.]hold_expires_at>p_now/u);
});

test("109 artifacts are PostgreSQL 16 checksum pinned", () => {
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
    phase: "phase4z-storefront-hosted-checkout-stale-session-guard",
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
