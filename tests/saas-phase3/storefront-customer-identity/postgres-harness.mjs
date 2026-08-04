import assert from "node:assert/strict";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const DB = "storefront_customer_identity";
const EMPTY = "storefront_customer_identity_empty";
const UP = "202608040083_storefront_customer_identity.up.sql";
const DOWN = "202608040083_storefront_customer_identity.down.sql";
const ASSERTIONS = "202608040083_storefront_customer_identity_assertions.sql";
const STORE_A = "10000000-0000-4000-8000-000000000083";
const STORE_B = "10000000-0000-4000-8000-000000000084";
const HOST_A = "identity-a.saas-staging.celebix.site";
const HOST_B = "identity-b.saas-staging.celebix.site";
const CUSTOMER_A = "20000000-0000-4000-8000-000000000083";
const ORDER_A = "30000000-0000-4000-8000-000000000083";
const CHALLENGE_A = "40000000-0000-4000-8000-000000000083";
const ACCOUNT_A = "50000000-0000-4000-8000-000000000083";
const SESSION_A = "60000000-0000-4000-8000-000000000083";
const NOW = "2026-08-04T09:00:00.000Z";
const EMAIL_DIGEST = "a".repeat(64);
const CODE_DIGEST = "b".repeat(64);
const SESSION_DIGEST = "c".repeat(64);
const CSRF_DIGEST = "d".repeat(64);
const UA_DIGEST = "e".repeat(64);
const TOTAL = 18;
let completed = 0;

function executable(name) {
  const directories = [process.env.POSTGRES_BIN, ...(process.env.PATH ?? "").split(path.delimiter)];
  try {
    directories.push(...readdirSync(path.join(homedir(), ".codex", "tmp"), { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^postgresql-16[.]/.test(entry.name)).map((entry) => path.join(homedir(), ".codex", "tmp", entry.name, "bin")));
  } catch {}
  for (const directory of directories) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch {}
  }
  throw new Error(`DISPOSABLE_DB_EXECUTION_BLOCKED: missing ${name}`);
}

function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, { cwd: ROOT, input, encoding: "utf8", env: { ...process.env, LC_ALL: "C", LANG: "C" }, maxBuffer: 128 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}

function start() {
  const tools = Object.fromEntries(["initdb", "pg_ctl", "psql"].map((name) => [name, executable(name)]));
  const root = mkdtempSync("/tmp/celebix-identity-");
  const data = path.join(root, "data"), socket = path.join(root, "socket"), port = 20_000 + Math.floor(Math.random() * 15_000);
  mkdirSync(socket, { mode: 0o700 });
  command(tools.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(tools.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { tools, root, data, socket, port };
}

function stop(box) {
  if (!box) return;
  command(box.tools.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], "", true);
  rmSync(box.root, { recursive: true, force: true });
}

function psql(box, sql, database = DB, allowFailure = false) {
  return command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], sql, allowFailure);
}

function psqlAsync(box, sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", DB], { cwd: ROOT, env: { ...process.env, LC_ALL: "C", LANG: "C" } });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => status === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr)));
    child.stdin.end(sql);
  });
}

function apply(box, file, database = DB) { psql(box, readFileSync(path.join(SQL, file), "utf8"), database); }
function migrations() {
  const accepted = /(?:[.]up|[.]seed|[.]freeze|_grants|_assertions|catalog_assertions)[.]sql$/;
  return readdirSync(SQL).filter((file) => {
    const sequence = Number.parseInt(file.slice(8, 12), 10);
    return Number.isSafeInteger(sequence) && sequence <= 71 && accepted.test(file) && !file.includes(".down.");
  }).sort((left, right) => {
    const a = Number.parseInt(left.slice(8, 12), 10), b = Number.parseInt(right.slice(8, 12), 10);
    if (a !== b) return a - b;
    const weight = (value) => value.includes("assertions") ? 3 : value.includes("freeze") || value.includes("grants") ? 2 : 1;
    return weight(left) - weight(right) || left.localeCompare(right);
  });
}
function escape(value) { return value.replaceAll("'", "''"); }
function envelope(output) { const line = output.stdout.trim().split("\n").at(-1); return line ? JSON.parse(line) : null; }
function publicCall(box, expression, database = DB) { return envelope(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result_payload',result_payload) FROM ${expression};COMMIT;`, database)); }
function candidates(keyId = "session_01", digest = SESSION_DIGEST) { return escape(JSON.stringify([{ keyId, digest }])); }
function authStart(box, hostname = HOST_A, challenge = CHALLENGE_A, emailDigest = EMAIL_DIGEST, codeDigest = CODE_DIGEST, suffix = "083") {
  return publicCall(box, `saas.public_account_auth_start('${hostname}','${NOW}','${challenge}','${emailDigest}','${"f".repeat(64)}','code_01','${codeDigest}','2026-08-04T09:10:00Z','70000000-0000-4000-8000-000000000${suffix}','encrypted-recipient-authority-${suffix}','{"name":"Güzide"}'::jsonb,'correlation_${suffix}')`);
}
function verifySql({ hostname = HOST_A, challenge = CHALLENGE_A, emailDigest = EMAIL_DIGEST, codeDigest = CODE_DIGEST, account = ACCOUNT_A, session = SESSION_A, sessionDigest = SESSION_DIGEST, email = "ada@example.test", correlation = "verify_00083" } = {}) {
  return `saas.public_account_auth_verify('${hostname}','${NOW}','${challenge}','${emailDigest}','${codeDigest}','${email}','${account}','${session}','session_01','${sessionDigest}','${CSRF_DIGEST}','Safari macOS','${UA_DIGEST}','${correlation}')`;
}
async function scenario(name, run) { await run(); completed += 1; console.log(`PASS ${completed}/${TOTAL} ${name}`); }

function seed(box) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
('${STORE_A}','Identity A','identity-a','active','tr','TRY','starter','2026-01-01','2026-01-01'),
('${STORE_B}','Identity B','identity-b','active','tr','TRY','starter','2026-01-01','2026-01-01');
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
('11000000-0000-4000-8000-000000000083','${STORE_A}','00000000-0000-4000-8000-000000000001','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01'),
('11000000-0000-4000-8000-000000000084','${STORE_B}','00000000-0000-4000-8000-000000000001','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES
('12000000-0000-4000-8000-000000000083','${STORE_A}','${HOST_A}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1),
('12000000-0000-4000-8000-000000000084','${STORE_B}','${HOST_B}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,phone,created_at,updated_at) VALUES('${CUSTOMER_A}','${STORE_A}','active','Ada','Lovelace','ada@example.test','+905551112233','2026-01-01','2026-01-01');
INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES('21000000-0000-4000-8000-000000000084','${STORE_B}','gumus-kolye','Gümüş Kolye','active','TRY',1,'2026-01-01','2026-01-01');
INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at,customer_id) VALUES('${ORDER_A}','${STORE_A}','CX-083','storefront','Ada Lovelace','ada@example.test','+905551112233','TRY',12000,0,0,12000,'delivered','completed','{}',1,'2026-07-01','2026-07-01','${CUSTOMER_A}');
INSERT INTO saas.order_items(id,store_id,order_id,position,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at) VALUES('31000000-0000-4000-8000-000000000083','${STORE_A}','${ORDER_A}',0,'Altın Yüzük',12000,1,0,12000,'2026-07-01');
COMMIT;`);
}

async function main() {
  let box;
  try {
    for (const file of [UP, DOWN, ASSERTIONS]) assert.equal(existsSync(path.join(SQL, file)), true, file);
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const file of migrations()) apply(box, file);
    apply(box, "202607310072_storefront_cart_checkout.up.sql");
    apply(box, UP); apply(box, ASSERTIONS);
    psql(box, `CREATE DATABASE ${EMPTY} TEMPLATE ${DB};`, "postgres");
    seed(box);

    await scenario("PostgreSQL 16 installs identity migration 083", () => assert.match(psql(box, "SHOW server_version;").stdout, /^16[.]/));
    await scenario("auth start stores only digests and encrypted recipient authority", () => { const result = authStart(box); assert.equal(result.outcome, "accepted"); assert.equal(psql(box, `SELECT count(*) FROM saas.storefront_login_challenges WHERE code_digest='${CODE_DIGEST}' AND email_digest='${EMAIL_DIGEST}';`).stdout.trim(), "1"); assert.doesNotMatch(psql(box, "SELECT row_to_json(challenge)::text FROM saas.storefront_login_challenges challenge;").stdout, /ada@example/u); });
    await scenario("concurrent verification consumes one challenge and creates one session", async () => { const sql = (call) => `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome FROM ${call};COMMIT;`; const outcomes = (await Promise.all([psqlAsync(box, sql(verifySql())), psqlAsync(box, sql(verifySql({ account: "50000000-0000-4000-8000-000000000084", session: "60000000-0000-4000-8000-000000000084", sessionDigest: "9".repeat(64), correlation: "verify_00084" })))] )).map(({ stdout }) => stdout.trim().split("\n").at(-1)).sort(); assert.deepEqual(outcomes, ["authenticated", "challenge_invalid"]); assert.equal(psql(box, "SELECT count(*) FROM saas.storefront_accounts;").stdout.trim(), "1"); assert.equal(psql(box, "SELECT count(*) FROM saas.storefront_account_sessions;").stdout.trim(), "1"); });
    await scenario("consumed code replay fails closed", () => assert.equal(publicCall(box, verifySql({ account: "50000000-0000-4000-8000-000000000085", session: "60000000-0000-4000-8000-000000000085", sessionDigest: "8".repeat(64), correlation: "verify_00085" })).outcome, "challenge_invalid"));
    await scenario("verified account claims exact historical same-store order", () => { assert.equal(psql(box, "SELECT count(*) FROM saas.storefront_account_order_links;").stdout.trim(), "1"); const result = publicCall(box, `saas.public_account_orders('${HOST_A}','${NOW}','${candidates()}'::jsonb,20,NULL)`); assert.equal(result.outcome, "found"); assert.equal(result.result_payload.items[0].orderReference, "CX-083"); assert.doesNotMatch(JSON.stringify(result), /orderId|storeId|customerId/u); });
    await scenario("session resolves only on its exact storefront hostname", () => { assert.equal(publicCall(box, `saas.public_account_session_get('${HOST_A}','${NOW}','${candidates()}'::jsonb)`).outcome, "found"); assert.equal(publicCall(box, `saas.public_account_session_get('${HOST_B}','${NOW}','${candidates()}'::jsonb)`).outcome, "unauthenticated"); });
    await scenario("the same email creates an independent account in another store", () => { const challenge = "40000000-0000-4000-8000-000000000084", digest = "1".repeat(64); assert.equal(authStart(box, HOST_B, challenge, "2".repeat(64), digest, "084").outcome, "accepted"); const result = publicCall(box, verifySql({ hostname: HOST_B, challenge, emailDigest: "2".repeat(64), codeDigest: digest, account: "50000000-0000-4000-8000-000000000086", session: "60000000-0000-4000-8000-000000000086", sessionDigest: "3".repeat(64), correlation: "verify_00086" })); assert.equal(result.outcome, "profile_required"); assert.equal(psql(box, "SELECT count(DISTINCT store_id) FROM saas.storefront_accounts WHERE email_normalized='ada@example.test';").stdout.trim(), "2"); });
    await scenario("registration profile completion rotates to one full session", () => { const result = publicCall(box, `saas.public_account_profile_complete('${HOST_B}','2026-08-04T09:01:00Z','${candidates("session_01", "3".repeat(64))}'::jsonb,'51000000-0000-4000-8000-000000000084','${"4".repeat(64)}','22000000-0000-4000-8000-000000000084','Ada','Lovelace',NULL,'61000000-0000-4000-8000-000000000084','session_01','${"4".repeat(64)}','${"5".repeat(64)}','Chrome macOS','${UA_DIGEST}','profile_00084')`); assert.equal(result.outcome, "committed"); assert.equal(psql(box, `SELECT status||'|'||(customer_id IS NOT NULL)::text FROM saas.storefront_accounts WHERE store_id='${STORE_B}';`).stdout.trim(), "active|true"); assert.equal(psql(box, `SELECT count(*) FROM saas.storefront_account_sessions WHERE store_id='${STORE_B}' AND session_kind='full' AND revoked_at IS NULL;`).stdout.trim(), "1"); });
    await scenario("account address writes are versioned and visible only through the full session", () => { const credentials = candidates("session_01", "4".repeat(64)); const result = publicCall(box, `saas.public_account_address_save('${HOST_B}','2026-08-04T09:02:00Z','${credentials}'::jsonb,'52000000-0000-4000-8000-000000000084','${"6".repeat(64)}','23000000-0000-4000-8000-000000000084','Ev','Ada Lovelace','Örnek Sokak 1',NULL,'İstanbul','Kadıköy','34710','TR',true,0,'address_00084')`); assert.equal(result.outcome, "committed"); const snapshot = publicCall(box, `saas.public_account_session_get('${HOST_B}','2026-08-04T09:02:00Z','${credentials}'::jsonb)`); assert.equal(snapshot.result_payload.addresses[0].label, "Ev"); assert.equal(snapshot.result_payload.addresses[0].isDefault, true); });
    await scenario("favorites and profile updates persist server-authorized store data", () => { const credentials = candidates("session_01", "4".repeat(64)); assert.equal(publicCall(box, `saas.public_account_favorite_set('${HOST_B}','2026-08-04T09:03:00Z','${credentials}'::jsonb,'53000000-0000-4000-8000-000000000084','${"7".repeat(64)}','21000000-0000-4000-8000-000000000084',true,'favorite_00084')`).outcome, "committed"); assert.equal(publicCall(box, `saas.public_account_profile_update('${HOST_B}','2026-08-04T09:03:00Z','${credentials}'::jsonb,'54000000-0000-4000-8000-000000000084','${"8".repeat(64)}','Ada','Byron','+905551112233',2,'profile_00085')`).outcome, "committed"); const snapshot = publicCall(box, `saas.public_account_session_get('${HOST_B}','2026-08-04T09:03:00Z','${credentials}'::jsonb)`); assert.equal(snapshot.result_payload.profile.lastName, "Byron"); assert.equal(snapshot.result_payload.favorites.length, 1); });
    await scenario("session list and logout-all revoke every device for only that account", () => { const credentials = candidates("session_01", "4".repeat(64)); const sessions = publicCall(box, `saas.public_account_sessions('${HOST_B}','2026-08-04T09:04:00Z','${credentials}'::jsonb)`); assert.equal(sessions.result_payload.items.length, 1); assert.equal(publicCall(box, `saas.public_account_logout_all('${HOST_B}','2026-08-04T09:04:00Z','${credentials}'::jsonb,'logoutall_00084')`).outcome, "logged_out"); assert.equal(publicCall(box, `saas.public_account_session_get('${HOST_B}','2026-08-04T09:04:00Z','${credentials}'::jsonb)`).outcome, "unauthenticated"); });
    await scenario("guest cart authority remains callable and independent", () => { const result = publicCall(box, `saas.public_cart_resolve('${HOST_A}','${NOW}','${escape(JSON.stringify([{ keyId: "guest_01", digest: "7".repeat(64) }]))}'::jsonb)`); assert.equal(result.outcome, "not_found"); });
    await scenario("runtime roles have zero direct identity table authority", () => { for (const role of ["celebix_saas_app", "celebix_saas_host_resolver"]) assert.notEqual(psql(box, `SET ROLE ${role};SELECT count(*) FROM saas.storefront_accounts;`, DB, true).status, 0); });
    await scenario("only host resolver executes public account functions", () => { const signature = "saas.public_account_session_get(text,timestamp with time zone,jsonb)"; assert.equal(psql(box, `SELECT has_function_privilege('celebix_saas_host_resolver','${signature}','EXECUTE');`).stdout.trim(), "t"); assert.equal(psql(box, `SELECT has_function_privilege('celebix_saas_app','${signature}','EXECUTE');`).stdout.trim(), "f"); });
    await scenario("logout revokes only the current store-scoped session", () => { const result = publicCall(box, `saas.public_account_logout('${HOST_A}','2026-08-04T09:01:00Z','${candidates()}'::jsonb,'logout_00083')`); assert.equal(result.outcome, "logged_out"); assert.equal(publicCall(box, `saas.public_account_session_get('${HOST_A}','2026-08-04T09:01:00Z','${candidates()}'::jsonb)`).outcome, "unauthenticated"); });
    await scenario("rollback refuses durable identity data", () => { psql(box, `ALTER DATABASE ${DB} SET celebix.allow_storefront_customer_identity_down='on';`, "postgres"); const result = psql(box, readFileSync(path.join(SQL, DOWN), "utf8"), DB, true); assert.notEqual(result.status, 0); assert.match(result.stderr, /STOREFRONT_CUSTOMER_IDENTITY_DOWN_BLOCKED/u); });
    await scenario("guarded rollback and reapply preserve guest commerce in an empty database", () => { psql(box, `ALTER DATABASE ${EMPTY} SET celebix.allow_storefront_customer_identity_down='on';`, "postgres"); apply(box, DOWN, EMPTY); assert.equal(psql(box, "SELECT to_regprocedure('saas.public_cart_resolve(text,timestamp with time zone,jsonb)') IS NOT NULL;", EMPTY).stdout.trim(), "t"); apply(box, UP, EMPTY); apply(box, ASSERTIONS, EMPTY); });
    await scenario("disposable cluster has no leaked database sessions", () => assert.equal(psql(box, "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid();").stdout.trim(), "0"));
    assert.equal(completed, TOTAL);
    console.log(`${TOTAL}/${TOTAL} PASS`);
  } finally { stop(box); }
}

await main();
