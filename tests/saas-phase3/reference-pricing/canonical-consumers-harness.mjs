import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import {
  DB, NOW, STORE, OWNER, MEMBERSHIP, PLAN, USD, SET_1, USD_VARIANT, FIXED,
  command, start, stop, psql, scalar, call, jsonb, operation, define, saveSet,
  preview, activate, policySave, migrationsThrough128, apply, seed,
} from "./postgres-harness.mjs";

const root = process.env.CELEBIX_CANONICAL_ARCHIVE_ROOT;
if (!root) throw new Error("CANONICAL_ARCHIVE_REQUIRED: extract exact c09d59a21944fb24ef82cf904db5e444ec1d4fd5 packages into a separate archive root");
const imported = (relative) => import(pathToFileURL(path.join(root, relative)).href);
const [{ parseBarcodeLabelVariantRow }, { PostgresBarcodeLabelRepository },
  { PostgresCatalogRepository }] = await Promise.all([
  imported("packages/saas-contracts/src/barcode-labels/validation.ts"),
  imported("packages/saas-data/src/barcode-labels/repository.ts"),
  imported("packages/saas-data/src/catalog/repository.ts"),
]);

const tenantContext = {
  schemaVersion: 1,
  requestId: operation(399),
  principal: { id: OWNER, issuer: "https://identity.example/oidc", subject: "canonical-test" },
  store: { id: STORE, slug: "pricing-isolated", status: "active" },
  membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
  entitlements: {
    schemaVersion: 1, planId: PLAN, planCode: "free_starter", version: 1,
    status: "active", features: ["catalog"],
    limits: { products: 100, staff: 1, storageBytes: 1024 },
    validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z",
  },
  locale: "tr-TR",
};
const templateConfig = {
  sectorProfile: "retail", paperType: "thermal-roll", widthMm: 50, heightMm: 30,
  orientation: "portrait", rows: 1, columns: 1,
  marginsMm: { top: 1, right: 1, bottom: 1, left: 1 },
  gapMm: { horizontal: 0, vertical: 0 }, barcodeFormat: "code128",
  barcodeSource: "barcode", barcodeHeightMm: 10, showHumanReadable: true,
  currencyDisplay: "symbol", fields: [
    { key: "productTitle", visible: true, order: 0, align: "center", fontSizePt: 9, maxLines: 2, autoShrink: true },
    { key: "barcodeSymbol", visible: true, order: 1, align: "center", fontSizePt: 8, maxLines: 1, autoShrink: false },
  ],
};

let box;
let pool;
try {
  box = start();
  command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], `CREATE DATABASE ${DB};`);
  for (const file of migrationsThrough128()) apply(box, file);
  apply(box, "202609200130_reference_pricing.up.sql");
  for (const file of [136, 137, 138, 139, 140, 141]) {
    apply(box, {
      136: "202609200136_reference_pricing_legacy_consumers.up.sql",
      137: "202609200137_reference_pricing_inactive_activation.up.sql",
      138: "202609200138_reference_pricing_catalog_summary.up.sql",
      139: "202609200139_reference_pricing_print_guard.up.sql",
      140: "202609200140_reference_pricing_catalog_detail.up.sql",
      141: "202609200141_reference_pricing_catalog_preview.up.sql",
    }[file]);
  }
  seed(box);
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)
    VALUES('11000000-0000-4000-8000-000000000130','${STORE}','pricing-isolated.test','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
    UPDATE saas.product_variants SET barcode='FIXED-CANONICAL' WHERE store_id='${STORE}'::uuid AND id='${FIXED}'::uuid;
    COMMIT;`);
  pool = new pg.Pool({ host: box.socket, port: box.port, database: DB, user: "postgres", max: 2 });
  const options = { pool, role: "celebix_saas_app", timeouts: {
    poolCheckoutMs: 1000, statementMs: 5000, lockMs: 1000, idleTransactionMs: 5000,
  }, audit: () => undefined };
  const labels = new PostgresBarcodeLabelRepository({ ...options, uuid: () => operation(320) });
  const catalog = new PostgresCatalogRepository({ ...options, generateId: () => operation(321) });
  const now = new Date(NOW);
  const fixedRows = await labels.list({ tenantContext, now, query: { sort: "name-asc", pageSize: 20 } });
  assert.equal(fixedRows.items.find((item) => item.variantId === FIXED)?.priceCents, 12345);
  const fixedRow = fixedRows.items.find((item) => item.variantId === FIXED);
  assert.ok(fixedRow);
  assert.deepEqual(parseBarcodeLabelVariantRow(fixedRow), fixedRow);
  const fixedVersion = Number(scalar(box, `SELECT version FROM saas.product_variants WHERE id='${FIXED}'::uuid;`));
  assert.equal(scalar(box, `SELECT saas.barcode_label_template_config_valid(${jsonb(templateConfig)});`), "t");
  assert.equal(JSON.parse(scalar(box, `SELECT saas.barcode_label_variant_projection_v2('${STORE}'::uuid,'${FIXED}'::uuid)::text;`)).priceCents, 12345);
  const printInput = {
    tenantContext, now, operationId: operation(322),
    template: { kind: "system", key: "retail-50x30" }, templateName: "Fiyat etiketi",
    templateConfig, outputType: "pdf", printerProfile: "thermal", startCell: 0,
    targets: [{ variantId: FIXED, expectedVersion: fixedVersion, quantity: 1 }],
  };
  const directPrint = call(box, "barcode_print_job_create", `'${operation(330)}'::uuid,'${operation(330)}'::uuid,NULL::uuid,NULL::bigint,'Fiyat etiketi',${jsonb(templateConfig)},'pdf','thermal',0,${jsonb([{ variantId: FIXED, expectedVersion: fixedVersion, quantity: 1 }])}`);
  assert.equal(directPrint.outcome, "created", JSON.stringify(directPrint));
  const printed = await labels.createJob(printInput);
  assert.equal(printed.items[0].snapshot.priceCents, 12345);
  assert.equal((await labels.getJob({ tenantContext, now, jobId: printed.id })).items[0].snapshot.priceCents, 12345);
  assert.equal((await labels.createJob(printInput)).items[0].snapshot.priceCents, 12345);
  assert.equal((await catalog.listProducts({ tenantContext, now, pageSize: 20 })).catalogTotal, 1);
  process.stdout.write("PASS canonical old repositories parse fixed label list/create/read/replay and catalog\n");

  assert.equal(define(box, USD, "usd", "USD satış", null, operation(323)).outcome, "defined");
  assert.equal(saveSet(box, SET_1, 0, [{ referenceId: USD, rateTry: "40", active: true }], operation(324)).outcome, "saved");
  assert.equal(activate(box, SET_1, 0, preview(box, SET_1).result.scopeDigest, operation(325)).outcome, "activated");
  assert.equal(policySave(box, USD_VARIANT, 1, 0, { method: "usd", sourceAmount: "125", referenceId: USD }, operation(326)).outcome, "policy_saved");
  const rich = call(box, "barcode_label_list_v2", `NULL::text,NULL::text,NULL::text,NULL::uuid,NULL::uuid,NULL::uuid,NULL::boolean,'name-asc',20,NULL::integer,NULL::text,NULL::integer,NULL::uuid`);
  assert.throws(() => parseBarcodeLabelVariantRow(rich.result.items.find((item) => item.variantId === FIXED)),
    "canonical strict parser must reject the new V2 shape even for fixed labels");
  await assert.rejects(() => labels.list({ tenantContext, now, query: { sort: "name-asc", pageSize: 20 } }),
    (error) => error?.code === "unavailable", "old mixed list must fail closed");
  const oldDetail = await catalog.getProductDetails({ tenantContext, now,
    productId: "50000000-0000-4000-8000-000000000130", includeArchivedVariants: true });
  assert.equal(oldDetail.variants.find((item) => item.id === USD_VARIANT)?.priceCents, 500000);
  await assert.rejects(() => labels.createJob({ ...printInput, operationId: operation(327),
    targets: [{ variantId: USD_VARIANT, expectedVersion: 1, quantity: 1 }] }),
    (error) => error?.code === "unavailable", "old dynamic print must be denied before write");
  assert.equal((await labels.getJob({ tenantContext, now, jobId: printed.id })).items[0].snapshot.priceCents, 12345);
  process.stdout.write("PASS canonical strict parser rejects V2; old mixed reads and dynamic writes are controlled\n");
} finally {
  if (pool) await pool.end();
  stop(box);
}
