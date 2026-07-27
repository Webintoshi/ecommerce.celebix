import assert from "node:assert/strict";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "payment_sandbox_evidence_history";
const BOUNDS_DB = "payment_sandbox_evidence_history_bounds";
const ROLLBACK_DB = "payment_sandbox_evidence_history_rollback";
const UP = "202607270054_paytr_iframe_sandbox_evidence_history.up.sql";
const DOWN = "202607270054_paytr_iframe_sandbox_evidence_history.down.sql";
const ASSERTIONS =
  "202607270054_paytr_iframe_sandbox_evidence_history_assertions.sql";
const FIXTURE = readFileSync(new URL("./fixture.sql", import.meta.url), "utf8");
const prior = JSON.parse(readFileSync(
  path.join(SQL, "phase3l-paytr-iframe-activation-authority-manifest.json"),
  "utf8",
));
const TOTAL = 8;
let completed = 0;

const SUCCESS = "90000000-0000-4000-8000-000000000001";
const DECLINE = "90000000-0000-4000-8000-000000000002";
const TIMEOUT = "90000000-0000-4000-8000-000000000003";
const STATUS = "90000000-0000-4000-8000-000000000004";
const EXTRA = "90000000-0000-4000-8000-000000000005";
const DRIFT_DECLINE = "90000000-0000-4000-8000-000000000006";

function bin(name) {
  const candidate = path.join(PG, name);
  accessSync(candidate, constants.X_OK);
  return candidate;
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
    throw new Error(path.basename(program) + " failed\n" + result.stderr);
  }
  return result;
}

function start() {
  const root = mkdtempSync("/tmp/celebix-payment-evidence-history-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 24_000 + Math.floor(Math.random() * 8_000);
  mkdirSync(socket, { mode: 0o700 });
  command(bin("initdb"), [
    "-D", data, "--auth=trust", "--username=postgres", "--no-locale",
    "--encoding=UTF8",
  ]);
  command(bin("pg_ctl"), [
    "-D", data, "-o", "-k " + socket + " -p " + port + " -h ''",
    "-l", path.join(root, "postgres.log"), "start",
  ]);
  return { root, data, socket, port };
}

function stop(box) {
  if (!box) return;
  command(bin("pg_ctl"), ["-D", box.data, "-m", "fast", "stop"], "", true);
  rmSync(box.root, { recursive: true, force: true });
}

function sql(box, input, database = DB, allowFailure = false) {
  return command(bin("psql"), [
    "-h", box.socket, "-p", String(box.port), "-X", "-qAt",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database,
  ], input, allowFailure);
}

function apply(box, file, database = DB) {
  sql(box, readFileSync(path.join(SQL, file), "utf8"), database);
}

function scenario(name, run) {
  run();
  completed += 1;
  process.stdout.write("PASS " + completed + "/" + TOTAL + " " + name + "\n");
}

function uuid(value) {
  return value === null ? "NULL" : "'" + value + "'::uuid";
}

function call(box, options = {}) {
  const success = options.success === undefined ? SUCCESS : options.success;
  const decline = options.decline === undefined ? DECLINE : options.decline;
  const replay = options.replay === undefined ? SUCCESS : options.replay;
  const timeout = options.timeout === undefined ? TIMEOUT : options.timeout;
  const status = options.status === undefined ? STATUS : options.status;
  const role = options.role ?? "celebix_saas_app";
  const database = options.database ?? DB;
  const statement = [
    "SET ROLE " + role + ";",
    "SELECT pg_catalog.jsonb_build_object(",
    "  'outcome',outcome,'result',result_payload",
    ") FROM saas.paytr_iframe_sandbox_evidence_history(",
    [success, decline, replay, timeout, status].map(uuid).join(","),
    ");",
  ].join("\n");
  const result = sql(box, statement, database);
  return JSON.parse(result.stdout.trim());
}

function main() {
  let box;
  try {
    box = start();
    sql(box, "CREATE DATABASE " + DB + ";", "postgres");
    for (const { file } of prior.migrationChain) apply(box, file);
    apply(box, UP);
    apply(box, ASSERTIONS);
    sql(box, FIXTURE);
    sql(box, "CREATE DATABASE " + BOUNDS_DB + " TEMPLATE " + DB + ";", "postgres");
    sql(box, "CREATE DATABASE " + ROLLBACK_DB + " TEMPLATE " + DB + ";", "postgres");

    scenario("migration pins owner stable security and exact ACL", () => {
      const metadata = sql(box, [
        "SELECT procedure.prosecdef||'|'||procedure.provolatile::text||'|'||",
        "procedure.proowner::regrole::text||'|'||procedure.proconfig::text",
        "FROM pg_catalog.pg_proc AS procedure",
        "WHERE procedure.oid=",
        "'saas.paytr_iframe_sandbox_evidence_history(uuid,uuid,uuid,uuid,uuid)'::regprocedure;",
      ].join("\n")).stdout.trim();
      assert.equal(
        metadata,
        "true|s|celebix_saas_owner|{\"search_path=pg_catalog, saas\"}",
      );
      const denied = sql(
        box,
        "SET ROLE celebix_saas_workflow; SELECT * FROM " +
          "saas.paytr_iframe_sandbox_evidence_history(NULL,NULL,NULL,NULL,NULL);",
        DB,
        true,
      );
      assert.notEqual(denied.status, 0);
      const raw = sql(
        box,
        "SET ROLE celebix_saas_app; SELECT count(*) FROM saas.checkout_operations;",
        DB,
        true,
      );
      assert.notEqual(raw.status, 0);
    });

    scenario("invalid and duplicate selectors return one opaque incomplete row", () => {
      for (const input of [
        { success: null },
        { replay: DECLINE },
        { decline: TIMEOUT },
        { status: "90000000-0000-4000-8000-000000000099" },
      ]) {
        assert.deepEqual(call(box, input), {
          outcome: "incomplete",
          result: null,
        });
      }
    });

    scenario("app reads five bounded facts and replay input", () => {
      const result = call(box);
      assert.equal(result.outcome, "found");
      assert.deepEqual(Object.keys(result.result).sort(), [
        "facts", "replayInput", "successReceiptCount",
        "successSettlementCount",
      ]);
      assert.deepEqual(result.result.replayInput, {
        merchantOid: "a".repeat(32),
        paymentType: "card",
        totalAmount: 10000,
      });
      assert.equal(result.result.successSettlementCount, 1);
      assert.equal(result.result.successReceiptCount, 1);
      assert.deepEqual(result.result.facts.map(({ kind }) => kind), [
        "success", "decline", "replay", "timeout", "status",
      ]);
      assert.equal(result.result.facts[0].operationId, SUCCESS);
      assert.equal(result.result.facts[2].operationId, SUCCESS);
      assert.equal(
        result.result.facts[2].attemptId,
        result.result.facts[0].attemptId,
      );
      assert.equal(
        result.result.facts[3].attemptId,
        result.result.facts[4].attemptId,
      );
      assert.equal(result.result.facts[3].sawUnknown, true);
      assert.equal(result.result.facts[3].sawReconciledCaptured, false);
      assert.equal(result.result.facts[4].sawReconciledCaptured, true);
      assert.doesNotMatch(
        JSON.stringify(result.result),
        /storeId|providerConfig|configurationDigest|customer|order|resultPayload/,
      );
    });

    scenario("provider snapshot drift fails before returning facts", () => {
      assert.deepEqual(call(box, { decline: DRIFT_DECLINE }), {
        outcome: "incomplete",
        result: null,
      });
    });

    scenario("replay input outside exact bounds is incomplete", () => {
      sql(box, [
        "SET ROLE celebix_saas_owner;",
        "ALTER TABLE saas.checkout_operations DISABLE TRIGGER",
        "  checkout_operations_immutable;",
        "UPDATE saas.checkout_operations SET",
        "  result_payload=jsonb_set(result_payload,'{totalAmount}',",
        "    '9007199254740992'::jsonb)",
        "WHERE operation_id='" + SUCCESS + "'::uuid;",
        "ALTER TABLE saas.checkout_operations ENABLE TRIGGER",
        "  checkout_operations_immutable;",
      ].join("\n"), BOUNDS_DB);
      assert.deepEqual(call(box, { database: BOUNDS_DB }), {
        outcome: "incomplete",
        result: null,
      });
    });

    scenario("contradictory second settlement and receipt are incomplete", () => {
      sql(box, [
        "SET ROLE celebix_saas_owner;",
        "INSERT INTO saas.checkout_operations(",
        " operation_id,store_id,attempt_id,operation_kind,payload_fingerprint,",
        " result_payload,committed_at",
        ") VALUES(",
        " '" + EXTRA + "','10000000-0000-4000-8000-000000000054',",
        " '62000000-0000-4000-8000-000000000051','settle_callback',",
        " repeat('7',64),'{\"status\":\"failed\",\"testMode\":1}',",
        " '2026-07-27 12:01:30+00');",
        "INSERT INTO saas.checkout_callback_receipts(",
        " id,store_id,attempt_id,callback_digest,currency,callback_status,",
        " result_payload,received_at",
        ") VALUES(",
        " '" + EXTRA + "','10000000-0000-4000-8000-000000000054',",
        " '62000000-0000-4000-8000-000000000051',repeat('8',64),",
        " 'TRY','failed','{}','2026-07-27 12:01:30+00');",
      ].join("\n"));
      assert.deepEqual(call(box), {
        outcome: "incomplete",
        result: null,
      });
    });

    scenario("timeout and status selectors must bind one reconciled attempt", () => {
      assert.deepEqual(call(box, { status: DRIFT_DECLINE }), {
        outcome: "incomplete",
        result: null,
      });
    });

    scenario("assertions reject drift and rollback removes only function", () => {
      const drift = sql(box, [
        "BEGIN; SET LOCAL ROLE celebix_saas_owner;",
        "GRANT EXECUTE ON FUNCTION",
        " saas.paytr_iframe_sandbox_evidence_history(uuid,uuid,uuid,uuid,uuid)",
        "TO celebix_saas_workflow;",
        readFileSync(path.join(SQL, ASSERTIONS), "utf8"),
      ].join("\n"), DB, true);
      assert.notEqual(drift.status, 0);
      assert.match(
        drift.stderr,
        /PAYTR_IFRAME_SANDBOX_EVIDENCE_HISTORY_ACL_INVALID/,
      );
      apply(box, DOWN, ROLLBACK_DB);
      const rollback = sql(box, [
        "SELECT",
        " pg_catalog.to_regprocedure(",
        "  'saas.paytr_iframe_sandbox_evidence_history(uuid,uuid,uuid,uuid,uuid)'",
        " ) IS NULL,",
        " pg_catalog.to_regclass('saas.checkout_payment_attempts') IS NOT NULL;",
      ].join("\n"), ROLLBACK_DB).stdout.trim();
      assert.equal(rollback, "t|t");
    });

    assert.equal(completed, TOTAL);
  } finally {
    stop(box);
  }
}

await main();
