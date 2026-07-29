import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
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
  "akbank", "akode", "albaraka_turk", "craftgate", "denizbank", "erpapay",
  "esnekpos", "qnb_finansbank", "garanti_bbva", "halkbank", "hepsipay",
  "is_bankasi", "isyerimpos", "iyzico", "kuveyt_turk", "lidio", "moka",
  "mollie", "ozan", "paidora", "papara", "papel", "param", "paratika",
  "paybull", "paycell", "paynkolay", "paytr", "qnbpay", "rubikpara",
  "sekerbank", "setcard", "shopier", "sipay", "tami", "teb",
  "united_payment", "vakif_katilim", "vakifbank", "vallet", "vepara",
  "weepay", "worldpay", "wyld", "yapi_kredi", "ziraat_bankasi",
  "ziraat_katilim", "ziraatpay",
]);
const SOURCE_KEYS = Object.freeze([
  "familyCode", "file", "officialHost", "retrievedAt", "sourceUrl", "usageNote",
]);
const SVG_ACTIVE_CONTENT = /<(?:script|foreignObject|iframe|object|embed)\b|\bon[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["'](?:https?:|data:|\/\/)/i;
const MIME_BY_EXTENSION = Object.freeze({
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
});

function fail(message) {
  throw new Error(message);
}

function assertRasterDimensions(bytes, extension, familyCode) {
  if (extension === "png") {
    const signature = bytes.subarray(0, 8).toString("hex");
    if (signature !== "89504e470d0a1a0a") fail(`Invalid PNG: ${familyCode}`);
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width < 1 || height < 1 || width > 2048 || height > 2048) {
      fail(`Unsafe PNG dimensions: ${familyCode}`);
    }
    return;
  }

  if (bytes.subarray(0, 4).toString("ascii") !== "RIFF" ||
      bytes.subarray(8, 12).toString("ascii") !== "WEBP") {
    fail(`Invalid WebP: ${familyCode}`);
  }
  const chunk = bytes.subarray(12, 16).toString("ascii");
  let width;
  let height;
  if (chunk === "VP8X") {
    width = 1 + bytes.readUIntLE(24, 3);
    height = 1 + bytes.readUIntLE(27, 3);
  } else if (chunk === "VP8 ") {
    width = bytes.readUInt16LE(26) & 0x3fff;
    height = bytes.readUInt16LE(28) & 0x3fff;
  } else if (chunk === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    width = (bits & 0x3fff) + 1;
    height = ((bits >> 14) & 0x3fff) + 1;
  } else {
    fail(`Unsupported WebP chunk: ${familyCode}`);
  }
  if (width < 1 || height < 1 || width > 2048 || height > 2048) {
    fail(`Unsafe WebP dimensions: ${familyCode}`);
  }
}

const sources = JSON.parse(readFileSync(SOURCE_FILE, "utf8"));
if (!Array.isArray(sources)) fail("Logo source inventory must be an array");
if (sources.length !== EXPECTED_FAMILIES.length) fail("Logo source count mismatch");

const seen = new Set();
for (const source of sources) {
  if (JSON.stringify(Object.keys(source).sort()) !== JSON.stringify([...SOURCE_KEYS].sort())) {
    fail(`Unexpected source shape: ${source.familyCode ?? "unknown"}`);
  }
  if (!EXPECTED_FAMILIES.includes(source.familyCode) || seen.has(source.familyCode)) {
    fail(`Unexpected or duplicate family: ${source.familyCode}`);
  }
  seen.add(source.familyCode);
  if (!/^[a-z0-9_]+\.(?:svg|png|webp)$/.test(source.file) ||
      !source.file.startsWith(`${source.familyCode}.`)) {
    fail(`Unsafe logo file: ${source.familyCode}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source.retrievedAt) || !source.usageNote) {
    fail(`Incomplete provenance: ${source.familyCode}`);
  }
  const url = new URL(source.sourceUrl);
  if (url.protocol !== "https:" || url.hostname !== source.officialHost ||
      url.username || url.password || url.search) {
    fail(`Unsafe source URL: ${source.familyCode}`);
  }
}

const manifest = sources.map((source) => {
  const extension = path.extname(source.file).slice(1);
  const mimeType = MIME_BY_EXTENSION[extension];
  if (!mimeType) fail(`Unsupported logo type: ${source.familyCode}`);
  const bytes = readFileSync(path.join(PROVIDER_ROOT, source.file));
  if (bytes.length < 1) fail(`Empty logo: ${source.familyCode}`);

  if (extension === "svg") {
    if (bytes.length > 256 * 1024) fail(`Oversized SVG: ${source.familyCode}`);
    const svg = bytes.toString("utf8");
    if (!/<svg\b[^>]*\bviewBox\s*=\s*["'][^"']+["']/i.test(svg) ||
        SVG_ACTIVE_CONTENT.test(svg)) {
      fail(`Unsafe SVG: ${source.familyCode}`);
    }
  } else {
    if (bytes.length > 512 * 1024) fail(`Oversized raster: ${source.familyCode}`);
    assertRasterDimensions(bytes, extension, source.familyCode);
  }

  return {
    familyCode: source.familyCode,
    file: `/payment-providers/${source.file}`,
    mimeType,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}).sort((left, right) => left.familyCode.localeCompare(right.familyCode));

writeFileSync(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
