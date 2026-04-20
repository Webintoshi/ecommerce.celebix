import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const profilePath = path.join(repoRoot, "stores", "butik-waya", "ticimax-catalog-profile.json");
const defaultOutputPath = path.join(
  repoRoot,
  "stores",
  "butik-waya",
  "ticimax-category-audit.json",
);

function parseArgs(argv) {
  const args = {
    profile: profilePath,
    output: defaultOutputPath,
    write: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--profile" && argv[index + 1]) {
      args.profile = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === "--output" && argv[index + 1]) {
      args.output = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === "--no-write") {
      args.write = false;
      continue;
    }
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function decodeHtmlEntities(value) {
  if (!value) {
    return "";
  }

  const entityMap = {
    amp: "&",
    apos: "'",
    quot: "\"",
    lt: "<",
    gt: ">",
    nbsp: " ",
    uuml: "ü",
    Uuml: "Ü",
    ouml: "ö",
    Ouml: "Ö",
    auml: "ä",
    Auml: "Ä",
    ccedil: "ç",
    Ccedil: "Ç",
    rsquo: "'",
    lsquo: "'",
    rdquo: "\"",
    ldquo: "\"",
  };

  let decoded = value;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const next = decoded.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/gi, (entity, token) => {
      if (token[0] === "#") {
        const isHex = token[1]?.toLowerCase() === "x";
        const numericValue = Number.parseInt(token.slice(isHex ? 2 : 1), isHex ? 16 : 10);
        return Number.isFinite(numericValue) ? String.fromCodePoint(numericValue) : entity;
      }

      return entityMap[token] ?? entity;
    });

    if (next === decoded) {
      break;
    }
    decoded = next;
  }

  return decoded;
}

function normalizeText(value) {
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractTag(block, tagName) {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(regex);
  return match?.[1] ? normalizeText(match[1]) : "";
}

function buildMappingIndex(profile) {
  const index = new Map();
  for (const mapping of profile.productTypeMappings ?? []) {
    index.set(normalizeKey(mapping.source), mapping);
  }
  return index;
}

function aggregateMappedItems(mappedItems) {
  const buckets = new Map();

  for (const item of mappedItems) {
    const key = item.primaryPath.join(" > ");
    if (!buckets.has(key)) {
      buckets.set(key, {
        primaryPath: item.primaryPath,
        count: 0,
        sampleTitles: [],
        sourceProductTypes: new Set(),
      });
    }

    const bucket = buckets.get(key);
    bucket.count += 1;
    bucket.sourceProductTypes.add(item.productType);
    if (bucket.sampleTitles.length < 5 && !bucket.sampleTitles.includes(item.title)) {
      bucket.sampleTitles.push(item.title);
    }
  }

  return Array.from(buckets.values())
    .map((bucket) => ({
      primaryPath: bucket.primaryPath,
      count: bucket.count,
      sourceProductTypes: Array.from(bucket.sourceProductTypes).sort((left, right) =>
        left.localeCompare(right, "tr-TR"),
      ),
      sampleTitles: bucket.sampleTitles,
    }))
    .sort((left, right) => right.count - left.count);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profile = readJson(args.profile);
  const mappingIndex = buildMappingIndex(profile);

  const response = await fetch(profile.feedUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!response.ok) {
    throw new Error(`Feed indirilemedi: HTTP ${response.status}`);
  }

  const xml = await response.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);

  const mappedItems = [];
  const unmappedItems = [];
  const uniqueProductTypes = new Map();

  for (const block of items) {
    const productType = extractTag(block, "g:product_type");
    const title = extractTag(block, "g:title");
    const link = extractTag(block, "g:link");
    const key = normalizeKey(productType);

    if (productType && !uniqueProductTypes.has(key)) {
      uniqueProductTypes.set(key, productType);
    }

    const mapping = mappingIndex.get(key);
    if (!mapping) {
      unmappedItems.push({
        productType,
        title,
        link,
      });
      continue;
    }

    mappedItems.push({
      productType,
      title,
      link,
      primaryPath: mapping.primaryPath,
    });
  }

  const report = {
    storeSlug: profile.storeSlug,
    provider: profile.provider,
    feedUrl: profile.feedUrl,
    generatedAt: new Date().toISOString(),
    totalItems: items.length,
    mappedItemCount: mappedItems.length,
    unmappedItemCount: unmappedItems.length,
    uniqueProductTypeCount: uniqueProductTypes.size,
    mappedBuckets: aggregateMappedItems(mappedItems),
    unmappedItems,
    unmappedProductTypes: Array.from(
      new Set(unmappedItems.map((item) => item.productType).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right, "tr-TR")),
  };

  if (args.write) {
    fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
