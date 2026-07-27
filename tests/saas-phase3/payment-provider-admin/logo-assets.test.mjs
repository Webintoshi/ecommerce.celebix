import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PROVIDER_ROOT = path.join(ROOT, "apps/customer-panel/public/payment-providers");
const SOURCE_FILE = path.join(
  ROOT,
  "apps/customer-panel/lib/payment-providers/logo-sources.json",
);
const MANIFEST_FILE = path.join(
  ROOT,
  "apps/customer-panel/lib/payment-providers/logo-manifest.json",
);

const EXPECTED_FAMILIES = Object.freeze([
  "akbank",
  "akode",
  "albaraka_turk",
  "craftgate",
  "denizbank",
  "erpapay",
  "esnekpos",
  "qnb_finansbank",
  "garanti_bbva",
  "halkbank",
  "hepsipay",
  "is_bankasi",
  "isyerimpos",
  "iyzico",
  "kuveyt_turk",
  "lidio",
  "moka",
  "mollie",
  "ozan",
  "paidora",
  "papara",
  "papel",
  "param",
  "paratika",
  "paybull",
  "paycell",
  "paynkolay",
  "paytr",
  "qnbpay",
  "rubikpara",
  "sekerbank",
  "setcard",
  "shopier",
  "sipay",
  "tami",
  "teb",
  "united_payment",
  "vakif_katilim",
  "vakifbank",
  "vallet",
  "vepara",
  "weepay",
  "worldpay",
  "wyld",
  "yapi_kredi",
  "ziraat_bankasi",
  "ziraat_katilim",
  "ziraatpay",
]);

const ACTIVE_SVG = /<(?:script|foreignObject|iframe|object|embed)\b|\bon[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["'](?:https?:|data:|\/\/)/i;
const ALLOWED_MIME_TYPES = new Set(["image/svg+xml", "image/png", "image/webp"]);

function readJson(file) {
  assert.ok(existsSync(file), `missing ${path.relative(ROOT, file)}`);
  return JSON.parse(readFileSync(file, "utf8"));
}

function assertExactFamilies(rows, label) {
  assert.ok(Array.isArray(rows), `${label} must be an array`);
  assert.deepEqual(
    rows.map((row) => row.familyCode).sort(),
    [...EXPECTED_FAMILIES].sort(),
    `${label} must cover exactly the approved provider families`,
  );
}

test("logo source records cover exactly every approved provider family", () => {
  const sources = readJson(SOURCE_FILE);
  assertExactFamilies(sources, "logo sources");

  for (const source of sources) {
    assert.deepEqual(Object.keys(source).sort(), [
      "familyCode",
      "file",
      "officialHost",
      "retrievedAt",
      "sourceUrl",
      "usageNote",
    ]);
    const url = new URL(source.sourceUrl);
    assert.equal(url.protocol, "https:", source.familyCode);
    assert.equal(url.hostname, source.officialHost, source.familyCode);
    assert.equal(url.username, "", source.familyCode);
    assert.equal(url.password, "", source.familyCode);
    assert.equal(url.search, "", source.familyCode);
    assert.match(source.retrievedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(source.file, /^[a-z0-9_]+\.(?:svg|png|webp)$/);
    assert.ok(source.usageNote.length > 0, source.familyCode);
  }
});

test("logo manifest is deterministic and pins one safe local asset per family", () => {
  const manifest = readJson(MANIFEST_FILE);
  assertExactFamilies(manifest, "logo manifest");
  assert.deepEqual(
    manifest.map((row) => row.familyCode),
    [...EXPECTED_FAMILIES].sort(),
    "manifest rows must be sorted by familyCode",
  );

  for (const row of manifest) {
    assert.deepEqual(Object.keys(row).sort(), [
      "familyCode",
      "file",
      "mimeType",
      "sha256",
    ]);
    assert.ok(ALLOWED_MIME_TYPES.has(row.mimeType), row.familyCode);
    assert.equal(row.file, `/payment-providers/${row.familyCode}.${row.file.split(".").at(-1)}`);
    assert.match(row.sha256, /^[a-f0-9]{64}$/);

    const asset = path.join(PROVIDER_ROOT, path.basename(row.file));
    assert.ok(existsSync(asset), `missing asset ${row.file}`);
    const bytes = readFileSync(asset);
    assert.ok(bytes.length > 0, row.familyCode);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), row.sha256, row.familyCode);

    if (row.mimeType === "image/svg+xml") {
      const svg = bytes.toString("utf8");
      assert.ok(bytes.length <= 256 * 1024, row.familyCode);
      assert.match(svg, /<svg\b[^>]*\bviewBox\s*=\s*["'][^"']+["']/i, row.familyCode);
      assert.doesNotMatch(svg, ACTIVE_SVG, row.familyCode);
    } else {
      assert.ok(bytes.length <= 512 * 1024, row.familyCode);
    }
  }
});

test("logo provenance stays in the source inventory and the runtime manifest stays local", () => {
  const sources = readJson(SOURCE_FILE);
  const manifest = readJson(MANIFEST_FILE);
  const manifestByFamily = new Map(manifest.map((row) => [row.familyCode, row]));

  for (const source of sources) {
    const row = manifestByFamily.get(source.familyCode);
    assert.ok(row, source.familyCode);
    assert.equal(path.basename(row.file), source.file, source.familyCode);
  }

  assert.doesNotMatch(JSON.stringify(manifest), /https?:\/\/|sourceUrl|officialHost|retrievedAt|usageNote/);
});
