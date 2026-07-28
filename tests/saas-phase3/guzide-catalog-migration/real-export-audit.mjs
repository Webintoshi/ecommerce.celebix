import assert from "node:assert/strict";
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compileWooCommerceMigration } from "../../../apps/customer-panel/lib/catalog-import/woocommerce-migration.ts";

const ROOT = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.."));
const selected = process.env.GUZIDE_WOOCOMMERCE_EXPORT;
if (!selected || !path.isAbsolute(selected)) throw new Error("GUZIDE_EXPORT_INPUT_REQUIRED");
const sourcePath = realpathSync(selected);
if (sourcePath === ROOT || sourcePath.startsWith(`${ROOT}${path.sep}`)) throw new Error("GUZIDE_EXPORT_MUST_REMAIN_OUTSIDE_GIT");
const size = statSync(sourcePath).size;
if (size < 1 || size > 4 * 1024 * 1024) throw new Error("GUZIDE_EXPORT_SIZE_INVALID");
const source = readFileSync(sourcePath, "utf8");

function headerWidth(value) {
  let fields = 1, quoted = false;
  const selectedHeader = value.startsWith("\uFEFF") ? value.slice(1) : value;
  for (let index = 0; index < selectedHeader.length; index += 1) {
    const character = selectedHeader[index];
    if (character === '"') {
      if (quoted && selectedHeader[index + 1] === '"') { index += 1; continue; }
      quoted = !quoted; continue;
    }
    if (!quoted && character === ",") fields += 1;
    if (!quoted && (character === "\n" || character === "\r")) return fields;
  }
  if (quoted) throw new Error("GUZIDE_EXPORT_HEADER_INVALID");
  return fields;
}

const manifest = await compileWooCommerceMigration(source);
const rawImageReferences = manifest.mediaCount + manifest.warningCounts.duplicateImagesRemoved;
assert.equal(headerWidth(source), 41);
assert.equal(manifest.products.length, 1_628);
assert.equal(rawImageReferences, 5_646);
assert.equal(manifest.mediaCount, 5_423);
assert.equal(manifest.categories.length, 50);
assert.equal(manifest.brands.length, 6);
assert.equal(manifest.batches.length, 66);
assert.equal(manifest.batches.slice(0, -1).every((batch) => batch.length === 25), true);
assert.equal(manifest.batches.at(-1)?.length, 3);
assert.equal(manifest.products.filter((product) => product.status === "active").length, 1_195);
assert.equal(manifest.products.filter((product) => product.status === "draft").length, 433);
assert.equal(manifest.products.filter((product) => product.variants[0]?.attributes["Ağırlık (g)"] !== undefined).length, 1_589);
assert.equal(manifest.products.reduce((count, product) => count + product.sourceImages.length, 0), manifest.mediaCount);
assert.equal(manifest.products.every((product) => product.sourceImages.every((url) => url.startsWith("https://"))), true);
assert.equal(
  manifest.products.every((product) => product.sourceImages.every((url) => new URL(url).hostname === "guzidekuyumcu.com.tr")),
  true,
);

const evidence = Object.freeze({
  source: "external-private-export",
  sourceBytes: size,
  sourceDigest: manifest.sourceDigest,
  columns: 41,
  products: manifest.products.length,
  active: 1_195,
  draft: 433,
  preciseGramWeights: 1_589,
  categories: manifest.categories.length,
  brands: manifest.brands.length,
  batches: manifest.batches.length,
  rawImageReferences,
  acceptedMedia: manifest.mediaCount,
  sourceImageHosts: 1,
  warningCounts: manifest.warningCounts,
  customerRecords: 0,
  orderRecords: 0,
  sourceMutations: 0,
});
const output = JSON.stringify(evidence);
if (/https?:\/\/|wp-content|email|phone|cookie|token|secret/i.test(output)) throw new Error("GUZIDE_EXPORT_AUDIT_OUTPUT_UNSAFE");
console.log(output);
