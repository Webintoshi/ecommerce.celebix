import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const moduleUrl = new URL("./index.ts", import.meta.url).href;
const fixture = JSON.stringify({
  schemaVersion: 1,
  cartId: "11111111-1111-4111-8111-111111111111",
  cartVersion: 1,
  checkoutNonce: "A".repeat(43),
  storeName: "Celebix",
  currency: "TRY",
  locale: "tr",
  items: [{
    id: "22222222-2222-4222-8222-222222222222",
    title: "Ürün",
    variantLabel: null,
    quantity: 1,
    unitPriceCents: 10_000,
    lineTotalCents: 10_000,
    imagePath: null,
  }],
  shippingOptions: [{
    id: "standard",
    label: "Standart",
    description: null,
    priceCents: 2_900,
  }],
  selectedShippingId: "standard",
  paymentMethods: [{
    id: "44444444-4444-4444-8444-444444444444",
    kind: "provider",
    label: "Kart",
    providerCode: "paytr_iframe",
    logoPath: "/payment-providers/paytr.svg",
  }],
  policyLinks: [],
  subtotalCents: 10_000,
  shippingCents: 2_900,
  discountCents: 0,
  totalCents: 12_900,
  discountCode: null,
});

function isolated(script: string) {
  return spawnSync(process.execPath, [
    "--experimental-strip-types",
    "--input-type=module",
    "--eval",
    script,
  ], { encoding: "utf8" });
}

test("proxy inspection never uses cloning or undocumented proxy details", async () => {
  const source = await readFile(new URL("./validation.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /structuredClone|getProxyDetails|process[.]binding|NODE_PROCESS[.]binding/);
  assert.doesNotMatch(source, /node:util(?:\/types)?/);
  assert.doesNotMatch(
    source,
    /(?:from|import\s*\(|require\s*\()[\s\S]{0,40}["'](?:node:)?util(?:\/types)?["']/,
  );
  assert.match(source, /getBuiltinModule/);
});

test("the real declared Node runtime parses a valid quote and rejects a proxy", () => {
  const result = isolated(`
    if (typeof process.getBuiltinModule !== "function") throw new Error("unsupported_node_runtime");
    const nodeTypes = process.getBuiltinModule("util")?.types;
    if (typeof nodeTypes?.isProxy !== "function") throw new Error("missing_real_isProxy");
    const { parseCheckoutQuote } = await import(${JSON.stringify(moduleUrl)});
    const parsed = parseCheckoutQuote(${fixture});
    if (parsed.storeName !== "Celebix") throw new Error("valid_quote_rejected");
    let rejected = false;
    try { parseCheckoutQuote(new Proxy(${fixture}, {})); }
    catch { rejected = true; }
    if (!rejected) throw new Error("binding_proxy_accepted");
  `);
  assert.equal(result.status, 0, result.stderr);
});

test("declared Node range and deployment runtimes require getBuiltinModule", async () => {
  const rootPackage = JSON.parse(await readFile(
    new URL("../../../../package.json", import.meta.url),
    "utf8",
  )) as { engines?: { node?: unknown } };
  const lock = JSON.parse(await readFile(
    new URL("../../../../package-lock.json", import.meta.url),
    "utf8",
  )) as { packages?: { ""?: { engines?: { node?: unknown } } } };
  const nixpacks = await readFile(new URL("../../../../nixpacks.toml", import.meta.url), "utf8");
  const workerDockerfile = await readFile(
    new URL("../../../../Dockerfile.analytics-worker", import.meta.url),
    "utf8",
  );
  const range = ">=22.7.0";
  assert.equal(rootPackage.engines?.node, range);
  assert.equal(lock.packages?.[""]?.engines?.node, range);
  assert.match(nixpacks, /^nixPkgs = \["nodejs_22"\]$/m);
  assert.match(nixpacks, /^runImage = "node:22[.]22[.]3-bookworm-slim"$/m);
  assert.match(workerDockerfile, /^FROM node:22[.]22[.]3-bookworm-slim$/m);

  const supportsRepositoryRuntime = (version: string) => {
    const [major = 0, minor = 0] = version.split(".").map(Number);
    return major > 22 || (major === 22 && minor >= 7);
  };
  for (const version of ["20.9.0", "20.16.0", "21.7.3", "22.0.0", "22.3.0", "22.6.0"]) {
    assert.equal(supportsRepositoryRuntime(version), false, version);
  }
  for (const version of ["22.7.0", "22.22.3", "23.0.0", "24.0.0"]) {
    assert.equal(supportsRepositoryRuntime(version), true, version);
  }
});

test("a detected Node runtime without either synchronous proxy authority fails closed", () => {
  const result = isolated(`
    Object.defineProperty(process, "getBuiltinModule", {
      configurable: true,
      value: undefined,
      writable: true,
    });
    Object.defineProperty(process, "binding", {
      configurable: true,
      value: () => ({}),
      writable: true,
    });
    const { parseCheckoutQuote } = await import(${JSON.stringify(moduleUrl)});
    let rejected = false;
    try { parseCheckoutQuote(${fixture}); }
    catch { rejected = true; }
    if (!rejected) throw new Error("node_without_authority_accepted");
  `);
  assert.equal(result.status, 0, result.stderr);
});

test("hostile accessors are rejected without invoking their getters", () => {
  const result = isolated(`
    const { parseCheckoutQuote } = await import(${JSON.stringify(moduleUrl)});
    const hostile = ${fixture};
    let reads = 0;
    Object.defineProperty(hostile, "storeName", {
      enumerable: true,
      get() { reads += 1; return "Celebix"; },
    });
    let rejected = false;
    try { parseCheckoutQuote(hostile); }
    catch { rejected = true; }
    if (!rejected) throw new Error("accessor_accepted");
    if (reads !== 0) throw new Error("getter_invoked_" + reads);
  `);
  assert.equal(result.status, 0, result.stderr);
});

test("a post-startup getBuiltinModule monkeypatch cannot make a transparent proxy pass", () => {
  const result = isolated(`
    const { parseCheckoutQuote } = await import(${JSON.stringify(moduleUrl)});
    Object.defineProperty(process, "getBuiltinModule", {
      configurable: true,
      value: () => ({ isProxy: () => false }),
      writable: true,
    });
    let rejected = false;
    try { parseCheckoutQuote(new Proxy(${fixture}, {})); }
    catch { rejected = true; }
    if (!rejected) throw new Error("transparent_proxy_accepted");
  `);
  assert.equal(result.status, 0, result.stderr);
});
