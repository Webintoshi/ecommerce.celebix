import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const BASE = "912df940d2f8aa1e4d43a076621ad592751f4f04";
const ANALYTICS_HEAD = "c365bc2195df1af5929381f7e910f73059c13ba7";
const LOCKFILE_GATE_HEAD = "c81e298f";
const STARTER_COMMERCE_BASE = "bbe68885986279f8642f1852ac3db74eb8bc06ab";
const PAYMENT_ADAPTERS_PREDECESSOR = "f14590b20c713c1bac8a223a9ecb46d85b6d2210";
const PAYMENT_ADAPTERS_HEAD = "710c0221537099c419726b4d5f7b5da1ef891ec6";
const PAYMENT_ADAPTER_WORKSPACE = Object.freeze({
  name: "@celebix/payment-adapters",
  version: "0.1.0",
  private: true,
  type: "module",
  main: "./src/index.ts",
  types: "./src/index.ts",
  exports: { ".": "./src/index.ts" },
  scripts: {
    typecheck: "tsc -p tsconfig.json --noEmit",
    test: "node --experimental-strip-types --test src/*.test.ts src/packets/*.test.ts src/providers/paytr/*.test.ts src/providers/iyzico/*.test.ts",
  },
  dependencies: { "@celebix/saas-contracts": "0.1.0" },
});

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

async function source(path) {
  return { path, text: await readFile(`${ROOT}/${path}`, "utf8") };
}

function changedNames(...paths) {
  return git(["diff", "--name-only", `${BASE}...HEAD`, "--", ...paths])
    .trim()
    .split("\n")
    .filter(Boolean);
}

function addedApplicationLines() {
  return git([
    "diff", "--unified=0", `${BASE}...${ANALYTICS_HEAD}`, "--",
    "apps/customer-panel", "apps/storefront-shared", "packages/saas-contracts", "packages/saas-data",
    ":(exclude)**/*.test.ts", ":(exclude)**/*.test.tsx",
  ]).split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")).join("\n");
}

const PANEL_CLIENT_AND_RSC = [
  "apps/customer-panel/app/analytics/page.tsx",
  "apps/customer-panel/components/analytics/PanelAnalyticsView.tsx",
  "apps/customer-panel/lib/analytics-ui/client.ts",
  "apps/customer-panel/lib/analytics-ui/presentation.ts",
  "apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx",
  "apps/customer-panel/components/panel/PanelNavigation.tsx",
  "apps/customer-panel/components/panel/PanelSidebar.tsx",
];

test("client and RSC analytics sources contain no private analytics authority", async () => {
  for (const value of await Promise.all(PANEL_CLIENT_AND_RSC.map(source))) {
    assert.doesNotMatch(value.text, /CELEBIX_UMAMI_(?:USERNAME|PASSWORD)|TenantContext|postgres(?:ql)?:|providerBody|sessionId|distinctId/, value.path);
  }
});

test("private Umami environment markers remain behind server-only configuration", async () => {
  const files = changedNames("apps/customer-panel", "apps/storefront-shared")
    .filter((path) => !/\.test\./.test(path) && !path.endsWith(".md"));
  const matches = [];
  for (const path of files) {
    const text = await readFile(`${ROOT}/${path}`, "utf8");
    if (/CELEBIX_UMAMI_(?:USERNAME|PASSWORD)/.test(text)) matches.push(path);
  }
  assert.deepEqual(matches, ["apps/customer-panel/lib/umami-provider/config.ts"]);
  const runtime = await source("apps/customer-panel/lib/server-analytics/default.ts");
  assert.match(runtime.text, /^import"server-only"/);
  assert.doesNotMatch(runtime.text, /NEXT_PUBLIC/);
});

test("analytics route modules are thin server delegates with no projected authority", async () => {
  const routes = await Promise.all([
    "apps/customer-panel/app/api/analytics/connection/route.ts",
    "apps/customer-panel/app/api/analytics/summary/route.ts",
    "apps/customer-panel/app/api/analytics/metrics/route.ts",
  ].map(source));
  for (const value of routes) {
    assert.match(value.text, /defaultAnalyticsHandlers/);
    assert.doesNotMatch(value.text, /process[.]env|TenantContext|websiteId|storeId|credential|password/i, value.path);
  }
});

test("analytics additions contain no admin API, Supabase, iframe, legacy auth, or fake KPI", () => {
  assert.doesNotMatch(addedApplicationLines(), /\/api\/admin\/|@supabase|iframe|legacy.{0,20}logto|placeholder analytics|fake (?:kpi|metric)|estimated (?:kpi|metric)/i);
});

test("analytics CSP grants only the exact resolved script and collector origins", async () => {
  const proxy = (await source("apps/storefront-shared/proxy.ts")).text;
  assert.match(proxy, /script-src 'nonce-\$\{nonce\}' 'strict-dynamic'\$\{scriptDestination\}/);
  assert.match(proxy, /connect-src \$\{connectDestination\}/);
  assert.match(proxy, /scriptOrigin:\s*new URL\(runtime[.]analyticsCollector[.]trackerScriptUrl\)[.]origin/);
  assert.doesNotMatch(proxy, /script-src[^;]*(?:\*|unsafe-inline| https:;)|connect-src[^;]*(?:\*| https:;)/);
});

test("storefront tracking reduces location and referrer to safe pathname and origin", async () => {
  const tracker = (await source("apps/storefront-shared/lib/analytics/tracker-client.ts")).text;
  const events = (await source("apps/storefront-shared/lib/analytics/events.ts")).text;
  assert.match(tracker, /url: browser[.]location[.]pathname/);
  assert.match(tracker, /referrer = selected[.]origin/);
  assert.match(events, /url: selected[.]pathname/);
  assert.doesNotMatch(`${tracker}\n${events}`, /location[.](?:href|search|hash)|referrer:\s*browser[.]document[.]referrer/);
});

test("panel browser mutations cannot submit store or Website authority", async () => {
  const client = (await source("apps/customer-panel/lib/analytics-ui/client.ts")).text;
  const view = (await source("apps/customer-panel/components/analytics/PanelAnalyticsView.tsx")).text;
  assert.doesNotMatch(`${client}\n${view}`, /\b(?:storeId|tenantId|websiteId|connectionId|principalId|membershipId)\b/);
  assert.match(client, /JSON[.]stringify\(\{ intent: "enable" \}\)/);
  assert.match(client, /JSON[.]stringify\(\{ intent: "disable", expectedVersion: input[.]expectedVersion \}\)/);
});

test("provider and outbox paths never log raw event or response payloads", async () => {
  const paths = [
    "apps/customer-panel/lib/umami-provider/client.ts",
    "apps/customer-panel/lib/analytics-http/handler.ts",
    "apps/storefront-shared/lib/analytics/delivery.ts",
    "apps/storefront-shared/scripts/deliver-analytics-events.mjs",
  ];
  const values = await Promise.all(paths.map(source));
  const combined = values.map(({ text }) => text).join("\n");
  assert.doesNotMatch(combined, /console[.](?:log|warn|error)|providerBody/);
  assert.doesNotMatch(values.filter(({ path }) => !path.endsWith("analytics-http/handler.ts")).map(({ text }) => text).join("\n"), /response[.](?:text|json)\(/);
  const worker = values.find(({ path }) => path.endsWith("deliver-analytics-events.mjs")).text;
  assert.match(worker, /JSON[.]stringify\(result\)/);
  assert.doesNotMatch(worker, /claim[.](?:payload|websiteId|hostname)|eventPayload|providerResponse/);
  assert.doesNotMatch(combined, /sessionId|distinctId|customerEmail|customerPhone/);
});

test("migrations 001 through 038 remain byte-for-byte outside the analytics change", () => {
  const changed = changedNames("apps/owner/scripts/sql/saas")
    .filter((path) => /2026072600(?:0[1-9]|[12][0-9]|3[0-8])_/.test(path));
  assert.deepEqual(changed, []);
  assert.deepEqual(changedNames("apps/owner/scripts/sql/saas/202607260039_store_analytics_authority.up.sql").length, 1);
});

test("the pinned donor admin tree remains unchanged", () => {
  assert.equal(git(["rev-parse", "fc6c5318b47f045a7cefcedc7612d5b10563ba32^{commit}"]).trim(), "fc6c5318b47f045a7cefcedc7612d5b10563ba32");
  assert.deepEqual(changedNames("apps/admin"), []);
});

test("analytics lockfile admits only its approved dependencies and later starter commerce adds no lockfile churn", async () => {
  assert.equal(
    git(["merge-base", PAYMENT_ADAPTERS_HEAD, "HEAD"]).trim(),
    PAYMENT_ADAPTERS_HEAD,
  );
  assert.deepEqual(changedNames("package-lock.json"), ["package-lock.json"]);
  assert.equal(
    git(["diff", "--name-only", `${BASE}...${PAYMENT_ADAPTERS_PREDECESSOR}`, "--", "package-lock.json"]).trim(),
    "",
  );
  assert.match(git([
    "diff", "--name-only", `${PAYMENT_ADAPTERS_HEAD}..HEAD`, "--",
    "packages/payment-adapters/package.json",
  ]).trim(), /^(?:|packages\/payment-adapters\/package[.]json)$/);

  const workspace = JSON.parse(await readFile(`${ROOT}/packages/payment-adapters/package.json`, "utf8"));
  assert.deepEqual(workspace, PAYMENT_ADAPTER_WORKSPACE);
  const customerPanelWorkspace = JSON.parse(await readFile(`${ROOT}/apps/customer-panel/package.json`, "utf8"));
  assert.equal(customerPanelWorkspace.devDependencies?.["happy-dom"], "20.8.9");
  const expectedLock = JSON.parse(git(["show", `${PAYMENT_ADAPTERS_PREDECESSOR}:package-lock.json`]));
  expectedLock.packages["node_modules/@celebix/payment-adapters"] = {
    resolved: "packages/payment-adapters",
    link: true,
  };
  expectedLock.packages["packages/payment-adapters"] = {
    name: "@celebix/payment-adapters",
    version: "0.1.0",
    dependencies: { "@celebix/saas-contracts": "0.1.0" },
  };
  expectedLock.packages["apps/storefront-shared"].dependencies["@celebix/payment-adapters"] = "0.1.0";
  expectedLock.packages["apps/customer-panel"].dependencies["@celebix/payment-adapters"] = "0.1.0";
  expectedLock.packages["apps/customer-panel"].devDependencies["happy-dom"] = "20.8.9";
  expectedLock.packages["apps/owner"].dependencies["@celebix/payment-adapters"] = "0.1.0";
  expectedLock.packages["packages/platform-config"].dependencies = { "markdown-it": "14.1.1" };
  expectedLock.packages["packages/platform-config"].devDependencies = { "@types/markdown-it": "14.1.2" };
  expectedLock.packages["node_modules/@types/whatwg-mimetype"] = {
    version: "3.0.2",
    resolved: "https://registry.npmjs.org/@types/whatwg-mimetype/-/whatwg-mimetype-3.0.2.tgz",
    integrity: "sha512-c2AKvDT8ToxLIOUlN51gTiHXflsfIFisS4pO7pDPoKouJCESkhZnEy623gwP9laCy5lnLDAw1vAzu2vM2YLOrA==",
    dev: true,
    license: "MIT",
  };
  expectedLock.packages["node_modules/happy-dom"] = {
    version: "20.8.9",
    resolved: "https://registry.npmjs.org/happy-dom/-/happy-dom-20.8.9.tgz",
    integrity: "sha512-Tz23LR9T9jOGVZm2x1EPdXqwA37G/owYMxRwU0E4miurAtFsPMQ1d2Jc2okUaSjZqAFz2oEn3FLXC5a0a+siyA==",
    dev: true,
    license: "MIT",
    dependencies: {
      "@types/node": ">=20.0.0",
      "@types/whatwg-mimetype": "^3.0.2",
      "@types/ws": "^8.18.1",
      entities: "^7.0.1",
      "whatwg-mimetype": "^3.0.0",
      ws: "^8.18.3",
    },
    engines: { node: ">=20.0.0" },
  };
  expectedLock.packages["node_modules/happy-dom/node_modules/entities"] = {
    version: "7.0.1",
    resolved: "https://registry.npmjs.org/entities/-/entities-7.0.1.tgz",
    integrity: "sha512-TWrgLOFUQTH994YUyl1yT4uyavY5nNB5muff+RtWaqNVCAK408b5ZnnbNAUEWLTCpum9w6arT70i1XdQ4UeOPA==",
    dev: true,
    license: "BSD-2-Clause",
    engines: { node: ">=0.12" },
    funding: { url: "https://github.com/fb55/entities?sponsor=1" },
  };
  expectedLock.packages["node_modules/whatwg-mimetype"] = {
    version: "3.0.0",
    resolved: "https://registry.npmjs.org/whatwg-mimetype/-/whatwg-mimetype-3.0.0.tgz",
    integrity: "sha512-nt+N2dzIutVRxARx1nghPKGv1xHikU7HKdfafKkLNLindmPU/ch3U31NOCGGA/dmPcmb1VlofO0vnKAcsm0o/Q==",
    dev: true,
    license: "MIT",
    engines: { node: ">=12" },
  };
  expectedLock.packages["apps/media-gateway"] = {
    name: "@celebix/media-gateway",
    version: "0.1.0",
  };
  expectedLock.packages["node_modules/@celebix/media-gateway"] = {
    resolved: "apps/media-gateway",
    link: true,
  };
  const gateLock = JSON.parse(git(["show", `${LOCKFILE_GATE_HEAD}:package-lock.json`]));
  assert.deepEqual(gateLock, expectedLock);
  assert.equal(
    git(["diff", "--name-only", `${STARTER_COMMERCE_BASE}...HEAD`, "--", "package-lock.json"]).trim(),
    "",
  );

  const sensitive = git(["diff", "--name-only", `${BASE}...${LOCKFILE_GATE_HEAD}`])
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((path) => /(^|\/)[.]env($|[.])|credential|secret/i.test(path));
  assert.deepEqual(sensitive, [
    "packages/saas-data/src/provider-execution/credential-crypto.test.ts",
    "packages/saas-data/src/provider-execution/credential-crypto.ts",
  ]);
});

test("whole analytics diff is whitespace-clean and contains no embedded credentials", async () => {
  assert.equal(git(["diff", "--check"]), "");
  const files = changedNames("apps/customer-panel", "apps/storefront-shared", "packages/saas-contracts", "packages/saas-data")
    .filter((path) => !/\.test\./.test(path) && !path.endsWith(".md"));
  const combined = (await Promise.all(files.map(source))).map(({ text }) => text).join("\n");
  assert.doesNotMatch(combined, /postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@|Authorization:\s*Bearer\s+[A-Za-z0-9_-]{16,}|NEXT_PUBLIC_.*UMAMI_(?:PASSWORD|USERNAME)/i);
});
