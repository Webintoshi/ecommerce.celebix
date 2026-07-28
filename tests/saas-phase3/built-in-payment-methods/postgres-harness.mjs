import assert from "node:assert/strict";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "built_in_payment_methods";
const DUPLICATE_DB = "built_in_payment_methods_duplicate";
const ROLLBACK_DB = "built_in_payment_methods_rollback";
const UP = "202607280062_builtin_payment_methods.up.sql";
const DOWN = "202607280062_builtin_payment_methods.down.sql";
const ASSERTIONS = "202607280062_builtin_payment_methods_assertions.sql";
const SINGLE_UP = "202607280059_payment_method_single_active_provider.up.sql";
const EVIDENCE_UP = "202607280060_iyzico_iframe_tenant_sandbox_evidence.up.sql";
const RUNTIME_UP = "202607280061_iyzico_iframe_tenant_activation_runtime.up.sql";
const FIXTURE = readFileSync(path.join(ROOT,
  "tests/saas-phase3/iyzico-iframe-tenant-activation-runtime/fixture.sql"), "utf8");
const prior = JSON.parse(readFileSync(path.join(SQL,
  "phase3q-quick-order-hosted-payment-bridge-manifest.json"), "utf8"));

const STORE = "10000000-0000-4000-8000-000000000061";
const OTHER_STORE = "10000000-0000-4000-8000-000000000062";
const PRINCIPAL = "20000000-0000-4000-8000-000000000061";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000061";
const OTHER_MEMBERSHIP = "30000000-0000-4000-8000-000000000062";
const PLAN = "00000000-0000-4000-8000-000000000001";
const PROVIDER_METHOD = "50000000-0000-4000-8000-000000000061";
const COD_METHOD = "50000000-0000-4000-8000-000000000064";
const BANK_METHOD = "50000000-0000-4000-8000-000000000065";
const OTHER_COD_METHOD = "50000000-0000-4000-8000-000000000066";
const IBAN = "TR330006100519786457841326";
const NOW = "2026-07-28T15:00:00.000Z";
const TOTAL = 13;
let completed = 0;

function bin(name) {
  const selected = path.join(PG, name);
  accessSync(selected, constants.X_OK);
  return selected;
}

function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    input,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  }
  return result;
}

function start() {
  const root = mkdtempSync("/tmp/celebix-built-in-payment-methods-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 29_900 + Math.floor(Math.random() * 80);
  mkdirSync(socket, { mode: 0o700 });
  command(bin("initdb"), ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(bin("pg_ctl"), ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { root, data, socket, port };
}

function stop(box) {
  if (!box) return;
  command(bin("pg_ctl"), ["-D", box.data, "-m", "fast", "stop"], "", true);
  rmSync(box.root, { recursive: true, force: true });
}

function sql(box, input, database = DB, allowFailure = false) {
  return command(bin("psql"), [
    "-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], input, allowFailure);
}

function apply(box, file, database = DB, allowFailure = false) {
  const target = path.join(SQL, file);
  if (!existsSync(target)) throw new Error(`missing required SQL artifact: ${file}`);
  return sql(box, readFileSync(target, "utf8"), database, allowFailure);
}

function pass(label, callback) {
  callback();
  completed += 1;
  process.stdout.write(`PASS ${completed}/${TOTAL} ${label}\n`);
}

function authority(store = STORE) {
  const membership = store === STORE ? MEMBERSHIP : OTHER_MEMBERSHIP;
  return `'${store}'::uuid,'${PRINCIPAL}'::uuid,'${membership}'::uuid,'${PLAN}'::uuid,` +
    `'free_starter',1,'${NOW}'::timestamptz`;
}

function saveCall({ store = STORE, operation, fingerprint, method, expectedVersion = 0,
  kind, profile = null, provider = null, label, config }) {
  return `SELECT outcome,result_payload FROM saas.payment_method_save(
    ${authority(store)},'${operation}'::uuid,'${fingerprint}','${method}'::uuid,${expectedVersion},
    '${kind}',${profile ? `'${profile}'::uuid` : "NULL::uuid"},
    ${provider ? `'${provider}'` : "NULL::text"},'${label}','${JSON.stringify(config)}'::jsonb
  )`;
}

function appSave(box, input, database = DB) {
  return row(sql(box, `SET ROLE celebix_saas_app; ${saveCall(input)};`, database).stdout);
}

function row(output) {
  const separator = output.indexOf("|");
  const outcome = separator < 0 ? output.trim() : output.slice(0, separator).trim();
  const payload = separator < 0 ? "" : output.slice(separator + 1).trim();
  return { outcome, payload: payload ? JSON.parse(payload) : null };
}

async function main() {
  let box;
  try {
    box = start();
    sql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const { file } of prior.migrationChain) apply(box, file);
    apply(box, SINGLE_UP);
    sql(box, FIXTURE);
    apply(box, EVIDENCE_UP);
    apply(box, RUNTIME_UP);

    sql(box, `SET ROLE celebix_saas_owner;
      UPDATE saas.payment_methods SET config='{"instructions":"Nakit veya kart."}'::jsonb
      WHERE kind='cash_on_delivery';
      UPDATE saas.payment_methods SET config='{"accountHolder":"Celebix AŞ","bankName":"Test Bankası","iban":"${IBAN}","instructions":"Sipariş numarasını yazın."}'::jsonb
      WHERE kind='bank_transfer';
      INSERT INTO saas.payment_methods(
        id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,
        position,config,version,created_at,updated_at
      ) VALUES(
        '50000000-0000-4000-8000-000000000099','${STORE}','cash_on_delivery',
        NULL,NULL,'İkinci Kapıda Ödeme','disabled',NULL,99,'{"instructions":""}',1,'${NOW}','${NOW}'
      );`);
    assert.equal(sql(box, `SELECT count(*) FROM saas.payment_methods
      WHERE store_id='${STORE}' AND kind='cash_on_delivery';`).stdout.trim(), "2",
    "061 must permit the duplicate that 062 closes");
    sql(box, `CREATE DATABASE ${DUPLICATE_DB} TEMPLATE ${DB};`, "postgres");
    sql(box, `SET ROLE celebix_saas_owner;
      DELETE FROM saas.payment_methods WHERE kind IN('cash_on_delivery','bank_transfer');`);

    const duplicateRejected = apply(box, UP, DUPLICATE_DB, true);
    assert.notEqual(duplicateRejected.status, 0, "062 must reject pre-existing duplicates");
    assert.match(duplicateRejected.stderr, /BUILT_IN_PAYMENT_METHOD_DUPLICATES_EXIST/);

    apply(box, UP);
    apply(box, ASSERTIONS);

    const codCreate = appSave(box, {
      operation: "60000000-0000-4000-8000-000000000071", fingerprint: "1".repeat(64),
      method: COD_METHOD, kind: "cash_on_delivery", label: "Kapıda Ödeme",
      config: { instructions: "Teslimatta nakit veya kart ile ödeyin." },
    });
    pass("valid COD create", () => {
      assert.equal(codCreate.outcome, "saved");
      assert.equal(codCreate.payload.id, COD_METHOD);
      assert.equal(codCreate.payload.version, 1);
    });

    const bankCreate = appSave(box, {
      operation: "60000000-0000-4000-8000-000000000072", fingerprint: "2".repeat(64),
      method: BANK_METHOD, kind: "bank_transfer", label: "Banka Havalesi",
      config: { accountHolder: "Celebix AŞ", bankName: "Test Bankası", iban: IBAN,
        instructions: "Açıklamaya sipariş numarasını yazın." },
    });
    pass("valid bank create with checksum-valid IBAN", () => {
      assert.equal(bankCreate.outcome, "saved");
      assert.equal(bankCreate.payload.id, BANK_METHOD);
      assert.equal(bankCreate.payload.version, 1);
    });

    pass("second COD denied as method_already_exists", () => {
      const denied = appSave(box, {
        operation: "60000000-0000-4000-8000-000000000073", fingerprint: "3".repeat(64),
        method: "50000000-0000-4000-8000-000000000073", kind: "cash_on_delivery",
        label: "Başka Kapıda Ödeme", config: { instructions: "" },
      });
      assert.deepEqual(denied, { outcome: "method_already_exists", payload: null });
      const directWrite = sql(box, `SET ROLE celebix_saas_owner;
        INSERT INTO saas.payment_methods(
          id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,
          position,config,version,created_at,updated_at
        ) VALUES(
          '50000000-0000-4000-8000-000000000083','${STORE}','cash_on_delivery',
          NULL,NULL,'Doğrudan Yinelenen','disabled',NULL,83,'{"instructions":""}',1,'${NOW}','${NOW}'
        );`, DB, true);
      assert.notEqual(directWrite.status, 0);
      assert.match(directWrite.stderr, /payment_methods_one_builtin_kind_per_store/);
    });

    pass("second bank denied as method_already_exists", () => {
      const denied = appSave(box, {
        operation: "60000000-0000-4000-8000-000000000074", fingerprint: "4".repeat(64),
        method: "50000000-0000-4000-8000-000000000074", kind: "bank_transfer",
        label: "Başka Banka", config: { accountHolder: "Celebix AŞ", bankName: "Test Bankası",
          iban: IBAN, instructions: "" },
      });
      assert.deepEqual(denied, { outcome: "method_already_exists", payload: null });
    });

    pass("COD and bank coexist", () => {
      assert.equal(sql(box, `SELECT string_agg(kind,',' ORDER BY kind) FROM saas.payment_methods
        WHERE store_id='${STORE}' AND kind IN('cash_on_delivery','bank_transfer');`).stdout.trim(),
      "bank_transfer,cash_on_delivery");
    });

    pass("one provider coexists with both built-ins", () => {
      const providerEdit = appSave(box, {
        operation: "60000000-0000-4000-8000-000000000075", fingerprint: "5".repeat(64),
        method: PROVIDER_METHOD, expectedVersion: 1, kind: "provider",
        profile: "40000000-0000-4000-8000-000000000063", provider: "paytr_iframe",
        label: "PayTR Güncel", config: { environment: "test" },
      });
      assert.equal(providerEdit.outcome, "saved");
      assert.equal(sql(box, `SELECT count(*) FROM saas.payment_methods WHERE store_id='${STORE}'
        AND kind IN('provider','cash_on_delivery','bank_transfer');`).stdout.trim(), "3");
    });

    pass("unknown config key denied", () => {
      const denied = appSave(box, {
        operation: "60000000-0000-4000-8000-000000000076", fingerprint: "6".repeat(64),
        method: "50000000-0000-4000-8000-000000000076", kind: "cash_on_delivery",
        label: "Geçersiz", config: { instructions: "", unexpected: true },
      });
      assert.deepEqual(denied, { outcome: "invalid_input", payload: null });
      const noncanonical = appSave(box, {
        operation: "60000000-0000-4000-8000-000000000086", fingerprint: "a".repeat(64),
        method: "50000000-0000-4000-8000-000000000086", kind: "cash_on_delivery",
        label: "Geçersiz Boşluk", config: { instructions: "\u00a0başında boşluk" },
      });
      assert.deepEqual(noncanonical, { outcome: "invalid_input", payload: null });
    });

    pass("bad IBAN checksum denied", () => {
      const denied = appSave(box, {
        operation: "60000000-0000-4000-8000-000000000077", fingerprint: "7".repeat(64),
        method: "50000000-0000-4000-8000-000000000077", kind: "bank_transfer",
        label: "Geçersiz IBAN", config: { accountHolder: "Celebix AŞ", bankName: "Test Bankası",
          iban: "TR340006100519786457841326", instructions: "" },
      });
      assert.deepEqual(denied, { outcome: "invalid_input", payload: null });
    });

    pass("cross-store same kind allowed", () => {
      const selected = appSave(box, {
        store: OTHER_STORE, operation: "60000000-0000-4000-8000-000000000078",
        fingerprint: "8".repeat(64), method: OTHER_COD_METHOD, kind: "cash_on_delivery",
        label: "Diğer Mağaza Kapıda Ödeme", config: { instructions: "" },
      });
      assert.equal(selected.outcome, "saved");
      assert.equal(sql(box, `SELECT count(*) FROM saas.payment_methods
        WHERE kind='cash_on_delivery';`).stdout.trim(), "2");
    });

    pass("operation replay remains exact", () => {
      const replay = appSave(box, {
        operation: "60000000-0000-4000-8000-000000000071", fingerprint: "1".repeat(64),
        method: COD_METHOD, kind: "cash_on_delivery", label: "Kapıda Ödeme",
        config: { instructions: "Teslimatta nakit veya kart ile ödeyin." },
      });
      assert.equal(replay.outcome, "operation_replayed");
      assert.deepEqual(replay.payload, { ...codCreate.payload, replayed: true });
      const mismatch = appSave(box, {
        operation: "60000000-0000-4000-8000-000000000071", fingerprint: "b".repeat(64),
        method: COD_METHOD, kind: "cash_on_delivery", label: "Kapıda Ödeme",
        config: { instructions: "Teslimatta nakit veya kart ile ödeyin." },
      });
      assert.deepEqual(mismatch, { outcome: "operation_mismatch", payload: null });
    });

    pass("versioned edit preserves identity", () => {
      const edited = appSave(box, {
        operation: "60000000-0000-4000-8000-000000000079", fingerprint: "9".repeat(64),
        method: COD_METHOD, expectedVersion: 1, kind: "cash_on_delivery",
        label: "Kapıda Güvenli Ödeme", config: { instructions: "Teslimatta ödeme yapın." },
      });
      assert.equal(edited.outcome, "saved");
      assert.equal(edited.payload.id, COD_METHOD);
      assert.equal(edited.payload.version, 2);
      assert.equal(sql(box, `SELECT id||'|'||label||'|'||(config->>'instructions') FROM saas.payment_methods
        WHERE store_id='${STORE}' AND kind='cash_on_delivery';`).stdout.trim(),
      `${COD_METHOD}|Kapıda Güvenli Ödeme|Teslimatta ödeme yapın.`);
    });

    pass("preflight and ACLs are exact", () => {
      assert.equal(sql(box, `SET ROLE celebix_saas_app;
        SELECT saas.built_in_payment_methods_preflight();`).stdout.trim(), "t");
      assert.equal(sql(box, `SET ROLE celebix_saas_workflow;
        SELECT saas.built_in_payment_methods_preflight();`).stdout.trim(), "t");
      assert.equal(sql(box, `SELECT pg_catalog.has_function_privilege('celebix_saas_app',
          'saas.built_in_payment_method_config_valid(text,jsonb)'::regprocedure,'EXECUTE')||'|'||
        pg_catalog.has_function_privilege('celebix_saas_workflow',
          'saas.built_in_payment_method_config_valid(text,jsonb)'::regprocedure,'EXECUTE')||'|'||
        pg_catalog.has_function_privilege('celebix_saas_app',
          'saas.payment_method_save_without_builtin_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)'::regprocedure,'EXECUTE')||'|'||
        pg_catalog.has_function_privilege('celebix_saas_workflow',
          'saas.payment_method_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)'::regprocedure,'EXECUTE');`).stdout.trim(),
      "false|false|false|false");
    });

    sql(box, `CREATE DATABASE ${ROLLBACK_DB} TEMPLATE ${DB};`, "postgres");
    pass("down refuses unsafe duplicate-producing rollback conditions", () => {
      const refused = apply(box, DOWN, ROLLBACK_DB, true);
      assert.notEqual(refused.status, 0);
      assert.match(refused.stderr, /BUILT_IN_PAYMENT_METHODS_ROLLBACK_REQUIRES_DRAIN/);
      assert.equal(sql(box, `SELECT saas.built_in_payment_methods_preflight();`, ROLLBACK_DB).stdout.trim(), "t");
      sql(box, `SET ROLE celebix_saas_owner;
        DELETE FROM saas.payment_methods WHERE kind IN('cash_on_delivery','bank_transfer');`, ROLLBACK_DB);
      apply(box, DOWN, ROLLBACK_DB);
      assert.equal(sql(box, `SELECT pg_catalog.to_regclass(
          'saas.payment_methods_one_builtin_kind_per_store') IS NULL AND
        pg_catalog.to_regprocedure('saas.built_in_payment_methods_preflight()') IS NULL AND
        pg_catalog.to_regprocedure(
          'saas.payment_method_save_without_builtin_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)'
        ) IS NULL AND pg_catalog.has_function_privilege('celebix_saas_app',
          'saas.payment_method_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)'::regprocedure,'EXECUTE');`,
      ROLLBACK_DB).stdout.trim(), "t");
    });

    assert.equal(completed, TOTAL);
  } finally {
    stop(box);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
