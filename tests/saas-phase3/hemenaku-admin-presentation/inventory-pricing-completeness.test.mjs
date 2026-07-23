import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const INVENTORY_BASE = "6cbbe8859c9ae01374ccd1488e24733e2256552c";
const TASK_1_8_HEAD = "146fa723b2af66050a6819314cb1a2bd86fab9db";
const DONOR = "fc6c5318b47f045a7cefcedc7612d5b10563ba32";
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
    "apps/customer-panel/app/products/purchasing/[purchaseOrderId]/page.tsx",
  ]),
  inventoryCounts: Object.freeze([
    "apps/customer-panel/app/products/inventory-counts/page.tsx",
    "apps/customer-panel/app/products/inventory-counts/[countId]/page.tsx",
  ]),
  transfers: Object.freeze([
    "apps/customer-panel/app/products/transfers/page.tsx",
    "apps/customer-panel/app/products/transfers/[transferId]/page.tsx",
  ]),
  priceLists: Object.freeze([
    "apps/customer-panel/app/products/price-lists/page.tsx",
    "apps/customer-panel/app/products/price-lists/new/page.tsx",
    "apps/customer-panel/app/products/price-lists/[priceListId]/page.tsx",
  ]),
});

const MIGRATION_BUNDLES = Object.freeze(["042_catalog_product_tags", "043_inventory_purchasing", "044_inventory_counts_transfers", "045_price_lists"]);

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

function resolveRepositorySpecifier(importerPath, specifier) {
  let candidate;
  if (specifier.startsWith(".")) {
    candidate = resolve(dirname(resolve(ROOT_PATH, importerPath)), specifier);
  } else if (specifier.startsWith("@/")) {
    candidate = resolve(ROOT_PATH, "apps/customer-panel", specifier.slice(2));
  } else if (specifier === "@celebix/saas-contracts") {
    candidate = resolve(ROOT_PATH, "packages/saas-contracts/src/index.ts");
  } else if (specifier.startsWith("@celebix/saas-contracts/")) {
    candidate = resolve(ROOT_PATH, "packages/saas-contracts/src", specifier.slice("@celebix/saas-contracts/".length));
  } else if (specifier === "@celebix/saas-data") {
    candidate = resolve(ROOT_PATH, "packages/saas-data/src/index.ts");
  } else if (specifier.startsWith("@celebix/saas-data/")) {
    candidate = resolve(ROOT_PATH, "packages/saas-data/src", specifier.slice("@celebix/saas-data/".length));
  } else if (specifier === "@celebix/platform-config") {
    candidate = resolve(ROOT_PATH, "packages/platform-config/src/index.ts");
  } else if (specifier.startsWith("@celebix/platform-config/")) {
    candidate = resolve(ROOT_PATH, "packages/platform-config/src", specifier.slice("@celebix/platform-config/".length));
  } else if (specifier.startsWith("apps/") || specifier.startsWith("packages/")) {
    candidate = resolve(ROOT_PATH, specifier);
  } else {
    if (specifier === "apps/admin" || specifier.startsWith("apps/admin/") || specifier.startsWith("@/../admin/")) {
      throw new Error("apps_admin_import_forbidden");
    }
    return null;
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
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return specifiers;
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

function assertResolverCount(body, expected, label) {
  assert.equal(
    occurrences(body, "saas.resolve_effective_variant_price("),
    expected,
    `${label} does not own its exact effective-price resolver calls`,
  );
}

test("pins all six product-operation page families and their subpages", async () => {
  assert.equal(Object.keys(PAGE_GROUPS).length, 6);
  for (const [family, paths] of Object.entries(PAGE_GROUPS)) {
    assert.ok(paths.length > 0, `${family} has no routes`);
    for (const path of paths) await access(new URL(path, ROOT));
  }
});

test("pins four complete migration bundles and their disposable PostgreSQL proofs", async () => {
  assert.equal(MIGRATION_BUNDLES.length, 4);
  for (const name of MIGRATION_BUNDLES) {
    for (const suffix of [".up.sql", ".down.sql", "_assertions.sql"]) {
      await access(new URL(`apps/owner/scripts/sql/saas/202607220${name}${suffix}`, ROOT));
    }
  }
  for (const path of [
    "tests/saas-phase3/catalog-product-tags/postgres-harness.mjs",
    "tests/saas-phase3/inventory-purchasing/postgres-harness.mjs",
    "tests/saas-phase3/inventory-counts-transfers/postgres-harness.mjs",
    "tests/saas-phase3/price-lists/postgres-harness.mjs",
  ]) await access(new URL(path, ROOT));
});

test("keeps the cumulative artifact allowlist exact and reviewable", async () => {
  const securitySource = await read("tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs");
  const pinned = pinnedTaskArtifacts(securitySource);
  const committedTaskDiff = git(
    "diff",
    "--name-only",
    `${INVENTORY_BASE}...${TASK_1_8_HEAD}`,
  ).split("\n").filter(Boolean).sort();
  assert.equal(committedTaskDiff.length, 117);
  assert.deepEqual(pinned, committedTaskDiff, "Task 1-8 tracked artifact inventory is not symmetric with its pinned committed diff");
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
    /row[.]inventory_relations !== true \|\| row[.]inventory_repository !== true/,
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
  const resolver = "saas.resolve_effective_variant_price(";
  assertResolverCount(sqlFunctionBody(migration, "public_list_products"), 1, "public_list_products");
  assertResolverCount(sqlFunctionBody(migration, "public_get_product_by_slug"), 1, "public_get_product_by_slug");
  assertResolverCount(sqlFunctionBody(migration, "abandoned_carts_capture"), 2, "abandoned_carts_capture");

  const createWrapper = sqlFunctionBody(migration, "quick_links_create");
  const duplicateWrapper = sqlFunctionBody(migration, "quick_links_duplicate");
  assert.equal(occurrences(createWrapper, resolver), 0);
  assert.equal(occurrences(duplicateWrapper, resolver), 0);
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
  assertResolverCount(createCorePatch, 1, "quick_links_create_025 patch");
  assertResolverCount(duplicateCorePatch, 1, "quick_links_duplicate_025 patch");
  assert.equal(occurrences(createCorePatch, "variant.price_cents"), 1);
  assert.equal(occurrences(duplicateCorePatch, "variant.price_cents"), 1);

  for (const functionName of ["public_list_products", "public_get_product_by_slug", "abandoned_carts_capture"]) {
    const body = sqlFunctionBody(migration, functionName);
    const withoutResolver = body.replaceAll(resolver, "saas.untrusted_price_reader(");
    assert.throws(
      () => assertResolverCount(withoutResolver, functionName === "abandoned_carts_capture" ? 2 : 1, functionName),
      assert.AssertionError,
    );
  }
});

test("resolves every static local import and re-export without donor or Supabase authority", async () => {
  assert.equal(git("rev-parse", `${DONOR}^{commit}`), DONOR);
  assert.equal(git("diff", "--name-only", `${INVENTORY_BASE}...HEAD`, "--", "apps/admin"), "");
  const pinned = pinnedTaskArtifacts(await read(STATIC_SECURITY_PATH));
  for (const required of REQUIRED_GRAPH_ROOTS) assert.equal(pinned.includes(required), true, `missing graph root ${required}`);
  const imported = await import("typescript");
  const ts = imported.default ?? imported;
  const sourceRoots = pinned.filter((path) => SOURCE_EXTENSIONS.includes(extname(path)));
  const graph = assertRepositoryImportGraph(ts, sourceRoots);
  for (const required of REQUIRED_GRAPH_ROOTS) assert.equal(graph.includes(required), true, `unvisited graph root ${required}`);
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
    assert.deepEqual(Object.keys(inventoryApi).sort(), ["cancelCount", "cancelTransfer", "commitCount", "dispatchTransfer", "getCount", "getPurchaseOrder", "getTransfer", "listBalances", "listCounts", "listLocations", "listPurchaseOrders", "listTransfers", "receivePurchaseOrder", "receiveTransfer", "saveCount", "savePurchaseOrder", "saveTransfer", "startCount", "transitionPurchaseOrder"]);
    assert.deepEqual(Object.keys(pricingApi).sort(), ["activate", "archive", "get", "list", "save"]);
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
  ], { cwd: ROOT_PATH, stdio: "pipe", maxBuffer: 64 * 1024 * 1024 });
});
