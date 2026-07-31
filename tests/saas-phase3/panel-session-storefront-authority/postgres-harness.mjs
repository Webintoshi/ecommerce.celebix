import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { REQUIRED_APPLY_ORDER, REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DATABASE = `panel_storefront_${randomBytes(5).toString("hex")}`;
const UP = "202607310074_panel_session_storefront_authority.up.sql";
const DOWN = "202607310074_panel_session_storefront_authority.down.sql";
const VERIFY = "202607310074_panel_session_storefront_authority_assertions.sql";
const PRIOR = [
  ...REQUIRED_APPLY_ORDER,
  "202607110007_identity_roles.up.sql",
  "202607110008_identity_persistence.up.sql",
  "202607110009_identity_grants.sql",
  "202607110010_identity_catalog_assertions.sql",
  "202607120012_verified_identity_snapshot.up.sql",
  "202607120013_verified_identity_grants.sql",
  "202607120014_verified_identity_catalog_assertions.sql",
  "202607140015_panel_sessions.up.sql",
  "202607140016_panel_session_handoffs.up.sql",
  "202607140017_panel_browser_bindings.up.sql",
  "202607160018_product_catalog.up.sql",
  "202607160018_product_catalog_assertions.sql",
  "202607160019_product_catalog_api.up.sql",
  "202607160019_product_catalog_api_assertions.sql",
  "202607160020_pilot_storefront_media_domains.up.sql",
  "202607160020_pilot_storefront_media_domains_assertions.sql",
];
const ID = Object.freeze({
  principal: "10000000-0000-4000-8000-000000000074",
  store: "20000000-0000-4000-8000-000000000074",
  membership: "30000000-0000-4000-8000-000000000074",
  subscription: "40000000-0000-4000-8000-000000000074",
  domain: "50000000-0000-4000-8000-000000000074",
  session: "60000000-0000-4000-8000-000000000074",
  family: "70000000-0000-4000-8000-000000000074",
  operation: "80000000-0000-4000-8000-000000000074",
});
const PLAN = "00000000-0000-4000-8000-000000000001";
const KEY = "panel.active.v1";
const DIGEST = createHash("sha256").update("panel-storefront-authority").digest("hex");

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* continue */ }
  }
  return null;
}

function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    encoding: "utf8",
    input,
    env: { ...process.env, PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}

function start() {
  assertSafeEnvironment();
  const tools = Object.fromEntries([...new Set(REQUIRED_NATIVE_TOOLS)].map((name) => [name, executable(name)]));
  if (Object.values(tools).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const root = mkdtempSync("/tmp/celebix-panel-storefront-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 20_000 + Math.floor(Math.random() * 15_000);
  mkdirSync(socket, { mode: 0o700 });
  command(tools.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(tools.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { tools, root, data, socket, port, started: true };
}

function stop(box) {
  if (!box) return;
  if (box.started) command(box.tools.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], "", true);
  rmSync(box.root, { recursive: true, force: true });
}

function psql(box, source, database = DATABASE) {
  return command(box.tools.psql, [
    "-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], source).stdout.trim();
}

function apply(box, file) {
  const source = readFileSync(path.join(SQL, file), "utf8");
  psql(box, source);
}

function applyBase(box) {
  for (const file of PRIOR) apply(box, file);
}

function resolveAuthority(box, now) {
  return JSON.parse(psql(box, `BEGIN READ ONLY;SET LOCAL ROLE celebix_saas_identity;
    SELECT authority FROM saas.resolve_panel_session('${KEY}','${DIGEST}','${now}');COMMIT;`));
}

function main() {
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DATABASE};`, "postgres");
    applyBase(box);
    assert.match(psql(box, "SHOW server_version;"), /^16[.]/);

    const now = new Date().toISOString();
    const expires = new Date(Date.parse(now) + 8 * 60 * 60_000).toISOString();
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
      INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
        VALUES('${ID.principal}','https://identity.example.test/oidc','guzide-owner','owner@example.test',true,'${now}','${now}');
      INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
        VALUES('${ID.store}','Guzide Kuyumcu','guzide-kuyumcu-4','active','tr','TRY','starter','${now}','${now}');
      INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)
        VALUES('${ID.membership}','${ID.principal}','${ID.store}','store_owner','active','${now}','${now}');
      INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at)
        VALUES('${ID.subscription}','${ID.store}','${PLAN}','free_starter',1,'active','2026-01-01',NULL,'${now}','${now}');
      INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)
        VALUES('${ID.domain}','${ID.store}','guzide-kuyumcu-4.saas-staging.celebix.site','platform_subdomain','active',true,'${now}','${now}','${now}',1);
      COMMIT;`);
    assert.equal(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_identity;
      SELECT outcome FROM saas.issue_panel_session('${ID.session}','${ID.family}','${ID.operation}','${KEY}','${DIGEST}','${ID.principal}','${ID.store}','${now}','${expires}');COMMIT;`), "issued");

    apply(box, UP);
    apply(box, VERIFY);
    const projected = resolveAuthority(box, now);
    assert.equal(projected.tenant.resolvedHost.hostname, "guzide-kuyumcu-4.saas-staging.celebix.site");
    assert.equal(projected.tenant.resolvedHost.storeId, ID.store);
    assert.equal(projected.tenant.resolvedHost.status, "active");
    process.stdout.write("PASS verified primary storefront is projected into the exact panel session tenant\n");

    apply(box, DOWN);
    assert.equal("resolvedHost" in resolveAuthority(box, now).tenant, false);
    apply(box, UP);
    apply(box, VERIFY);
    assert.equal(resolveAuthority(box, now).tenant.resolvedHost.domainId, ID.domain);
    process.stdout.write("PASS migration rolls back and reapplies without changing the panel session\n");
  } finally {
    stop(box);
  }
}

main();
