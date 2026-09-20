import assert from "node:assert/strict";
import {
  DB, NOW, STORE, OWNER, MEMBERSHIP, PLAN, USD, SET_1, USD_VARIANT, command, start, stop, psql,
  scalar, call, jsonb, operation, define, saveSet, preview, activate, policySave, effective,
  migrationsThrough128, apply, seed,
} from "./postgres-harness.mjs";

const SET_2 = "41000000-0000-4000-8000-000000000131";
const FIXED = "51000000-0000-4000-8000-000000000130";
const DRAFT_PRODUCT = "50000000-0000-4000-8000-000000000131";
const DRAFT_VARIANT = "51000000-0000-4000-8000-000000000135";
const LABEL_CONFIG = {
  sectorProfile: "retail", paperType: "thermal-roll", widthMm: 50, heightMm: 30,
  orientation: "portrait", rows: 1, columns: 1,
  marginsMm: { top: 1, right: 1, bottom: 1, left: 1 },
  gapMm: { horizontal: 0, vertical: 0 }, barcodeFormat: "code128",
  barcodeSource: "barcode", barcodeHeightMm: 10, showHumanReadable: true,
  currencyDisplay: "symbol", fields: [
    { key: "productTitle", visible: true, order: 0, align: "center",
      fontSizePt: 9, maxLines: 2, autoShrink: true },
    { key: "barcodeSymbol", visible: true, order: 1, align: "center",
      fontSizePt: 8, maxLines: 1, autoShrink: false },
  ],
};

function printJob(box, index, variantId = USD_VARIANT, expectedVersion = 2,
  rpc = "barcode_print_job_create_v2") {
  return call(box, rpc, [
    `'${operation(index)}'::uuid`, `'${operation(index + 100)}'::uuid`,
    "NULL::uuid", "NULL::bigint", "'Fiyat etiketi'", jsonb(LABEL_CONFIG),
    "'pdf'", "'thermal'", "0", jsonb([{ variantId, expectedVersion, quantity: 1 }]),
  ].join(","));
}

function catalogCall(box, name, argumentsSql) {
  return JSON.parse(scalar(box, `SET ROLE celebix_saas_app;
    SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
    FROM saas.${name}('${STORE}'::uuid,'${OWNER}'::uuid,'${MEMBERSHIP}'::uuid,
      '${PLAN}'::uuid,'free_starter',1,100,'${NOW}'::timestamptz,${argumentsSql});`));
}

function main() {
  let box;
  try {
    box = start();
    command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], `CREATE DATABASE ${DB};`);
    for (const file of migrationsThrough128()) apply(box, file);
    apply(box, "202609200130_reference_pricing.up.sql");
    seed(box);
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
      INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)
      VALUES('11000000-0000-4000-8000-000000000130','${STORE}','pricing-isolated.test','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
      COMMIT;`);
    assert.equal(define(box, USD, "usd", "USD satış", null, operation(201)).outcome, "defined");
    assert.equal(saveSet(box, SET_1, 0, [{ referenceId: USD, rateTry: "40", active: true }], operation(202)).outcome, "saved");
    assert.equal(activate(box, SET_1, 0, preview(box, SET_1).result.scopeDigest, operation(203)).outcome, "activated");
    assert.equal(policySave(box, USD_VARIANT, 1, 0, { method: "usd", sourceAmount: "125", referenceId: USD }, operation(204)).outcome, "policy_saved");

    for (const sequence of [136, 137, 138, 139, 140, 141]) {
      const file = {
        136: "202609200136_reference_pricing_legacy_consumers.up.sql",
        137: "202609200137_reference_pricing_inactive_activation.up.sql",
        138: "202609200138_reference_pricing_catalog_summary.up.sql",
        139: "202609200139_reference_pricing_print_guard.up.sql",
        140: "202609200140_reference_pricing_catalog_detail.up.sql",
        141: "202609200141_reference_pricing_catalog_preview.up.sql",
      }[sequence];
      apply(box, file);
    }

    const oldFixedList = call(box, "barcode_label_list", `NULL::text,NULL::text,NULL::text,NULL::uuid,NULL::uuid,NULL::uuid,NULL::boolean,'name-asc',20,NULL::integer,NULL::text,NULL::integer,NULL::uuid`);
    assert.equal(oldFixedList.outcome, "unavailable", "legacy mixed page must not display a dynamic stored base price");
    const newPricedList = call(box, "barcode_label_list_v2", `NULL::text,NULL::text,NULL::text,NULL::uuid,NULL::uuid,NULL::uuid,NULL::boolean,'name-asc',20,NULL::integer,NULL::text,NULL::integer,NULL::uuid`);
    assert.equal(newPricedList.outcome, "listed");
    assert.equal(newPricedList.result.items.find((item) => item.variantId === USD_VARIANT)?.priceCents, 500_000);
    assert.equal(newPricedList.result.items.find((item) => item.variantId === FIXED)?.priceCents, 12345);

    const oldSummary = catalogCall(box, "catalog_list_products_v3", `NULL::text,NULL::text,NULL::text,NULL::uuid,NULL::uuid,NULL::uuid,'updated-desc',20::integer,NULL::timestamptz,NULL::text,NULL::uuid`);
    assert.equal(oldSummary.outcome, "listed");
    assert.equal(oldSummary.result.variantSummaries[oldSummary.result.items[0].id].priceCents, 12345,
      "legacy fixed-price summary remains unchanged");
    const dynamicSummary = JSON.parse(scalar(box, `BEGIN;
      UPDATE saas.product_variants SET status='archived', archived_at='${NOW}'::timestamptz, updated_at='${NOW}'::timestamptz WHERE store_id='${STORE}'::uuid AND id='${FIXED}'::uuid;
      UPDATE saas.product_variants SET created_at='2025-01-01' WHERE store_id='${STORE}'::uuid AND id='${USD_VARIANT}'::uuid;
      UPDATE saas.product_variants SET compare_at_cents=500000 WHERE store_id='${STORE}'::uuid AND id='${USD_VARIANT}'::uuid;
      SET LOCAL ROLE celebix_saas_app;
      SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
      FROM saas.catalog_list_products_v3('${STORE}'::uuid,'${OWNER}'::uuid,
        '${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,100,
        '${NOW}'::timestamptz,NULL,NULL,NULL,NULL,NULL,NULL,'updated-desc',20,
        NULL::timestamptz,NULL::text,NULL::uuid);
      ROLLBACK;`));
    assert.equal(dynamicSummary.outcome, "listed");
    assert.equal(dynamicSummary.result.variantSummaries[oldSummary.result.items[0].id].priceCents, 500_000);
    assert.equal(Object.hasOwn(dynamicSummary.result.variantSummaries[oldSummary.result.items[0].id], "effectivePriceCents"), false);
    assert.equal(Object.hasOwn(dynamicSummary.result.variantSummaries[oldSummary.result.items[0].id], "compareAtCents"), false,
      "equal strike-through amount must not present a fake discount");
    const archivedDynamicSummary = JSON.parse(scalar(box, `BEGIN;
      UPDATE saas.product_variants SET status='archived',archived_at='${NOW}'::timestamptz,
        updated_at='${NOW}'::timestamptz WHERE store_id='${STORE}'::uuid;
      UPDATE saas.product_variants SET created_at='2025-01-01' WHERE store_id='${STORE}'::uuid AND id='${USD_VARIANT}'::uuid;
      SET LOCAL ROLE celebix_saas_app;
      SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
      FROM saas.catalog_list_products_v3('${STORE}'::uuid,'${OWNER}'::uuid,
        '${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,100,
        '${NOW}'::timestamptz,NULL,NULL,NULL,NULL,NULL,NULL,'updated-desc',20,
        NULL::timestamptz,NULL::text,NULL::uuid);
      ROLLBACK;`));
    assert.equal(archivedDynamicSummary.outcome, "listed",
      "unsellable archived dynamic variants must not hide an otherwise readable page");
    assert.equal(archivedDynamicSummary.result.variantSummaries[oldSummary.result.items[0].id].variantId, USD_VARIANT);
    const oldDetail = catalogCall(box, "catalog_get_product_details", `'50000000-0000-4000-8000-000000000130'::uuid,true`);
    assert.equal(oldDetail.outcome, "found");
    assert.equal(oldDetail.result.variants.find((item) => item.id === USD_VARIANT).priceCents, 500_000);
    const oldPreview = catalogCall(box, "catalog_get_product_preview", `'50000000-0000-4000-8000-000000000130'::uuid`);
    assert.equal(oldPreview.outcome, "found");
    assert.equal(oldPreview.result.variants.find((item) => item.title === "USD").priceCents, 500_000);

    const label = JSON.parse(scalar(box, `SELECT saas.barcode_label_variant_projection_v2('${STORE}'::uuid,'${USD_VARIANT}'::uuid)::text;`));
    assert.equal(label.priceCents, 500_000, "a barcode preview must not show the cached base TRY price");
    assert.equal(label.priceContext?.channel, "storefront");
    assert.equal(label.priceContext?.activeSetId, SET_1);
    assert.equal(label.priceContext?.activeSetVersion, 1);
    assert.equal(label.priceContext?.policyVersion, 1);
    process.stdout.write("PASS barcode preview uses the active reference price\n");
    assert.equal(scalar(box, `BEGIN READ ONLY;SET LOCAL ROLE celebix_saas_app;
      SELECT item.value->>'priceCents' FROM saas.barcode_label_list_v2(
        '${STORE}'::uuid,'${OWNER}'::uuid,'${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,
        'free_starter',1,'${NOW}'::timestamptz,NULL::text,NULL::text,NULL::text,
        NULL::uuid,NULL::uuid,NULL::uuid,NULL::boolean,'name-asc',20,
        NULL::integer,NULL::text,NULL::integer,NULL::uuid) listing,
        pg_catalog.jsonb_array_elements(listing.result_payload->'items') item(value)
      WHERE item.value->>'variantId'='${USD_VARIANT}';COMMIT;`), "500000",
      "the panel's permitted read-only list must resolve the live label amount");

    const listed = call(box, "barcode_label_list_v2", `NULL::text,NULL::text,NULL::text,NULL::uuid,NULL::uuid,NULL::uuid,NULL::boolean,'name-asc',20,NULL::integer,NULL::text,NULL::integer,NULL::uuid`);
    assert.equal(listed.outcome, "listed");
    assert.equal(listed.result.items.find((item) => item.variantId === USD_VARIANT)?.priceCents,
      500_000, "the label list must not surface the cached base price");
    process.stdout.write("PASS barcode list uses the same anonymous storefront price\n");

    psql(box, `UPDATE saas.product_variants SET created_at='2025-01-01' WHERE store_id='${STORE}'::uuid AND id='${USD_VARIANT}'::uuid;`);
    const catalog = JSON.parse(scalar(box, `SET ROLE celebix_saas_app;
      SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
      FROM saas.catalog_list_products_v4('${STORE}'::uuid,'${OWNER}'::uuid,
        '${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,100,
        '${NOW}'::timestamptz,NULL,NULL,NULL,NULL,NULL,NULL,'updated-desc',20,
        NULL::timestamptz,NULL::text,NULL::uuid);`));
    assert.equal(catalog.outcome, "listed");
    const summary = catalog.result.variantSummaries[catalog.result.items[0].id];
    assert.equal(summary.priceCents, 10_000, "the stored base price is retained only for editing");
    assert.equal(summary.effectivePriceCents, 500_000, "the panel list must show the current selling price");
    assert.equal(summary.pricingMethod, "usd");
    process.stdout.write("PASS catalog V4 separates persisted edit price from effective selling price\n");

    const detailSql = `SET ROLE celebix_saas_app;
      SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
      FROM saas.catalog_get_product_details_v2('${STORE}'::uuid,'${OWNER}'::uuid,
        '${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,100,
        '${NOW}'::timestamptz,'50000000-0000-4000-8000-000000000130'::uuid,true);`;
    const detail = JSON.parse(scalar(box, detailSql));
    assert.equal(detail.outcome, "found");
    assert.equal(detail.result.variants.find((variant) => variant.id === USD_VARIANT).priceCents, 10_000);
    assert.equal(detail.result.variants.find((variant) => variant.id === USD_VARIANT).effectivePriceCents, 500_000);
    process.stdout.write("PASS detail separates edit and selling prices\n");

    const previewSql = `SET ROLE celebix_saas_app;
      SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
      FROM saas.catalog_get_product_preview_v2('${STORE}'::uuid,'${OWNER}'::uuid,
        '${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,100,
        '${NOW}'::timestamptz,'50000000-0000-4000-8000-000000000130'::uuid);`;
    const productPreview = JSON.parse(scalar(box, previewSql));
    assert.equal(productPreview.outcome, "found");
    assert.equal(productPreview.result.variants.find((variant) => variant.title === "USD").priceCents, 500_000);
    process.stdout.write("PASS panel storefront preview shows effective anonymous price\n");

    psql(box, `UPDATE saas.product_variants SET barcode='PRICING-USD' WHERE store_id='${STORE}'::uuid AND id='${USD_VARIANT}'::uuid;`);
    assert.equal(scalar(box, `SELECT saas.barcode_label_template_config_valid(${jsonb(LABEL_CONFIG)});`), "t", "print config is valid");
    assert.equal(scalar(box, `SELECT version FROM saas.product_variants WHERE id='${USD_VARIANT}'::uuid;`), "2", "the print target version is current");
    const printed = printJob(box, 207);
    assert.equal(printed.outcome, "created");
    assert.equal(printed.result.items[0].snapshot.priceCents, 500_000);
    assert.equal(printed.result.items[0].snapshot.priceContext.activeSetId, SET_1);
    process.stdout.write("PASS print job persists the active reference price and lineage\n");

    psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
      INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at)
      VALUES('${DRAFT_PRODUCT}','${STORE}','fixed-draft','Fixed Draft','draft','TRY',1,'2026-01-01','2026-01-01');
      ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
      INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,barcode,
        stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at)
      VALUES('${DRAFT_VARIANT}','${DRAFT_PRODUCT}','${STORE}','Draft',45678,'PRICING-DRAFT',
        false,0,'active','{}',1,'2026-01-01','2026-01-01');
      ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile; COMMIT;`);
    assert.equal(JSON.parse(scalar(box, `SELECT saas.barcode_label_variant_projection_v2('${STORE}'::uuid,'${DRAFT_VARIANT}'::uuid)::text;`)).priceCents,45678);
    assert.equal(call(box, "barcode_label_list_v2", `NULL::text,NULL::text,NULL::text,NULL::uuid,NULL::uuid,NULL::uuid,NULL::boolean,'name-asc',20,NULL::integer,NULL::text,NULL::integer,NULL::uuid`)
      .result.items.find((item) => item.variantId === DRAFT_VARIANT)?.priceCents,45678);
    const draftCatalog = JSON.parse(scalar(box, `SET ROLE celebix_saas_app;
      SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
      FROM saas.catalog_list_products_v4('${STORE}'::uuid,'${OWNER}'::uuid,
        '${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,100,
        '${NOW}'::timestamptz,NULL,'draft',NULL,NULL,NULL,NULL,'updated-desc',20,
        NULL::timestamptz,NULL::text,NULL::uuid);`));
    assert.equal(draftCatalog.result.variantSummaries[DRAFT_PRODUCT].effectivePriceCents,45678);
    const draftDetail = JSON.parse(scalar(box, detailSql.replaceAll('50000000-0000-4000-8000-000000000130',DRAFT_PRODUCT)));
    assert.equal(draftDetail.result.variants[0].effectivePriceCents,45678);
    const draftPreview = JSON.parse(scalar(box, previewSql.replaceAll('50000000-0000-4000-8000-000000000130',DRAFT_PRODUCT)));
    assert.equal(draftPreview.result.variants[0].priceCents,45678);
    const legacyFixedPrint = printJob(box, 209, DRAFT_VARIANT, 1, "barcode_print_job_create");
    assert.equal(legacyFixedPrint.result.items[0].snapshot.priceCents,45678);
    assert.equal(Object.hasOwn(legacyFixedPrint.result.items[0].snapshot,"priceContext"),false,
      "an old fixed-product print result must retain the strict V1 snapshot shape");
    process.stdout.write("PASS fixed draft remains previewable and printable without being a live sale\n");

    assert.equal(saveSet(box, SET_2, 1, [{ referenceId: USD, rateTry: null, active: false }], operation(205)).outcome, "saved");
    const inactivePreview = preview(box, SET_2);
    assert.equal(inactivePreview.outcome, "previewed");
    assert.equal(inactivePreview.result.unavailableVariants, 1);
    assert.equal(activate(box, SET_2, 1, inactivePreview.result.scopeDigest, operation(206)).outcome,
      "activated", "the merchant must be able to stop new dynamic sales by deactivating a reference");
    assert.equal(effective(box, USD_VARIANT).outcome, "unavailable");
    assert.equal(effective(box, FIXED).price_cents, 12345);
    const inactiveList = call(box, "barcode_label_list_v2", `NULL::text,NULL::text,NULL::text,NULL::uuid,NULL::uuid,NULL::uuid,NULL::boolean,'name-asc',20,NULL::integer,NULL::text,NULL::integer,NULL::uuid`);
    assert.equal(inactiveList.outcome, "listed");
    assert.equal(inactiveList.result.items.find((item) => item.variantId === USD_VARIANT)?.priceCents, null);
    assert.equal(inactiveList.result.items.find((item) => item.variantId === USD_VARIANT)?.priceUnavailable, true);
    assert.equal(inactiveList.result.items.find((item) => item.variantId === FIXED)?.priceCents, 12345);
    process.stdout.write("PASS inactive reference hides only dependent label prices and leaves fixed rows available\n");

    const inactiveCatalog = JSON.parse(scalar(box, `SET ROLE celebix_saas_app;
      SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
      FROM saas.catalog_list_products_v4('${STORE}'::uuid,'${OWNER}'::uuid,
        '${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,100,
        '${NOW}'::timestamptz,NULL,NULL,NULL,NULL,NULL,NULL,'updated-desc',20,
        NULL::timestamptz,NULL::text,NULL::uuid);`));
    assert.equal(inactiveCatalog.outcome, "listed");
    assert.equal(inactiveCatalog.result.variantSummaries[catalog.result.items[0].id].effectivePriceCents, null,
      "inactive reference must never fall back to the cached base price");
    assert.equal(JSON.parse(scalar(box, detailSql)).result.variants.find((variant) => variant.id === USD_VARIANT).effectivePriceCents, null);
    assert.equal(JSON.parse(scalar(box, previewSql)).result.variants.find((variant) => variant.title === "USD").priceCents, null);

    const oldPrint = call(box, "barcode_print_job_get", `'${printed.result.id}'::uuid`);
    assert.equal(oldPrint.outcome, "found");
    assert.equal(oldPrint.result.items[0].snapshot.priceCents, 500_000,
      "a historical print job must retain its original amount");
    assert.equal(Object.hasOwn(oldPrint.result.items[0].snapshot,"priceContext"),false,
      "old job detail must be parseable without erasing persisted price audit");
    const newPrint = call(box, "barcode_print_job_get_v2", `'${printed.result.id}'::uuid`);
    assert.equal(newPrint.result.items[0].snapshot.priceContext.activeSetId, SET_1);
    const legacyReplay = printJob(box, 207, USD_VARIANT, 2, "barcode_print_job_create");
    assert.equal(legacyReplay.outcome,"operation_replayed");
    assert.equal(Object.hasOwn(legacyReplay.result.items[0].snapshot,"priceContext"),false);
    const replay = printJob(box, 207);
    assert.equal(replay.outcome, "operation_replayed");
    assert.equal(replay.result.items[0].snapshot.priceCents, 500_000);
    assert.equal(printJob(box, 208).outcome, "unavailable",
      "new labels must fail explicitly when their reference is inactive");
    process.stdout.write("PASS prior print snapshot is immutable and new unavailable job is rejected\n");

    const method = scalar(box, `SELECT pg_catalog.to_regprocedure('saas.resolve_effective_variant_price(uuid,uuid,text,timestamp with time zone,text)') IS NOT NULL;`);
    assert.equal(method, "t");
  } finally { stop(box); }
}

main();
