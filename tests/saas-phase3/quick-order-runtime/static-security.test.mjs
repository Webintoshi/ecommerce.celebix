import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BASE = "301637111de040fc3bbf3cfed718a2d772e42130";
const DONOR = "fc6c5318b47f045a7cefcedc7612d5b10563ba32";
const HISTORICAL_RUNTIME_HEAD = "3ebf4b2cfaf10a840c2df5058fbf1a0d70f80986";
const NEXT_SECURITY_HEAD = "943ee5924ce2d486e3f0eb28947206bdcc51b8d7";
const ROOT = new URL("../../../", import.meta.url);
const SQL = "apps/owner/scripts/sql/saas/";
const MANIFEST = `${SQL}phase3b2-quick-order-runtime-manifest.json`;
const EXPECTED_CHANGED_FILE_COUNT = 130;
const EXPECTED_CHANGED_FILE_SHA256 = "d8919b5bbdbb02b7e713cfbf435db86e4203ff71e51eb17d449b33ae2aeac874";
const read = (file) => readFile(new URL(file, ROOT), "utf8");

function git(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, `git command failed: ${args[0]}`);
  return result.stdout;
}

function addedLines(revision = "HEAD") {
  const diff = git(["diff", "--unified=0", `${BASE}...${revision}`, "--", ":!docs/**"]);
  let testFixture = false;
  return diff.split("\n").filter((line) => {
    if (line.startsWith("+++ b/")) {
      testFixture = /(?:^|\/)tests?\//.test(line.slice(6)) || /[.]test[.]/.test(line);
      return false;
    }
    return !testFixture && line.startsWith("+") && !line.startsWith("+++");
  });
}

function changedFiles(revision = "HEAD") {
  return git(["diff", "--name-only", `${BASE}...${revision}`, "--", ":!docs/**"])
    .trim().split("\n").filter(Boolean).sort();
}

test("pins donor, admin immutability, current 026-029 manifest bytes and least-privilege roles", async () => {
  assert.equal(git(["rev-parse", `${DONOR}^{commit}`]).trim(), DONOR);
  assert.equal(git(["rev-parse", `${NEXT_SECURITY_HEAD}^{commit}`]).trim(), NEXT_SECURITY_HEAD);
  assert.equal(git(["diff", "--name-only", `${BASE}...${NEXT_SECURITY_HEAD}`, "--", "apps/admin"]).trim(), "apps/admin/package.json");
  assert.equal(git(["diff", "--name-only", `${NEXT_SECURITY_HEAD}...HEAD`, "--", "apps/admin"]).trim(), "");
  const manifest = JSON.parse(await read(MANIFEST));
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.artifacts.length, 12);
  assert.deepEqual(manifest.artifacts.map(({ file }) => file).sort(), [
    "202607220026_quick_order_checkout_runtime.up.sql", "202607220026_quick_order_checkout_runtime.down.sql", "202607220026_quick_order_checkout_runtime_assertions.sql",
    "202607220027_quick_order_checkout_api.up.sql", "202607220027_quick_order_checkout_api.down.sql", "202607220027_quick_order_checkout_api_assertions.sql",
    "202607220028_quick_order_redemption_expiry_authority.up.sql", "202607220028_quick_order_redemption_expiry_authority.down.sql", "202607220028_quick_order_redemption_expiry_authority_assertions.sql",
    "202607220029_quick_order_settlement_authority.up.sql", "202607220029_quick_order_settlement_authority.down.sql", "202607220029_quick_order_settlement_authority_assertions.sql",
  ].sort());
  for (const artifact of manifest.artifacts) {
    assert.match(artifact.file, /^20260722002[6-9]_quick_order_/);
    const source = await read(`${SQL}${artifact.file}`);
    assert.equal(createHash("sha256").update(source).digest("hex"), artifact.sha256, artifact.file);
  }
  const sql = await Promise.all(manifest.artifacts.map(({ file }) => read(`${SQL}${file}`)));
  const combined = sql.join("\n");
  assert.match(combined, /GRANT EXECUTE ON FUNCTION[\s\S]*TO celebix_saas_app/i);
  assert.match(combined, /GRANT EXECUTE ON FUNCTION[\s\S]*TO celebix_saas_workflow/i);
  assert.doesNotMatch(combined, /GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)\b[\s\S]*\bTO\s+celebix_saas_(?:app|workflow|host_resolver)/i);
  assert.doesNotMatch(combined, /GRANT EXECUTE ON FUNCTION[^;]+TO celebix_saas_host_resolver/i,
    "checkout functions remain app/workflow-only; host resolver receives no payment authority");
});

test("historical runtime scope is the exact reviewed Task 1 through Task 14 allowlist", () => {
  const files = changedFiles(HISTORICAL_RUNTIME_HEAD);
  assert.equal(files.length, EXPECTED_CHANGED_FILE_COUNT);
  assert.equal(createHash("sha256").update(`${files.join("\n")}\n`).digest("hex"), EXPECTED_CHANGED_FILE_SHA256);
});

test("historical runtime content has no credentials, private browser authority, unsafe CSP, unsupported navigation, or test network", async () => {
  const added = addedLines(HISTORICAL_RUNTIME_HEAD).join("\n");
  const forbidden = [
    /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i,
    /postgres(?:ql)?:\/\/[^\s"']+:[^\s"'@]+@/i,
    /(?:merchant[_-]?(?:key|salt)|client_secret|service_role_key)\s*[:=]\s*["'][^"']+/i,
    /@supabase|\/api\/admin\/|legacy[-_ ]admin/i,
    /frame-src\s+(?:\*|https:(?:\s|$)|'self'(?:\s|$)|[^;\n]*unsafe-inline)/i,
    /(?:raw|plain(?:text)?|unsealed)[_-]?(?:link|redemption|provider|callback|session)[_-]?(?:token|credential|secret)\s*[:=]\s*["'][^"']+/i,
    /(?:token|callback|session|provider)[_-]?(?:digest|sealed|credential)\s*[:=]\s*["'][A-Za-z0-9_./+=-]{16,}["']/i,
  ];
  for (const pattern of forbidden) assert.equal(pattern.test(added), false, `forbidden material pattern ${pattern}`);
  const navigation = git(["show", `${HISTORICAL_RUNTIME_HEAD}:apps/customer-panel/lib/panel-ui/navigation.ts`]);
  assert.match(navigation, /label: "Hızlı Siparişler", href: "\/orders\/quick-links"/);
  assert.doesNotMatch(navigation, /abandoned-carts|customers|discounts|marketing|analytics|accounting|marketplace/i);
  const changedTests = changedFiles(HISTORICAL_RUNTIME_HEAD).filter((file) => file.startsWith("tests/") || /[.]test[.]/.test(file));
  const localNetworkFixtures = new Set([
    "tests/saas-phase3/quick-order-runtime/in-process.test.mjs",
    "tests/saas-phase3/quick-order-runtime/reconcile-cli.test.mjs",
  ]);
  for (const file of changedTests) {
    const source = await read(file);
    if (file === "tests/saas-phase3/quick-order-runtime/static-security.test.mjs") continue;
    const networkPrimitive = /from\s+["']node:(?:http|https|net|tls|dgram|dns)["']|\b(?:globalThis[.])?fetch\s*\(|\b(?:axios|got|undici|WebSocket)\b|createConnection\s*\(/i;
    if (networkPrimitive.test(source)) {
      assert.equal(localNetworkFixtures.has(file), true, `unapproved test network primitive: ${file}`);
      assert.match(source, /127[.]0[.]0[.]1/);
      const listeners = [...source.matchAll(/\blisten\(([^\n]*)/g)].map((match) => match[1]);
      assert.equal(listeners.length > 0, true);
      for (const listener of listeners) assert.match(listener, /^0,\s*["']127[.]0[.]0[.]1["']/);
      assert.doesNotMatch(source, /\b(?:globalThis[.])?fetch\s*\(|\b(?:axios|got|undici|WebSocket)\b|createConnection\s*\(/i);
      if (/\bhttpRequest\s*\(/.test(source)) {
        const destinations = [...source.matchAll(/\bhttpRequest\s*\(\s*\{([^}]*)\}/g)].map((match) => match[1]);
        assert.equal(destinations.length, 1);
        assert.match(destinations[0], /hostname:\s*["']127[.]0[.]0[.]1["']/);
      }
    }
  }
  const browserAndRsc = await Promise.all([
    read("apps/customer-panel/components/orders/QuickOrderLinksConsole.tsx"),
    read("apps/customer-panel/lib/quick-link-ui/client.ts"),
    read("apps/customer-panel/app/orders/quick-links/page.tsx"),
    read("apps/storefront-shared/app/odeme/hizli/[token]/route.ts"),
    read("apps/storefront-shared/app/odeme/hizli/page.tsx"),
    read("apps/storefront-shared/app/odeme/hizli/sonuc/page.tsx"),
    read("apps/storefront-shared/app/odeme/hizli/odeme/route.ts"),
    read("apps/storefront-shared/app/api/quick-order/checkout/route.ts"),
    read("apps/storefront-shared/app/api/quick-order/status/route.ts"),
    read("apps/storefront-shared/app/api/payments/paytr/callback/route.ts"),
  ]);
  assert.doesNotMatch(browserAndRsc.join("\n"), /\b(?:tenantId|storeId|principalId|membershipId|planId|providerConfigId|quickOrderLinkId|tokenDigest|sealedToken|redemptionToken|providerToken|providerTokenDigest|callbackDigest|callbackCredential|session(?:Id|Credential|Token)?)\b/);
  const hostAuthority = await read("apps/storefront-shared/lib/trusted-host-authority.ts");
  assert.match(hostAuthority, /selectTrustedStorefrontHostAuthority/);
});

test("PayTR iframe emits its provider token exactly once after the exact secure origin", async () => {
  const runtime = await read("apps/storefront-shared/lib/checkout/runtime.ts");
  const proof = await read("apps/storefront-shared/lib/checkout/paytr.test.ts");
  assert.match(runtime, /<iframe src="\$\{createPaytrIframePresentationUrl\(token\)\}"/);
  assert.match(proof, /body[.]split\(fixture[.]providerToken\)[.]length - 1, 1/);
  assert.doesNotMatch(runtime, /Response[.]json\([^)]*token|Location[^\n]+paytr[.]com/i);
});
