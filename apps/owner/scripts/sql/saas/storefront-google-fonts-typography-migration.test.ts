import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608070096_storefront_google_fonts_typography.up.sql",
  down: "202608070096_storefront_google_fonts_typography.down.sql",
  assertions: "202608070096_storefront_google_fonts_typography_assertions.sql",
  manifest: "phase4o-storefront-google-fonts-typography-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

test("096 adds exact legacy-compatible storefront typography authority", () => {
  const up = source("up");
  for (const token of ["headingFont", "bodyFont", "headingWeight", "bodyWeight", "headingSizePx", "bodySizePx", "storefront_design_typography_valid", "storefront_design_public_payload"]) {
    assert.match(up, new RegExp(token));
  }
  assert.match(up, /BETWEEN 24 AND 72/);
  assert.match(up, /BETWEEN 14 AND 20/);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)/i);
  assert.doesNotMatch(up, /localStorage|sessionStorage|x-forwarded|document[.]cookie/i);
});

test("096 assertions cover valid projection, hostile input, legacy fallback, and guarded rollback", () => {
  const assertions = source("assertions");
  for (const token of ["STOREFRONT_TYPOGRAPHY_VALID_INVALID", "STOREFRONT_TYPOGRAPHY_PUBLIC_INVALID", "STOREFRONT_TYPOGRAPHY_LEGACY_INVALID", "STOREFRONT_TYPOGRAPHY_HOSTILE_ACCEPTED"]) {
    assert.match(assertions, new RegExp(token));
  }
  assert.match(source("down"), /celebix[.]allow_storefront_typography_down/);
});

test("096 artifacts are PostgreSQL 16 pinned and checksum verified", () => {
  for (const name of Object.values(files)) assert.equal(existsSync(new URL(name, root)), true, `${name} missing`);
  const manifest = JSON.parse(source("manifest")) as {
    phase: string;
    postgresqlMajor: number;
    externalConnections: number;
    productionMutations: number;
    artifacts: Array<{ file: string; direction: string; sha256: string }>;
  };
  assert.deepEqual({ phase: manifest.phase, postgresqlMajor: manifest.postgresqlMajor, externalConnections: manifest.externalConnections, productionMutations: manifest.productionMutations }, {
    phase: "phase4o-storefront-google-fonts-typography",
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
