#!/usr/bin/env node

const DEFAULT_SOURCE = "https://derycraft.com";
const DEFAULT_TARGET = "https://derycraft.com.tr";
const DEFAULT_SLUGS = [
  "citcitli-deri-kartlik",
  "deri-pasaport-cuzdani",
  "deri-pasaport-kilifi",
  "bund-cift-katli-apple-watch-deri-kayis-aci",
  "bund-cift-katli-deri-kayis-kahve",
  "deri-el-cantasi-grace",
  "deri-telefon-cantasi-nova",
  "klasik-deri-cuzdan",
  "dikey-deri-kartlik-paragon-midi",
  "minimalist-deri-kartlik",
];

function parseArgs(argv) {
  const args = {
    source: DEFAULT_SOURCE,
    target: DEFAULT_TARGET,
    slugs: [...DEFAULT_SLUGS],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--source" && argv[index + 1]) {
      args.source = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--target" && argv[index + 1]) {
      args.target = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--slugs" && argv[index + 1]) {
      args.slugs = argv[index + 1]
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      index += 1;
    }
  }

  return args;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "celebix-light-postgres-parity-check/1.0",
    },
  });

  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && typeof payload.error === "string"
        ? payload.error
        : `${response.status} ${response.statusText}`;
    throw new Error(`${url} -> ${message}`);
  }

  return payload;
}

function summarizeSchema(schema) {
  if (!schema || typeof schema !== "object") {
    return null;
  }

  const steps = Array.isArray(schema.steps) ? schema.steps : [];
  const optionCount = steps.reduce((total, step) => {
    const options = Array.isArray(step?.options) ? step.options : [];
    return total + options.length;
  }, 0);

  return {
    id: typeof schema.id === "string" ? schema.id : null,
    name: typeof schema.name === "string" ? schema.name : null,
    stepCount: steps.length,
    optionCount,
  };
}

async function loadProductWithSchema(baseUrl, slug) {
  const productPayload = await fetchJson(
    `${baseUrl}/api/products?slug=${encodeURIComponent(slug)}`,
  );
  const product = productPayload?.product;

  if (!product || typeof product !== "object" || typeof product.id !== "string") {
    throw new Error(`${baseUrl} urun bulunamadi: ${slug}`);
  }

  const schemaPayload = await fetchJson(
    `${baseUrl}/api/customization/schema?productId=${encodeURIComponent(product.id)}`,
  );

  return {
    slug,
    productName: typeof product.name === "string" ? product.name : slug,
    schema: summarizeSchema(schemaPayload?.schema),
  };
}

function summarizeShippingOptions(payload) {
  const options = Array.isArray(payload?.shippingOptions) ? payload.shippingOptions : [];
  return options.map((option) => ({
    label: typeof option?.label === "string" ? option.label : null,
    regions: Array.isArray(option?.regions) ? option.regions.length : 0,
  }));
}

function summarizeStoreInfo(payload) {
  const storeInfo = payload?.storeInfo;
  if (!storeInfo || typeof storeInfo !== "object") {
    return null;
  }

  return {
    name: typeof storeInfo.name === "string" ? storeInfo.name : null,
    logoUrl: typeof storeInfo.logoUrl === "string" ? storeInfo.logoUrl : null,
    phone: typeof storeInfo.phone === "string" ? storeInfo.phone : null,
  };
}

function compareValues(label, source, target) {
  const sourceJson = JSON.stringify(source);
  const targetJson = JSON.stringify(target);

  return {
    label,
    matches: sourceJson === targetJson,
    source,
    target,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const [sourceStoreInfo, targetStoreInfo, sourceShipping, targetShipping] = await Promise.all([
    fetchJson(`${args.source}/api/settings?type=store`),
    fetchJson(`${args.target}/api/settings?type=store`),
    fetchJson(`${args.source}/api/settings?type=shipping`),
    fetchJson(`${args.target}/api/settings?type=shipping`),
  ]);

  const productChecks = [];
  for (const slug of args.slugs) {
    const [sourceProduct, targetProduct] = await Promise.all([
      loadProductWithSchema(args.source, slug),
      loadProductWithSchema(args.target, slug),
    ]);

    productChecks.push({
      slug,
      nameMatches: sourceProduct.productName === targetProduct.productName,
      source: sourceProduct.schema,
      target: targetProduct.schema,
      schemaMatches:
        JSON.stringify(sourceProduct.schema) === JSON.stringify(targetProduct.schema),
    });
  }

  const summary = {
    comparedAt: new Date().toISOString(),
    source: args.source,
    target: args.target,
    settings: [
      compareValues(
        "store_info",
        summarizeStoreInfo(sourceStoreInfo),
        summarizeStoreInfo(targetStoreInfo),
      ),
      compareValues(
        "shipping_options",
        summarizeShippingOptions(sourceShipping),
        summarizeShippingOptions(targetShipping),
      ),
    ],
    products: productChecks,
  };

  const mismatches = [
    ...summary.settings.filter((item) => !item.matches).map((item) => item.label),
    ...summary.products
      .filter((item) => !item.nameMatches || !item.schemaMatches)
      .map((item) => item.slug),
  ];

  console.log(JSON.stringify(summary, null, 2));

  if (mismatches.length > 0) {
    process.exitCode = 1;
  }
}

await main();
