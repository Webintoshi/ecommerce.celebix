import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  accessSync,
  constants,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const DB = `commerce_analytics_${randomBytes(5).toString("hex")}`;
const UP = "202609030124_commerce_analytics_cart_recovery.up.sql";
const DOWN = "202609030124_commerce_analytics_cart_recovery.down.sql";
const ASSERTIONS =
  "202609030124_commerce_analytics_cart_recovery_assertions.sql";
const STORE = "10000000-0000-4000-8000-000000000124";
const OTHER_STORE = "10000000-0000-4000-8000-000000000125";
const PRINCIPAL = "20000000-0000-4000-8000-000000000124";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000124";
const ANALYST = "20000000-0000-4000-8000-000000000125";
const ANALYST_MEMBERSHIP = "30000000-0000-4000-8000-000000000125";
const PLAN = "00000000-0000-4000-8000-000000000001";
const CART = "60000000-0000-4000-8000-000000000124";
const RESTORED_CART = "61000000-0000-4000-8000-000000000124";
const TOKEN = "63000000-0000-4000-8000-000000000124";
const ROTATED_TOKEN = "63000000-0000-4000-8000-000000000126";
const OTHER_CART = "60000000-0000-4000-8000-000000000125";
const PRODUCT = "40000000-0000-4000-8000-000000000124";
const VARIANT = "50000000-0000-4000-8000-000000000124";
const CATEGORY = "42000000-0000-4000-8000-000000000124";
const CONNECTION = "70000000-0000-4000-8000-000000000124";
const WEBSITE = "71000000-0000-4000-8000-000000000124";
const ORDER = "80000000-0000-4000-8000-000000000124";
const FAILED_ORDER = "80000000-0000-4000-8000-000000000125";
const CANCELLED_ORDER = "80000000-0000-4000-8000-000000000126";
const HOSTED_CART = "60000000-0000-4000-8000-000000000126";
const HOSTED_ORDER = "80000000-0000-4000-8000-000000000127";
const LEGACY_ABANDONED = "60000000-0000-4000-8000-000000000180";
const LEGACY_RECOVERED = "60000000-0000-4000-8000-000000000181";
const LEGACY_ARCHIVED_ABANDONED = "60000000-0000-4000-8000-000000000182";
const LEGACY_ARCHIVED_RECOVERED = "60000000-0000-4000-8000-000000000183";
const LEGACY_ORDER = "80000000-0000-4000-8000-000000000180";
const NOW = "2026-09-03T12:00:00.000Z";
const TOTAL = 33;
let completed = 0;

function bin(name) {
  const bundled = path.join(homedir(), ".codex", "tmp");
  let candidates = [];
  try {
    candidates = readdirSync(bundled, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          /^postgresql-16[.][0-9]+-install$/.test(entry.name),
      )
      .map((entry) => path.join(bundled, entry.name, "bin"));
  } catch {}
  for (const directory of [
    process.env.POSTGRES_BIN,
    ...(process.env.PATH ?? "").split(path.delimiter),
    ...candidates,
  ]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  throw new Error(`DISPOSABLE_DB_EXECUTION_BLOCKED: missing ${name}`);
}

function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    input,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0)
    throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}

function start() {
  const tools = Object.fromEntries(
    ["initdb", "pg_ctl", "psql"].map((name) => [name, bin(name)]),
  );
  const root = mkdtempSync(path.join(tmpdir(), "cx-commerce-analytics-"));
  const data = path.join(root, "data"),
    socket = path.join(root, "socket"),
    port = 20000 + Math.floor(Math.random() * 15000);
  mkdirSync(socket, { mode: 0o700 });
  command(tools.initdb, [
    "-D",
    data,
    "--auth=trust",
    "--username=postgres",
    "--no-locale",
    "--encoding=UTF8",
  ]);
  command(tools.pg_ctl, [
    "-D",
    data,
    "-o",
    `-k ${socket} -p ${port} -h ''`,
    "-l",
    path.join(root, "postgres.log"),
    "start",
  ]);
  return { tools, root, data, socket, port };
}

function stop(box) {
  if (!box) return;
  command(box.tools.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], "", true);
  rmSync(box.root, { recursive: true, force: true });
}
function psql(box, source, database = DB, allowFailure = false) {
  return command(
    box.tools.psql,
    [
      "-h",
      box.socket,
      "-p",
      String(box.port),
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      database,
    ],
    source,
    allowFailure,
  );
}
function apply(box, file) {
  psql(box, readFileSync(path.join(SQL, file), "utf8"));
}
function scalar(box, source) {
  return psql(box, source).stdout.trim().split("\n").at(-1) ?? "";
}
function json(box, source) {
  return JSON.parse(scalar(box, source));
}
function scenario(name, proof) {
  proof();
  completed += 1;
  process.stdout.write(`PASS ${completed}/${TOTAL} ${name}\n`);
}

function migrationsThrough123() {
  const accepted =
    /(?:[.]up|[.]seed|[.]freeze|_grants|_assertions|catalog_assertions)[.]sql$/;
  return readdirSync(SQL)
    .filter((file) => {
      if (
        !/^2026\d{8}_.+[.]sql$/.test(file) ||
        file.includes(".down.") ||
        file.includes("rollback") ||
        file.includes("forward_recovery") ||
        file === "202607300073_seed_guzide_pilot_admin_domain.up.sql"
      )
        return false;
      const sequence = Number.parseInt(file.slice(8, 12), 10);
      return (
        Number.isSafeInteger(sequence) &&
        sequence <= 123 &&
        (sequence <= 71 ? accepted.test(file) : file.endsWith(".up.sql"))
      );
    })
    .sort((left, right) => {
      const sequence =
        Number.parseInt(left.slice(8, 12), 10) -
        Number.parseInt(right.slice(8, 12), 10);
      const weight = (file) =>
        file.includes("assertions")
          ? 3
          : file.includes("freeze") || file.includes("grants")
            ? 2
            : 1;
      return (
        sequence || weight(left) - weight(right) || left.localeCompare(right)
      );
    });
}

function seed(box) {
  psql(
    box,
    `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
      ('${STORE}','Commerce Analytics','commerce-analytics','active','tr','TRY','starter','2026-01-01','2026-01-01'),
      ('${OTHER_STORE}','Foreign Analytics','foreign-analytics','active','tr','TRY','starter','2026-01-01','2026-01-01');
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
      ('${PRINCIPAL}','https://identity.test','analytics-owner','owner@test.invalid',true,'2026-01-01','2026-01-01'),
      ('${ANALYST}','https://identity.test','analytics-analyst','analyst@test.invalid',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
      ('${MEMBERSHIP}','${PRINCIPAL}','${STORE}','store_owner','active','2026-01-01','2026-01-01'),
      ('${ANALYST_MEMBERSHIP}','${ANALYST}','${STORE}','analyst','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
      ('90000000-0000-4000-8000-000000000124','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
    INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES
      ('91000000-0000-4000-8000-000000000124','${STORE}','commerce.example.test','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
    INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES
      ('${PRODUCT}','${STORE}','analytics-product','Analytics Product','active','TRY','2026-01-01','2026-01-01');
    INSERT INTO saas.catalog_categories(id,store_id,parent_id,name,slug,position,depth,status,version,created_at,updated_at) VALUES
      ('${CATEGORY}','${STORE}',NULL,'Analytics Category','analytics-category',0,1,'active',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.catalog_product_categories(store_id,product_id,category_id,position) VALUES
      ('${STORE}','${PRODUCT}','${CATEGORY}',0);
    ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
    INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,created_at,updated_at) VALUES
      ('${VARIANT}','${PRODUCT}','${STORE}','Default','AN-1',2500,true,10,'active','{}','2026-01-01','2026-01-01');
    ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;
    INSERT INTO saas.store_analytics_connections(id,store_id,provider,website_id,hostname,status,version,last_verified_at,created_at,updated_at)
      VALUES('${CONNECTION}','${STORE}','umami','${WEBSITE}','commerce.example.test','active',1,'${NOW}','2026-01-01','${NOW}');
    INSERT INTO saas.payment_methods(id,store_id,kind,label,state,position,config,created_at,updated_at) VALUES
      ('81000000-0000-4000-8000-000000000129','${STORE}','bank_transfer','Banka havalesi','active',10,'{"accountHolder":"Commerce Analytics","bankName":"Celebix Bank","iban":"TR330006100519786457841326","instructions":"Sipariş numaranızı yazın."}','2026-01-01','2026-01-01');
    INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,created_at,updated_at) VALUES
      ('82000000-0000-4000-8000-000000000129','${STORE}','shipping_setting','Standart kargo','{"regions":["TR"],"estimatedDays":3}','active','2026-01-01','2026-01-01');
    ALTER TABLE saas.orders DISABLE TRIGGER orders_enqueue_analytics_purchase;
    INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at)
      VALUES('${LEGACY_ORDER}','${STORE}','ATLAS-LEGACY-PAID','storefront','Legacy QA','legacy@test.invalid','TRY',2500,0,0,2500,'confirmed','completed','{}',1,'2026-02-04','2026-02-04');
    ALTER TABLE saas.orders ENABLE TRIGGER orders_enqueue_analytics_purchase;
    ALTER TABLE saas.storefront_carts DISABLE TRIGGER USER;
    ALTER TABLE saas.storefront_cart_items DISABLE TRIGGER USER;
    INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)
      VALUES('${CART}','${STORE}','active',1,'2026-10-01','2026-09-01','2026-09-01');
    INSERT INTO saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at)
      VALUES('${CART}','${STORE}','current_01','${"a".repeat(64)}','2026-10-01');
    INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at)
      VALUES('${CART}','${STORE}','${PRODUCT}','${VARIANT}',2,2500,0,'2026-09-01','2026-09-01');
    ALTER TABLE saas.storefront_cart_items ENABLE TRIGGER USER;
    ALTER TABLE saas.storefront_carts ENABLE TRIGGER USER;
    INSERT INTO saas.abandoned_carts(id,store_id,public_cart_digest,status,currency,subtotal_cents,discount_cents,total_cents,checkout_started_at,last_activity_at,abandoned_at,recovered_at,recovered_order_id,version,created_at,updated_at)
      VALUES('${CART}','${STORE}','${"a".repeat(64)}','active','TRY',5000,0,5000,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z',NULL,NULL,NULL,1,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
      ('${OTHER_CART}','${OTHER_STORE}','${"b".repeat(64)}','active','TRY',2500,0,2500,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z',NULL,NULL,NULL,1,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
      ('${LEGACY_ABANDONED}','${STORE}','${"c".repeat(64)}','abandoned','TRY',2500,0,2500,'2026-01-01','2026-01-01','2026-01-02',NULL,NULL,1,'2026-01-01','2026-01-02'),
      ('${LEGACY_RECOVERED}','${STORE}','${"0".repeat(64)}','recovered','TRY',2500,0,2500,'2026-02-01','2026-02-01','2026-02-02','2026-02-03','${LEGACY_ORDER}',1,'2026-02-01','2026-02-03');
    INSERT INTO saas.abandoned_carts(id,store_id,public_cart_digest,status,currency,subtotal_cents,discount_cents,total_cents,checkout_started_at,last_activity_at,abandoned_at,recovered_at,recovered_order_id,archived_at,version,created_at,updated_at)
      VALUES
      ('${LEGACY_ARCHIVED_ABANDONED}','${STORE}','${"1".repeat(64)}','archived','TRY',2500,0,2500,'2026-02-01','2026-02-01','2026-02-02',NULL,NULL,'2026-02-05',1,'2026-02-01','2026-02-05'),
      ('${LEGACY_ARCHIVED_RECOVERED}','${STORE}','${"2".repeat(64)}','archived','TRY',2500,0,2500,'2026-02-01','2026-02-01','2026-02-02','2026-02-03','${LEGACY_ORDER}','2026-02-05',1,'2026-02-01','2026-02-05');
    INSERT INTO saas.abandoned_cart_items(id,store_id,cart_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
      VALUES('62000000-0000-4000-8000-000000000124','${STORE}','${CART}','${PRODUCT}','${VARIANT}',0,'Analytics Product','Default','AN-1',2500,2,0,5000,'2026-09-01'),
      ('62000000-0000-4000-8000-000000000180','${STORE}','${LEGACY_ABANDONED}','${PRODUCT}','${VARIANT}',0,'Legacy Abandoned Product','Default','AN-1',2500,1,0,2500,'2026-01-01'),
      ('62000000-0000-4000-8000-000000000181','${STORE}','${LEGACY_RECOVERED}','${PRODUCT}','${VARIANT}',0,'Legacy Recovered Product','Default','AN-1',2500,1,0,2500,'2026-02-01'),
      ('62000000-0000-4000-8000-000000000182','${STORE}','${LEGACY_ABANDONED}',NULL,NULL,1,'Legacy Manual Item',NULL,NULL,500,1,0,500,'2026-01-01'),
      ('62000000-0000-4000-8000-000000000183','${STORE}','${CART}',NULL,NULL,1,'Runtime Manual Item',NULL,NULL,500,1,0,500,'2026-09-01'),
      ('62000000-0000-4000-8000-000000000184','${STORE}','${LEGACY_ARCHIVED_ABANDONED}','${PRODUCT}','${VARIANT}',0,'Archived Abandoned Product','Default','AN-1',2500,1,0,2500,'2026-02-01'),
      ('62000000-0000-4000-8000-000000000185','${STORE}','${LEGACY_ARCHIVED_RECOVERED}','${PRODUCT}','${VARIANT}',0,'Archived Recovered Product','Default','AN-1',2500,1,0,2500,'2026-02-01');
    COMMIT;`,
  );
}

function evaluate(box, now = NOW) {
  return json(
    box,
    `BEGIN;SET LOCAL ROLE celebix_saas_workflow;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.commerce_analytics_evaluate_carts('${now}',100);COMMIT;`,
  );
}
function authority(principal = PRINCIPAL, membership = MEMBERSHIP, now = NOW) {
  return `'${STORE}','${principal}','${membership}','${PLAN}','free_starter',1,'${now}'`;
}

function main() {
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const migration of migrationsThrough123()) apply(box, migration);
    scenario("PostgreSQL 16 target schema through 123 is ready", () =>
      assert.match(scalar(box, "SHOW server_version;"), /^16[.]/),
    );
    seed(box);
    apply(box, UP);
    apply(box, ASSERTIONS);
    psql(
      box,
      `SET ROLE celebix_saas_owner;UPDATE saas.abandoned_carts SET source_cart_id='${CART}' WHERE id='${CART}';`,
    );
    scenario(
      "migration 124 up, hostname reconciliation, and assertions pass",
      () => {
        assert.equal(
          scalar(
            box,
            "SELECT to_regclass('saas.abandoned_cart_episodes') IS NOT NULL;",
          ),
          "t",
        );
        assert.equal(
          scalar(
            box,
            `SELECT (SELECT count(*) FROM saas.abandoned_cart_items WHERE store_id='${STORE}' AND cart_id='${LEGACY_ABANDONED}')||':'||(SELECT count(*) FROM saas.abandoned_cart_episode_items item JOIN saas.abandoned_cart_episodes episode ON episode.store_id=item.store_id AND episode.id=item.episode_id WHERE episode.cart_id='${LEGACY_ABANDONED}');`,
          ),
          "2:1",
        );
        assert.equal(
          scalar(
            box,
            `SELECT string_agg(cart.id||':'||cart.lifecycle_status||':'||(episode.recovered_at IS NOT NULL)||':'||(episode.closed_at IS NOT NULL)||':'||(episode.linked_order_id IS NOT NULL),',' ORDER BY cart.id) FROM saas.abandoned_carts cart JOIN saas.abandoned_cart_episodes episode ON episode.store_id=cart.store_id AND episode.cart_id=cart.id WHERE cart.id IN ('${LEGACY_ARCHIVED_ABANDONED}','${LEGACY_ARCHIVED_RECOVERED}');`,
          ),
          `${LEGACY_ARCHIVED_ABANDONED}:expired:false:true:false,${LEGACY_ARCHIVED_RECOVERED}:expired:true:true:true`,
        );
        assert.equal(
          scalar(
            box,
            `SELECT count(*) FROM saas.store_analytics_hostnames WHERE store_id='${STORE}' AND hostname='commerce.example.test' AND active;`,
          ),
          "1",
        );
        assert.equal(
          scalar(
            box,
            `SELECT count(*) FROM saas.store_analytics_hostnames WHERE store_id='${STORE}' AND hostname='admin.commerce.example.test';`,
          ),
          "0",
        );
        assert.equal(
          scalar(
            box,
            `SELECT string_agg(cart.lifecycle_status||':'||episode.episode_number||':'||(episode.closed_at IS NOT NULL),',' ORDER BY cart.id) FROM saas.abandoned_carts cart JOIN saas.abandoned_cart_episodes episode ON episode.store_id=cart.store_id AND episode.cart_id=cart.id WHERE cart.id IN ('${LEGACY_ABANDONED}','${LEGACY_RECOVERED}');`,
          ),
          "abandoned:1:false,recovered:1:true",
        );
        assert.equal(
          scalar(
            box,
            `SELECT recovered_at=TIMESTAMPTZ '2026-02-04' AND closed_at=TIMESTAMPTZ '2026-02-04' FROM saas.abandoned_cart_episodes WHERE store_id='${STORE}' AND cart_id='${LEGACY_RECOVERED}';`,
          ),
          "t",
        );
        assert.equal(
          json(
            box,
            `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT result_payload FROM saas.analytics_connection_get_for_host('commerce.example.test','${NOW}');COMMIT;`,
          ).websiteId,
          WEBSITE,
        );
        assert.equal(
          json(
            box,
            `SET ROLE celebix_saas_owner;SELECT saas.storefront_cart_projection('${STORE}','${CART}','${NOW}');`,
          ).items[0]?.categoryId,
          CATEGORY,
        );
        assert.equal(
          json(
            box,
            `SET ROLE celebix_saas_owner;SELECT saas.public_campaign_product_projection('${STORE}','${PRODUCT}','${NOW}');`,
          ).primaryCategoryId,
          CATEGORY,
        );
      },
    );
    scenario(
      "old application signatures remain available on the new schema",
      () =>
        assert.equal(
          scalar(
            box,
            "SELECT to_regprocedure('saas.analytics_outbox_claim(timestamp with time zone,integer,interval)') IS NOT NULL AND to_regprocedure('saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)') IS NOT NULL;",
          ),
          "t",
        ),
    );
    scenario(
      "safe cart attribution preserves first touch and projects to the durable cart",
      () => {
        const result = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT jsonb_build_object('outcome',outcome) FROM saas.public_cart_attribution_record('commerce.example.test','${NOW}','[{"keyId":"current_01","digest":"${"a".repeat(64)}"}]','{"firstTouch":{"source":"atlas-qa","medium":"test","campaign":"cart-recovery"},"lastTouch":{"source":"atlas-qa","medium":"test","campaign":"cart-recovery"},"referrerHost":"search.example.test","landingPathGroup":"/products/analytics-product","deviceGroup":"desktop"}');COMMIT;`,
        );
        assert.equal(result.outcome, "recorded");
        assert.equal(
          scalar(
            box,
            `SELECT first_touch_source||':'||last_touch_campaign||':'||device_group FROM saas.abandoned_carts WHERE id='${CART}';`,
          ),
          "atlas-qa:cart-recovery:desktop",
        );
      },
    );
    scenario("default thresholds are bounded and automation is off", () =>
      assert.deepEqual(
        json(
          box,
          `SELECT to_jsonb(selected) FROM (SELECT candidate_minutes,abandoned_hours,recovery_link_hours,automatic_recovery_enabled,maximum_message_attempts,minimum_message_interval_hours FROM saas.commerce_analytics_settings_for_store('${STORE}','${NOW}')) selected;`,
        ),
        {
          candidate_minutes: 30,
          abandoned_hours: 24,
          recovery_link_hours: 72,
          automatic_recovery_enabled: false,
          maximum_message_attempts: 3,
          minimum_message_interval_hours: 6,
        },
      ),
    );
    scenario("empty commerce period returns exactly one resolved row", () => {
      const result = json(
        box,
        `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('rows',COUNT(*),'outcome',MIN(outcome),'currencies',(MIN(result_payload::text)::jsonb)->'currencies','hasSettings',(MIN(result_payload::text)::jsonb)?'settings') FROM saas.commerce_analytics_snapshot(${authority(PRINCIPAL, MEMBERSHIP, NOW)},'2025-01-01','2025-01-02');COMMIT;`,
      );
      assert.deepEqual(result, {
        rows: 1,
        outcome: "resolved",
        currencies: [],
        hasSettings: false,
      });
    });
    scenario("invalid per-store thresholds fail closed", () =>
      assert.notEqual(
        psql(
          box,
          `SET ROLE celebix_saas_owner;UPDATE saas.store_commerce_analytics_settings SET candidate_minutes=14 WHERE store_id='${STORE}';`,
          DB,
          true,
        ).status,
        0,
      ),
    );
    scenario(
      "eligible product-bearing cart becomes one candidate episode",
      () => {
        psql(
          box,
          `SET ROLE celebix_saas_owner;UPDATE saas.abandoned_carts SET last_activity_at='2026-09-03T11:00:00Z' WHERE id='${CART}';`,
        );
        const result = evaluate(box, "2026-09-03T11:31:00.000Z");
        assert.equal(result.payload.candidate, 1);
        assert.equal(
          scalar(
            box,
            `SELECT lifecycle_status||':'||(SELECT count(*) FROM saas.abandoned_cart_episodes WHERE store_id='${STORE}' AND cart_id='${CART}') FROM saas.abandoned_carts WHERE id='${CART}';`,
          ),
          "candidate:1",
        );
      },
    );
    scenario(
      "new cart activity closes a candidate snapshot before a fresh episode",
      () => {
        psql(
          box,
          `SET ROLE celebix_saas_owner;UPDATE saas.abandoned_carts SET last_activity_at='2026-09-03T11:32:00Z',updated_at='2026-09-03T11:32:00Z' WHERE id='${CART}';UPDATE saas.abandoned_cart_items SET product_name='Analytics Product Updated' WHERE store_id='${STORE}' AND cart_id='${CART}';`,
        );
        evaluate(box, "2026-09-03T11:32:01.000Z");
        assert.equal(
          scalar(
            box,
            `SELECT lifecycle_status||':'||(candidate_at IS NULL)||':'||(SELECT closed_at IS NOT NULL FROM saas.abandoned_cart_episodes WHERE store_id='${STORE}' AND cart_id='${CART}' AND episode_number=1) FROM saas.abandoned_carts WHERE id='${CART}';`,
          ),
          "active:true:true",
        );
        evaluate(box, "2026-09-03T12:03:00.000Z");
        assert.equal(
          scalar(
            box,
            `SELECT count(*)||':'||MAX(episode_number)||':'||(SELECT product_name FROM saas.abandoned_cart_episode_items WHERE store_id='${STORE}' AND episode_id=(SELECT id FROM saas.abandoned_cart_episodes WHERE store_id='${STORE}' AND cart_id='${CART}' AND episode_number=2)) FROM saas.abandoned_cart_episodes WHERE store_id='${STORE}' AND cart_id='${CART}';`,
          ),
          "2:2:Analytics Product Updated",
        );
      },
    );
    scenario("candidate crosses the store abandonment threshold once", () => {
      const result = evaluate(box, "2026-09-04T12:00:00.000Z");
      assert.equal(result.payload.abandoned, 1);
      assert.equal(
        scalar(
          box,
          `SELECT lifecycle_status FROM saas.abandoned_carts WHERE id='${CART}';`,
        ),
        "abandoned",
      );
    });
    scenario("evaluation replay does not duplicate an episode or event", () => {
      evaluate(box, "2026-09-04T12:00:00.000Z");
      assert.equal(
        scalar(
          box,
          `SELECT (SELECT count(*) FROM saas.abandoned_cart_episodes WHERE cart_id='${CART}')||':'||(SELECT count(*) FROM saas.analytics_delivery_outbox WHERE cart_id='${CART}' AND event_kind='cart_abandoned');`,
        ),
        "2:1",
      );
      psql(
        box,
        `SET ROLE celebix_saas_owner;UPDATE saas.abandoned_cart_items SET product_name='Changed After Episode' WHERE store_id='${STORE}' AND cart_id='${CART}';`,
      );
      assert.equal(
        scalar(
          box,
          `SELECT product_name FROM saas.abandoned_cart_episode_items WHERE store_id='${STORE}' AND episode_id=(SELECT id FROM saas.abandoned_cart_episodes WHERE store_id='${STORE}' AND cart_id='${CART}' AND episode_number=2);`,
        ),
        "Analytics Product Updated",
      );
      psql(
        box,
        `SET ROLE celebix_saas_owner;UPDATE saas.abandoned_cart_items SET product_name='Analytics Product' WHERE store_id='${STORE}' AND cart_id='${CART}';`,
      );
    });
    scenario(
      "recovery snapshot cohorts by in-range abandonment instead of earlier candidacy",
      () => {
        const result = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT result_payload FROM saas.commerce_analytics_snapshot(${authority(PRINCIPAL, MEMBERSHIP, "2026-09-04T12:01:00Z")},'2026-09-03T12:00:00Z','2026-09-03T13:00:00Z');COMMIT;`,
        );
        assert.equal(result.currencies[0]?.abandonedCarts ?? 0, 0);
      },
    );
    scenario(
      "recovery link issuance rejects a cart without a currently eligible line",
      () => {
        psql(
          box,
          `SET ROLE celebix_saas_owner;UPDATE saas.products SET status='draft' WHERE id='${PRODUCT}';`,
        );
        const result = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome) FROM saas.commerce_cart_recovery_link_issue(${authority(PRINCIPAL, MEMBERSHIP, "2026-09-04T12:00:30Z")},'${CART}','63000000-0000-4000-8000-000000000125','${"b".repeat(64)}',1);COMMIT;`,
        );
        assert.equal(result.outcome, "invalid_transition");
        psql(
          box,
          `SET ROLE celebix_saas_owner;UPDATE saas.products SET status='active' WHERE id='${PRODUCT}';`,
        );
      },
    );
    scenario(
      "reopenable recovery link restores only eligible current-price items",
      () => {
        const issued = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.commerce_cart_recovery_link_issue(${authority(PRINCIPAL, MEMBERSHIP, "2026-09-04T12:01:00Z")},'${CART}','${TOKEN}','${"c".repeat(64)}',1);COMMIT;`,
        );
        assert.equal(issued.outcome, "committed");
        assert.equal(issued.payload.hostname, "commerce.example.test");
        const rotated = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome) FROM saas.commerce_cart_recovery_link_issue(${authority(PRINCIPAL, MEMBERSHIP, "2026-09-04T12:01:10Z")},'${CART}','${ROTATED_TOKEN}','${"f".repeat(64)}',1);COMMIT;`,
        );
        assert.equal(rotated.outcome, "committed");
        const noted = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.commerce_cart_recovery_attempt_record(${authority(PRINCIPAL, MEMBERSHIP, "2026-09-04T12:01:30Z")},'${CART}','64000000-0000-4000-8000-000000000124','note','QA note');COMMIT;`,
        );
        assert.equal(noted.outcome, "committed");
        assert.equal(noted.payload.kind, "note");
        const noteReplay = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.commerce_cart_recovery_attempt_record(${authority(PRINCIPAL, MEMBERSHIP, "2026-09-04T12:01:31Z")},'${CART}','64000000-0000-4000-8000-000000000124','note','QA note');COMMIT;`,
        );
        assert.equal(noteReplay.outcome, "operation_replayed");
        assert.equal(noteReplay.payload.replayed, true);
        const restored = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.public_cart_recovery_restore('commerce.example.test','2026-09-04T12:02:00Z','${"f".repeat(64)}','${RESTORED_CART}','current_01','${"d".repeat(64)}','2026-10-01');COMMIT;`,
        );
        assert.equal(restored.outcome, "restored");
        assert.equal(restored.payload.restoredItems, 1);
        assert.equal(restored.payload.cart.subtotalCents, 5000);
        assert.equal(
          scalar(
            box,
            `SELECT lifecycle_status||':'||(SELECT used_at IS NOT NULL FROM saas.abandoned_cart_recovery_tokens WHERE id='${ROTATED_TOKEN}') FROM saas.abandoned_carts WHERE id='${CART}';`,
          ),
          "resumed:true",
        );
        const replay = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT jsonb_build_object('outcome',outcome) FROM saas.public_cart_recovery_restore('commerce.example.test','2026-09-04T12:03:00Z','${"f".repeat(64)}','${RESTORED_CART}','current_01','${"d".repeat(64)}','2026-10-01');COMMIT;`,
        );
        assert.equal(replay.outcome, "restored");
      },
    );
    scenario(
      "recovery replay rotates the cart credential across application keys",
      () => {
        const replay = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT jsonb_build_object('outcome',outcome) FROM saas.public_cart_recovery_restore('commerce.example.test','2026-09-04T12:04:00Z','${"f".repeat(64)}','${RESTORED_CART}','current_02','${"e".repeat(64)}','2026-10-02');COMMIT;`,
        );
        assert.equal(replay.outcome, "restored");
        assert.equal(
          scalar(
            box,
            `SELECT key_id||':'||credential_digest FROM saas.storefront_cart_credentials WHERE store_id='${STORE}' AND cart_id='${RESTORED_CART}';`,
          ),
          `current_02:${"e".repeat(64)}`,
        );
      },
    );
    scenario(
      "checkout starts deduplicate replays and preserve distinct anonymous sessions",
      () => {
        const quote = (session, at) =>
          json(
            box,
            `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT jsonb_build_object('outcome',outcome) FROM saas.public_checkout_quote('commerce.example.test','${at}','cart','[{"keyId":"current_02","digest":"${"e".repeat(64)}"}]'::jsonb,'{"firstTouch":{"source":"atlas-qa","medium":"test","campaign":"cart-recovery"},"lastTouch":{"source":"atlas-qa","medium":"test","campaign":"cart-recovery"},"landingPathGroup":"/cart","deviceGroup":"desktop","anonymousSessionRef":"h1_${session}"}'::jsonb);COMMIT;`,
          );
        assert.equal(
          quote("1".repeat(64), "2026-09-04T12:05:00Z").outcome,
          "quoted",
        );
        psql(
          box,
          `SET ROLE celebix_saas_owner;UPDATE saas.storefront_cart_items SET quantity=2,updated_at='2026-09-04T12:05:01Z' WHERE store_id='${STORE}' AND cart_id='${RESTORED_CART}' AND variant_id='${VARIANT}';`,
        );
        assert.equal(
          quote("1".repeat(64), "2026-09-04T12:05:01Z").outcome,
          "quoted",
        );
        assert.equal(
          quote("2".repeat(64), "2026-09-04T12:05:02Z").outcome,
          "quoted",
        );
        assert.equal(
          scalar(
            box,
            `SELECT count(*)||':'||count(DISTINCT attribution_snapshot->>'anonymousSessionRef') FROM saas.storefront_checkout_start_snapshots WHERE store_id='${STORE}' AND cart_id='${RESTORED_CART}';`,
          ),
          "3:2",
        );
        assert.equal(
          scalar(
            box,
            `SELECT item_snapshot->0->>'quantity' FROM saas.storefront_checkout_start_snapshots WHERE store_id='${STORE}' AND cart_id='${RESTORED_CART}' AND attribution_snapshot->>'anonymousSessionRef'='h1_${"1".repeat(64)}' ORDER BY started_at DESC,id DESC LIMIT 1;`,
          ),
          "2",
        );
        const snapshot = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT result_payload FROM saas.commerce_analytics_snapshot(${authority(PRINCIPAL, MEMBERSHIP, "2026-09-05T00:00:00Z")},'2026-09-04T12:00:00Z','2026-09-04T13:00:00Z','{"view":"funnel"}'::jsonb);COMMIT;`,
        );
        assert.equal(snapshot.currencies[0].checkoutStarts, 2);
      },
    );
    scenario(
      "analytics attribution failure remains fail-open for canonical checkout quote",
      () => {
        psql(
          box,
          `SET ROLE celebix_saas_owner;
         CREATE FUNCTION saas.qa_fail_cart_attribution() RETURNS trigger LANGUAGE plpgsql AS $qa$BEGIN RAISE EXCEPTION 'QA_ANALYTICS_UNAVAILABLE';END$qa$;
         CREATE TRIGGER qa_fail_cart_attribution BEFORE UPDATE ON saas.storefront_cart_attribution FOR EACH ROW EXECUTE FUNCTION saas.qa_fail_cart_attribution();`,
        );
        const result = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT jsonb_build_object('outcome',outcome) FROM saas.public_checkout_quote('commerce.example.test','2026-09-04T12:06:00Z','cart','[{"keyId":"current_02","digest":"${"e".repeat(64)}"}]'::jsonb,'{"firstTouch":{"source":"atlas-qa","medium":"test"},"lastTouch":{"source":"second","medium":"email"},"landingPathGroup":"/cart","deviceGroup":"desktop","anonymousSessionRef":"h1_${"3".repeat(64)}"}'::jsonb);COMMIT;`,
        );
        assert.equal(result.outcome, "quoted");
        psql(
          box,
          "SET ROLE celebix_saas_owner;DROP TRIGGER qa_fail_cart_attribution ON saas.storefront_cart_attribution;DROP FUNCTION saas.qa_fail_cart_attribution();",
        );
      },
    );
    scenario(
      "analytics attribution failure remains fail-open for canonical buy-now creation",
      () => {
        const intent = "69000000-0000-4000-8000-000000000124";
        psql(
          box,
          `SET ROLE celebix_saas_owner;
         CREATE FUNCTION saas.qa_fail_intent_attribution() RETURNS trigger LANGUAGE plpgsql AS $qa$BEGIN RAISE EXCEPTION 'QA_ANALYTICS_UNAVAILABLE';END$qa$;
         CREATE TRIGGER qa_fail_intent_attribution BEFORE INSERT ON saas.storefront_intent_attribution FOR EACH ROW EXECUTE FUNCTION saas.qa_fail_intent_attribution();`,
        );
        const result = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT jsonb_build_object('outcome',outcome) FROM saas.public_buy_now_create('commerce.example.test','2026-09-04T12:07:00Z','${intent}','intent-key-124','${"4".repeat(64)}','2026-09-04T12:20:00Z','${PRODUCT}','${VARIANT}',1,'{"firstTouch":{"source":"atlas-qa","medium":"test"},"lastTouch":{"source":"atlas-qa","medium":"test"},"landingPathGroup":"/products/analytics-product","deviceGroup":"desktop","anonymousSessionRef":"h1_${"4".repeat(64)}"}'::jsonb);COMMIT;`,
        );
        assert.equal(result.outcome, "committed");
        assert.equal(
          scalar(
            box,
            `SELECT count(*) FROM saas.storefront_checkout_intents WHERE store_id='${STORE}' AND id='${intent}';`,
          ),
          "1",
        );
        psql(
          box,
          "SET ROLE celebix_saas_owner;DROP TRIGGER qa_fail_intent_attribution ON saas.storefront_intent_attribution;DROP FUNCTION saas.qa_fail_intent_attribution();",
        );
      },
    );
    scenario(
      "pending order binding automatically blocks recovery without claiming payment",
      () => {
        psql(
          box,
          `SET ROLE celebix_saas_owner;INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at) VALUES('${ORDER}','${STORE}','ATLAS-124','storefront','QA','qa@test.invalid','TRY',5000,0,0,5000,'confirmed','pending','{}',1,'${NOW}','${NOW}');INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at) VALUES('81000000-0000-4000-8000-000000000124','${STORE}','${ORDER}','${PRODUCT}','${VARIANT}',0,'Analytics Product','Default','AN-1',2500,2,0,5000,'${NOW}');UPDATE saas.abandoned_carts SET recovered_order_id='${ORDER}' WHERE id='${CART}';`,
        );
        assert.equal(
          scalar(
            box,
            `SELECT lifecycle_status FROM saas.abandoned_carts WHERE id='${CART}';`,
          ),
          "converted_pending_payment",
        );
        const issue = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome) FROM saas.commerce_cart_recovery_link_issue(${authority(PRINCIPAL, MEMBERSHIP, "2026-09-04T12:10:00Z")},'${CART}','63000000-0000-4000-8000-000000000125','${"e".repeat(64)}',1);COMMIT;`,
        );
        assert.equal(issue.outcome, "invalid_transition");
      },
    );
    scenario(
      "captured payment does not convert unused rotated tokens or block checkout",
      () => {
        psql(
          box,
          `SET ROLE celebix_saas_owner;UPDATE saas.orders SET payment_status='completed',updated_at='2026-09-04T13:00:00Z' WHERE id='${ORDER}';`,
        );
        assert.equal(
          scalar(
            box,
            `SELECT lifecycle_status FROM saas.abandoned_carts WHERE id='${CART}';`,
          ),
          "recovered",
        );
        assert.equal(
          scalar(
            box,
            `SELECT count(*) FROM saas.analytics_delivery_outbox WHERE store_id='${STORE}' AND event_kind IN ('purchase','cart_recovered');`,
          ),
          "2",
        );
        assert.equal(
          scalar(
            box,
            `SELECT (SELECT converted_at IS NULL AND revoked_at IS NOT NULL AND used_at IS NULL FROM saas.abandoned_cart_recovery_tokens WHERE id='${TOKEN}')||':'||(SELECT converted_at IS NOT NULL FROM saas.abandoned_cart_recovery_tokens WHERE id='${ROTATED_TOKEN}');`,
          ),
          "true:true",
        );
        assert.equal(
          scalar(
            box,
            `SELECT first_touch_source||':'||last_touch_campaign FROM saas.order_commerce_attribution WHERE store_id='${STORE}' AND order_id='${ORDER}';`,
          ),
          "atlas-qa:cart-recovery",
        );
      },
    );
    scenario(
      "completed hosted order binding finalizes recovery after order insertion",
      () => {
        psql(
          box,
          `SET ROLE celebix_saas_owner;
      INSERT INTO saas.abandoned_carts(id,store_id,public_cart_digest,status,lifecycle_status,currency,subtotal_cents,discount_cents,total_cents,checkout_started_at,last_activity_at,candidate_at,abandoned_at,version,created_at,updated_at) VALUES('${HOSTED_CART}','${STORE}','${"9".repeat(64)}','abandoned','abandoned','TRY',2500,0,2500,'2026-09-04T10:00:00Z','2026-09-04T10:00:00Z','2026-09-04T10:30:00Z','2026-09-04T11:00:00Z',1,'2026-09-04T10:00:00Z','2026-09-04T11:00:00Z');
      INSERT INTO saas.abandoned_cart_episodes(id,store_id,cart_id,episode_number,candidate_at,abandoned_at,resumed_at,currency,value_minor,created_at,updated_at) VALUES('65000000-0000-4000-8000-000000000123','${STORE}','${HOSTED_CART}',1,'2026-09-03T10:30:00Z','2026-09-03T11:00:00Z','2026-09-03T12:00:00Z','TRY',2500,'2026-09-03T10:30:00Z','2026-09-03T12:00:00Z');
      INSERT INTO saas.abandoned_cart_episodes(id,store_id,cart_id,episode_number,candidate_at,abandoned_at,currency,value_minor,created_at,updated_at) VALUES('65000000-0000-4000-8000-000000000124','${STORE}','${HOSTED_CART}',2,'2026-09-04T10:30:00Z','2026-09-04T11:00:00Z','TRY',2500,'2026-09-04T10:30:00Z','2026-09-04T11:00:00Z');
      INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at) VALUES('${HOSTED_ORDER}','${STORE}','ATLAS-124-HOSTED','storefront','QA','qa@test.invalid','TRY',2500,0,0,2500,'confirmed','completed','{}',1,'2026-09-04T13:01:00Z','2026-09-04T13:01:00Z');
      UPDATE saas.abandoned_carts SET recovered_order_id='${HOSTED_ORDER}',updated_at='2026-09-04T13:02:00Z' WHERE id='${HOSTED_CART}';`,
        );
        assert.equal(
          scalar(
            box,
            `SELECT lifecycle_status||':'||(recovered_at IS NOT NULL) FROM saas.abandoned_carts WHERE id='${HOSTED_CART}';`,
          ),
          "recovered:true",
        );
        assert.equal(
          scalar(
            box,
            `SELECT string_agg(episode_number||':'||(recovered_at IS NOT NULL)||':'||(linked_order_id IS NOT NULL),',' ORDER BY episode_number) FROM saas.abandoned_cart_episodes WHERE cart_id='${HOSTED_CART}';`,
          ),
          "1:false:false,2:true:true",
        );
        assert.equal(
          scalar(
            box,
            `SELECT count(*) FROM saas.analytics_delivery_outbox WHERE cart_id='${HOSTED_CART}' AND event_kind='cart_recovered';`,
          ),
          "1",
        );
      },
    );
    scenario(
      "ordinary paid checkout with only a candidate episode stays archived",
      () => {
        psql(
          box,
          `SET ROLE celebix_saas_owner;INSERT INTO saas.abandoned_carts(id,store_id,public_cart_digest,status,lifecycle_status,currency,subtotal_cents,discount_cents,total_cents,checkout_started_at,last_activity_at,candidate_at,version,created_at,updated_at) VALUES('60000000-0000-4000-8000-000000000127','${STORE}','${"7".repeat(64)}','active','candidate','TRY',2500,0,2500,'2026-09-04T12:00:00Z','2026-09-04T12:00:00Z','2026-09-04T12:30:00Z',1,'2026-09-04T12:00:00Z','2026-09-04T12:30:00Z');INSERT INTO saas.abandoned_cart_episodes(id,store_id,cart_id,episode_number,candidate_at,currency,value_minor,created_at,updated_at) VALUES('65000000-0000-4000-8000-000000000125','${STORE}','60000000-0000-4000-8000-000000000127',1,'2026-09-04T12:30:00Z','TRY',2500,'2026-09-04T12:30:00Z','2026-09-04T12:30:00Z');UPDATE saas.abandoned_carts SET recovered_order_id='${HOSTED_ORDER}',updated_at='2026-09-04T13:02:30Z' WHERE id='60000000-0000-4000-8000-000000000127';`,
        );
        assert.equal(
          scalar(
            box,
            `SELECT status||':'||lifecycle_status||':'||(abandoned_at IS NULL)||':'||(recovered_at IS NULL) FROM saas.abandoned_carts WHERE id='60000000-0000-4000-8000-000000000127';`,
          ),
          "archived:expired:true:true",
        );
        assert.equal(
          scalar(
            box,
            `SELECT recovered_at IS NULL AND linked_order_id IS NULL FROM saas.abandoned_cart_episodes WHERE id='65000000-0000-4000-8000-000000000125';`,
          ),
          "t",
        );
      },
    );
    scenario(
      "archiving a recovered cart is not overwritten by conversion synchronization",
      () => {
        const result = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome) FROM saas.abandoned_carts_archive(${authority(PRINCIPAL, MEMBERSHIP, "2026-09-04T13:03:00Z")},'66000000-0000-4000-8000-000000000124','${"8".repeat(64)}','${HOSTED_CART}',1);COMMIT;`,
        );
        assert.equal(result.outcome, "committed");
        assert.equal(
          scalar(
            box,
            `SELECT status||':'||lifecycle_status||':'||(SELECT bool_and(closed_at IS NOT NULL) FROM saas.abandoned_cart_episodes WHERE store_id='${STORE}' AND cart_id='${HOSTED_CART}') FROM saas.abandoned_carts WHERE id='${HOSTED_CART}';`,
          ),
          "archived:expired:true",
        );
      },
    );
    scenario(
      "payment failure, refund, and cancellation are server-side outbox events with opaque keys",
      () => {
        psql(
          box,
          `SET ROLE celebix_saas_owner;
        INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at) VALUES
          ('${FAILED_ORDER}','${STORE}','ATLAS-124-FAILED','storefront','QA','qa@test.invalid','TRY',2500,0,0,2500,'confirmed','failed','{}',1,'2026-09-04T13:01:00Z','2026-09-04T13:01:00Z'),
          ('${CANCELLED_ORDER}','${STORE}','ATLAS-124-CANCELLED','storefront','QA','qa@test.invalid','TRY',2500,0,0,2500,'cancelled','pending','{}',1,'2026-09-04T13:02:00Z','2026-09-04T13:02:00Z');
        INSERT INTO saas.order_events(id,store_id,order_id,event_type,from_value,to_value,message,payload,created_at)
          VALUES('82000000-0000-4000-8000-000000000124','${STORE}','${FAILED_ORDER}','payment_transition','processing','failed','Payment failed','{"from":"processing","to":"failed"}','2026-09-04T13:01:00Z');
        INSERT INTO saas.storefront_checkout_start_snapshots(id,store_id,source_kind,cart_id,currency,item_snapshot,attribution_snapshot,started_at)
          VALUES
          ('83000000-0000-4000-8000-000000000124','${STORE}','cart','${CART}','TRY','[{"productId":"${PRODUCT}","variantId":"${VARIANT}","title":"Analytics Product","categoryId":"${CATEGORY}","quantity":2,"lineTotalCents":5000}]','{"firstTouchSource":"atlas-qa","firstTouchMedium":"test","firstTouchCampaign":"cart-recovery","lastTouchSource":"atlas-qa","lastTouchMedium":"test","lastTouchCampaign":"cart-recovery","deviceGroup":"desktop","anonymousSessionRef":"h1_${"8".repeat(64)}"}','2026-09-04T12:59:00Z'),
          ('83000000-0000-4000-8000-000000000125','${STORE}','cart','${CART}','TRY','[{"productId":"${PRODUCT}","variantId":"${VARIANT}","title":"Analytics Product","categoryId":"${CATEGORY}","quantity":2,"lineTotalCents":5000}]','{"firstTouchSource":"future-wrong","firstTouchMedium":"test","lastTouchSource":"future-wrong","lastTouchMedium":"test","landingPathGroup":"/future","deviceGroup":"desktop","anonymousSessionRef":"h1_${"9".repeat(64)}"}','2026-09-04T13:00:30Z');
        INSERT INTO saas.storefront_checkout_operations(operation_id,store_id,cart_id,order_id,payload_fingerprint,result_payload,committed_at)
          VALUES('84000000-0000-4000-8000-000000000124','${STORE}','${CART}','${FAILED_ORDER}','${"9".repeat(64)}','{}','2026-09-04T13:00:00Z');
        UPDATE saas.orders SET status='refunded',payment_status='refunded',updated_at='2026-09-04T13:03:00Z' WHERE id='${ORDER}';`,
        );
        assert.equal(
          scalar(
            box,
            `SELECT count(*) FROM saas.analytics_delivery_outbox WHERE store_id='${STORE}' AND event_kind IN ('payment_failed','refund','order_cancelled');`,
          ),
          "3",
        );
        assert.equal(
          scalar(
            box,
            `SELECT bool_and(event_key~'^[0-9a-f]{64}$') FROM saas.analytics_delivery_outbox WHERE store_id='${STORE}';`,
          ),
          "t",
        );
        assert.equal(
          scalar(
            box,
            `SELECT first_touch_source FROM saas.order_commerce_attribution WHERE store_id='${STORE}' AND order_id='${FAILED_ORDER}';`,
          ),
          "atlas-qa",
        );
      },
    );
    scenario(
      "hosted payment attempt failures enqueue once and remain fail-open",
      () => {
        const attempt = "85000000-0000-4000-8000-000000000124";
        psql(
          box,
          `BEGIN;SET LOCAL session_replication_role=replica;SET LOCAL ROLE celebix_saas_owner;
          INSERT INTO saas.payment_attempts(id,store_id,payment_method_id,profile_id,provider_code,environment,credential_version,order_reference,amount_minor,currency,status,safe_code,version,created_at,updated_at,method_config_snapshot)
          VALUES('${attempt}','${STORE}','85000000-0000-4000-8000-000000000125','85000000-0000-4000-8000-000000000126','paytr_iframe','test',1,'ATLAS-ATTEMPT-124',2500,'TRY','failed','declined',2,'2026-09-04T13:04:00Z','2026-09-04T13:04:00Z','{"environment":"test","locale":"tr","threeDSecure":"provider_managed","installmentMode":"all","maxInstallment":0}');COMMIT;
          SET ROLE celebix_saas_owner;
          INSERT INTO saas.payment_attempt_events(event_id,attempt_id,store_id,profile_id,provider_code,environment,source,from_status,to_status,attempt_version,safe_code,payload_fingerprint,occurred_at)
          VALUES('85000000-0000-4000-8000-000000000127','${attempt}','${STORE}','85000000-0000-4000-8000-000000000126','paytr_iframe','test','initialize','created','failed',2,'declined','${"7".repeat(64)}','2026-09-04T13:04:00Z');`,
        );
        assert.equal(
          scalar(
            box,
            `SELECT event_kind||':'||(payment_attempt_id='${attempt}')||':'||(event_key~'^[0-9a-f]{64}$') FROM saas.analytics_delivery_outbox WHERE store_id='${STORE}' AND payment_attempt_id='${attempt}';`,
          ),
          "payment_failed:true:true",
        );
        psql(
          box,
          `SET ROLE celebix_saas_owner;
          CREATE FUNCTION saas.qa_fail_attempt_outbox() RETURNS trigger LANGUAGE plpgsql AS $qa$BEGIN RAISE EXCEPTION 'QA_ANALYTICS_UNAVAILABLE';END$qa$;
          CREATE TRIGGER qa_fail_attempt_outbox BEFORE INSERT ON saas.analytics_delivery_outbox FOR EACH ROW EXECUTE FUNCTION saas.qa_fail_attempt_outbox();
          INSERT INTO saas.payment_attempt_events(event_id,attempt_id,store_id,profile_id,provider_code,environment,source,from_status,to_status,attempt_version,safe_code,payload_fingerprint,occurred_at)
          VALUES('85000000-0000-4000-8000-000000000128','${attempt}','${STORE}','85000000-0000-4000-8000-000000000126','paytr_iframe','test','reconciliation','failed','failed',3,'declined','${"8".repeat(64)}','2026-09-04T13:05:00Z');
          DROP TRIGGER qa_fail_attempt_outbox ON saas.analytics_delivery_outbox;DROP FUNCTION saas.qa_fail_attempt_outbox();`,
        );
        assert.equal(
          scalar(
            box,
            `SELECT count(*) FROM saas.payment_attempt_events WHERE store_id='${STORE}' AND attempt_id='${attempt}';`,
          ),
          "2",
        );
      },
    );
    scenario("v2 worker claims generalized events with one lease each", () => {
      const result = json(
        box,
        `BEGIN;SET LOCAL ROLE celebix_saas_workflow;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.analytics_outbox_claim_v2('2026-09-04T14:00:00Z',100,interval '30 seconds');COMMIT;`,
      );
      assert.equal(result.outcome, "claimed");
      assert.ok(result.payload.length >= 2);
      assert.ok(
        result.payload.every((entry) =>
          /^[0-9a-f]{64}$/.test(entry.leaseToken),
        ),
      );
    });
    scenario(
      "dead-letter requeue is event-scoped and safely resets delivery state",
      () => {
        const claimed = json(
          box,
          `SELECT jsonb_build_object('eventId',id,'leaseToken',lease_token) FROM saas.analytics_delivery_outbox WHERE store_id='${STORE}' AND status='processing' ORDER BY id LIMIT 1;`,
        );
        const failed = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_workflow;SELECT jsonb_build_object('outcome',outcome) FROM saas.analytics_outbox_mark_failed('${claimed.eventId}','${claimed.leaseToken}','2026-09-04T14:00:10Z','collector_unavailable','2026-09-04T14:00:10Z',true);COMMIT;`,
        );
        assert.equal(failed.outcome, "failed");
        const result = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_workflow;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.analytics_outbox_requeue_dead_letter('${claimed.eventId}','2026-09-04T14:01:00Z');COMMIT;`,
        );
        assert.equal(result.outcome, "requeued");
        assert.equal(
          scalar(
            box,
            `SELECT status||':'||attempt_count||':'||(last_error_code IS NULL) FROM saas.analytics_delivery_outbox WHERE id='${claimed.eventId}';`,
          ),
          "pending:0:true",
        );
      },
    );
    scenario(
      "expired tenth worker lease atomically becomes dead-letter",
      () => {
        const eventId = scalar(
          box,
          `SELECT id FROM saas.analytics_delivery_outbox WHERE store_id='${STORE}' AND status='processing' ORDER BY id LIMIT 1;`,
        );
        psql(
          box,
          `SET ROLE celebix_saas_owner;UPDATE saas.analytics_delivery_outbox SET attempt_count=10,lease_expires_at='2026-09-04T14:01:00Z' WHERE id='${eventId}';`,
        );
        json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_workflow;SELECT jsonb_build_object('outcome',outcome) FROM saas.analytics_outbox_claim_v2('2026-09-04T14:02:00Z',100,interval '30 seconds');COMMIT;`,
        );
        assert.equal(
          scalar(
            box,
            `SELECT status||':'||(lease_token IS NULL)||':'||last_error_code FROM saas.analytics_delivery_outbox WHERE id='${eventId}';`,
          ),
          "failed:true:lease_expired_after_max_attempts",
        );
      },
    );
    scenario(
      "analytics snapshot is currency-aware PostgreSQL financial truth",
      () => {
        const result = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.commerce_analytics_snapshot(${authority(PRINCIPAL, MEMBERSHIP, "2026-09-05T00:00:00Z")},'2026-09-01','2026-09-04T13:30:00Z');COMMIT;`,
        );
        assert.equal(result.outcome, "resolved");
        assert.deepEqual(
          result.payload.currencies.map((row) => row.currency),
          ["TRY"],
        );
        assert.equal(result.payload.currencies[0].grossRevenueMinor, 7500);
        assert.equal(result.payload.currencies[0].refundedMinor, 5000);
        assert.equal(result.payload.currencies[0].paymentFailures, 1);
        assert.ok(result.payload.currencies[0].eligibleCarts >= 2);
        assert.deepEqual(result.payload.products, [
          {
            productId: PRODUCT,
            title: "Analytics Product",
            currency: "TRY",
            categoryId: CATEGORY,
            categoryName: "Analytics Category",
            brandId: null,
            brandName: null,
            checkoutStarts: 4,
            paidOrders: 1,
            quantity: 2,
            revenueMinor: 5000,
            abandonedAppearances: 1,
            recoveredRevenueMinor: 5000,
          },
        ]);
        assert.ok(result.payload.series.length >= 1);
        assert.ok(result.payload.carts.some((row) => row.id === CART));
        psql(
          box,
          `SET ROLE celebix_saas_owner;
          INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at)
          VALUES('86000000-0000-4000-8000-000000000124','${STORE}','ATLAS-124-REPEAT-SESSION','storefront','QA','qa@test.invalid','TRY',100,0,0,100,'confirmed','completed','{}',1,'2026-09-04T13:20:00Z','2026-09-04T13:20:00Z');
          INSERT INTO saas.order_commerce_attribution(store_id,order_id,source_cart_id,source_intent_id,first_touch_source,first_touch_medium,first_touch_campaign,last_touch_source,last_touch_medium,last_touch_campaign,referrer_host,landing_path_group,device_group,anonymous_session_ref,captured_at)
          SELECT store_id,'86000000-0000-4000-8000-000000000124',source_cart_id,source_intent_id,first_touch_source,first_touch_medium,first_touch_campaign,last_touch_source,last_touch_medium,last_touch_campaign,referrer_host,landing_path_group,device_group,anonymous_session_ref,'2026-09-04T13:20:00Z'
          FROM saas.order_commerce_attribution WHERE store_id='${STORE}' AND order_id='${ORDER}';`,
        );
        const tryPaidFunnel = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.commerce_analytics_paid_funnel_sessions(${authority(PRINCIPAL, MEMBERSHIP, "2026-09-05T00:00:00Z")},'2026-09-01','2026-09-04T13:30:00Z','{"currency":"TRY"}');COMMIT;`,
        );
        assert.equal(tryPaidFunnel.outcome, "resolved");
        assert.ok(tryPaidFunnel.payload.length >= 1);
        assert.ok(
          Object.values(
            tryPaidFunnel.payload.reduce((counts, row) => {
              counts[row.anonymousSessionRef] =
                (counts[row.anonymousSessionRef] ?? 0) + 1;
              return counts;
            }, {}),
          ).some((count) => count >= 2),
        );
        const usdPaidFunnel = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.commerce_analytics_paid_funnel_sessions(${authority(PRINCIPAL, MEMBERSHIP, "2026-09-05T00:00:00Z")},'2026-09-01','2026-09-04T13:30:00Z','{"currency":"USD"}');COMMIT;`,
        );
        assert.equal(usdPaidFunnel.outcome, "resolved");
        assert.deepEqual(usdPaidFunnel.payload, []);
        const independentOrder = "61000000-0000-4000-8000-000000000199";
        const connectionVersion = scalar(
          box,
          `SELECT version FROM saas.store_analytics_connections WHERE id='${CONNECTION}';`,
        );
        psql(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM saas.analytics_connection_disable(${authority(PRINCIPAL, MEMBERSHIP, "2026-09-04T17:59:00Z")},'61000000-0000-4000-8000-000000000198','${"a".repeat(64)}','${CONNECTION}',${connectionVersion});COMMIT;SET ROLE celebix_saas_owner;INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at) VALUES('${independentOrder}','${STORE}','ATLAS-124-NO-UMAMI','storefront','QA','qa@test.invalid','TRY',1000,0,0,1000,'confirmed','completed','{}',1,'2026-09-04T18:00:00Z','2026-09-04T18:00:00Z');`,
        );
        assert.equal(
          scalar(
            box,
            `SELECT count(*) FROM saas.analytics_delivery_outbox WHERE order_id='${independentOrder}' AND event_kind='purchase';`,
          ),
          "0",
        );
        const paidWithoutUmami = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT result_payload FROM saas.commerce_analytics_snapshot(${authority(PRINCIPAL, MEMBERSHIP, "2026-09-06T00:00:00Z")},'2026-09-04T17:00:00Z','2026-09-04T19:00:00Z');COMMIT;`,
        );
        assert.equal(paidWithoutUmami.currencies[0].grossRevenueMinor, 1000);
        psql(
          box,
          `SET ROLE celebix_saas_owner;UPDATE saas.orders SET payment_status='refunded',updated_at='2026-09-05T18:00:00Z' WHERE id='${independentOrder}';`,
        );
        const laterRefund = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT result_payload FROM saas.commerce_analytics_snapshot(${authority(PRINCIPAL, MEMBERSHIP, "2026-09-06T00:00:00Z")},'2026-09-05T17:00:00Z','2026-09-05T19:00:00Z');COMMIT;`,
        );
        assert.equal(laterRefund.currencies[0].paidOrders, 0);
        assert.equal(laterRefund.currencies[0].refundedMinor, 1000);
        psql(
          box,
          `SET ROLE celebix_saas_owner;INSERT INTO saas.abandoned_carts(id,store_id,public_cart_digest,status,lifecycle_status,currency,subtotal_cents,discount_cents,total_cents,checkout_started_at,last_activity_at,version,created_at,updated_at) SELECT md5('cart-filter-'||sequence)::uuid,'${STORE}',encode(sha256(convert_to('cart-filter-'||sequence,'UTF8')),'hex'),'active','active','TRY',100,0,100,'2026-09-04T13:20:00Z','2026-09-04T13:20:00Z',1,'2026-09-04T13:20:00Z','2026-09-04T13:20:00Z' FROM generate_series(1,101) sequence;`,
        );
        const filteredAfterLimit = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT result_payload FROM saas.commerce_analytics_snapshot(${authority(PRINCIPAL, MEMBERSHIP, "2026-09-06T00:00:00Z")},'2026-09-01','2026-09-04T13:30:00Z','{"lifecycle":"recovered"}'::jsonb);COMMIT;`,
        );
        assert.ok(filteredAfterLimit.carts.some((row) => row.id === CART));
      },
    );
    scenario(
      "multi-currency commerce period still returns one resolved row",
      () => {
        psql(
          box,
          `SET ROLE celebix_saas_owner;UPDATE saas.abandoned_cart_episodes SET currency='USD' WHERE store_id='${STORE}' AND cart_id='${CART}';`,
        );
        const result = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('rows',COUNT(*),'payloads',jsonb_agg(result_payload)) FROM saas.commerce_analytics_snapshot(${authority(PRINCIPAL, MEMBERSHIP, "2026-09-05T00:00:00Z")},'2026-09-01','2026-09-04T13:30:00Z');COMMIT;`,
        );
        assert.equal(result.rows, 1);
        assert.deepEqual(
          result.payloads[0].currencies.map((row) => row.currency),
          ["TRY", "USD"],
        );
      },
    );
    scenario(
      "analyst read is allowed without mutation authority expansion",
      () => {
        const result = json(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome) FROM saas.commerce_analytics_snapshot(${authority(ANALYST, ANALYST_MEMBERSHIP, "2026-09-05T00:00:00Z")},'2026-09-01','2026-09-04T13:30:00Z');COMMIT;`,
        );
        assert.equal(result.outcome, "resolved");
        assert.equal(
          scalar(
            box,
            "SELECT has_function_privilege('celebix_saas_app','saas.commerce_analytics_evaluate_carts(timestamp with time zone,integer)','EXECUTE');",
          ),
          "f",
        );
      },
    );
    scenario("cross-tenant cart cannot enter the store episode or outbox", () =>
      assert.equal(
        scalar(
          box,
          `SELECT count(*) FROM saas.abandoned_cart_episodes WHERE store_id='${STORE}' AND cart_id='${OTHER_CART}';`,
        ),
        "0",
      ),
    );
    scenario("down migration is guarded after lifecycle data exists", () => {
      const failed = psql(
        box,
        readFileSync(path.join(SQL, DOWN), "utf8"),
        DB,
        true,
      );
      assert.notEqual(failed.status, 0);
      assert.match(failed.stderr, /COMMERCE_ANALYTICS_DOWN_GUARD/);
    });
    assert.equal(completed, TOTAL);
    process.stdout.write(
      `PASS ${TOTAL}/${TOTAL} commerce analytics cart recovery PostgreSQL 16 rehearsal complete\n`,
    );
  } finally {
    stop(box);
  }
}

main();
