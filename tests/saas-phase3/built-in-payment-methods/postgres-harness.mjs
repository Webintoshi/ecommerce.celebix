import assert from "node:assert/strict";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const DB = "built_in_payment_methods";
const DUPLICATE_DB = "built_in_payment_methods_duplicate";
const REPLAY_DB = "built_in_payment_methods_replay";
const RACE_DB = "built_in_payment_methods_race";
const UNIQUE_CONFLICT_DB = "built_in_payment_methods_unique_conflict";
const CLEAN_DOWN_DB = "built_in_payment_methods_clean_down";
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
  const bundledRoot = path.join(homedir(), ".codex", "tmp");
  let bundled = [];
  try {
    bundled = readdirSync(bundledRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^postgresql-[0-9.]+-install$/.test(entry.name))
      .map((entry) => path.join(bundledRoot, entry.name, "bin"));
  } catch { /* optional bundled runtime is absent */ }
  for (const directory of [
    process.env.POSTGRES_BIN,
    ...(process.env.PATH ?? "").split(path.delimiter),
    ...bundled,
  ]) {
    if (!directory) continue;
    const selected = path.join(directory, name);
    try {
      accessSync(selected, constants.X_OK);
      return selected;
    } catch { /* continue */ }
  }
  throw new Error(`DISPOSABLE_DB_EXECUTION_BLOCKED: missing ${name}`);
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
  const root = mkdtempSync(path.join("/tmp", "celebix-built-in-payment-methods-"));
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

async function passAsync(label, callback) {
  await callback();
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

function stateCall({ method, operation, fingerprint, expectedVersion, state, emergencyReason = null }) {
  return `SELECT outcome,result_payload FROM saas.payment_method_set_state(
    ${authority()},'${operation}'::uuid,'${fingerprint}','${method}'::uuid,${expectedVersion},
    '${state}',${emergencyReason ? `'${emergencyReason}'` : "NULL::text"}
  )`;
}

function appState(box, input, database = DB) {
  return row(sql(box, `SET ROLE celebix_saas_app; ${stateCall(input)};`, database).stdout);
}

async function concurrentSave(box, database, input, applicationName) {
  const client = new Client({
    host: box.socket,
    port: box.port,
    user: "postgres",
    database,
    application_name: applicationName,
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE celebix_saas_app");
    const selected = await client.query(saveCall(input));
    await client.query("COMMIT");
    return selected.rows[0]?.outcome;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
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
    sql(box, `CREATE DATABASE ${RACE_DB} TEMPLATE ${DB};`, "postgres");
    sql(box, `CREATE DATABASE ${UNIQUE_CONFLICT_DB} TEMPLATE ${DB};`, "postgres");
    sql(box, `CREATE DATABASE ${CLEAN_DOWN_DB} TEMPLATE ${DB};`, "postgres");

    const codCreate = appSave(box, {
      operation: "60000000-0000-4000-8000-000000000071", fingerprint: "1".repeat(64),
      method: COD_METHOD, kind: "cash_on_delivery", label: "Kapıda Ödeme",
      config: { instructions: "Teslimatta nakit veya kart ile ödeyin." },
    });
    pass("valid COD create", () => {
      assert.equal(codCreate.outcome, "saved");
      assert.equal(codCreate.payload.id, COD_METHOD);
      assert.equal(codCreate.payload.version, 1);
      assert.equal(sql(box, `SELECT state||'|'||COALESCE(emergency_reason,'none')
        FROM saas.payment_methods WHERE id='${COD_METHOD}';`).stdout.trim(), "disabled|none");
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
      assert.equal(sql(box, `SELECT state||'|'||COALESCE(emergency_reason,'none')
        FROM saas.payment_methods WHERE id='${BANK_METHOD}';`).stdout.trim(), "disabled|none");
    });

    sql(box, `CREATE DATABASE ${REPLAY_DB} TEMPLATE ${DB};`, "postgres");

    await passAsync("second COD denied as method_already_exists", async () => {
      const conflict = {
        operation: "60000000-0000-4000-8000-000000000073", fingerprint: "3".repeat(64),
        method: "50000000-0000-4000-8000-000000000073", kind: "cash_on_delivery",
        label: "Başka Kapıda Ödeme", config: { instructions: "" },
      };
      const denied = appSave(box, conflict, REPLAY_DB);
      assert.deepEqual(denied, { outcome: "method_already_exists", payload: null });
      sql(box, `SET ROLE celebix_saas_owner; DELETE FROM saas.payment_methods
        WHERE id='${COD_METHOD}';`, REPLAY_DB);
      assert.deepEqual(appSave(box, conflict, REPLAY_DB), denied,
        "conflict replay must remain exact after the conflicting row disappears");
      assert.equal(sql(box, `SELECT count(*) FROM saas.payment_methods
        WHERE id='${conflict.method}';`, REPLAY_DB).stdout.trim(), "0");

      const race = await Promise.all([
        concurrentSave(box, RACE_DB, {
          operation: "60000000-0000-4000-8000-000000000081", fingerprint: "c".repeat(64),
          method: "50000000-0000-4000-8000-000000000081", kind: "cash_on_delivery",
          label: "Yarış A", config: { instructions: "" },
        }, "built-in-race-a"),
        concurrentSave(box, RACE_DB, {
          operation: "60000000-0000-4000-8000-000000000082", fingerprint: "d".repeat(64),
          method: "50000000-0000-4000-8000-000000000082", kind: "cash_on_delivery",
          label: "Yarış B", config: { instructions: "" },
        }, "built-in-race-b"),
      ]);
      assert.deepEqual(race.sort(), ["method_already_exists", "saved"]);
      assert.equal(sql(box, `SELECT count(*) FROM saas.payment_methods
        WHERE kind='cash_on_delivery';`, RACE_DB).stdout.trim(), "1");
      assert.equal(sql(box, `SELECT count(*) FROM saas.payment_method_operations
        WHERE operation_id IN(
          '60000000-0000-4000-8000-000000000081','60000000-0000-4000-8000-000000000082'
        );`, RACE_DB).stdout.trim(), "2");

      sql(box, `SET ROLE celebix_saas_owner;
        CREATE FUNCTION saas.built_in_unique_conflict_gate() RETURNS trigger
        LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $gate$
        BEGIN
          IF NEW.id='50000000-0000-4000-8000-000000000091'::uuid THEN
            PERFORM pg_catalog.pg_advisory_xact_lock(620062);
          END IF;
          RETURN NEW;
        END $gate$;
        CREATE TRIGGER built_in_unique_conflict_gate
        BEFORE INSERT ON saas.payment_methods FOR EACH ROW
        EXECUTE FUNCTION saas.built_in_unique_conflict_gate();`, UNIQUE_CONFLICT_DB);
      const blocker = new Client({
        host: box.socket, port: box.port, user: "postgres", database: UNIQUE_CONFLICT_DB,
      });
      await blocker.connect();
      const uniqueConflict = {
        operation: "60000000-0000-4000-8000-000000000091", fingerprint: "1".repeat(64),
        method: "50000000-0000-4000-8000-000000000091", kind: "cash_on_delivery",
        label: "İndeks Yarışı", config: { instructions: "" },
      };
      let translated;
      try {
        await blocker.query("SELECT pg_catalog.pg_advisory_lock(620062)");
        const pending = concurrentSave(box, UNIQUE_CONFLICT_DB, uniqueConflict, "unique-translation");
        let waiting = false;
        for (let attempt = 0; attempt < 100 && !waiting; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 10));
          waiting = sql(box, `SELECT count(*)=1 FROM pg_catalog.pg_stat_activity
            WHERE datname='${UNIQUE_CONFLICT_DB}' AND application_name='unique-translation'
              AND wait_event_type='Lock';`, UNIQUE_CONFLICT_DB).stdout.trim() === "t";
        }
        assert.equal(waiting, true, "public save must reach the test-only pre-insert gate");
        sql(box, `SET ROLE celebix_saas_owner;
          INSERT INTO saas.payment_methods(
            id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,
            position,config,version,created_at,updated_at
          ) VALUES(
            '50000000-0000-4000-8000-000000000092','${STORE}','cash_on_delivery',
            NULL,NULL,'İndeks Kazananı','disabled',NULL,92,'{"instructions":""}',1,'${NOW}','${NOW}'
          );`, UNIQUE_CONFLICT_DB);
        await blocker.query("SELECT pg_catalog.pg_advisory_unlock(620062)");
        translated = await pending;
      } finally {
        await blocker.query("SELECT pg_catalog.pg_advisory_unlock_all()").catch(() => undefined);
        await blocker.end();
      }
      assert.equal(translated, "method_already_exists");
      sql(box, `SET ROLE celebix_saas_owner; DELETE FROM saas.payment_methods
        WHERE id='50000000-0000-4000-8000-000000000092';`, UNIQUE_CONFLICT_DB);
      assert.deepEqual(appSave(box, uniqueConflict, UNIQUE_CONFLICT_DB),
        { outcome: "method_already_exists", payload: null });
      assert.equal(sql(box, `SELECT count(*) FROM saas.payment_methods
        WHERE id='${uniqueConflict.method}';`, UNIQUE_CONFLICT_DB).stdout.trim(), "0");

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
      assert.equal(appState(box, {
        method: PROVIDER_METHOD, operation: "60000000-0000-4000-8000-000000000085",
        fingerprint: "e".repeat(64), expectedVersion: 2, state: "active",
      }).outcome, "state_changed");
      assert.equal(sql(box, `SELECT count(*) FROM saas.payment_methods WHERE store_id='${STORE}'
        AND kind IN('provider','cash_on_delivery','bank_transfer');`).stdout.trim(), "3");
      assert.equal(sql(box, `SELECT state FROM saas.payment_methods
        WHERE id='${PROVIDER_METHOD}';`).stdout.trim(), "active");
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
      assert.equal(appState(box, {
        method: COD_METHOD, operation: "60000000-0000-4000-8000-000000000087",
        fingerprint: "f".repeat(64), expectedVersion: 1, state: "active",
      }).outcome, "state_changed");
      assert.equal(appState(box, {
        method: COD_METHOD, operation: "60000000-0000-4000-8000-000000000088",
        fingerprint: "0".repeat(64), expectedVersion: 2, state: "emergency_disabled",
        emergencyReason: "Operasyon güvenlik durdurması",
      }).outcome, "state_changed");
      const edited = appSave(box, {
        operation: "60000000-0000-4000-8000-000000000079", fingerprint: "9".repeat(64),
        method: COD_METHOD, expectedVersion: 3, kind: "cash_on_delivery",
        label: "Kapıda Güvenli Ödeme", config: { instructions: "Teslimatta ödeme yapın." },
      });
      assert.equal(edited.outcome, "saved");
      assert.equal(edited.payload.id, COD_METHOD);
      assert.equal(edited.payload.version, 4);
      assert.equal(sql(box, `SELECT id||'|'||label||'|'||(config->>'instructions')||'|'||state||'|'||emergency_reason
        FROM saas.payment_methods
        WHERE store_id='${STORE}' AND kind='cash_on_delivery';`).stdout.trim(),
      `${COD_METHOD}|Kapıda Güvenli Ödeme|Teslimatta ödeme yapın.|emergency_disabled|Operasyon güvenlik durdurması`);
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
      const markerRefused = apply(box, DOWN, ROLLBACK_DB, true);
      assert.notEqual(markerRefused.status, 0);
      assert.match(markerRefused.stderr, /BUILT_IN_PAYMENT_METHODS_ROLLBACK_REQUIRES_DRAIN/);
      apply(box, DOWN, CLEAN_DOWN_DB);
      assert.equal(sql(box, `SELECT pg_catalog.to_regclass(
          'saas.payment_methods_one_builtin_kind_per_store') IS NULL AND
        pg_catalog.to_regprocedure('saas.built_in_payment_methods_preflight()') IS NULL AND
        pg_catalog.to_regprocedure(
          'saas.payment_method_save_without_builtin_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)'
        ) IS NULL AND pg_catalog.has_function_privilege('celebix_saas_app',
          'saas.payment_method_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)'::regprocedure,'EXECUTE');`,
      CLEAN_DOWN_DB).stdout.trim(), "t");
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
