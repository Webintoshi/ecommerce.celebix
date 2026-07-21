import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BASE = "301637111de040fc3bbf3cfed718a2d772e42130";
const DONOR = "fc6c5318b47f045a7cefcedc7612d5b10563ba32";
const ROOT = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), "utf8");
const bytes = (path) => readFile(new URL(path, ROOT));
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const lines = (value) => value.split("\n").filter(Boolean);

const SQL_ROOT = "apps/owner/scripts/sql/saas/";
const MANIFEST = `${SQL_ROOT}phase3b2-quick-order-links-manifest.json`;
const ARTIFACTS = Object.freeze([
  Object.freeze({
    id: "202607220024_quick_order_links_up",
    direction: "up",
    file: "202607220024_quick_order_links.up.sql",
    sha256: "e4f53eeafe638f34e414f03a07918edeaefd1f0876a12539ca9a450fcaed95be",
    purpose: "Add store-scoped checkout configuration and quick-order link persistence with forced RLS.",
  }),
  Object.freeze({
    id: "202607220024_quick_order_links_down",
    direction: "down",
    file: "202607220024_quick_order_links.down.sql",
    sha256: "cae1763cec8b93e4cb5c559a741b2766e92b9c57cb2145e8e04e52b99c7d2527",
    purpose: "Remove only migration 024 quick-order link objects during disposable rollback rehearsal.",
  }),
  Object.freeze({
    id: "202607220024_quick_order_links_assertions",
    direction: "verify",
    file: "202607220024_quick_order_links_assertions.sql",
    sha256: "f8e537e983d9c944e98f7083f7e6fd0b4c7d888ff22b18a9517f519ac290d746",
    purpose: "Fail on quick-link catalog, constraint, tenant-FK, ACL, RLS, immutability, secret-envelope or authority drift.",
  }),
  Object.freeze({
    id: "202607220025_quick_order_links_api_up",
    direction: "up",
    file: "202607220025_quick_order_links_api.up.sql",
    sha256: "1facd08e00020d1c80124723f25ee4756bc162cd02be784f954ba02f453ccf55",
    purpose: "Add the least-privilege merchant quick-order link API and durable operation recovery.",
  }),
  Object.freeze({
    id: "202607220025_quick_order_links_api_down",
    direction: "down",
    file: "202607220025_quick_order_links_api.down.sql",
    sha256: "9500dd84143e980684891b39a09bba881dee592f6ce699be72e7de924022a788",
    purpose: "Remove only migration 025 API functions during disposable rollback rehearsal.",
  }),
  Object.freeze({
    id: "202607220025_quick_order_links_api_assertions",
    direction: "verify",
    file: "202607220025_quick_order_links_api_assertions.sql",
    sha256: "b5cac3ac0be7f5ccecc1733dfddb389e00fcccce5a9ba382b9c902eaabb2b108",
    purpose: "Fail on quick-link API signature, authority, deterministic projection, recovery or ACL drift.",
  }),
]);

const EXPECTED_MANIFEST = Object.freeze({
  bundleId: "phase3b2-202607220025-quick-order-links-api",
  postgresqlMajor: 16,
  migrationClassification: "additive",
  environmentAuthorization: "LOCAL_DISPOSABLE_ONLY_STAGING_REQUIRES_SEPARATE_AUTHORIZATION",
  rollbackLimitations: "Migration 024 rollback destroys checkout provider configuration and quick-order link data; migration 025 rollback removes only API functions. Both are for disposable rehearsal only.",
  artifacts: ARTIFACTS,
});

const EXPECTED_PRODUCTION_FILES = Object.freeze([
  ...ARTIFACTS.map(({ file }) => `${SQL_ROOT}${file}`),
  MANIFEST,
  "packages/saas-contracts/src/authorization/actions.ts",
  "packages/saas-contracts/src/index.ts",
  "packages/saas-contracts/src/quick-orders/index.ts",
  "packages/saas-contracts/src/quick-orders/types.ts",
  "packages/saas-contracts/src/quick-orders/validation.ts",
  "packages/saas-data/src/index.ts",
  "packages/saas-data/src/quick-orders/canonical.ts",
  "packages/saas-data/src/quick-orders/cursor.ts",
  "packages/saas-data/src/quick-orders/errors.ts",
  "packages/saas-data/src/quick-orders/index.ts",
  "packages/saas-data/src/quick-orders/repository.ts",
  "packages/saas-data/src/quick-orders/types.ts",
  "packages/saas-data/src/quick-orders/validation.ts",
].sort());

function changedFiles(...paths) {
  return lines(git("diff", "--name-only", "--no-renames", `${BASE}..HEAD`, ...(paths.length === 0 ? [] : ["--", ...paths])));
}

test("pins the exact donor SHA and keeps apps admin byte unchanged", () => {
  assert.equal(git("rev-parse", `${DONOR}^{commit}`), DONOR);
  assert.equal(changedFiles("apps/admin").join("\n"), "");
});

test("binds the exact six-artifact 024 and 025 manifest including bytes", async () => {
  const manifestSource = await read(MANIFEST);
  assert.equal(manifestSource, `${JSON.stringify(EXPECTED_MANIFEST, null, 2)}\n`);
  const parsed = JSON.parse(manifestSource);
  assert.deepEqual(parsed, EXPECTED_MANIFEST);
  for (const artifact of ARTIFACTS) {
    const digest = createHash("sha256").update(await bytes(`${SQL_ROOT}${artifact.file}`)).digest("hex");
    assert.equal(digest, artifact.sha256, artifact.file);
  }
});

test("grants the application role exact function execution and no direct table access", async () => {
  const sql = (await Promise.all(ARTIFACTS.map(({ file }) => read(`${SQL_ROOT}${file}`)))).join("\n");
  assert.match(sql, /GRANT EXECUTE ON FUNCTION saas[.]quick_links_(?:list|get|create|cancel|duplicate|recover_operation)[\s\S]*?TO celebix_saas_app/i);
  const directTableGrant = sql.split(";").some((statement) =>
    /GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)\b/i.test(statement) &&
    /\bON\s+(?:TABLE\s+)?saas[.]/i.test(statement) &&
    /\bTO\s+celebix_saas_app\b/i.test(statement)
  );
  assert.equal(directTableGrant, false);
  for (const assertionsFile of [
    "202607220024_quick_order_links_assertions.sql",
    "202607220025_quick_order_links_api_assertions.sql",
  ]) {
    const assertions = await read(`${SQL_ROOT}${assertionsFile}`);
    assert.match(assertions, /has_table_privilege\([\s\S]{0,220}?'celebix_saas_app'[\s\S]{0,220}?'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'/i);
  }
});

test("keeps token sealed material and private authority out of public DTO and result parsers", async () => {
  const publicProjection = `${await read("packages/saas-contracts/src/quick-orders/types.ts")}\n${await read("packages/saas-contracts/src/quick-orders/validation.ts")}`;
  assert.doesNotMatch(publicProjection, /\b(?:rawToken|tokenDigest|sealedToken|tokenKeyId|providerConfigId)\b/);
  assert.doesNotMatch(publicProjection, /\b(?:tenantId|storeId|principalId|membershipId|planId|requestId|domainId)\b/);

  const dataTypes = await read("packages/saas-data/src/quick-orders/types.ts");
  const publicResultInterfaces = dataTypes.match(/export interface ListQuickLinksResult \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.notEqual(publicResultInterfaces, "");
  assert.doesNotMatch(publicResultInterfaces, /token|sealed|keyId|providerConfigId|tenant|storeId|principalId|membershipId|planId/i);

  const repository = await read("packages/saas-data/src/quick-orders/repository.ts");
  const resultParsers = ["safeListItem", "safeDetail", "safeMutation"].map((name) => {
    const source = repository.match(new RegExp(`function ${name}\\b[\\s\\S]*?\\n\\}`))?.[0];
    assert.ok(source, name);
    return source;
  }).join("\n");
  assert.doesNotMatch(resultParsers, /tokenDigest|sealedToken|tokenKeyId|providerConfigId|principalId|membershipId|planId|requestId/);
});

test("keeps customer panel HTTP pages navigation and storefront runtime byte unchanged", () => {
  assert.deepEqual(changedFiles("apps/customer-panel"), []);
  assert.deepEqual(changedFiles("apps/storefront-shared", "apps/storefront-base"), []);
  const changedRoutes = changedFiles().filter((path) =>
    /(?:^|\/)(?:app\/.*\/(?:route|page)[.]tsx?|navigation[.]tsx?|routes?[.]tsx?)$/.test(path),
  );
  assert.deepEqual(changedRoutes, []);
});

test("keeps the exact hidden foundation production scope and all protected configuration unchanged", () => {
  const production = changedFiles().filter((path) =>
    !path.startsWith("docs/") &&
    !path.startsWith("tests/") &&
    !/[.]test[.][cm]?[jt]sx?$/.test(path),
  ).sort();
  assert.deepEqual(production, EXPECTED_PRODUCTION_FILES);

  assert.deepEqual(changedFiles(
    "apps/admin",
    "apps/customer-panel",
    "apps/storefront-shared",
    "apps/storefront-base",
    "deploy",
    "infra",
    "infrastructure",
    "package.json",
    "package-lock.json",
    "apps/customer-panel/package.json",
    "apps/owner/package.json",
    "apps/storefront-shared/package.json",
    "packages/saas-contracts/package.json",
    "packages/saas-data/package.json",
  ), []);
});

test("imports no admin API Supabase legacy auth or application runtime authority", async () => {
  const sourceFiles = changedFiles().filter((path) =>
    /(?:packages\/saas-(?:contracts|data)\/src\/.*[.]ts|apps\/owner\/scripts\/sql\/saas\/.*[.]sql)$/.test(path) &&
    !/[.]test[.]ts$/.test(path),
  );
  const source = (await Promise.all(sourceFiles.map(read))).join("\n");
  assert.doesNotMatch(source, /@supabase|\/api\/admin\/|getAdminAuthContext|getBrowserSupabaseClient|legacy[-_ ]auth|store-runtime|store-info-context/i);
  assert.doesNotMatch(source, /from\s+["'][^"']*(?:apps\/admin|apps\/customer-panel|apps\/storefront)/i);
});

test("keeps quick links unmounted from navigation and exposes no HTTP redemption or provider success claim", async () => {
  const navigation = await read("apps/customer-panel/lib/panel-ui/navigation.ts");
  assert.doesNotMatch(navigation, /quick[-_ ]?(?:order|link)|hızlı\s+sipariş|\/orders\/(?:quick|links?)/i);
  const productionFiles = changedFiles().filter((path) =>
    !path.startsWith("docs/") && !path.startsWith("tests/") && !/[.]test[.][cm]?[jt]sx?$/.test(path),
  );
  const source = (await Promise.all(productionFiles.map(read))).join("\n");
  assert.doesNotMatch(source, /\b(?:redeem|redemption|provider_success|payment_succeeded|signed_callback|webhook|settlement|settle)\b/i);
  assert.equal(productionFiles.some((path) => /\/(?:route|page)[.]tsx?$/.test(path)), false);
});

test("tracked foundation diff contains no credentials private keys database URLs or panel sessions", () => {
  const productionFiles = changedFiles().filter((path) =>
    !path.startsWith("docs/") &&
    !path.startsWith("tests/") &&
    !/[.]test[.][cm]?[jt]sx?$/.test(path),
  );
  const patch = productionFiles.length === 0 ? "" : git("diff", `${BASE}..HEAD`, "--", ...productionFiles);
  const privateKey = new RegExp(["BEGIN ", "(?:RSA|EC|OPENSSH)", " PRIVATE", " KEY"].join(""), "i");
  const databaseUrl = new RegExp(["postgres", "(?:ql)?://", "[^\\s\"']+:", "[^\\s\"'@]+@"].join(""), "i");
  const credentialAssignment = new RegExp(["(?:password|client_", "secret|service_role_key)", "\\s*[:=]\\s*[\"'][^\"']+"].join(""), "i");
  const panelSession = new RegExp(["__Host", "-celebix", "_panel", String.fromCharCode(61)].join(""));
  assert.doesNotMatch(patch, privateKey);
  assert.doesNotMatch(patch, databaseUrl);
  assert.doesNotMatch(patch, credentialAssignment);
  assert.doesNotMatch(patch, panelSession);
});
