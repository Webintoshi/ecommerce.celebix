import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const TOKEN = randomBytes(5).toString("hex");
const DB = `catalog_hierarchy_${TOKEN}`;
const ROLLBACK = `${DB}_rollback`;
const RESTORE = `${DB}_restore`;
const PLAN = "00000000-0000-4000-8000-000000000001";
const NOW = "2026-07-29T12:00:00.000Z";
const MIGRATION_059_UP = "202607280059_catalog_product_migrations.up.sql";
const MIGRATION_059_ASSERTIONS = "202607280059_catalog_product_migrations_assertions.sql";
const UP = "202607290066_catalog_category_hierarchy.up.sql";
const DOWN = "202607290066_catalog_category_hierarchy.down.sql";
const ASSERTIONS = "202607290066_catalog_category_hierarchy_assertions.sql";
const PRIOR = JSON.parse(readFileSync(path.join(SQL, "phase3n-hosted-callback-lifecycle-manifest.json"), "utf8"));
const ONBOARDING = JSON.parse(readFileSync(path.join(SQL, "phase3-product-onboarding-manifest.json"), "utf8"));
const MEDIA = JSON.parse(readFileSync(path.join(SQL, "phase3-tenant-r2-media-manifest.json"), "utf8"));
const MIGRATION_059 = JSON.parse(readFileSync(path.join(SQL, "phase3-guzide-catalog-migration-manifest.json"), "utf8"));
const MANIFEST = JSON.parse(readFileSync(path.join(SQL, "phase3y-catalog-category-hierarchy-manifest.json"), "utf8"));
const TOTAL = 23;
let completed = 0;

function uuid(prefix, ordinal) {
  return `${prefix}000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`;
}
function context(ordinal) {
  return {
    store: uuid("41", ordinal),
    principal: uuid("42", ordinal),
    membership: uuid("43", ordinal),
    subscription: uuid("44", ordinal),
  };
}
function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch {}
  }
  return null;
}
function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    encoding: "utf8",
    input: options.input,
    env: { ...process.env, PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}
function commandAsync(program, args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd: ROOT,
      env: { ...process.env, PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(input);
  });
}
function start() {
  assertSafeEnvironment();
  const names = [...new Set([...REQUIRED_NATIVE_TOOLS, "pg_dump", "pg_restore"])];
  const executables = Object.fromEntries(names.map((name) => [name, executable(name)]));
  if (Object.values(executables).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const root = mkdtempSync("/tmp/celebix-catalog-hierarchy-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 20_000 + Math.floor(Math.random() * 15_000);
  mkdirSync(socket, { mode: 0o700 });
  command(executables.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(executables.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return {
    executables,
    root,
    data,
    socket,
    port,
    pid: Number.parseInt(readFileSync(path.join(data, "postmaster.pid"), "utf8"), 10),
    started: true,
  };
}
function stop(box) {
  if (!box) return;
  if (box.started) command(box.executables.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], { allowFailure: true });
  rmSync(box.root, { recursive: true, force: true });
}
function args(box, database = DB) {
  return ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database];
}
function psql(box, source, database = DB, allowFailure = false) {
  return command(box.executables.psql, args(box, database), { input: source, allowFailure });
}
async function psqlAsync(box, source, database = DB) {
  const result = await commandAsync(box.executables.psql, args(box, database), source);
  if (result.status !== 0) throw new Error(`psql failed\n${result.stderr}`);
  return result.stdout.trim();
}
function apply(box, file, database = DB) {
  psql(box, readFileSync(path.join(SQL, file), "utf8"), database);
}
function sha256(file) {
  return createHash("sha256").update(readFileSync(path.join(SQL, file))).digest("hex");
}
function digest(marker) {
  return createHash("sha256").update(marker).digest("hex");
}
function applyBase(box, database = DB) {
  for (const artifact of PRIOR.migrationChain) {
    assert.equal(sha256(artifact.file), artifact.sha256, artifact.file);
    apply(box, artifact.file, database);
  }
  for (const bundle of [ONBOARDING, MEDIA]) {
    for (const artifact of bundle.artifacts) {
      if (artifact.direction === "up" || artifact.direction === "verify") {
        assert.equal(sha256(artifact.file), artifact.sha256, artifact.file);
        apply(box, artifact.file, database);
      }
    }
  }
  for (const artifact of MIGRATION_059.artifacts) {
    if (artifact.direction === "up" || artifact.direction === "verify") {
      assert.equal(sha256(artifact.file), artifact.sha256, artifact.file);
      apply(box, artifact.file, database);
    }
  }
}
function seed(box, database = DB) {
  const stores = [];
  const principals = [];
  const memberships = [];
  const subscriptions = [];
  for (let ordinal = 1; ordinal <= 20; ordinal += 1) {
    const selected = context(ordinal);
    stores.push(`('${selected.store}','Store ${ordinal}','hierarchy-store-${ordinal}','active','tr','TRY','default','${NOW}','${NOW}')`);
    principals.push(`('${selected.principal}','https://identity.example.test/oidc','hierarchy-${ordinal}','hierarchy-${ordinal}@example.test',true,'${NOW}','${NOW}')`);
    memberships.push(`('${selected.membership}','${selected.principal}','${selected.store}','store_owner','active','${NOW}','${NOW}')`);
    subscriptions.push(`('${selected.subscription}','${selected.store}','${PLAN}','free_starter',1,'active','2026-01-01T00:00:00.000Z','${NOW}','${NOW}')`);
  }
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES ${stores.join(",")};
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES ${principals.join(",")};
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES ${memberships.join(",")};
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES ${subscriptions.join(",")};
    COMMIT;`, database);
}
async function scenario(name, run) {
  await run();
  completed += 1;
  process.stdout.write(`PASS ${completed}/${TOTAL} ${name}\n`);
}
function authority(ordinal) {
  const selected = context(ordinal);
  return `'${selected.store}','${selected.principal}','${selected.membership}','${PLAN}','free_starter',1,100,'${NOW}'`;
}
function outcome(box, expression, database = DB) {
  const raw = psql(
    box,
    `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${expression};COMMIT;`,
    database,
  ).stdout.trim();
  return JSON.parse(raw);
}
function category(ordinal, name, slug, parentSlug) {
  return {
    id: uuid("46", ordinal),
    name,
    slug,
    ...(parentSlug === undefined ? {} : { parentSlug }),
  };
}
function beginFingerprint({
  contextOrdinal,
  jobOrdinal,
  sourceMarker,
  categories,
  totalProducts = 1,
  totalMedia = 0,
}) {
  return digest(JSON.stringify({
    storeId: context(contextOrdinal).store,
    jobId: uuid("45", jobOrdinal),
    sourceDigest: digest(sourceMarker),
    totalProducts,
    totalMedia,
    categories,
    brands: [],
  }));
}
function beginExpression(request) {
  const {
    contextOrdinal,
    operationOrdinal,
    jobOrdinal,
    sourceMarker,
    categories,
    totalProducts = 1,
    totalMedia = 0,
  } = request;
  const fingerprint = request.fingerprint ?? beginFingerprint(request);
  return `saas.catalog_migration_begin(
    ${authority(contextOrdinal)},'${uuid("4a", operationOrdinal)}','${fingerprint}',
    '${uuid("45", jobOrdinal)}','${digest(sourceMarker)}',${totalProducts},${totalMedia},
    $json$${JSON.stringify(categories)}$json$::jsonb,'[]'::jsonb
  )`;
}
function counts(box, contextOrdinal, database = DB) {
  const selected = context(contextOrdinal);
  return psql(
    box,
    `SELECT
      (SELECT count(*) FROM saas.catalog_categories WHERE store_id='${selected.store}')||'|'||
      (SELECT count(*) FROM saas.catalog_product_migration_jobs WHERE store_id='${selected.store}')||'|'||
      (SELECT count(*) FROM saas.catalog_product_migration_operations WHERE store_id='${selected.store}');`,
    database,
  ).stdout.trim();
}
function insertCategories(box, contextOrdinal, categories, database = DB) {
  const selected = context(contextOrdinal);
  const bySlug = new Map();
  const values = categories.map((candidate, index) => {
    const parentId = candidate.parentSlug === undefined ? "NULL" : `'${bySlug.get(candidate.parentSlug)}'`;
    bySlug.set(candidate.slug, candidate.id);
    return `('${candidate.id}','${selected.store}',${parentId},'${candidate.name}','${candidate.slug}',${index},'${candidate.status ?? "active"}',${candidate.status === "archived" ? 2 : 1},${candidate.status === "archived" ? `'${NOW}'` : "NULL"},'${NOW}','${NOW}')`;
  });
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.catalog_categories(id,store_id,parent_id,name,slug,position,status,version,archived_at,created_at,updated_at)
    VALUES ${values.join(",")};
    COMMIT;`, database);
}
function absent(pid) {
  if (!Number.isSafeInteger(pid)) return true;
  return spawnSync("kill", ["-0", String(pid)]).status !== 0;
}

async function main() {
  let box;
  let cleanupReady = false;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    applyBase(box);
    psql(box, `CREATE DATABASE ${ROLLBACK} TEMPLATE ${DB};`, "postgres");
    apply(box, UP);
    apply(box, ASSERTIONS);
    seed(box);
    seed(box, ROLLBACK);

    await scenario("manifest checksums are exact", () => {
      assert.deepEqual(MANIFEST.artifacts.map(({ direction }) => direction), ["up", "down", "verify"]);
      for (const artifact of MANIFEST.artifacts) assert.equal(sha256(artifact.file), artifact.sha256, artifact.file);
    });

    await scenario("full base chain plus 066 and assertions apply on PostgreSQL 16", () => {
      assert.match(psql(box, "SHOW server_version;").stdout.trim(), /^16[.]/);
      assert.notEqual(psql(box, "SELECT to_regprocedure('saas.catalog_migration_category_manifest_valid(jsonb)');").stdout.trim(), "");
      assert.notEqual(psql(box, "SELECT to_regprocedure('saas.catalog_migration_category_manifest_matches(uuid,jsonb)');").stdout.trim(), "");
    });

    await scenario("helper and begin functions have exact owner ACL volatility and security-definer authority", () => {
      const authorityRows = psql(box, `
        SELECT procedure.proname||'|'||pg_catalog.pg_get_userbyid(procedure.proowner)||'|'||
          procedure.provolatile::text||'|'||procedure.prosecdef||'|'||pg_catalog.array_to_string(procedure.proconfig,';')||'|'||
          (SELECT pg_catalog.string_agg(
            CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(acl.grantee) END,
            ',' ORDER BY CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(acl.grantee) END
          ) FROM pg_catalog.aclexplode(COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))) acl
            WHERE acl.privilege_type='EXECUTE')
        FROM pg_catalog.pg_proc procedure
        WHERE procedure.oid IN(
          'saas.catalog_migration_category_manifest_valid(jsonb)'::regprocedure,
          'saas.catalog_migration_category_manifest_matches(uuid,jsonb)'::regprocedure,
          'saas.catalog_migration_begin(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,text,integer,integer,jsonb,jsonb)'::regprocedure
        ) ORDER BY procedure.proname;
      `).stdout.trim().split("\n");
      assert.deepEqual(authorityRows, [
        "catalog_migration_begin|celebix_saas_owner|v|true|search_path=pg_catalog, saas|celebix_saas_app,celebix_saas_owner",
        "catalog_migration_category_manifest_matches|celebix_saas_owner|s|false|search_path=pg_catalog, saas|celebix_saas_owner",
        "catalog_migration_category_manifest_valid|celebix_saas_owner|i|false|search_path=pg_catalog, saas|celebix_saas_owner",
      ]);
    });

    const tree = [
      category(101, "Takılar", "takilar"),
      category(102, "Yüzükler", "yuzukler", "takilar"),
      category(103, "Altın Yüzükler", "altin-yuzukler", "yuzukler"),
    ];
    const treeBegin = {
      contextOrdinal: 1,
      operationOrdinal: 101,
      jobOrdinal: 101,
      sourceMarker: "tree",
      categories: tree,
    };
    const createdTree = outcome(box, beginExpression(treeBegin));

    await scenario("root child grandchild categories are created atomically", () => {
      assert.equal(createdTree.outcome, "begun");
      assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_categories WHERE store_id='${context(1).store}';`).stdout.trim(), "3");
      assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_product_migration_jobs WHERE id='${uuid("45", 101)}';`).stdout.trim(), "1");

      const persistedConflict = category(1602, "Kalıcı Çocuk", "kalici-cocuk");
      insertCategories(box, 16, [persistedConflict]);
      const partialConflict = outcome(box, beginExpression({
        contextOrdinal: 16,
        operationOrdinal: 1601,
        jobOrdinal: 1601,
        sourceMarker: "partial-loop-conflict",
        categories: [
          category(1601, "Yeni Ata", "yeni-ata"),
          { ...persistedConflict, parentSlug: "yeni-ata" },
        ],
      }));
      assert.equal(partialConflict.outcome, "import_conflict");
      assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_categories WHERE store_id='${context(16).store}' AND slug='yeni-ata';`).stdout.trim(), "0");
      assert.equal(psql(box, `SELECT parent_id IS NULL FROM saas.catalog_categories WHERE id='${persistedConflict.id}';`).stdout.trim(), "t");
      assert.equal(counts(box, 16), "1|0|0");
    });

    await scenario("persisted parent_id and depth equal the requested tree", () => {
      assert.equal(
        psql(box, `SELECT string_agg(child.slug||':'||COALESCE(parent.slug,'root')||':'||child.depth,',' ORDER BY child.position)
          FROM saas.catalog_categories child
          LEFT JOIN saas.catalog_categories parent ON parent.store_id=child.store_id AND parent.id=child.parent_id
          WHERE child.store_id='${context(1).store}';`).stdout.trim(),
        "takilar:root:1,yuzukler:takilar:2,altin-yuzukler:yuzukler:3",
      );
    });

    await scenario("product batch assigns only the requested leaf category", () => {
      const product = {
        sourceProductId: "1",
        productId: uuid("48", 101),
        title: "Altın Yüzük",
        slug: "altin-yuzuk-101",
        status: "active",
        categorySlugs: ["altin-yuzukler"],
        brandSlugs: [],
        variant: {
          variantId: uuid("49", 101),
          title: "Standart",
          priceCents: 1000,
          stockQuantity: 1,
          attributes: {},
        },
        sourceImageDigests: [],
      };
      const imported = outcome(
        box,
        `saas.catalog_migration_import_batch(${authority(1)},'${uuid("4a", 102)}','${digest("leaf-batch")}','${uuid("45", 101)}','${digest("tree")}',$json$${JSON.stringify([product])}$json$::jsonb)`,
      );
      assert.equal(imported.outcome, "batch_imported");
      assert.equal(
        psql(box, `SELECT category.slug FROM saas.catalog_product_categories relation
          JOIN saas.catalog_categories category ON category.store_id=relation.store_id AND category.id=relation.category_id
          WHERE relation.product_id='${uuid("48", 101)}';`).stdout.trim(),
        "altin-yuzukler",
      );
      assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_product_categories WHERE product_id='${uuid("48", 101)}';`).stdout.trim(), "1");
    });

    const rootOnly = [category(201, "Kolyeler", "kolyeler")];
    const rootOnlyRequest = {
      contextOrdinal: 2,
      operationOrdinal: 201,
      jobOrdinal: 201,
      sourceMarker: "root-only",
      categories: rootOnly,
    };
    const rootOnlyResult = outcome(box, beginExpression(rootOnlyRequest));

    await scenario("legacy root-only manifests still begin", () => {
      assert.equal(rootOnlyResult.outcome, "begun");
      assert.equal(psql(box, `SELECT parent_id IS NULL AND depth=1 FROM saas.catalog_categories WHERE id='${rootOnly[0].id}';`).stdout.trim(), "t");
    });

    const sharedTree = [
      category(301, "Aksesuarlar", "aksesuarlar"),
      category(302, "Küpeler", "kupeler", "aksesuarlar"),
      category(303, "Bileklikler", "bileklikler", "aksesuarlar"),
      category(304, "Altın Küpeler", "altin-kupeler", "kupeler"),
      category(305, "Altın Bileklikler", "altin-bileklikler", "bileklikler"),
    ];
    const sharedResult = outcome(box, beginExpression({
      contextOrdinal: 3,
      operationOrdinal: 301,
      jobOrdinal: 301,
      sourceMarker: "shared-tree",
      categories: sharedTree,
    }));

    await scenario("repeated shared ancestors across multiple paths create once", () => {
      assert.equal(sharedResult.outcome, "begun");
      assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_categories WHERE store_id='${context(3).store}' AND slug='aksesuarlar';`).stdout.trim(), "1");
      assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_categories WHERE store_id='${context(3).store}';`).stdout.trim(), "5");
    });

    await scenario("missing parent rejects with no category job or operation rows", () => {
      const result = outcome(box, beginExpression({
        contextOrdinal: 4,
        operationOrdinal: 401,
        jobOrdinal: 401,
        sourceMarker: "missing-parent",
        categories: [category(401, "Yetim", "yetim", "olmayan")],
      }));
      assert.equal(result.outcome, "invalid_input");
      assert.equal(counts(box, 4), "0|0|0");
    });

    await scenario("child before parent rejects with no durable reach", () => {
      const result = outcome(box, beginExpression({
        contextOrdinal: 5,
        operationOrdinal: 501,
        jobOrdinal: 501,
        sourceMarker: "child-first",
        categories: [
          category(502, "Çocuk", "cocuk", "kok"),
          category(501, "Kök", "kok"),
        ],
      }));
      assert.equal(result.outcome, "invalid_input");
      assert.equal(counts(box, 5), "0|0|0");
    });

    await scenario("a ninth level rejects with no durable reach", () => {
      const categories = [];
      for (let depth = 1; depth <= 9; depth += 1) {
        categories.push(category(600 + depth, `Seviye ${depth}`, `seviye-${depth}`, depth === 1 ? undefined : `seviye-${depth - 1}`));
      }
      const result = outcome(box, beginExpression({
        contextOrdinal: 6,
        operationOrdinal: 601,
        jobOrdinal: 601,
        sourceMarker: "ninth-level",
        categories,
      }));
      assert.equal(result.outcome, "invalid_input");
      assert.equal(counts(box, 6), "0|0|0");
    });

    await scenario("duplicate slug with different parent rejects", () => {
      const result = outcome(box, beginExpression({
        contextOrdinal: 7,
        operationOrdinal: 701,
        jobOrdinal: 701,
        sourceMarker: "duplicate-parent",
        categories: [
          category(701, "Bir", "bir"),
          category(702, "İki", "iki"),
          category(703, "Aynı", "ayni", "bir"),
          category(704, "Aynı", "ayni", "iki"),
        ],
      }));
      assert.equal(result.outcome, "invalid_input");
      assert.equal(counts(box, 7), "0|0|0");
    });

    const exactTree = [
      category(801, "Saatler", "saatler"),
      category(802, "Erkek Saatleri", "erkek-saatleri", "saatler"),
    ];
    insertCategories(box, 8, exactTree);

    await scenario("an exact existing active tree is reused", () => {
      const result = outcome(box, beginExpression({
        contextOrdinal: 8,
        operationOrdinal: 801,
        jobOrdinal: 801,
        sourceMarker: "existing-tree",
        categories: exactTree,
      }));
      assert.equal(result.outcome, "begun");
      assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_categories WHERE store_id='${context(8).store}';`).stdout.trim(), "2");
      assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_product_migration_jobs WHERE store_id='${context(8).store}';`).stdout.trim(), "1");
    });

    insertCategories(box, 9, [category(901, "Yanlış Ad", "isim-catismasi")]);
    await scenario("existing category name mismatch returns import_conflict", () => {
      const result = outcome(box, beginExpression({
        contextOrdinal: 9,
        operationOrdinal: 901,
        jobOrdinal: 901,
        sourceMarker: "name-mismatch",
        categories: [category(901, "Doğru Ad", "isim-catismasi")],
      }));
      assert.equal(result.outcome, "import_conflict");
      assert.equal(counts(box, 9), "1|0|0");
    });

    const persistedParentTree = [
      category(1001, "Birinci Kök", "birinci-kok"),
      category(1002, "İkinci Kök", "ikinci-kok"),
      category(1003, "Çocuk", "tasinan-cocuk", "birinci-kok"),
    ];
    insertCategories(box, 10, persistedParentTree);
    await scenario("existing category parent mismatch returns import_conflict", () => {
      const requested = [
        persistedParentTree[0],
        persistedParentTree[1],
        { ...persistedParentTree[2], parentSlug: "ikinci-kok" },
      ];
      const result = outcome(box, beginExpression({
        contextOrdinal: 10,
        operationOrdinal: 1001,
        jobOrdinal: 1001,
        sourceMarker: "parent-mismatch",
        categories: requested,
      }));
      assert.equal(result.outcome, "import_conflict");
      assert.equal(counts(box, 10), "3|0|0");
    });

    const archivedParent = category(1101, "Arşiv Kök", "arsiv-kok");
    insertCategories(box, 11, [{ ...archivedParent, status: "archived" }]);
    await scenario("archived parent cannot satisfy a child", () => {
      const result = outcome(box, beginExpression({
        contextOrdinal: 11,
        operationOrdinal: 1101,
        jobOrdinal: 1101,
        sourceMarker: "archived-parent",
        categories: [archivedParent, category(1102, "Çocuk", "arsiv-cocuk", "arsiv-kok")],
      }));
      assert.equal(result.outcome, "import_conflict");
      assert.equal(counts(box, 11), "1|0|0");
    });

    const otherStoreRoot = category(1301, "Mağaza Kökü", "magaza-koku");
    insertCategories(box, 13, [otherStoreRoot]);
    const targetRoot = category(1201, "Mağaza Kökü", "magaza-koku");
    const crossStoreResult = outcome(box, beginExpression({
      contextOrdinal: 12,
      operationOrdinal: 1201,
      jobOrdinal: 1201,
      sourceMarker: "cross-store-parent",
      categories: [targetRoot, category(1202, "Hedef Çocuk", "hedef-cocuk", "magaza-koku")],
    }));
    await scenario("another store matching slug cannot satisfy the parent", () => {
      assert.equal(crossStoreResult.outcome, "begun");
      assert.equal(
        psql(box, `SELECT parent.store_id='${context(12).store}' AND parent.id='${targetRoot.id}'
          FROM saas.catalog_categories child
          JOIN saas.catalog_categories parent ON parent.store_id=child.store_id AND parent.id=child.parent_id
          WHERE child.id='${uuid("46", 1202)}';`).stdout.trim(),
        "t",
      );
      assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_categories WHERE slug='magaza-koku';`).stdout.trim(), "2");
    });

    await scenario("exact operation replay returns the original immutable result", () => {
      const product = {
        sourceProductId: "201",
        productId: uuid("48", 201),
        title: "Kök Kategori Ürünü",
        slug: "kok-kategori-urunu-201",
        status: "active",
        categorySlugs: ["kolyeler"],
        brandSlugs: [],
        variant: {
          variantId: uuid("49", 201),
          title: "Standart",
          priceCents: 2000,
          stockQuantity: 1,
          attributes: {},
        },
        sourceImageDigests: [],
      };
      const imported = outcome(
        box,
        `saas.catalog_migration_import_batch(${authority(2)},'${uuid("4a", 202)}','${digest("root-only-batch")}','${uuid("45", 201)}','${digest("root-only")}',$json$${JSON.stringify([product])}$json$::jsonb)`,
      );
      assert.equal(imported.outcome, "batch_imported");
      assert.equal(psql(box, `SELECT status||'|'||imported_products||'|'||version FROM saas.catalog_product_migration_jobs WHERE id='${uuid("45", 201)}';`).stdout.trim(), "completed|1|2");
      const replay = outcome(box, beginExpression(rootOnlyRequest));
      assert.equal(replay.outcome, "operation_replayed");
      assert.deepEqual(replay.result, { ...rootOnlyResult.result, replayed: true });
      assert.equal(replay.result.status, "processing");
      assert.equal(replay.result.importedProducts, 0);
      assert.equal(replay.result.version, 1);
      assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_product_migration_operations WHERE operation_id='${uuid("4a", 201)}';`).stdout.trim(), "1");
    });

    await scenario("changed parentSlug under the same operation ID returns operation_mismatch", () => {
      const changed = sharedTree.map((candidate) => (
        candidate.slug === "altin-kupeler" ? { ...candidate, parentSlug: "bileklikler" } : candidate
      ));
      const result = outcome(box, beginExpression({
        contextOrdinal: 3,
        operationOrdinal: 301,
        jobOrdinal: 301,
        sourceMarker: "shared-tree",
        categories: changed,
      }));
      assert.equal(result.outcome, "operation_mismatch");
      const freshOperation = outcome(box, beginExpression({
        contextOrdinal: 3,
        operationOrdinal: 302,
        jobOrdinal: 301,
        sourceMarker: "shared-tree",
        categories: changed,
      }));
      assert.equal(freshOperation.outcome, "job_mismatch");
      assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_categories WHERE store_id='${context(3).store}';`).stdout.trim(), "5");
      assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_product_migration_operations WHERE store_id='${context(3).store}';`).stdout.trim(), "1");
    });

    await scenario("concurrent equal begin calls leave one job and one exact tree", async () => {
      const concurrentTree = [
        category(1401, "Eşzamanlı Kök", "eszamanli-kok"),
        category(1402, "Eşzamanlı Çocuk", "eszamanli-cocuk", "eszamanli-kok"),
      ];
      const expression = beginExpression({
        contextOrdinal: 14,
        operationOrdinal: 1401,
        jobOrdinal: 1401,
        sourceMarker: "concurrent-tree",
        categories: concurrentTree,
      });
      const sql = `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM ${expression};COMMIT;`;
      const results = await Promise.all([psqlAsync(box, sql), psqlAsync(box, sql)]);
      assert.deepEqual(results.sort(), ["begun", "operation_replayed"]);
      assert.equal(counts(box, 14), "2|1|1");
      assert.equal(
        psql(box, `SELECT count(*) FROM saas.catalog_categories child
          JOIN saas.catalog_categories parent ON parent.store_id=child.store_id AND parent.id=child.parent_id
          WHERE child.store_id='${context(14).store}' AND child.slug='eszamanli-cocuk' AND parent.slug='eszamanli-kok';`).stdout.trim(),
        "1",
      );

      const distinctOperationTree = [
        category(1501, "Mağaza Kilidi Kök", "magaza-kilidi-kok"),
        category(1502, "Mağaza Kilidi Çocuk", "magaza-kilidi-cocuk", "magaza-kilidi-kok"),
      ];
      const distinctRequest = {
        contextOrdinal: 15,
        jobOrdinal: 1501,
        sourceMarker: "store-lock-tree",
        categories: distinctOperationTree,
      };
      const distinctSql = (operationOrdinal) => `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM ${beginExpression({
        ...distinctRequest,
        operationOrdinal,
      })};COMMIT;`;
      const distinctResults = await Promise.all([
        psqlAsync(box, distinctSql(1501)),
        psqlAsync(box, distinctSql(1502)),
      ]);
      assert.deepEqual(distinctResults, ["begun", "begun"]);
      assert.equal(counts(box, 15), "2|1|2");
      assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_product_migration_operations WHERE store_id='${context(15).store}' AND operation_id IN('${uuid("4a", 1501)}','${uuid("4a", 1502)}');`).stdout.trim(), "2");
      assert.equal(
        psql(box, `SELECT count(*) FROM saas.catalog_categories child
          JOIN saas.catalog_categories parent ON parent.store_id=child.store_id AND parent.id=child.parent_id
          WHERE child.store_id='${context(15).store}' AND child.slug='magaza-kilidi-cocuk' AND parent.slug='magaza-kilidi-kok';`).stdout.trim(),
        "1",
      );
    });

    await scenario("backup restore preserves hierarchy RLS ACL functions jobs and product assignment", () => {
      const dump = path.join(box.root, "catalog-hierarchy.dump");
      command(box.executables.pg_dump, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-Fc", "-f", dump, DB]);
      psql(box, `CREATE DATABASE ${RESTORE};`, "postgres");
      command(box.executables.pg_restore, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-d", RESTORE, dump]);
      assert.equal(
        psql(box, `SELECT child.depth||'|'||parent.slug FROM saas.catalog_categories child
          JOIN saas.catalog_categories parent ON parent.store_id=child.store_id AND parent.id=child.parent_id
          WHERE child.id='${uuid("46", 103)}';`, RESTORE).stdout.trim(),
        "3|yuzukler",
      );
      assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_product_migration_jobs WHERE id='${uuid("45", 101)}';`, RESTORE).stdout.trim(), "1");
      assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_product_categories WHERE product_id='${uuid("48", 101)}' AND category_id='${uuid("46", 103)}';`, RESTORE).stdout.trim(), "1");
      assert.equal(psql(box, "SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='saas.catalog_product_migration_jobs'::regclass;", RESTORE).stdout.trim(), "t");
      assert.equal(psql(box, "SELECT has_function_privilege('celebix_saas_app','saas.catalog_migration_category_manifest_valid(jsonb)','EXECUTE');", RESTORE).stdout.trim(), "f");
      assert.notEqual(psql(box, "SET ROLE celebix_saas_app;SELECT count(*) FROM saas.catalog_product_migration_jobs;", RESTORE, true).status, 0);
      apply(box, ASSERTIONS, RESTORE);
    });

    await scenario("down restores migration 059 root-only behavior and reapply restores 066", () => {
      apply(box, UP, ROLLBACK);
      apply(box, ASSERTIONS, ROLLBACK);
      const hierarchy = [category(2001, "Rollback Kök", "rollback-kok"), category(2002, "Rollback Çocuk", "rollback-cocuk", "rollback-kok")];
      assert.equal(outcome(box, beginExpression({
        contextOrdinal: 20,
        operationOrdinal: 2001,
        jobOrdinal: 2001,
        sourceMarker: "rollback-hierarchy",
        categories: hierarchy,
      }), ROLLBACK).outcome, "begun");
      apply(box, DOWN, ROLLBACK);
      assert.equal(psql(box, "SELECT to_regprocedure('saas.catalog_migration_category_manifest_valid(jsonb)') IS NULL;", ROLLBACK).stdout.trim(), "t");
      assert.doesNotMatch(
        psql(box, "SELECT pg_get_functiondef('saas.catalog_migration_begin(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,text,integer,integer,jsonb,jsonb)'::regprocedure);", ROLLBACK).stdout,
        /parentSlug/,
      );
      assert.equal(outcome(box, beginExpression({
        contextOrdinal: 20,
        operationOrdinal: 2002,
        jobOrdinal: 2002,
        sourceMarker: "rollback-reject-hierarchy",
        categories: [category(2003, "Yeni Kök", "yeni-kok"), category(2004, "Yeni Çocuk", "yeni-cocuk", "yeni-kok")],
      }), ROLLBACK).outcome, "invalid_input");
      assert.equal(outcome(box, beginExpression({
        contextOrdinal: 20,
        operationOrdinal: 2003,
        jobOrdinal: 2003,
        sourceMarker: "rollback-root-only",
        categories: [category(2005, "Kök Yalnız", "kok-yalniz")],
      }), ROLLBACK).outcome, "begun");
      assert.equal(counts(box, 20, ROLLBACK), "3|2|2");
      apply(box, UP, ROLLBACK);
      apply(box, ASSERTIONS, ROLLBACK);
      assert.notEqual(psql(box, "SELECT to_regprocedure('saas.catalog_migration_category_manifest_valid(jsonb)');", ROLLBACK).stdout.trim(), "");
      assert.equal(outcome(box, beginExpression({
        contextOrdinal: 20,
        operationOrdinal: 2004,
        jobOrdinal: 2004,
        sourceMarker: "rollback-reapply",
        categories: [category(2006, "Son Kök", "son-kok"), category(2007, "Son Çocuk", "son-cocuk", "son-kok")],
      }), ROLLBACK).outcome, "begun");
    });

    cleanupReady = true;
  } finally {
    const root = box?.root;
    const data = box?.data;
    const socket = box?.socket;
    const pid = box?.pid;
    stop(box);
    if (cleanupReady) {
      await scenario("cleanup removes the isolated cluster and process", () => {
        assert.equal(existsSync(root), false);
        assert.equal(existsSync(data), false);
        assert.equal(existsSync(socket), false);
        assert.equal(absent(pid), true);
      });
      assert.equal(completed, TOTAL);
      console.log(JSON.stringify({
        status: "PASS",
        backend: "native-postgresql",
        postgresqlVersion: "16.14",
        scenarios: `${TOTAL}/${TOTAL}`,
        backupRestore: "PASS",
        rollbackReapply: "PASS",
        externalConnections: 0,
        productionConnections: 0,
        cleanup: "PASS",
      }));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
