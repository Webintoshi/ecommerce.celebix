import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

export function getButikWayaTicimaxDefaults() {
  return {
    repoRoot,
    profilePath: path.join(repoRoot, "stores", "butik-waya", "ticimax-catalog-profile.json"),
    auditPath: path.join(repoRoot, "stores", "butik-waya", "ticimax-category-audit.json"),
  };
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function decodeHtmlEntities(value) {
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
    szlig: "ß",
    agrave: "à",
    egrave: "è",
    eacute: "é",
  };

  let decoded = value;
  for (let iteration = 0; iteration < 6; iteration += 1) {
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

export function normalizeText(value) {
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeKey(value) {
  return normalizeText(value)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0131/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function extractTag(block, tagName) {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(regex);
  return match?.[1] ? normalizeText(match[1]) : "";
}

export function buildMappingIndex(profile) {
  const index = new Map();
  for (const mapping of profile.productTypeMappings ?? []) {
    index.set(normalizeKey(mapping.source), mapping);
  }
  return index;
}

export function toCategoryPath(primaryPath) {
  return (primaryPath || [])
    .map((name) => normalizeText(name))
    .filter(Boolean)
    .map((name) => ({
      name,
      slug: normalizeKey(name),
    }))
    .filter((segment) => segment.slug);
}

export function toProductCategoryAssignment(primaryPath) {
  const categoryPath = toCategoryPath(primaryPath);
  const category = categoryPath[0]?.slug || null;
  const subcategory =
    categoryPath.length > 1 ? categoryPath[categoryPath.length - 1]?.slug || null : null;

  return {
    category,
    subcategory: subcategory && subcategory !== category ? subcategory : null,
    categoryPath,
  };
}

export function extractFeedSlug(link, title, fallback) {
  const rawLink = normalizeText(link);

  if (rawLink) {
    try {
      const url = new URL(rawLink);
      const lastPathSegment = url.pathname.split("/").filter(Boolean).pop();
      const normalizedSegment = normalizeText(lastPathSegment || "");
      if (normalizedSegment) {
        return normalizedSegment;
      }
    } catch {
      const normalizedSegment = normalizeText(rawLink.split("/").filter(Boolean).pop() || "");
      if (normalizedSegment) {
        return normalizedSegment;
      }
    }
  }

  return normalizeKey(title || fallback || "urun");
}

export function parseButikWayaFeed(xml, profile) {
  const mappingIndex = buildMappingIndex(profile);
  const itemBlocks = [...xml.matchAll(/<(item|entry)>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]);
  const mappedItems = [];
  const unmappedItems = [];
  const uniqueProductTypes = new Map();

  for (const block of itemBlocks) {
    const productType = extractTag(block, "g:product_type") || extractTag(block, "product_type");
    const title = extractTag(block, "g:title") || extractTag(block, "title");
    const link = extractTag(block, "g:link") || extractTag(block, "link");
    const itemGroupId = extractTag(block, "g:item_group_id") || extractTag(block, "item_group_id");
    const slug = extractFeedSlug(link, title, itemGroupId);
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
        slug,
      });
      continue;
    }

    const assignment = toProductCategoryAssignment(mapping.primaryPath);
    mappedItems.push({
      productType,
      title,
      link,
      slug,
      itemGroupId,
      primaryPath: mapping.primaryPath,
      ...assignment,
    });
  }

  return {
    totalItems: itemBlocks.length,
    mappedItems,
    unmappedItems,
    uniqueProductTypes,
  };
}

export async function fetchAndMapButikWayaFeed(profile) {
  const response = await fetch(profile.feedUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!response.ok) {
    throw new Error(`Feed indirilemedi: HTTP ${response.status}`);
  }

  const xml = await response.text();
  return parseButikWayaFeed(xml, profile);
}

export function aggregateMappedItems(mappedItems) {
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

export function buildAuditReport(profile, parsedFeed) {
  return {
    storeSlug: profile.storeSlug,
    provider: profile.provider,
    feedUrl: profile.feedUrl,
    generatedAt: new Date().toISOString(),
    totalItems: parsedFeed.totalItems,
    mappedItemCount: parsedFeed.mappedItems.length,
    unmappedItemCount: parsedFeed.unmappedItems.length,
    uniqueProductTypeCount: parsedFeed.uniqueProductTypes.size,
    mappedBuckets: aggregateMappedItems(parsedFeed.mappedItems),
    unmappedItems: parsedFeed.unmappedItems,
    unmappedProductTypes: Array.from(
      new Set(parsedFeed.unmappedItems.map((item) => item.productType).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right, "tr-TR")),
  };
}
