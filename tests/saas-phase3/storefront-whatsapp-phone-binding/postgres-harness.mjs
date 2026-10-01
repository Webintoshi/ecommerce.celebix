import assert from "node:assert/strict";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const DB = "storefront_phone_binding";
const UP = "202610010190_storefront_whatsapp_phone_binding.up.sql";
const DOWN = "202610010190_storefront_whatsapp_phone_binding.down.sql";
const ASSERTIONS = "202610010190_storefront_whatsapp_phone_binding_assertions.sql";
const STORE_A = "10000000-0000-4000-8000-000000000190";
const STORE_B = "10000000-0000-4000-8000-000000000191";
const HOST_A = "phone-binding-a.saas-staging.celebix.site";
const HOST_B = "phone-binding-b.saas-staging.celebix.site";
const NOW = "2026-10-01T09:00:00.000Z";
const CODE = "b".repeat(64), CSRF = "d".repeat(64), UA = "e".repeat(64);
const TYPES = "text,timestamp with time zone,uuid,text,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text";
const OLD_SIGNATURE = `saas.public_account_auth_verify_phone(${TYPES})`;
const NEW_SIGNATURE = `saas.public_account_auth_verify_phone_v2(${TYPES},jsonb)`;
const ENV = { PATH: process.env.PATH, HOME: process.env.HOME, LC_ALL: "C", LANG: "C" };
const id = (n, prefix = 4) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const digest = (n) => Number(n).toString(16).padStart(64, "0");
const phone = (n) => `+90555${String(n).padStart(7, "0")}`;
const at = (seconds = 0) => new Date(Date.parse(NOW) + seconds * 1000).toISOString();
const quote = (value) => value === null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${quote(JSON.stringify(value))}::jsonb`;
const credentials = (n) => [{ keyId: "session_01", digest: digest(n) }];
let completed = 0;

function executable(name) {
  const directories = [process.env.POSTGRES_BIN, ...(process.env.PATH ?? "").split(path.delimiter)];
  try { directories.push(...readdirSync(path.join(homedir(), ".codex", "tmp"), { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^postgresql-16[.]/.test(entry.name)).map((entry) => path.join(homedir(), ".codex", "tmp", entry.name, "bin"))); } catch {}
  for (const directory of directories) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch {}
  }
  throw new Error(`DISPOSABLE_DB_EXECUTION_BLOCKED: missing ${name}`);
}
function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, { cwd: ROOT, input, encoding: "utf8", env: ENV, maxBuffer: 128 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}
function start() {
  assertSafeEnvironment();
  const tools = Object.fromEntries(["initdb", "pg_ctl", "psql"].map((name) => [name, executable(name)]));
  const root = mkdtempSync("/tmp/celebix-phone-binding-");
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
function args(box, database = DB) { return ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database]; }
function psql(box, sql, database = DB) { return command(box.tools.psql, args(box, database), sql).stdout.trim(); }
function psqlAsync(box, sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(box.tools.psql, args(box), { cwd: ROOT, env: ENV });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => status === 0 ? resolve(stdout.trim()) : reject(new Error(stderr)));
    child.stdin.end(sql);
  });
}
function apply(box, file) { return psql(box, readFileSync(path.join(SQL, file), "utf8")); }
function migrations() {
  const accepted = /(?:[.]up|[.]seed|[.]freeze|_grants|_assertions|catalog_assertions)[.]sql$/;
  const weight = (value) => value.includes("assertions") ? 3 : value.includes("freeze") || value.includes("grants") ? 2 : 1;
  return readdirSync(SQL).filter((file) => Number.parseInt(file.slice(8, 12), 10) <= 71 && accepted.test(file) && !file.includes(".down.")).sort((a, b) => Number.parseInt(a.slice(8, 12), 10) - Number.parseInt(b.slice(8, 12), 10) || weight(a) - weight(b) || a.localeCompare(b));
}
function callSql(expression) { return `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result_payload',result_payload) FROM ${expression};COMMIT;`; }
function envelope(output) { return JSON.parse(output.split("\n").at(-1)); }
function publicCall(box, expression) { return envelope(psql(box, callSql(expression))); }
function hasV2(box) { return psql(box, `SELECT pg_catalog.to_regprocedure(${quote(NEW_SIGNATURE)}) IS NOT NULL;`) === "t"; }
function verifySql(box, n, options = {}) {
  const { host = HOST_A, seconds = 0, challengedPhone = phone(n), phoneDigest = digest(n + 100000), code = CODE, names = false, candidateCredentials = credentials(n), session = n + 100000, customer = n + 100000, account = n + 100000 } = options;
  const values = [host, at(seconds), id(n), phoneDigest, code, challengedPhone, names ? "Yeni" : null, names ? "Müşteri" : null, id(customer, 2), id(account, 5), id(session, 6), "session_01", digest(session), CSRF, "Safari macOS", UA, `phone_verify_${session}`].map(quote);
  if (hasV2(box)) values.push(json(candidateCredentials));
  return `saas.${hasV2(box) ? "public_account_auth_verify_phone_v2" : "public_account_auth_verify_phone"}(${values.join(",")})`;
}
function verify(box, n, options) { return publicCall(box, verifySql(box, n, options)); }
function challenge(box, n, options = {}) {
  const { host = HOST_A, phoneDigest = digest(n + 100000) } = options;
  assert.equal(publicCall(box, `saas.public_account_auth_start_phone(${quote(host)},${quote(NOW)},${quote(id(n))},${quote(phoneDigest)},${quote(digest(n + 200000))},'code_01',${quote(CODE)},${quote(at(600))},'phone_start_${n}')`).outcome, "accepted");
  assert.equal(publicCall(box, `saas.public_account_auth_phone_delivery(${quote(host)},${quote(NOW)},${quote(id(n))},${quote(phoneDigest)},true)`).outcome, "committed");
}
function seedStores(box) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
('${STORE_A}','Phone binding A','phone-binding-a','active','tr','TRY','starter','2026-01-01','2026-01-01'),
('${STORE_B}','Phone binding B','phone-binding-b','active','tr','TRY','starter','2026-01-01','2026-01-01');
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
('${id(190, 1)}','${STORE_A}','00000000-0000-4000-8000-000000000001','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01'),
('${id(191, 1)}','${STORE_B}','00000000-0000-4000-8000-000000000001','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES
('${id(190, 9)}','${STORE_A}','${HOST_A}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1),
('${id(191, 9)}','${STORE_B}','${HOST_B}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);COMMIT;`);
}
function seedIdentity(box, n, options = {}) {
  const { store = STORE_A, status = "active", kind = "full", expired = false, revoked = false, future = false, emailIdentity = true, verifiedPhone = null, customerPhone = phone(n), history = false } = options;
  const created = at(future ? 600 : kind === "full" ? -3600 : -300), absolute = kind === "full" ? at(29 * 86400) : at(600), idle = expired ? at(-1) : kind === "full" ? at(7 * 86400) : absolute;
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,phone,created_at,updated_at) VALUES('${id(n, 2)}','${store}','active','Ada','Lovelace','ada${n}@example.test',${quote(customerPhone)},'2026-01-01','2026-01-01');
INSERT INTO saas.storefront_accounts(id,store_id,customer_id,email,email_normalized,phone_normalized,phone_verified_at,status,verified_at,last_login_at,created_at,updated_at) VALUES('${id(n, 5)}','${store}','${id(n, 2)}',${quote(emailIdentity ? `ada${n}@example.test` : null)},${quote(emailIdentity ? `ada${n}@example.test` : null)},${quote(verifiedPhone)},${verifiedPhone ? quote(created) : "NULL"},'${status}','${created}','${created}','${created}','${created}');
INSERT INTO saas.storefront_account_sessions(id,store_id,account_id,session_kind,key_id,credential_digest,csrf_digest,device_label,user_agent_digest,created_at,last_seen_at,idle_expires_at,absolute_expires_at,revoked_at,revocation_reason) VALUES('${id(n, 6)}','${store}','${id(n, 5)}','${kind}','session_01','${digest(n)}','${CSRF}','Safari macOS','${UA}','${created}','${created}','${idle}','${absolute}',${revoked ? quote(at(-60)) : "NULL"},${revoked ? "'logout'" : "NULL"});
${history ? `INSERT INTO saas.customer_addresses(id,store_id,customer_id,label,recipient_name,line1,city,country,is_default,created_at,updated_at) VALUES('${id(n, 7)}','${store}','${id(n, 2)}','Ev','Ada Lovelace','Fixture street','Ordu','TR',true,'2026-01-01','2026-01-01');
INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at,customer_id) VALUES('${id(n, 3)}','${store}','PHONE-${n}','storefront','Ada Lovelace','ada${n}@example.test',${quote(customerPhone)},'TRY',12000,0,0,12000,'delivered','completed','{}',1,'2026-07-01','2026-07-01','${id(n, 2)}');
INSERT INTO saas.order_items(id,store_id,order_id,position,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at) VALUES('${id(n, 8)}','${store}','${id(n, 3)}',0,'Altın Yüzük',12000,1,0,12000,'2026-07-01');` : ""}
COMMIT;`);
}
function red(box, n, label) {
  seedIdentity(box, n); challenge(box, n);
  const actual = verify(box, n).outcome;
  let failure;
  try { assert.equal(actual, "authenticated", "authenticated owner should bind their stored phone"); } catch (error) { failure = error; }
  assert.ok(failure, "predecessor must exhibit the missing binding behavior");
  assert.equal(actual, "identity_conflict");
  assert.equal(psql(box, `SELECT phone_normalized IS NULL FROM saas.storefront_accounts WHERE id='${id(n, 5)}';`), "t");
  console.log(`RED ${label}: expected authenticated, received identity_conflict; existing account remains unbound`);
}
function metadata(box) {
  return JSON.parse(psql(box, `SELECT pg_catalog.jsonb_build_object(
    'schema',(SELECT pg_catalog.to_jsonb(n) FROM pg_catalog.pg_namespace n WHERE n.nspname='saas'),
    'oldVerifier',(SELECT pg_catalog.to_jsonb(p)||pg_catalog.jsonb_build_object('definition',pg_catalog.pg_get_functiondef(p.oid)) FROM pg_catalog.pg_proc p WHERE p.oid=${quote(OLD_SIGNATURE)}::regprocedure),
    'context',(SELECT pg_catalog.to_jsonb(p)||pg_catalog.jsonb_build_object('definition',pg_catalog.pg_get_functiondef(p.oid)) FROM pg_catalog.pg_proc p WHERE p.oid='saas.storefront_identity_session_context(text,timestamp with time zone,jsonb,boolean)'::regprocedure),
    'tables',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',c.relname,'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
      'columns',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) ORDER BY a.attnum) FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0),
      'constraints',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(k) ORDER BY k.oid) FROM pg_catalog.pg_constraint k WHERE k.conrelid=c.oid),
      'policies',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) ORDER BY p.oid) FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid),
      'triggers',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY t.oid) FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid)) ORDER BY c.relname)
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relkind='r'));`));
}
function history(box, n) {
  return JSON.parse(psql(box, `SELECT pg_catalog.jsonb_build_object(
    'customer',(SELECT pg_catalog.to_jsonb(c) FROM saas.customers c WHERE id='${id(n, 2)}'),
    'account',(SELECT pg_catalog.to_jsonb(a)-ARRAY['phone_normalized','phone_verified_at','last_login_at','updated_at','version'] FROM saas.storefront_accounts a WHERE id='${id(n, 5)}'),
    'originalSession',(SELECT pg_catalog.to_jsonb(s) FROM saas.storefront_account_sessions s WHERE id='${id(n, 6)}'),
    'addresses',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) ORDER BY a.id) FROM saas.customer_addresses a WHERE customer_id='${id(n, 2)}'),
    'orders',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(o) ORDER BY o.id) FROM saas.orders o WHERE customer_id='${id(n, 2)}'),
    'items',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(i) ORDER BY i.id) FROM saas.order_items i JOIN saas.orders o ON o.id=i.order_id WHERE o.customer_id='${id(n, 2)}'),
    'links',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(l) ORDER BY l.order_id) FROM saas.storefront_account_order_links l WHERE account_id='${id(n, 5)}'));`));
}
function bindingState(box, n) {
  return JSON.parse(psql(box, `SELECT pg_catalog.jsonb_build_object(
    'accounts',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) ORDER BY a.id) FROM saas.storefront_accounts a),
    'customers',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) ORDER BY c.id) FROM saas.customers c),
    'sessions',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) ORDER BY s.id) FROM saas.storefront_account_sessions s),
    'addresses',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) ORDER BY a.id) FROM saas.customer_addresses a),
    'orders',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(o) ORDER BY o.id) FROM saas.orders o),
    'items',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(i) ORDER BY i.id) FROM saas.order_items i),
    'links',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(l) ORDER BY l.store_id,l.account_id,l.order_id) FROM saas.storefront_account_order_links l),
    'audit',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) ORDER BY a.id) FROM saas.storefront_identity_audit a),
    'challenge',(SELECT pg_catalog.to_jsonb(c) FROM saas.storefront_login_challenges c WHERE id='${id(n)}'))`));
}
function consumed(box, n) { return psql(box, `SELECT consumed_at IS NOT NULL FROM saas.storefront_login_challenges WHERE id='${id(n)}';`) === "t"; }
async function scenario(name, run) { await run(); console.log(`PASS ${++completed} ${name}`); }
function assertBound(box, n, challengedPhone = phone(n)) {
  assert.equal(psql(box, `SELECT phone_normalized=${quote(challengedPhone)} AND phone_verified_at='${NOW}' AND status='active' AND customer_id='${id(n, 2)}' AND email_normalized='ada${n}@example.test' FROM saas.storefront_accounts WHERE id='${id(n, 5)}';`), "t");
}
function deny(box, n, options = {}) {
  const before = bindingState(box, n);
  const result = verify(box, n, options);
  assert.equal(result.outcome, "identity_conflict");
  assert.equal(result.result_payload, null);
  assert.deepEqual(bindingState(box, n), before, "rejected binding must not alter any customer, account, session or OTP");
}
async function green(box) {
  assert.ok(hasV2(box));
  await scenario("same-store full email account binds matching phone and preserves customer/history", () => {
    seedIdentity(box, 1902, { history: true }); challenge(box, 1902);
    const before = history(box, 1902);
    assert.deepEqual(verify(box, 1902), { outcome: "authenticated", result_payload: { profileRequired: false } });
    assertBound(box, 1902); assert.ok(consumed(box, 1902));
    assert.deepEqual(history(box, 1902), before);
    assert.equal(psql(box, `SELECT account_id='${id(1902, 5)}' AND session_kind='full' FROM saas.storefront_account_sessions WHERE id='${id(101902, 6)}';`), "t");
    assert.equal(psql(box, `SELECT count(*) FROM saas.storefront_identity_audit WHERE account_id='${id(1902, 5)}' AND event_code='account_created';`), "0");
  });
  await scenario("consumed OTP cannot replay or create a second session", () => {
    const before = bindingState(box, 1902);
    assert.equal(verify(box, 1902, { session: 301902 }).outcome, "challenge_invalid");
    assert.deepEqual(bindingState(box, 1902), before);
  });
  await scenario("anonymous matching contact cannot claim the email account", () => {
    seedIdentity(box, 1910); challenge(box, 1910); deny(box, 1910, { candidateCredentials: [] });
  });
  await scenario("another account credential cannot bind the target customer's phone", () => {
    seedIdentity(box, 1911); seedIdentity(box, 1912); challenge(box, 1911);
    deny(box, 1911, { candidateCredentials: credentials(1912) });
  });
  await scenario("another store's credential cannot bind the target account", () => {
    seedIdentity(box, 1913); seedIdentity(box, 1914, { store: STORE_B }); challenge(box, 1913);
    deny(box, 1913, { candidateCredentials: credentials(1914) });
  });
  for (const [name, options, n] of [["registration", { kind: "registration" }, 1920], ["suspended account", { status: "suspended" }, 1921], ["expired session", { expired: true }, 1922], ["revoked session", { revoked: true }, 1923], ["future session", { future: true }, 1929], ["phone-only account", { emailIdentity: false, verifiedPhone: phone(1933) }, 1933]]) {
    await scenario(`${name} cannot authorize phone binding`, () => { seedIdentity(box, n, options); challenge(box, n); deny(box, n); });
  }
  await scenario("archived customer cannot authorize phone binding", () => {
    seedIdentity(box, 1924); challenge(box, 1924);
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.customers SET status='archived',archived_at='${NOW}',updated_at='${NOW}',version=version+1 WHERE id='${id(1924, 2)}';COMMIT;`);
    deny(box, 1924);
  });
  await scenario("credential and stored customer phone must agree", () => {
    seedIdentity(box, 1925); challenge(box, 1925); deny(box, 1925, { challengedPhone: phone(2925) });
  });
  await scenario("a verified account's existing different phone cannot be replaced", () => {
    seedIdentity(box, 1926, { verifiedPhone: phone(2926) }); challenge(box, 1926); deny(box, 1926);
  });
  await scenario("phone already verified by another account cannot switch the current identity", () => {
    seedIdentity(box, 1927); seedIdentity(box, 1928, { verifiedPhone: phone(1927) }); challenge(box, 1927); deny(box, 1927);
  });
  await scenario("malformed credential JSON is rejected without consuming OTP", () => {
    seedIdentity(box, 1930); challenge(box, 1930);
    for (const invalid of [null, {}, [{}], [null], "scalar", 7, [{ keyId: "session_01", digest: "invalid" }], [{ keyId: "session_01", digest: digest(1930), extra: true }]]) {
      const before = bindingState(box, 1930);
      assert.equal(verify(box, 1930, { candidateCredentials: invalid }).outcome, "invalid_input");
      assert.deepEqual(bindingState(box, 1930), before);
    }
  });
  await scenario("wrong codes increment attempts and the sixth locks the challenge", () => {
    seedIdentity(box, 1931); challenge(box, 1931);
    for (let attempt = 1; attempt <= 6; attempt++) {
      assert.equal(verify(box, 1931, { code: digest(999) }).outcome, "challenge_invalid");
      assert.equal(psql(box, `SELECT attempt_count::text||':'||(locked_at IS NOT NULL)::text FROM saas.storefront_login_challenges WHERE id='${id(1931)}';`), `${attempt}:${attempt === 6}`);
    }
    assert.equal(verify(box, 1931).outcome, "challenge_invalid");
    assert.equal(consumed(box, 1931), false);
    assert.equal(psql(box, `SELECT phone_normalized IS NULL FROM saas.storefront_accounts WHERE id='${id(1931, 5)}';`), "t");
  });
  await scenario("two concurrent correct verifications consume exactly once", async () => {
    seedIdentity(box, 1932); challenge(box, 1932);
    const first = verifySql(box, 1932, { session: 201932 }), second = verifySql(box, 1932, { session: 301932 });
    const results = await Promise.all([psqlAsync(box, callSql(first)), psqlAsync(box, callSql(second))]);
    assert.deepEqual(results.map((result) => envelope(result).outcome).sort(), ["authenticated", "challenge_invalid"]);
    assertBound(box, 1932); assert.ok(consumed(box, 1932));
    assert.equal(psql(box, `SELECT count(*) FROM saas.storefront_account_sessions WHERE id IN ('${id(201932, 6)}','${id(301932, 6)}');`), "1");
    assert.equal(psql(box, `SELECT count(*) FROM saas.storefront_identity_audit WHERE challenge_id='${id(1932)}' AND event_code='challenge_consumed';`), "1");
  });
  await scenario("anonymous fresh phone with nullable names still enters profile completion", () => {
    challenge(box, 1940);
    assert.deepEqual(verify(box, 1940, { candidateCredentials: [] }), { outcome: "profile_required", result_payload: { profileRequired: true } });
    assert.equal(psql(box, `SELECT status='pending_profile' AND customer_id IS NULL AND email IS NULL AND phone_normalized='${phone(1940)}' FROM saas.storefront_accounts WHERE id='${id(101940, 5)}';`), "t");
    assert.equal(publicCall(box, `saas.public_account_profile_complete('${HOST_A}','${NOW}',${json(credentials(101940))},'${id(1940, 9)}','${digest(1940)}','${id(101940, 2)}','Yeni','Müşteri',NULL,'${id(301940, 6)}','session_01','${digest(301940)}','${CSRF}','Safari macOS','${UA}','profile_complete_1940')`).outcome, "committed");
    assert.equal(psql(box, `SELECT phone='${phone(1940)}' AND email IS NULL AND first_name='Yeni' AND last_name='Müşteri' FROM saas.customers WHERE id='${id(101940, 2)}';`), "t");
  });
  await scenario("anonymous fresh phone with names still creates an active phone account", () => {
    challenge(box, 1941);
    assert.equal(verify(box, 1941, { candidateCredentials: [], names: true }).outcome, "authenticated");
    assert.equal(psql(box, `SELECT status='active' AND email IS NULL AND phone_normalized='${phone(1941)}' FROM saas.storefront_accounts WHERE id='${id(101941, 5)}';`), "t");
  });
  await scenario("already verified phone still logs in anonymously without historical order claims", () => {
    seedIdentity(box, 1942, { verifiedPhone: phone(1942), history: true }); challenge(box, 1942);
    const before = history(box, 1942);
    assert.equal(verify(box, 1942, { candidateCredentials: [] }).outcome, "authenticated");
    assert.deepEqual(history(box, 1942), before);
  });
  await scenario("same phone verified in another store remains scoped to each store", () => {
    seedIdentity(box, 1943, { verifiedPhone: phone(1943) });
    seedIdentity(box, 1944, { store: STORE_B, verifiedPhone: phone(1943), customerPhone: phone(1943) });
    challenge(box, 1943); challenge(box, 1944, { host: HOST_B });
    assert.equal(verify(box, 1943, { candidateCredentials: [] }).outcome, "authenticated");
    assert.equal(verify(box, 1944, { host: HOST_B, challengedPhone: phone(1943), candidateCredentials: [] }).outcome, "authenticated");
    assert.equal(psql(box, `SELECT account_id='${id(1944, 5)}' AND store_id='${STORE_B}' FROM saas.storefront_account_sessions WHERE id='${id(101944, 6)}';`), "t");
  });
  await scenario("customer email drift cannot bind using the previous email account", () => {
    seedIdentity(box, 1945, { history: true }); challenge(box, 1945);
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.customers SET email='changed1945@example.test',updated_at='${NOW}',version=version+1 WHERE id='${id(1945, 2)}';COMMIT;`);
    const preserved = history(box, 1945);
    deny(box, 1945);
    assert.deepEqual(history(box, 1945), preserved);
  });
}
async function main() {
  let box;
  try {
    box = start(); psql(box, `CREATE DATABASE ${DB};`, "postgres");
    assert.match(psql(box, "SHOW server_version;"), /^16[.]/);
    for (const file of migrations()) apply(box, file);
    for (const file of ["202607310072_storefront_cart_checkout.up.sql", "202608040084_storefront_customer_identity.up.sql", "202608040084_storefront_customer_identity_assertions.sql", "202608040085_storefront_magic_link_auth.up.sql", "202608040085_storefront_magic_link_auth_assertions.sql", "202610010187_storefront_whatsapp_identity.up.sql", "202610010187_storefront_whatsapp_identity_assertions.sql", "202610010188_storefront_checkout_international_phone.up.sql"]) apply(box, file);
    seedStores(box); red(box, 1901, "old17 authenticated existing account");
    if (process.argv.includes("--red-only")) return;
    const before = metadata(box);
    assert.equal(psql(box, `SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(${quote(OLD_SIGNATURE)}::regprocedure),'UTF8')),'hex');`), "b0a88aa6ef832bb0213bcdaf6494a2ea65106876ab358bbe1908587c99848338");
    apply(box, UP);
    apply(box, ASSERTIONS);
    assert.deepEqual(metadata(box), before, "UP must retain original function bodies, table ACL/RLS, owners and contracts");
    const newFunction = JSON.parse(psql(box, `SELECT pg_catalog.jsonb_build_object('owner',r.rolname,'definer',p.prosecdef,'config',p.proconfig,'grants',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE (SELECT rolname FROM pg_catalog.pg_roles WHERE oid=a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee,a.privilege_type) FROM pg_catalog.aclexplode(p.proacl) a)) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid=p.proowner WHERE p.oid=${quote(NEW_SIGNATURE)}::regprocedure;`));
    assert.equal(newFunction.owner, "celebix_saas_owner"); assert.equal(newFunction.definer, true);
    assert.deepEqual(newFunction.config, ["search_path=pg_catalog, saas"]);
    assert.deepEqual(newFunction.grants.map((grant) => grant.role).sort(), ["celebix_saas_host_resolver", "celebix_saas_owner"]);
    assert.ok(newFunction.grants.every((grant) => grant.privilege === "EXECUTE" && !grant.grantable));
    await green(box);
    apply(box, DOWN); assert.equal(hasV2(box), false); assert.deepEqual(metadata(box), before);
    red(box, 1903, "DOWN restores old17 behavior");
    assert.equal(psql(box, `SELECT phone_normalized='${phone(1902)}' AND phone_verified_at IS NOT NULL FROM saas.storefront_accounts WHERE id='${id(1902, 5)}';`), "t", "DOWN preserves committed identity data");
    apply(box, UP); apply(box, ASSERTIONS); assert.deepEqual(metadata(box), before);
    await scenario("reapply restores binding and leaves original ACL/RLS/function bodies unchanged", () => {
      seedIdentity(box, 1904); challenge(box, 1904); assert.equal(verify(box, 1904).outcome, "authenticated"); assertBound(box, 1904);
    });
    console.log(`PASS native PostgreSQL 16 phone binding ${completed}/${completed}; UP/DOWN/reapply metadata and old17 unchanged`);
  } finally { stop(box); }
}
main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
