import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_FILE = path.join(
  ROOT,
  "apps/customer-panel/lib/payment-providers/logo-sources.json",
);
const OUTPUT_ROOT = path.join(ROOT, "apps/customer-panel/public/payment-providers");

const LABELS = Object.freeze({
  akbank: "Akbank",
  akode: "AKÖde",
  albaraka_turk: "Albaraka Türk",
  craftgate: "Craftgate",
  denizbank: "DenizBank",
  erpapay: "ErpaPay",
  esnekpos: "EsnekPOS",
  qnb_finansbank: "QNB",
  garanti_bbva: "Garanti BBVA",
  halkbank: "Halkbank",
  hepsipay: "Hepsipay",
  is_bankasi: "İş Bankası",
  isyerimpos: "İşyerimPOS",
  iyzico: "iyzico",
  kuveyt_turk: "Kuveyt Türk",
  lidio: "Lidio",
  moka: "Moka United",
  mollie: "Mollie",
  ozan: "Ozan",
  paidora: "Paidora",
  papara: "Papara",
  papel: "Papel",
  param: "Param",
  paratika: "Paratika",
  paybull: "PayBull",
  paycell: "Paycell",
  paynkolay: "Pay N Kolay",
  paytr: "PayTR",
  qnbpay: "QNBpay",
  rubikpara: "Rubikpara",
  sekerbank: "Şekerbank",
  setcard: "Setcard",
  shopier: "Shopier",
  sipay: "Sipay",
  tami: "Tami",
  teb: "TEB",
  united_payment: "United Payment",
  vakif_katilim: "Vakıf Katılım",
  vakifbank: "VakıfBank",
  vallet: "Vallet",
  vepara: "Vepara",
  weepay: "weepay",
  worldpay: "Worldpay",
  wyld: "Wyld",
  yapi_kredi: "Yapı Kredi",
  ziraat_bankasi: "Ziraat Bankası",
  ziraat_katilim: "Ziraat Katılım",
  ziraatpay: "ZiraatPay",
});

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function initials(label) {
  return label
    .split(/\s+/u)
    .map((part) => [...part][0])
    .join("")
    .slice(0, 2)
    .toLocaleUpperCase("tr-TR");
}

function fallbackSvg(label) {
  const safeLabel = escapeXml(label);
  const safeInitials = escapeXml(initials(label));
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 80" role="img" aria-labelledby="title">',
    `  <title id="title">${safeLabel}</title>`,
    '  <rect x="1" y="1" width="278" height="78" rx="14" fill="#ffffff" stroke="#e5e7eb" stroke-width="2"/>',
    '  <rect x="14" y="14" width="52" height="52" rx="12" fill="#111827"/>',
    `  <text x="40" y="47" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="18" font-weight="700">${safeInitials}</text>`,
    `  <text x="78" y="48" fill="#111827" font-family="Arial, sans-serif" font-size="20" font-weight="700">${safeLabel}</text>`,
    "</svg>",
    "",
  ].join("\n");
}

const sources = JSON.parse(readFileSync(SOURCE_FILE, "utf8"));
mkdirSync(OUTPUT_ROOT, { recursive: true });

for (const source of sources) {
  if (!source.usageNote.includes("official_asset_unavailable_fallback")) {
    continue;
  }
  const label = LABELS[source.familyCode];
  if (!label) throw new Error(`Missing fallback label: ${source.familyCode}`);
  if (source.file !== `${source.familyCode}.svg`) {
    throw new Error(`Unsafe fallback file: ${source.file}`);
  }
  writeFileSync(path.join(OUTPUT_ROOT, source.file), fallbackSvg(label), "utf8");
}
