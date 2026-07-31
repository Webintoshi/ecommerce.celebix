import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const up = readFileSync(new URL("202607310074_panel_session_storefront_authority.up.sql", root), "utf8");
const down = readFileSync(new URL("202607310074_panel_session_storefront_authority.down.sql", root), "utf8");
const assertions = readFileSync(new URL("202607310074_panel_session_storefront_authority_assertions.sql", root), "utf8");
const manifest = JSON.parse(readFileSync(new URL("phase3-panel-session-storefront-authority-manifest.json", root), "utf8")) as {
  phase: string;
  postgresqlMajor: number;
  externalConnections: number;
  productionMutations: number;
  artifacts: Array<{ file: string; direction: string; sha256: string }>;
};

test("storefront session authority artifacts are checksum pinned and production inert", () => {
  assert.deepEqual({
    phase: manifest.phase,
    postgresqlMajor: manifest.postgresqlMajor,
    externalConnections: manifest.externalConnections,
    productionMutations: manifest.productionMutations,
  }, {
    phase: "phase3-panel-session-storefront-authority",
    postgresqlMajor: 16,
    externalConnections: 0,
    productionMutations: 0,
  });
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [
    ["202607310074_panel_session_storefront_authority.up.sql", "up"],
    ["202607310074_panel_session_storefront_authority.down.sql", "down"],
    ["202607310074_panel_session_storefront_authority_assertions.sql", "verify"],
  ]);
  for (const artifact of manifest.artifacts) {
    const source = readFileSync(new URL(artifact.file, root));
    assert.equal(createHash("sha256").update(source).digest("hex"), artifact.sha256, artifact.file);
  }
});

test("panel session projects only the active verified primary storefront domain", () => {
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]resolve_panel_session/);
  assert.match(up, /JOIN saas[.]store_domains AS primary_domain/);
  assert.match(up, /primary_domain[.]store_id = store[.]id/);
  assert.match(up, /primary_domain[.]status = 'active'/);
  assert.match(up, /primary_domain[.]is_primary/);
  assert.match(up, /primary_domain[.]verified_at <= p_now/);
  assert.match(up, /'resolvedHost'/);
  assert.match(up, /'canonicalHostname', primary_domain[.]hostname/);
});

test("storefront authority migration preserves role boundary and has a bounded rollback", () => {
  for (const source of [up, down]) {
    assert.match(source, /^BEGIN;/);
    assert.match(source, /ALTER FUNCTION saas[.]resolve_panel_session\(text,text,timestamptz\) OWNER TO celebix_saas_owner/);
    assert.match(source, /REVOKE ALL ON FUNCTION saas[.]resolve_panel_session\(text,text,timestamptz\) FROM PUBLIC/);
    assert.match(source, /GRANT EXECUTE ON FUNCTION saas[.]resolve_panel_session\(text,text,timestamptz\) TO celebix_saas_identity/);
    assert.match(source, /COMMIT;\s*$/);
    assert.doesNotMatch(source, /postgres(?:ql)?:\/\//i);
  }
  assert.match(assertions, /panel_session_storefront_authority_missing/);
  assert.match(assertions, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
  assert.match(assertions, /COMMIT;\s*$/);
});
