import assert from "node:assert/strict";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const DB = "storefront_whatsapp_identity";
const EMPTY = "storefront_whatsapp_identity_empty";
const UP = "202608040084_storefront_customer_identity.up.sql";
const DOWN = "202608040084_storefront_customer_identity.down.sql";
const ASSERTIONS = "202608040084_storefront_customer_identity_assertions.sql";
const MAGIC_UP = "202608040085_storefront_magic_link_auth.up.sql";
const MAGIC_DOWN = "202608040085_storefront_magic_link_auth.down.sql";
const MAGIC_ASSERTIONS = "202608040085_storefront_magic_link_auth_assertions.sql";
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
const TICKET_DIGEST = "8".repeat(64);
const SESSION_DIGEST = "c".repeat(64);
const CSRF_DIGEST = "d".repeat(64);
const UA_DIGEST = "e".repeat(64);
const TOTAL = 28;
let completed = 0;
let activeSessionDigest = SESSION_DIGEST;

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
function candidates(keyId = "session_01", digest = activeSessionDigest) { return escape(JSON.stringify([{ keyId, digest }])); }
function authStart(box, hostname = HOST_A, challenge = CHALLENGE_A, emailDigest = EMAIL_DIGEST, codeDigest = CODE_DIGEST, suffix = "083", ticketDigest = TICKET_DIGEST) {
  return publicCall(box, `saas.public_account_auth_start_v2('${hostname}','${NOW}','${challenge}','${emailDigest}','${"f".repeat(64)}','code_01','${codeDigest}','ticket_01','${ticketDigest}','2026-08-04T09:10:00Z','70000000-0000-4000-8000-000000000${suffix}','encrypted-recipient-authority-${suffix}','{"name":"Güzide"}'::jsonb,'correlation_${suffix}')`);
}
function verifySql({ hostname = HOST_A, challenge = CHALLENGE_A, emailDigest = EMAIL_DIGEST, verifierKind = "code", verifierDigest = CODE_DIGEST, account = ACCOUNT_A, session = SESSION_A, sessionDigest = SESSION_DIGEST, email = "ada@example.test", correlation = "verify_00083" } = {}) {
  return `saas.public_account_auth_verify_v2('${hostname}','${NOW}','${challenge}','${emailDigest}','${verifierKind}','${verifierDigest}','${email}','${account}','${session}','session_01','${sessionDigest}','${CSRF_DIGEST}','Safari macOS','${UA_DIGEST}','${correlation}')`;
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


const PHONE_UP = "202610010187_storefront_whatsapp_identity.up.sql";
const PHONE_DOWN = "202610010187_storefront_whatsapp_identity.down.sql";
const PHONE_ASSERTIONS = "202610010187_storefront_whatsapp_identity_assertions.sql";
const PHONE = "+905557770187";
const d = (n) => Number(n).toString(16).padStart(64, "0");
const id = (n, prefix = 4) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (seconds = 0) => new Date(new Date(NOW).getTime() + seconds * 1000).toISOString();
function phoneStartSql(n, options = {}) {
  const { host = HOST_A, seconds = 0, phoneDigest = d(187), requestDigest = d(188) } = options;
  return `saas.public_account_auth_start_phone('${host}','${at(seconds)}','${id(n)}','${phoneDigest}','${requestDigest}','code_01','${CODE_DIGEST}','${at(seconds + 600)}','phone_start_${n}')`;
}
function phoneStart(box, n, options) { return publicCall(box, phoneStartSql(n, options)); }
function phoneDelivered(box, n, accepted = true, options = {}) {
  const { host = HOST_A, phoneDigest = d(187), seconds = 0 } = options;
  return publicCall(box, `saas.public_account_auth_phone_delivery('${host}','${at(seconds)}','${id(n)}','${phoneDigest}',${accepted})`);
}
function phoneVerifySql(n, options = {}) {
  const { host = HOST_A, phoneDigest = d(187), phone = PHONE, codeDigest = CODE_DIGEST, names = true, seconds = 0, session = 187, sessionDigest = d(189), customer = 187, account = 187 } = options;
  return `saas.public_account_auth_verify_phone('${host}','${at(seconds)}','${id(n)}','${phoneDigest}','${codeDigest}','${phone}',${names ? "'Yeni','Müşteri'" : "NULL,NULL"},'${id(customer,2)}','${id(account,5)}','${id(session,6)}','session_01','${sessionDigest}','${CSRF_DIGEST}','Safari macOS','${UA_DIGEST}','phone_verify_${session}')`;
}
function phoneVerify(box, n, options) { return publicCall(box, phoneVerifySql(n, options)); }
async function main() {
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const file of migrations()) apply(box, file);
    apply(box, "202607310072_storefront_cart_checkout.up.sql");
    apply(box, UP); apply(box, ASSERTIONS); apply(box, MAGIC_UP); apply(box, MAGIC_ASSERTIONS);
    if (existsSync(path.join(SQL, PHONE_UP))) { apply(box, PHONE_UP); apply(box, PHONE_ASSERTIONS); }
    psql(box, `CREATE DATABASE ${EMPTY} TEMPLATE ${DB};`, "postgres");
    seed(box);
    await scenario("phone challenge stores digests and requests one delivery", () => {
      assert.deepEqual(phoneStart(box, 187), { outcome: "accepted", result_payload: { retryAfterSeconds: 60, deliveryRequired: true } });
      assert.doesNotMatch(psql(box, "SELECT row_to_json(challenge)::text FROM saas.storefront_login_challenges challenge WHERE channel='whatsapp';").stdout, /905557770187/);
    });
    await scenario("provider-pending challenge never authenticates", () => assert.equal(phoneVerify(box, 187).outcome, "challenge_invalid"));
    await scenario("cross-store delivery and verification cannot activate a challenge", () => {
      assert.equal(phoneDelivered(box, 187, true, { host: HOST_B }).outcome, "challenge_invalid");
      assert.equal(phoneVerify(box, 187, { host: HOST_B }).outcome, "challenge_invalid");
    });
    await scenario("confirmed delivery creates a phone account with null email", () => {
      assert.equal(phoneDelivered(box, 187).outcome, "committed");
      assert.equal(phoneVerify(box, 187).outcome, "authenticated");
      assert.equal(psql(box, `SELECT email IS NULL AND email_normalized IS NULL AND phone_normalized='${PHONE}' AND phone_verified_at IS NOT NULL FROM saas.storefront_accounts WHERE id='${id(187,5)}';`).stdout.trim(), "t");
      assert.equal(psql(box, `SELECT email IS NULL AND first_name='Yeni' AND last_name='Müşteri' FROM saas.customers WHERE id='${id(187,2)}';`).stdout.trim(), "t");
      assert.equal(psql(box, `SELECT count(*) FROM saas.storefront_account_order_links WHERE account_id='${id(187,5)}';`).stdout.trim(), "0");
    });
    await scenario("successful OTP is single-use", () => assert.equal(phoneVerify(box, 187, { session: 188, sessionDigest: d(190) }).outcome, "challenge_invalid"));
    await scenario("phone snapshot resolves existing account session without email", () => {
      const credentials = escape(JSON.stringify([{ keyId: "session_01", digest: d(189) }]));
      const result = publicCall(box, `saas.public_account_session_get('${HOST_A}','${NOW}','${credentials}'::jsonb)`);
      assert.equal(result.outcome, "found");
      assert.deepEqual(result.result_payload.profile, { email: null, firstName: "Yeni", lastName: "Müşteri", phone: PHONE, phoneVerified: true });
      assert.equal(publicCall(box, `saas.public_account_session_get('${HOST_B}','${NOW}','${credentials}'::jsonb)`).outcome, "unauthenticated");
    });
    await scenario("verified phone rejects replacement and preserves omission in profile updates", () => {
      const credentials = escape(JSON.stringify([{ keyId: "session_01", digest: d(189) }]));
      for (const [n, phone] of [[191, "'+905557770191'"]]) {
        assert.equal(publicCall(box, `saas.public_account_profile_update('${HOST_A}','${NOW}','${credentials}'::jsonb,'${id(n,8)}','${d(n)}','Yeni','Müşteri',${phone},1,'phone_profile_${n}')`).outcome, "invalid_input");
      }
      assert.equal(publicCall(box, `saas.public_account_profile_update('${HOST_A}','${NOW}','${credentials}'::jsonb,'${id(193,8)}','${d(193)}','Yeni','Soyad',NULL,1,'phone_profile_193')`).outcome, "committed");
      assert.equal(psql(box, `SELECT phone='${PHONE}' FROM saas.customers WHERE id='${id(187,2)}';`).stdout.trim(), "t");
      assert.equal(publicCall(box, `saas.public_account_profile_update('${HOST_A}','${NOW}','${credentials}'::jsonb,'${id(193,8)}','${d(193)}','Yeni','Soyad',NULL,1,'phone_profile_193')`).outcome, "operation_replayed");
    });
    await scenario("existing unverified customer phone cannot claim that customer", () => {
      assert.equal(phoneStart(box, 194, { phoneDigest: d(194), requestDigest: d(195) }).result_payload.deliveryRequired, true);
      phoneDelivered(box, 194, true, { phoneDigest: d(194) });
      assert.equal(phoneVerify(box, 194, { phoneDigest: d(194), phone: "+905551112233", session: 194 }).outcome, "identity_conflict");
      assert.equal(psql(box, `SELECT count(*) FROM saas.storefront_accounts WHERE customer_id='${CUSTOMER_A}';`).stdout.trim(), "0");
      assert.equal(psql(box, `SELECT first_name FROM saas.customers WHERE id='${CUSTOMER_A}';`).stdout.trim(), "Ada");
    });
    await scenario("failed delivery cannot be revived by a later acknowledgement", () => {
      phoneStart(box, 196, { phoneDigest: d(196), requestDigest: d(197) });
      phoneDelivered(box, 196, false, { phoneDigest: d(196) });
      assert.equal(phoneDelivered(box, 196, true, { phoneDigest: d(196) }).outcome, "challenge_invalid");
      assert.equal(phoneVerify(box, 196, { phoneDigest: d(196), session: 196 }).outcome, "challenge_invalid");
    });
    await scenario("server enforces sixty-second resend cooldown", () => {
      assert.equal(phoneStart(box, 198, { seconds: 30 }).result_payload.deliveryRequired, false);
      const accepted = phoneStart(box, 199, { seconds: 61 });
      assert.equal(accepted.result_payload.deliveryRequired, true);
      phoneDelivered(box, 199, true, { seconds: 61 });
      assert.equal(phoneVerify(box, 199, { names: false, seconds: 61, session: 199, sessionDigest: d(199) }).outcome, "authenticated");
      assert.equal(psql(box, `SELECT count(*) FROM saas.storefront_accounts WHERE phone_normalized='${PHONE}';`).stdout.trim(), "1");
    });
    await scenario("concurrent resend requests produce one deliverable challenge", async () => {
      const options = { phoneDigest: d(210), requestDigest: d(211) };
      const results = await Promise.all([210,211].map(async n => envelope(await psqlAsync(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT jsonb_build_object('outcome',outcome,'result_payload',result_payload) FROM ${phoneStartSql(n,options)};COMMIT;`))));
      assert.deepEqual(results.map(r => r.result_payload.deliveryRequired).sort(), [false,true]);
    });
    await scenario("five phone sends per fifteen minutes is enforced", () => {
      const options = { phoneDigest: d(220), requestDigest: d(221) };
      for (let n=0;n<5;n++) assert.equal(phoneStart(box, 220+n, { ...options, seconds:n*61 }).result_payload.deliveryRequired,true);
      assert.equal(phoneStart(box, 225, { ...options, seconds:305 }).result_payload.deliveryRequired,false);
    });
    await scenario("ten request sends per fifteen minutes is enforced across numbers", () => {
      for (let n=0;n<10;n++) assert.equal(phoneStart(box, 230+n, { phoneDigest:d(230+n),requestDigest:d(240) }).result_payload.deliveryRequired,true);
      assert.equal(phoneStart(box, 241, { phoneDigest:d(241),requestDigest:d(240) }).result_payload.deliveryRequired,false);
    });
    await scenario("six wrong codes lock a confirmed challenge", () => {
      phoneStart(box, 250, { phoneDigest:d(250),requestDigest:d(251) }); phoneDelivered(box,250,true,{phoneDigest:d(250)});
      for (let n=0;n<6;n++) assert.equal(phoneVerify(box,250,{phoneDigest:d(250),codeDigest:d(999),session:250}).outcome,"challenge_invalid");
      assert.equal(phoneVerify(box,250,{phoneDigest:d(250),session:250}).outcome,"challenge_invalid");
      assert.equal(psql(box, `SELECT attempt_count=6 AND locked_at IS NOT NULL FROM saas.storefront_login_challenges WHERE id='${id(250)}';`).stdout.trim(),"t");
    });
    await scenario("expired confirmed challenge rejects without creating identity", () => {
      phoneStart(box, 270, { phoneDigest:d(270),requestDigest:d(271) }); phoneDelivered(box,270,true,{phoneDigest:d(270)});
      assert.equal(phoneVerify(box,270,{phoneDigest:d(270),seconds:600,session:270}).outcome,"challenge_invalid");
    });
    await scenario("failed resend preserves previous accepted code", () => {
      const options={phoneDigest:d(280),requestDigest:d(281)};
      phoneStart(box,280,options);phoneDelivered(box,280,true,options);
      phoneStart(box,281,{...options,seconds:61});phoneDelivered(box,281,false,{...options,seconds:61});
      assert.equal(phoneVerify(box,280,{...options,phone:"+905557770280",seconds:62,session:280,sessionDigest:d(280),customer:280,account:280}).outcome,"authenticated");
    });
    await scenario("accepted resend invalidates only its recipient's previous accepted code", () => {
      const options={phoneDigest:d(290),requestDigest:d(291)};
      phoneStart(box,290,options);phoneDelivered(box,290,true,options);
      phoneStart(box,291,{...options,seconds:61});phoneDelivered(box,291,true,{...options,seconds:61});
      assert.equal(phoneVerify(box,290,{...options,seconds:62,session:290}).outcome,"challenge_invalid");
      assert.equal(phoneVerify(box,291,{...options,phone:"+905557770290",seconds:62,session:291,sessionDigest:d(291),customer:290,account:290}).outcome,"authenticated");
    });
    await scenario("concurrent verification creates one session and consumes once", async () => {
      const options={phoneDigest:d(300),requestDigest:d(301)};
      phoneStart(box,300,options);phoneDelivered(box,300,true,options);
      const results=await Promise.all([300,301].map(async n=>envelope(await psqlAsync(box,`BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT jsonb_build_object('outcome',outcome,'result_payload',result_payload) FROM ${phoneVerifySql(300,{...options,phone:"+905557770300",session:n,sessionDigest:d(n),customer:300,account:300})};COMMIT;`))));
      assert.deepEqual(results.map(r=>r.outcome).sort(),["authenticated","challenge_invalid"]);
      assert.equal(psql(box,`SELECT count(*) FROM saas.storefront_account_sessions WHERE account_id='${id(300,5)}';`).stdout.trim(),"1");
    });
    await scenario("store aliases share recipient cooldown", () => {
      psql(box,`BEGIN;SET LOCAL ROLE celebix_saas_owner;INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES('${id(310,1)}','${STORE_A}','identity-alias.example.test','custom_domain','active',false,'2026-01-01','2026-01-01','2026-01-01',1);COMMIT;`);
      phoneStart(box,310,{phoneDigest:d(310),requestDigest:d(311)});
      assert.equal(phoneStart(box,311,{host:"identity-alias.example.test",phoneDigest:d(310),requestDigest:d(312),seconds:30}).result_payload.deliveryRequired,false);
    });
    await scenario("email verifier rejects whatsapp challenges", () => {
      phoneStart(box,320,{phoneDigest:d(320),requestDigest:d(321)});phoneDelivered(box,320,true,{phoneDigest:d(320)});
      assert.equal(publicCall(box,verifySql({challenge:id(320),account:id(320,5),session:id(320,6),sessionDigest:d(320)})).outcome,"challenge_invalid");
    });
    await scenario("new phone login without names requests profile instead of fabricating customer", () => {
      phoneStart(box,330,{phoneDigest:d(330),requestDigest:d(331)});phoneDelivered(box,330,true,{phoneDigest:d(330)});
      const verification=phoneVerify(box,330,{phoneDigest:d(330),phone:"+905557770330",names:false,session:330,sessionDigest:d(330),customer:330,account:330});
      assert.equal(verification.outcome,"profile_required");
      assert.deepEqual(verification.result_payload,{profileRequired:true});
      assert.equal(psql(box,`SELECT count(*) FROM saas.customers WHERE id='${id(330,2)}';`).stdout.trim(),"0");
      assert.equal(psql(box,`SELECT id='${id(330,5)}' AND store_id='${STORE_A}' AND customer_id IS NULL AND status='pending_profile' AND phone_normalized='+905557770330' AND phone_verified_at IS NOT NULL FROM saas.storefront_accounts WHERE id='${id(330,5)}';`).stdout.trim(),"t");
      assert.equal(psql(box,`SELECT session_kind FROM saas.storefront_account_sessions WHERE id='${id(330,6)}' AND account_id='${id(330,5)}';`).stdout.trim(),"registration");
      const credentials=escape(JSON.stringify([{keyId:"session_01",digest:d(330)}]));
      assert.deepEqual(publicCall(box,`saas.public_account_session_get('${HOST_A}','${NOW}','${credentials}'::jsonb)`),{outcome:"profile_required",result_payload:{profileRequired:true}});
      assert.equal(publicCall(box,`saas.public_account_orders('${HOST_A}','${NOW}','${credentials}'::jsonb,20,NULL)`).outcome,"unauthenticated");
      assert.equal(publicCall(box,`saas.public_account_profile_complete('${HOST_A}','${NOW}','${credentials}'::jsonb,'${id(330,8)}','${d(330)}','${id(330,2)}','Eksik','Profil',NULL,'${id(331,6)}','session_01','${d(331)}','${CSRF_DIGEST}','Safari','${UA_DIGEST}','phone_profile_330')`).outcome,"committed");
      assert.equal(psql(box,`SELECT email IS NULL AND phone='+905557770330' FROM saas.customers WHERE id='${id(330,2)}';`).stdout.trim(),"t");
      assert.equal(psql(box,`SELECT customer_id='${id(330,2)}' AND status='active' FROM saas.storefront_accounts WHERE id='${id(330,5)}';`).stdout.trim(),"t");
      assert.equal(psql(box,`SELECT revoked_at IS NOT NULL AND revocation_reason='rotated' FROM saas.storefront_account_sessions WHERE id='${id(330,6)}';`).stdout.trim(),"t");
      assert.equal(psql(box,`SELECT session_kind FROM saas.storefront_account_sessions WHERE id='${id(331,6)}' AND account_id='${id(330,5)}';`).stdout.trim(),"full");
      assert.equal(publicCall(box,`saas.public_account_session_get('${HOST_A}','${NOW}','${credentials}'::jsonb)`).outcome,"unauthenticated");
    });
    await scenario("lost completion cookie recovers completed phone account through a fresh code", () => {
      const phone="+905557770330";
      const oldCredentials=escape(JSON.stringify([{keyId:"session_01",digest:d(330)}]));
      assert.equal(publicCall(box,`saas.public_account_session_get('${HOST_A}','${at(61)}','${oldCredentials}'::jsonb)`).outcome,"unauthenticated");
      const started=phoneStart(box,331,{phoneDigest:d(330),requestDigest:d(332),seconds:61});
      assert.equal(started.outcome,"accepted");
      assert.equal(started.result_payload.deliveryRequired,true);
      assert.equal(phoneDelivered(box,331,true,{phoneDigest:d(330),seconds:61}).outcome,"committed");
      const verification=phoneVerify(box,331,{phoneDigest:d(330),phone,names:false,seconds:61,session:332,sessionDigest:d(332),customer:332,account:332});
      assert.equal(verification.outcome,"authenticated");
      assert.deepEqual(verification.result_payload,{profileRequired:false});
      const fullCredentials=escape(JSON.stringify([{keyId:"session_01",digest:d(332)}]));
      const snapshot=publicCall(box,`saas.public_account_session_get('${HOST_A}','${at(61)}','${fullCredentials}'::jsonb)`);
      assert.equal(snapshot.outcome,"found");
      assert.deepEqual(snapshot.result_payload.profile,{email:null,firstName:"Eksik",lastName:"Profil",phone,phoneVerified:true});
      assert.equal(psql(box,`SELECT count(*) FROM saas.storefront_accounts WHERE store_id='${STORE_A}' AND phone_normalized='${phone}';`).stdout.trim(),"1");
      assert.equal(psql(box,`SELECT count(*) FROM saas.customers WHERE store_id='${STORE_A}' AND phone='${phone}';`).stdout.trim(),"1");
      assert.equal(psql(box,`SELECT id='${id(330,5)}' AND customer_id='${id(330,2)}' AND status='active' FROM saas.storefront_accounts WHERE store_id='${STORE_A}' AND phone_normalized='${phone}';`).stdout.trim(),"t");
      assert.equal(psql(box,`SELECT account_id='${id(330,5)}' AND session_kind='full' FROM saas.storefront_account_sessions WHERE id='${id(332,6)}';`).stdout.trim(),"t");
      assert.equal(psql(box,`SELECT first_name='Eksik' AND last_name='Profil' AND email IS NULL FROM saas.customers WHERE id='${id(330,2)}';`).stdout.trim(),"t");
    });
    await scenario("verified login identity remains authoritative after merchant contact edit", () => {
      psql(box,`BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.customers SET phone='+905557770999' WHERE id='${id(187,2)}';COMMIT;`);
      const credentials=escape(JSON.stringify([{keyId:"session_01",digest:d(189)}]));
      assert.equal(publicCall(box,`saas.public_account_session_get('${HOST_A}','${NOW}','${credentials}'::jsonb)`).result_payload.profile.phone,PHONE);
    });
    await scenario("real repository commits six rejected attempts and enforces the lock", async () => {
      const { PostgresStorefrontIdentityRepository }=await import("../../../packages/saas-data/src/storefront-identity/repository.ts");
      const { default:pg }=await import("pg");
      const pool=new pg.Pool({host:box.socket,port:box.port,database:DB,user:"postgres",max:2});
      const repository=new PostgresStorefrontIdentityRepository({pool,role:"celebix_saas_host_resolver",timeouts:{poolCheckoutMs:2000,statementMs:2000,lockMs:1000,idleTransactionMs:3000},audit:()=>{}});
      try {
        await repository.startPhone({hostname:HOST_A,now:new Date(NOW),challengeId:id(340),phoneDigest:d(340),requestDigest:d(341),codeKeyId:"code_01",codeDigest:CODE_DIGEST,expiresAt:new Date(at(600)),correlationId:"repository_start_340"});
        await repository.markPhoneDelivery({hostname:HOST_A,now:new Date(NOW),challengeId:id(340),phoneDigest:d(340),accepted:true});
        const input={hostname:HOST_A,now:new Date(NOW),challengeId:id(340),phoneDigest:d(340),codeDigest:d(999),phone:"+905557770340",firstName:"Gerçek",lastName:"Test",customerId:id(340,2),accountId:id(340,5),sessionId:id(340,6),sessionKeyId:"session_01",sessionDigest:d(340),csrfDigest:CSRF_DIGEST,deviceLabel:"Safari",userAgentDigest:UA_DIGEST,correlationId:"repository_verify_340"};
        for(let n=0;n<6;n++) await assert.rejects(repository.verifyPhone(input),error=>error.code==="challenge_invalid");
        await assert.rejects(repository.verifyPhone({...input,codeDigest:CODE_DIGEST}),error=>error.code==="challenge_invalid");
        assert.equal(psql(box,`SELECT attempt_count=6 AND locked_at IS NOT NULL FROM saas.storefront_login_challenges WHERE id='${id(340)}';`).stdout.trim(),"t");
      } finally {await pool.end();}
    });
    await scenario("legacy email verification retains account and order links", () => {
      authStart(box); assert.equal(publicCall(box,verifySql()).outcome,"authenticated");
      const snapshot = publicCall(box,`saas.public_account_session_get('${HOST_A}','${NOW}','${candidates()}'::jsonb)`);
      assert.equal(snapshot.result_payload.profile.email,"ada@example.test");
      assert.equal(Object.hasOwn(snapshot.result_payload.profile,"phoneVerified"),false);
      assert.equal(publicCall(box,`saas.public_account_orders('${HOST_A}','${NOW}','${candidates()}'::jsonb,20,NULL)`).result_payload.items[0].orderReference,"CX-083");
    });
    await scenario("email v3 reports suppression without enqueueing another challenge", () => {
      const expression = `saas.public_account_auth_start_v3('${HOST_A}','${NOW}','${id(260)}','${EMAIL_DIGEST}','${d(260)}','code_01','${CODE_DIGEST}','ticket_01','${TICKET_DIGEST}','${at(600)}','${id(260,7)}','encrypted-recipient-authority-260','{"name":"Güzide"}'::jsonb,'email_start_260')`;
      assert.equal(publicCall(box,expression).result_payload.deliveryRequired,false);
      assert.equal(psql(box,`SELECT count(*) FROM saas.storefront_login_challenges WHERE id='${id(260)}';`).stdout.trim(),"0");
    });
    await scenario("rollback is blocked when verified phone identity would be lost", () => {
      psql(box,`ALTER DATABASE ${DB} SET celebix.allow_storefront_whatsapp_identity_down='on';`,"postgres");
      const result=psql(box,readFileSync(path.join(SQL,PHONE_DOWN),"utf8"),DB,true);
      assert.notEqual(result.status,0); assert.match(result.stderr,/STOREFRONT_WHATSAPP_IDENTITY_DOWN_BLOCKED/);
    });
    await scenario("empty rollback and reapply keep legacy email authority", () => {
      psql(box,`ALTER DATABASE ${EMPTY} SET celebix.allow_storefront_whatsapp_identity_down='on';`,"postgres");
      apply(box,PHONE_DOWN,EMPTY);
      assert.equal(psql(box,"SELECT to_regprocedure('saas.public_account_auth_verify_v2(text,timestamptz,uuid,text,text,text,text,uuid,uuid,text,text,text,text,text,text)') IS NOT NULL;",EMPTY).stdout.trim(),"t");
      apply(box,PHONE_UP,EMPTY);apply(box,PHONE_ASSERTIONS,EMPTY);
    });
    assert.equal(completed,TOTAL);
    console.log(`${completed}/${TOTAL} PASS`);
  } finally { stop(box); }
}
await main();
