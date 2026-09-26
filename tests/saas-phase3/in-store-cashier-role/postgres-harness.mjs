import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const BIN = path.join(homedir(), ".codex/tmp/postgresql-16.14-install/bin");
const MIGRATION = "202609260158_in_store_cashier_role";
const STORE = "10000000-0000-4000-8000-000000000158";
const OTHER = "10000000-0000-4000-8000-000000000159";
const PRINCIPAL = "20000000-0000-4000-8000-000000000158";
const MEMBER = "30000000-0000-4000-8000-000000000158";
const PLAN = "00000000-0000-4000-8000-000000000001";
const HOST = "cashier-fixture.admin.saas-staging.celebix.site";
const OTHER_HOST = "other-fixture.admin.saas-staging.celebix.site";
const ISSUER = "https://identity.example.test/oidc";
let box;
let scenarios = 0;
let next = 1;
const id = () => `90000000-0000-4000-8000-${String(next++).padStart(12, "0")}`;
const pass = (label) => console.log(`PASS ${++scenarios} ${label}`);
const authority = (store = STORE, member = MEMBER) => `'${store}','${PRINCIPAL}','${member}','${PLAN}','free_starter',1,transaction_timestamp()`;

function command(name, args, input = "", allowFailure = false) {
  const result = spawnSync(path.join(BIN, name), args, {
    cwd: ROOT, input, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
    env: { PATH: process.env.PATH, LC_ALL: "C", LANG: "C" },
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`${name} failed\n${result.stderr}`);
  return result;
}
function sql(source, allowFailure = false) {
  return command("psql", ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], source, allowFailure);
}
const value = (source) => sql(source).stdout.trim();
const apply = (file) => sql(readFileSync(path.join(SQL, file), "utf8"));
const asRole = (role, source) => value(`BEGIN;SET LOCAL ROLE ${role};${source};COMMIT;`);
// This is a private helper called by security-definer RPCs; callers never
// receive EXECUTE on it. Exercise its role matrix with its owning role.
const deny = (action, store = STORE) => asRole("celebix_saas_owner", `SELECT coalesce(saas.merchant_action_authority_error(${authority(store)},'orders','${action}'),'allowed')`);
const setMembership = (role, status = "active") => sql(`BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.memberships SET role='${role}',status='${status}' WHERE id='${MEMBER}';COMMIT;`);
function issue(host, issuer = ISSUER) {
  const operation = id();
  const digest = next.toString(16).padStart(64, "0");
  const args = `'${issuer}','cashier-subject',${host ? `'${host}',` : ""}'${id()}','${id()}','${operation}','cashier.v1','${digest}',transaction_timestamp(),transaction_timestamp()+interval '8 hours'`;
  const outcome = asRole("celebix_saas_identity", `SELECT outcome FROM saas.issue_returning_panel_session${host ? "_for_admin_host" : ""}(${args})`);
  return { operation, digest, outcome, host };
}
function recover(session, issuer = ISSUER) {
  return asRole("celebix_saas_identity", `SELECT outcome FROM saas.recover_returning_panel_session${session.host ? "_for_admin_host" : ""}('${issuer}','cashier-subject',${session.host ? `'${session.host}',` : ""}'${session.operation}','cashier.v1','${session.digest}')`);
}
function resolve(session) {
  return JSON.parse(asRole("celebix_saas_identity", `SELECT jsonb_build_object('outcome',outcome,'authority',authority) FROM saas.resolve_panel_session('cashier.v1','${session.digest}',transaction_timestamp())`));
}

try {
  assertSafeEnvironment();
  const temporary = mkdtempSync("/tmp/celebix-cashier-role-");
  box = { temporary, data: path.join(temporary, "data"), socket: path.join(temporary, "socket"), port: 20000 + Math.floor(Math.random() * 10000), started: false };
  mkdirSync(box.socket, { mode: 0o700 });
  command("initdb", ["-D", box.data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command("pg_ctl", ["-D", box.data, "-o", `-k ${box.socket} -p ${box.port} -h ''`, "-l", path.join(temporary, "postgres.log"), "start"]);
  box.started = true;
  assert.match(value("SHOW server_version;"), /^16\./);
  const migrations = readdirSync(SQL).filter((file) => /^\d{12}/.test(file) && Number(file.slice(8, 12)) <= 156 && /(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(file) && !file.includes("seed_guzide_pilot_admin_domain"))
    .sort((a, b) => Number(a.slice(8, 12)) - Number(b.slice(8, 12)) || a.localeCompare(b));
  for (const file of migrations) {
    // Migration148 contains a production-targeted data backfill. Rehearse it
    // against a matching synthetic target rather than weakening its preflight.
    if (file === "202609230148_celebix_net_staging_starter_storefront.up.sql") {
      sql(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
        VALUES('10000000-0000-4000-8000-000000000148','Butik Siora','butik-siora','active','tr','TRY','hemenaku','2026-01-01','2026-01-01');
        INSERT INTO saas.domains(id,store_id,normalized_hostname,domain_type,status,canonical,cache_version,created_at,updated_at)
        VALUES('50000000-0000-4000-8000-000000000148','10000000-0000-4000-8000-000000000148','butik-siora.saas-staging.celebix.net','platform_subdomain','active',true,1,'2026-01-01','2026-01-01');`);
    }
    apply(file);
  }
  pass("actual migrations through156 create isolated PostgreSQL16 auth authority");
  if (!process.argv.includes("--baseline")) {
    apply(`${MIGRATION}.up.sql`);
    apply(`${MIGRATION}_assertions.sql`);
  }
  sql(`BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
      VALUES('${PRINCIPAL}','${ISSUER}','cashier-subject','cashier@example.test',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
      VALUES('${STORE}','Cashier','cashier-fixture','active','tr','TRY','hemenaku','2026-01-01','2026-01-01'),
        ('${OTHER}','Other','other-fixture','active','tr','TRY','hemenaku','2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)
      VALUES('${MEMBER}','${PRINCIPAL}','${STORE}','cashier','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
      VALUES('40000000-0000-4000-8000-000000000158','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');COMMIT;`);
  asRole("celebix_saas_bootstrap", `SELECT outcome FROM saas.provision_canonical_admin_domain('${id()}','${STORE}','${HOST}',transaction_timestamp())`);
  asRole("celebix_saas_bootstrap", `SELECT outcome FROM saas.provision_canonical_admin_domain('${id()}','${OTHER}','${OTHER_HOST}',transaction_timestamp())`);
  pass("cashier role is stored under unchanged active membership status and store constraints");

  for (const role of ["cashier", "admin", "editor", "analyst", "store_owner"]) {
    setMembership(role);
    for (const host of [undefined, HOST]) {
      const session = issue(host);
      assert.equal(session.outcome, "issued", `${role}:${host ?? "normal"}`);
      assert.equal(recover(session), "operation_replayed");
      assert.equal(recover(session, "https://foreign.example.test/oidc"), "unavailable");
      const result = resolve(session);
      assert.equal(result.outcome, "resolved");
      assert.equal(result.authority.tenant.membership.role, role);
      assert.equal(result.authority.tenant.store.id, STORE);
    }
  }
  pass("verified active safe roles issue recover and resolve on normal and exact admin-host login");

  const cashierAllowed = ["in_store.read", "in_store.sell", "in_store.discount"];
  const inStore = [...cashierAllowed, "in_store.resolve", "in_store.staff"];
  const commerce = ["orders.read", "orders.manage", "orders.payment", "catalog_admin.read", "catalog_admin.manage", "customers.read", "configuration.read", "configuration.manage", "integrations.manage", "inventory.read", "pricing.manage"];
  for (const role of ["store_owner", "admin", "cashier", "editor", "analyst"]) {
    setMembership(role);
    for (const action of inStore) {
      const allowed = role === "store_owner" || role === "admin" || (role === "cashier" && cashierAllowed.includes(action));
      assert.equal(deny(action), allowed ? "allowed" : "membership_denied", `${role}:${action}`);
    }
    if (role === "cashier") for (const action of commerce) assert.equal(deny(action), "membership_denied", action);
  }
  pass("cashier only has register actions and owner/admin alone can assign staff or resolve incidents");

  setMembership("cashier");
  assert.equal(asRole("celebix_saas_app", `SELECT outcome FROM saas.orders_get(${authority()},'${id()}')`), "membership_denied");
  assert.equal(asRole("celebix_saas_app", `SELECT outcome FROM saas.catalog_get_product_details('${STORE}','${PRINCIPAL}','${MEMBER}','${PLAN}','free_starter',1,100,transaction_timestamp(),'${id()}',false)`), "membership_denied");
  assert.equal(asRole("celebix_saas_app", `SELECT outcome FROM saas.merchant_admin_list(${authority()},'payment_setting')`), "membership_denied");
  assert.equal(issue(OTHER_HOST).outcome, "membership_denied");
  assert.equal(deny("in_store.sell", OTHER), "membership_denied");
  assert.equal(issue("unknown.admin.saas-staging.celebix.site").outcome, "membership_denied");
  const live = issue(HOST);
  for (const status of ["revoked", "invited"]) {
    setMembership("cashier", status);
    assert.equal(issue(HOST).outcome, "membership_denied");
    assert.equal(issue().outcome, "membership_denied");
    assert.equal(recover(live), "unavailable");
    assert.equal(resolve(live).outcome, "membership_denied");
    assert.equal(deny("in_store.sell"), "membership_denied");
  }
  pass("revoked invited cross-store and unknown-host cashier authority is denied durably");

  setMembership("cashier");
  const unverified = sql(`UPDATE saas.principals SET email_verified=false WHERE id='${PRINCIPAL}';`, true);
  assert.notEqual(unverified.status, 0);
  assert.match(unverified.stderr, /principals_email_verified_check/);
  assert.equal(issue(HOST, "https://foreign.example.test/oidc").outcome, "membership_denied");
  assert.equal(issue(undefined, "https://foreign.example.test/oidc").outcome, "membership_denied");
  sql(`UPDATE saas.stores SET status='suspended' WHERE id='${STORE}';`);
  assert.equal(issue(HOST).outcome, "membership_denied");
  assert.equal(recover(live), "unavailable");
  assert.equal(deny("in_store.sell"), "store_inactive");
  sql(`UPDATE saas.stores SET status='active' WHERE id='${STORE}';UPDATE saas.subscriptions SET status='inactive' WHERE store_id='${STORE}';`);
  assert.equal(issue(HOST).outcome, "membership_denied");
  assert.equal(issue().outcome, "membership_denied");
  assert.equal(deny("in_store.sell"), "durable_authority_invalid");
  sql(`UPDATE saas.subscriptions SET status='active' WHERE store_id='${STORE}';`);
  pass("login retains verified identity active store and current subscription authority checks");

  const changed = sql(`UPDATE saas.memberships SET role='root' WHERE id='${MEMBER}';`, true);
  assert.notEqual(changed.status, 0);
  assert.match(changed.stderr, /memberships_role_check/);
  const blockedDown = sql(readFileSync(path.join(SQL, `${MIGRATION}.down.sql`), "utf8"), true);
  assert.notEqual(blockedDown.status, 0);
  assert.match(blockedDown.stderr, /in_store_cashier_memberships_exist/);
  assert.equal(deny("in_store.sell"), "allowed");
  setMembership("analyst");
  apply(`${MIGRATION}.down.sql`);
  assert.equal(issue(HOST).outcome, "membership_denied");
  assert.equal(issue().outcome, "membership_denied");
  apply(`${MIGRATION}.up.sql`);
  apply(`${MIGRATION}_assertions.sql`);
  setMembership("cashier");
  assert.equal(issue(HOST).outcome, "issued");
  pass("unknown roles fail and guarded rollback restores old login then reapplies cleanly");
  console.log(`IN_STORE_CASHIER_ROLE_POSTGRESQL16_COMPLETE ${scenarios}/${scenarios}`);
} finally {
  if (box?.started) command("pg_ctl", ["-D", box.data, "-m", "fast", "stop"], "", true);
  if (box) rmSync(box.temporary, { recursive: true, force: true });
}
