import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const INVENTORY_BASE = "6cbbe8859c9ae01374ccd1488e24733e2256552c";
const CUMULATIVE_HEAD = "1bc7a31f146a457222603d1999a179d90c6f5ebd";
const DONOR = "fc6c5318b47f045a7cefcedc7612d5b10563ba32";
const NEXT_SECURITY_HEAD = "943ee5924ce2d486e3f0eb28947206bdcc51b8d7";
const ROOT = new URL("../../../", import.meta.url);
const ROOT_PATH = fileURLToPath(ROOT);
const read = (path) => readFile(new URL(path, ROOT), "utf8");
const git = (...args) => execFileSync("git", args, {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
}).trim();

const PAGE_GROUPS = Object.freeze({
  tags: Object.freeze([
    "apps/customer-panel/app/products/tags/page.tsx",
    "apps/customer-panel/app/products/tags/new/page.tsx",
    "apps/customer-panel/app/products/tags/[resourceId]/edit/page.tsx",
  ]),
  barcodeLabels: Object.freeze([
    "apps/customer-panel/app/products/barcode-labels/page.tsx",
  ]),
  purchasing: Object.freeze([
    "apps/customer-panel/app/products/purchasing/page.tsx",
    "apps/customer-panel/app/products/purchasing/new/page.tsx",
    "apps/customer-panel/app/products/purchasing/[purchaseOrderId]/page.tsx",
  ]),
  inventoryCounts: Object.freeze([
    "apps/customer-panel/app/products/inventory-counts/page.tsx",
    "apps/customer-panel/app/products/inventory-counts/new/page.tsx",
    "apps/customer-panel/app/products/inventory-counts/[countId]/page.tsx",
  ]),
  transfers: Object.freeze([
    "apps/customer-panel/app/products/transfers/page.tsx",
    "apps/customer-panel/app/products/transfers/new/page.tsx",
    "apps/customer-panel/app/products/transfers/[transferId]/page.tsx",
  ]),
  priceLists: Object.freeze([
    "apps/customer-panel/app/products/price-lists/page.tsx",
    "apps/customer-panel/app/products/price-lists/new/page.tsx",
    "apps/customer-panel/app/products/price-lists/[priceListId]/page.tsx",
  ]),
});

const MIGRATION_BUNDLES = Object.freeze([
  ["202607220042", "catalog_product_tags"],
  ["202607220043", "inventory_purchasing"],
  ["202607220044", "inventory_counts_transfers"],
  ["202607220045", "price_lists"],
  ["202607230046", "inventory_locations"],
  ["202607230047", "pricing_preview"],
]);

function pinnedTaskArtifacts(source) {
  const serialized = source.match(
    /export const INVENTORY_PRICING_EXPECTED_ARTIFACTS = Object[.]freeze\((\[[\s\S]*?\])\);/,
  )?.[1];
  assert.ok(serialized, "inventory/pricing cumulative artifact allowlist is stale or missing");
  const parsed = JSON.parse(serialized);
  assert.ok(Array.isArray(parsed));
  assert.equal(new Set(parsed).size, parsed.length);
  return Object.freeze([...parsed].sort());
}

const STATIC_SECURITY_PATH = "tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs";

const REQUIRED_GRAPH_ROOTS = Object.freeze([
  "packages/saas-contracts/src/index.ts",
  "packages/saas-data/src/index.ts",
  "apps/customer-panel/app/api/inventory/[...path]/route.ts",
  "apps/customer-panel/app/api/pricing/[...path]/route.ts",
  "apps/customer-panel/lib/server-access.ts",
  "apps/customer-panel/lib/server-panel-access/decision-policy.ts",
  "apps/customer-panel/lib/server-panel-access/decision.ts",
  "apps/customer-panel/lib/server-panel-access/postgres-runtime.ts",
  "apps/customer-panel/lib/server-inventory/runtime.ts",
  "apps/customer-panel/lib/server-pricing/runtime.ts",
  "apps/customer-panel/lib/inventory-http/request-authority.ts",
  "apps/customer-panel/lib/inventory-http/request-input.ts",
  "apps/customer-panel/lib/inventory-http/handler.ts",
  "apps/customer-panel/lib/pricing-http/handler.ts",
  "apps/customer-panel/lib/inventory-ui/client.ts",
  "apps/customer-panel/lib/pricing-ui/client.ts",
  "apps/customer-panel/lib/catalog-admin-ui/barcode-label-projection.ts",
  "apps/customer-panel/lib/catalog-page-access.ts",
  "apps/customer-panel/lib/panel-ui/navigation.ts",
  "apps/customer-panel/components/catalog-admin/BarcodeLabelConsole.tsx",
  "apps/customer-panel/components/catalog-admin/CatalogResourceConsole.tsx",
  "apps/customer-panel/components/catalog-admin/CatalogResourceEditor.tsx",
  "apps/customer-panel/components/inventory/PurchasingConsole.tsx",
  "apps/customer-panel/components/inventory/InventoryCountConsole.tsx",
  "apps/customer-panel/components/inventory/InventoryTransferConsole.tsx",
  "apps/customer-panel/components/pricing/PriceListConsole.tsx",
  ...Object.values(PAGE_GROUPS).flat(),
]);

const SOURCE_EXTENSIONS = Object.freeze([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function repositoryPath(absolutePath) {
  const selected = relative(ROOT_PATH, absolutePath).split(sep).join("/");
  if (selected === ".." || selected.startsWith("../")) throw new Error("repository_import_escape");
  return selected;
}

function existingModule(candidate) {
  const extension = extname(candidate);
  const candidates = [
    candidate,
    ...(extension ? [] : SOURCE_EXTENSIONS.map((suffix) => `${candidate}${suffix}`)),
    ...(extension === ".js" ? [candidate.slice(0, -3) + ".ts", candidate.slice(0, -3) + ".tsx"] : []),
    ...SOURCE_EXTENSIONS.map((suffix) => resolve(candidate, `index${suffix}`)),
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

function workspacePackageRoots() {
  const rootManifest = JSON.parse(readFileSync(resolve(ROOT_PATH, "package.json"), "utf8"));
  assert.deepEqual(rootManifest.workspaces, ["apps/*", "packages/*"]);
  const manifestPaths = git("ls-files", "apps/*/package.json", "packages/*/package.json")
    .split("\n").filter(Boolean).sort();
  const packages = new Map();
  for (const manifestPath of manifestPaths) {
    const manifest = JSON.parse(readFileSync(resolve(ROOT_PATH, manifestPath), "utf8"));
    assert.equal(typeof manifest.name, "string", `workspace package has no name: ${manifestPath}`);
    assert.equal(packages.has(manifest.name), false, `duplicate workspace package: ${manifest.name}`);
    packages.set(manifest.name, Object.freeze({
      root: dirname(manifestPath).split(sep).join("/"),
      manifest: Object.freeze(manifest),
    }));
  }
  return packages;
}

const WORKSPACE_PACKAGES = workspacePackageRoots();

function workspaceSpecifierParts(specifier) {
  if (!specifier.startsWith("@")) return null;
  const parts = specifier.split("/");
  if (parts.length < 2) return null;
  return Object.freeze({ packageName: parts.slice(0, 2).join("/"), subpath: parts.slice(2).join("/") });
}

function workspacePackageCandidate(packageEntry, subpath) {
  const exportKey = subpath === "" ? "." : `./${subpath}`;
  const exported = packageEntry.manifest.exports?.[exportKey];
  const selected = typeof exported === "string"
    ? exported
    : subpath === ""
      ? packageEntry.manifest.module ?? packageEntry.manifest.main ?? packageEntry.manifest.types ?? "./src/index.ts"
      : `./src/${subpath}`;
  return resolve(ROOT_PATH, packageEntry.root, selected);
}

function resolveRepositorySpecifier(importerPath, specifier) {
  let candidate;
  if (specifier.startsWith(".")) {
    candidate = resolve(dirname(resolve(ROOT_PATH, importerPath)), specifier);
  } else if (specifier.startsWith("@/")) {
    candidate = resolve(ROOT_PATH, "apps/customer-panel", specifier.slice(2));
  } else if (specifier.startsWith("apps/") || specifier.startsWith("packages/")) {
    candidate = resolve(ROOT_PATH, specifier);
  } else {
    const workspace = workspaceSpecifierParts(specifier);
    const packageEntry = workspace === null ? null : WORKSPACE_PACKAGES.get(workspace.packageName);
    if (packageEntry?.root === "apps/admin" || specifier === "apps/admin" || specifier.startsWith("apps/admin/") || specifier.startsWith("@/../admin/")) {
      throw new Error("apps_admin_import_forbidden");
    }
    if (packageEntry !== null && packageEntry !== undefined) {
      candidate = workspacePackageCandidate(packageEntry, workspace.subpath);
    } else {
      return null;
    }
  }
  const selected = existingModule(candidate);
  if (selected === null) throw new Error(`repository_import_unresolved:${importerPath}:${specifier}`);
  const localPath = repositoryPath(selected);
  if (localPath === "apps/admin" || localPath.startsWith("apps/admin/")) throw new Error("apps_admin_import_forbidden");
  return localPath;
}

function moduleSpecifiers(ts, sourceFile) {
  const specifiers = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    } else if (
      ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require" &&
      node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return specifiers;
}

function isProductionInventorySource(path) {
  return SOURCE_EXTENSIONS.includes(extname(path)) &&
    (path.startsWith("apps/customer-panel/") || path.startsWith("packages/")) &&
    !/(^|\/)(?:[^/]+[.])?(?:test|spec)[.](?:ts|tsx|js|jsx|mjs|cjs)$/.test(path);
}

function isEvidenceArtifact(path) {
  return path.startsWith("tests/") ||
    /(^|\/)(?:[^/]+[.])?(?:test|spec)[.](?:ts|tsx|js|jsx|mjs|cjs)$/.test(path) ||
    path.endsWith("_assertions.sql");
}

function assertProductionSourceSecurity(ts, path, source) {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") || path.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const forbidden = [];
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (node.text.includes("/api/admin")) forbidden.push("legacy_admin_api");
      if (/^https?:\/\//i.test(node.text)) forbidden.push("external_endpoint");
    }
    if (ts.isIdentifier(node)) {
      if (/^(?:DATABASE_URL|PGPASSWORD|SERVICE_ROLE|CLIENT_SECRET|PRIVATE_KEY)$/.test(node.text)) forbidden.push("secret_identifier");
      if (/^(?:fake|fixture|mock)(?:Total|Price|Stock|Revenue|Quantity)$/i.test(node.text)) forbidden.push("fabricated_commerce_total");
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (forbidden.length > 0) throw new Error(`production_source_forbidden:${path}:${[...new Set(forbidden)].join(",")}`);
}

function assertProductionArtifactSecurity(ts, path, source) {
  if (isProductionInventorySource(path)) {
    assertProductionSourceSecurity(ts, path, source);
    return;
  }
  const searchable = path.endsWith(".sql") ? stripSqlComments(source) : source;
  if (/\/api\/admin\b|https?:\/\//i.test(searchable) ||
      /\b(?:DATABASE_URL|PGPASSWORD|SERVICE_ROLE|CLIENT_SECRET|PRIVATE_KEY)\b/.test(searchable) ||
      /\b(?:fake|fixture|mock)(?:Total|Price|Stock|Revenue|Quantity)\b/i.test(searchable)) {
    throw new Error(`production_source_forbidden:${path}`);
  }
}

function assertRepositoryImportGraph(ts, rootPaths) {
  const pending = [...rootPaths];
  const visited = new Set();
  while (pending.length > 0) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    visited.add(path);
    if (path === "apps/admin" || path.startsWith("apps/admin/")) throw new Error("apps_admin_import_forbidden");
    if (!SOURCE_EXTENSIONS.includes(extname(path))) continue;
    const source = readFileSync(resolve(ROOT_PATH, path), "utf8");
    const sourceFile = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith(".tsx") || path.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    for (const specifier of moduleSpecifiers(ts, sourceFile)) {
      if (specifier === "@supabase" || specifier.startsWith("@supabase/")) throw new Error("supabase_import_forbidden");
      const resolvedPath = resolveRepositorySpecifier(path, specifier);
      if (resolvedPath !== null) pending.push(resolvedPath);
    }
  }
  return Object.freeze([...visited].sort());
}

function stripSqlComments(value) {
  return value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}

function sqlFunctionBody(sql, name) {
  const startPattern = new RegExp(`CREATE OR REPLACE FUNCTION\\s+saas[.]${name}\\s*\\(`, "g");
  const start = startPattern.exec(sql)?.index;
  assert.notEqual(start, undefined, `missing SQL function ${name}`);
  const header = sql.slice(start);
  const tag = /\bAS\s+(\$[A-Za-z_][A-Za-z0-9_]*\$)/.exec(header)?.[1];
  assert.ok(tag, `missing SQL body delimiter for ${name}`);
  const bodyStart = header.indexOf(tag) + tag.length;
  const bodyEnd = header.indexOf(tag, bodyStart);
  assert.ok(bodyEnd > bodyStart, `unterminated SQL function ${name}`);
  return stripSqlComments(header.slice(bodyStart, bodyEnd));
}

function sqlDollarBlock(sql, tag) {
  const startMarker = `DO $${tag}$`;
  const start = sql.indexOf(startMarker);
  assert.ok(start >= 0, `missing SQL block ${tag}`);
  const bodyStart = start + startMarker.length;
  const bodyEnd = sql.indexOf(`$${tag}$;`, bodyStart);
  assert.ok(bodyEnd > bodyStart, `unterminated SQL block ${tag}`);
  return stripSqlComments(sql.slice(bodyStart, bodyEnd));
}

function occurrences(value, needle) {
  return value.split(needle).length - 1;
}

function assertStorefrontReaderDataflow(body, label) {
  const compact = body.replace(/\s+/g, " ");
  const lateral = /SELECT variant[.][*],resolved[.]price_cents AS effective_price FROM saas[.]product_variants variant CROSS JOIN LATERAL saas[.]resolve_effective_variant_price\( p_store_id,variant[.]id,'storefront',p_now,NULL \) resolved WHERE [\s\S]*?resolved[.]outcome='found'/;
  if (!lateral.test(compact) ||
      !/'priceCents',selected_price[.]effective_price/.test(compact) ||
      !/'priceCents',variant[.]effective_price/.test(compact) ||
      /'priceCents',(?:selected_price|variant)[.]price_cents/.test(compact)) {
    throw new Error(`price_consumer_dataflow_invalid:${label}`);
  }
}

function quickNewFragments(patch) {
  return [...patch.matchAll(/new_fragment:=\$new\$([\s\S]*?)\$new\$;/g)].map((match) => stripSqlComments(match[1]));
}

function assertQuickCoreDataflow(fragment, customerExpression, label) {
  const compact = fragment.replace(/\s+/g, " ");
  const expectedSelect = "SELECT product.id,product.title,variant.title,variant.sku,resolved.price_cents INTO product_id,product_name,variant_name,variant_sku,variant_price";
  const expectedResolver = `CROSS JOIN LATERAL saas.resolve_effective_variant_price( p_store_id,variant.id,'quick_order',p_now,${customerExpression} ) AS resolved`;
  if (!compact.includes(expectedSelect) || !compact.includes(expectedResolver) ||
      !compact.includes("AND resolved.outcome='found'") || /SELECT [^;]*variant[.]price_cents/.test(compact)) {
    throw new Error(`price_consumer_dataflow_invalid:${label}`);
  }
}

function assertAbandonedCartDataflow(body) {
  const compact = body.replace(/\s+/g, " ");
  const subtotal = "pg_catalog.sum(resolved.price_cents*(entry.value->>'quantity')::bigint) INTO resolved_count,subtotal";
  const resolver = "CROSS JOIN LATERAL saas.resolve_effective_variant_price( selected_store,variant.id,'storefront',p_now,NULL ) resolved";
  const lineProjection = "),resolved.price_cents,(entry.value->>'quantity')::integer,0, resolved.price_cents*(entry.value->>'quantity')::integer,p_now";
  if (!compact.includes(subtotal) || occurrences(compact, resolver) !== 2 ||
      !compact.includes(lineProjection) || /(?:sum\(|\),)variant[.]price_cents/.test(compact)) {
    throw new Error("price_consumer_dataflow_invalid:abandoned_carts_capture");
  }
}

function assertSqlConsumerDataflow(migration) {
  assertStorefrontReaderDataflow(sqlFunctionBody(migration, "public_list_products"), "public_list_products");
  assertStorefrontReaderDataflow(sqlFunctionBody(migration, "public_get_product_by_slug"), "public_get_product_by_slug");
  assertAbandonedCartDataflow(sqlFunctionBody(migration, "abandoned_carts_capture"));
  const fragments = quickNewFragments(sqlDollarBlock(migration, "quick_reader_patch"));
  if (fragments.length !== 2) throw new Error("price_consumer_dataflow_invalid:quick_core_count");
  assertQuickCoreDataflow(fragments[0], "p_customer_email", "quick_links_create_025");
  assertQuickCoreDataflow(fragments[1], "source_link.customer_email", "quick_links_duplicate_025");
}

test("pins all six product-operation page families and their subpages", async () => {
  assert.equal(Object.keys(PAGE_GROUPS).length, 6);
  for (const [family, paths] of Object.entries(PAGE_GROUPS)) {
    assert.ok(paths.length > 0, `${family} has no routes`);
    for (const path of paths) await access(new URL(path, ROOT));
  }
});

test("pins six complete migration bundles and their disposable PostgreSQL proofs", async () => {
  assert.equal(MIGRATION_BUNDLES.length, 6);
  for (const [prefix, name] of MIGRATION_BUNDLES) {
    for (const suffix of [".up.sql", ".down.sql", "_assertions.sql"]) {
      await access(new URL(`apps/owner/scripts/sql/saas/${prefix}_${name}${suffix}`, ROOT));
    }
  }
  for (const path of [
    "tests/saas-phase3/catalog-product-tags/postgres-harness.mjs",
    "tests/saas-phase3/inventory-purchasing/postgres-harness.mjs",
    "tests/saas-phase3/inventory-counts-transfers/postgres-harness.mjs",
    "tests/saas-phase3/price-lists/postgres-harness.mjs",
    "tests/saas-phase3/inventory-locations/postgres-harness.mjs",
    "tests/saas-phase3/pricing-preview/postgres-harness.mjs",
  ]) await access(new URL(path, ROOT));
});

test("keeps the cumulative artifact allowlist exact and reviewable", async () => {
  const securitySource = await read("tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs");
  const pinned = pinnedTaskArtifacts(securitySource);
  const committedTaskDiff = git(
    "diff",
    "--name-only",
    `${INVENTORY_BASE}...${CUMULATIVE_HEAD}`,
  ).split("\n").filter(Boolean).sort();
  assert.equal(committedTaskDiff.length, 144);
  assert.deepEqual(pinned, committedTaskDiff, "cumulative tracked artifact inventory is not symmetric with its pinned committed diff");
  for (const path of pinned) {
    assert.equal(git("ls-files", "--error-unmatch", path), path);
  }
});

test("registers exact inventory and pricing repositories behind server panel access", async () => {
  const runtime = await read("apps/customer-panel/lib/server-panel-access/postgres-runtime.ts");
  for (const proof of [
    /new PostgresInventoryRepository\(/,
    /new PostgresPricingRepository\(/,
    /registerServerInventoryRepository\(access, inventoryRepository\)/,
    /registerServerPricingRepository\(access, pricingRepository\)/,
    /row[.]inventory_relations !== true \|\| row[.]inventory_default_location_lifecycle !== true \|\|\s*row[.]inventory_repository !== true/,
    /row[.]pricing_relations !== true \|\| row[.]pricing_repository !== true \|\| row[.]pricing_resolver !== true/,
    /saas[.]resolve_effective_variant_price\(uuid,uuid,text,timestamp with time zone,text\)/,
  ]) assert.match(runtime, proof);

  const inventoryRoute = await read("apps/customer-panel/app/api/inventory/[...path]/route.ts");
  assert.match(inventoryRoute, /prepareInventoryRouteRequest\(request\)/);
  assert.match(inventoryRoute, /export const GET = handle/);
  assert.match(inventoryRoute, /export const POST = handle/);

  const pricingRoute = await read("apps/customer-panel/app/api/pricing/[...path]/route.ts");
  assert.match(pricingRoute, /export const GET = handlePricingRequest/);
  assert.match(pricingRoute, /export const POST = handlePricingRequest/);
});

test("shares one effective price authority across every required consumer", async () => {
  const migration = await read("apps/owner/scripts/sql/saas/202607220045_price_lists.up.sql");
  assertSqlConsumerDataflow(migration);

  const createWrapper = sqlFunctionBody(migration, "quick_links_create");
  const duplicateWrapper = sqlFunctionBody(migration, "quick_links_duplicate");
  assert.equal(occurrences(createWrapper, "saas.quick_links_create_025("), 1);
  assert.equal(occurrences(duplicateWrapper, "saas.quick_links_duplicate_025("), 1);
  assert.equal(occurrences(createWrapper, "saas.quick_links_duplicate_025("), 0);
  assert.equal(occurrences(duplicateWrapper, "saas.quick_links_create_025("), 0);

  const patch = sqlDollarBlock(migration, "quick_reader_patch");
  const duplicateBoundary = "SELECT pg_catalog.pg_get_functiondef(duplicate_target) INTO definition;";
  assert.equal(occurrences(patch, duplicateBoundary), 1);
  const [createCorePatch, duplicateCorePatch] = patch.split(duplicateBoundary);
  assert.match(createCorePatch, /create_target regprocedure:=\s*'saas[.]quick_links_create_025\([^']+\)'::regprocedure;/);
  assert.match(patch, /duplicate_target regprocedure:=\s*'saas[.]quick_links_duplicate_025\([^']+\)'::regprocedure;/);
  assert.equal(occurrences(createCorePatch, "variant.price_cents"), 1);
  assert.equal(occurrences(duplicateCorePatch, "variant.price_cents"), 1);
});

test("resolves every static local import and re-export without donor or Supabase authority", async () => {
  assert.equal(git("rev-parse", `${DONOR}^{commit}`), DONOR);
  assert.equal(git("rev-parse", `${NEXT_SECURITY_HEAD}^{commit}`), NEXT_SECURITY_HEAD);
  assert.equal(git("diff", "--name-only", `${INVENTORY_BASE}...${NEXT_SECURITY_HEAD}`, "--", "apps/admin"), "apps/admin/package.json");
  assert.equal(git("diff", "--name-only", `${NEXT_SECURITY_HEAD}...HEAD`, "--", "apps/admin"), "");
  const pinned = pinnedTaskArtifacts(await read(STATIC_SECURITY_PATH));
  for (const required of REQUIRED_GRAPH_ROOTS) assert.equal(pinned.includes(required), true, `missing graph root ${required}`);
  const imported = await import("typescript");
  const ts = imported.default ?? imported;
  const sourceRoots = pinned.filter((path) => SOURCE_EXTENSIONS.includes(extname(path)));
  const graph = assertRepositoryImportGraph(ts, sourceRoots);
  for (const required of REQUIRED_GRAPH_ROOTS) assert.equal(graph.includes(required), true, `unvisited graph root ${required}`);
  const productionSources = pinned.filter(isProductionInventorySource);
  assert.equal(productionSources.length, 75);
  const productionArtifacts = pinned.filter((path) => !isEvidenceArtifact(path));
  const evidenceArtifacts = pinned.filter(isEvidenceArtifact);
  assert.equal(productionArtifacts.length, 90);
  assert.equal(evidenceArtifacts.length, 54);
  assert.equal(productionArtifacts.length + evidenceArtifacts.length, pinned.length);
  for (const path of productionArtifacts) {
    assertProductionArtifactSecurity(ts, path, readFileSync(resolve(ROOT_PATH, path), "utf8"));
  }
  assert.throws(
    () => resolveRepositorySpecifier("apps/customer-panel/lib/server-access.ts", "../../admin/package.json"),
    /apps_admin_import_forbidden/,
  );
});

test("enforces private-authority and truthful projections through exact behavioral boundaries", async () => {
  const [{ parseInventoryLocation }, { parsePriceList }, { classifyInventoryRequest }, { createPricingHttpHandler }] = await Promise.all([
    import("../../../packages/saas-contracts/src/inventory/index.ts"),
    import("../../../packages/saas-contracts/src/pricing/index.ts"),
    import("../../../apps/customer-panel/lib/inventory-http/request-authority.ts"),
    import("../../../apps/customer-panel/lib/pricing-http/handler.ts"),
  ]);
  const locationId = "71000000-1111-4111-8111-111111111111";
  const variantId = "72000000-2222-4222-8222-222222222222";
  const priceListId = "73000000-3333-4333-8333-333333333333";
  const operationId = "74000000-4444-4444-8444-444444444444";
  const timestamp = "2026-07-22T10:00:00.000000Z";
  const location = Object.freeze({ id: locationId, name: "Merkez", isDefault: true, status: "active", version: 1, createdAt: timestamp, updatedAt: timestamp });
  const priceList = Object.freeze({
    id: priceListId,
    name: "Mağaza fiyatı",
    status: "draft",
    items: Object.freeze([Object.freeze({ variantId, fixedPriceCents: 12500 })]),
    rules: Object.freeze([Object.freeze({ channel: "storefront", priority: 0 })]),
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  assert.throws(() => parseInventoryLocation({ ...location, storeId: locationId }), TypeError);
  assert.throws(() => parsePriceList({ ...priceList, tenantId: locationId }), TypeError);

  const inventoryDecision = classifyInventoryRequest(new Request("https://panel.example/api/inventory/locations", {
    headers: { "x-store-id": locationId },
  }));
  assert.deepEqual(inventoryDecision, { kind: "invalid" });

  let runtimeResolutions = 0;
  const pricingHandler = createPricingHttpHandler({
    async resolveRuntime() { runtimeResolutions += 1; return null; },
    now: () => new Date("2026-07-22T10:00:00.000Z"),
    requestId: () => operationId,
  });
  const denied = await pricingHandler(new Request("https://panel.example/api/pricing/price-lists", {
    headers: { "x-store-id": locationId },
  }));
  assert.equal(denied.status, 400);
  assert.equal(runtimeResolutions, 0);

  const clientBoundaryScript = `
    import assert from "node:assert/strict";
    const [{ createInventoryApi }, { createPricingApi }] = await Promise.all([
      import("./apps/customer-panel/lib/inventory-ui/client.ts"),
      import("./apps/customer-panel/lib/pricing-ui/client.ts"),
    ]);
    const locationId = ${JSON.stringify(locationId)};
    const variantId = ${JSON.stringify(variantId)};
    const priceListId = ${JSON.stringify(priceListId)};
    const operationId = ${JSON.stringify(operationId)};
    const timestamp = ${JSON.stringify(timestamp)};
    const location = Object.freeze({ id: locationId, name: "Merkez", isDefault: true, status: "active", version: 1, createdAt: timestamp, updatedAt: timestamp });
    const priceList = Object.freeze({ id: priceListId, name: "Mağaza fiyatı", status: "draft", items: Object.freeze([Object.freeze({ variantId, fixedPriceCents: 12500 })]), rules: Object.freeze([Object.freeze({ channel: "storefront", priority: 0 })]), version: 1, createdAt: timestamp, updatedAt: timestamp });
    const inventoryApi = createInventoryApi(async () => Response.json({ items: [{ ...location, storeId: locationId }] }), () => operationId);
    const pricingApi = createPricingApi(async () => Response.json({ items: [{ ...priceList, storeId: locationId }] }), () => operationId);
    assert.deepEqual(Object.keys(inventoryApi).sort(), ["archiveLocation", "cancelCount", "cancelTransfer", "commitCount", "dispatchTransfer", "getCount", "getPurchaseOrder", "getTransfer", "listBalances", "listCounts", "listLocations", "listPurchaseOrders", "listTransfers", "receivePurchaseOrder", "receiveTransfer", "saveCount", "saveLocation", "savePurchaseOrder", "saveTransfer", "startCount", "transitionPurchaseOrder"]);
    assert.deepEqual(Object.keys(pricingApi).sort(), ["activate", "archive", "get", "list", "preview", "save"]);
    await assert.rejects(inventoryApi.listLocations(), (error) => error?.code === "unavailable" && error?.status === 503);
    await assert.rejects(pricingApi.list(), (error) => error?.code === "unavailable" && error?.status === 503);
  `;
  execFileSync(process.execPath, ["--experimental-transform-types", "--input-type=module", "--eval", clientBoundaryScript], {
    cwd: ROOT_PATH,
    stdio: "pipe",
    maxBuffer: 16 * 1024 * 1024,
  });
});

test("executes the exact focused contract repository HTTP client and console authority suites", () => {
  execFileSync(process.execPath, [
    "--experimental-transform-types",
    "--test",
    "packages/saas-contracts/src/inventory/inventory.test.ts",
    "packages/saas-contracts/src/pricing/pricing.test.ts",
    "packages/saas-data/src/inventory/repository.test.ts",
    "packages/saas-data/src/pricing/repository.test.ts",
    "apps/customer-panel/lib/server-inventory/runtime.test.ts",
    "apps/customer-panel/lib/inventory-http/handler.test.ts",
    "apps/customer-panel/lib/inventory-ui/client.test.ts",
    "apps/customer-panel/lib/inventory-console.test.ts",
    "apps/customer-panel/lib/server-pricing/runtime.test.ts",
    "apps/customer-panel/lib/pricing-http/handler.test.ts",
    "apps/customer-panel/lib/pricing-ui/client.test.ts",
    "apps/customer-panel/lib/price-list-console.test.ts",
    "apps/customer-panel/lib/catalog-admin-ui/barcode-label-projection.test.ts",
    "apps/customer-panel/lib/catalog-admin-console.test.ts",
    "apps/customer-panel/lib/catalog-ui/variant-choices.test.ts",
    "apps/customer-panel/lib/inventory-form-choices.test.ts",
    "apps/customer-panel/lib/inventory-form-intent.test.ts",
    "apps/customer-panel/lib/inventory-operation-forms.test.ts",
  ], { cwd: ROOT_PATH, stdio: "pipe", maxBuffer: 64 * 1024 * 1024 });
});

test("rejects workspace-admin aliases CommonJS edges and prohibited production literals", async () => {
  const imported = await import("typescript");
  const ts = imported.default ?? imported;
  assert.throws(
    () => resolveRepositorySpecifier("apps/customer-panel/lib/server-access.ts", "@celebix/admin/catalog"),
    /apps_admin_import_forbidden/,
  );
  const sourceFile = ts.createSourceFile(
    "synthetic.cjs",
    "export * from '@celebix/saas-data'; const donor = require('@celebix/admin/catalog');",
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  assert.deepEqual(moduleSpecifiers(ts, sourceFile), ["@celebix/saas-data", "@celebix/admin/catalog"]);
  for (const [path, source] of [
    ["apps/customer-panel/lib/forbidden-admin.ts", "fetch('/api/admin/catalog')"],
    ["apps/customer-panel/lib/forbidden-secret.ts", "const CLIENT_SECRET = 'hidden'"],
    ["apps/customer-panel/lib/forbidden-endpoint.ts", "const upstream = 'https://external.example/catalog'"],
    ["apps/customer-panel/lib/forbidden-total.ts", "const fakeRevenue = 12345"],
  ]) assert.throws(() => assertProductionSourceSecurity(ts, path, source), /production_source_forbidden/);
});

test("rejects resolver tokens that do not feed each authoritative price projection", async () => {
  const migration = await read("apps/owner/scripts/sql/saas/202607220045_price_lists.up.sql");
  assertSqlConsumerDataflow(migration);
  const brokenStorefront = migration.replace(
    "'priceCents',selected_price.effective_price",
    "'priceCents',selected_price.price_cents /* saas.resolve_effective_variant_price( */",
  );
  assert.throws(() => assertSqlConsumerDataflow(brokenStorefront), /price_consumer_dataflow_invalid/);
  const brokenCart = migration.replace(
    "pg_catalog.sum(resolved.price_cents*(entry.value->>'quantity')::bigint)",
    "pg_catalog.sum(variant.price_cents*(entry.value->>'quantity')::bigint) /* saas.resolve_effective_variant_price( */",
  );
  assert.throws(() => assertSqlConsumerDataflow(brokenCart), /price_consumer_dataflow_invalid/);
});
