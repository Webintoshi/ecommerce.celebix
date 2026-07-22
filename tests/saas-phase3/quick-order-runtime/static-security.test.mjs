import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BASE = "301637111de040fc3bbf3cfed718a2d772e42130";
const DONOR = "fc6c5318b47f045a7cefcedc7612d5b10563ba32";
const ROOT = new URL("../../../", import.meta.url);
const SQL = "apps/owner/scripts/sql/saas/";
const MANIFEST = `${SQL}phase3b2-quick-order-runtime-manifest.json`;
const read = (file) => readFile(new URL(file, ROOT), "utf8");

function git(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, `git command failed: ${args[0]}`);
  return result.stdout;
}

function addedLines() {
  const diff = git(["diff", "--unified=0", `${BASE}...HEAD`, "--", ":!docs/**"]);
  let testFixture = false;
  return diff.split("\n").filter((line) => {
    if (line.startsWith("+++ b/")) {
      testFixture = /(?:^|\/)tests?\//.test(line.slice(6)) || /[.]test[.]/.test(line);
      return false;
    }
    return !testFixture && line.startsWith("+") && !line.startsWith("+++");
  });
}

test("pins donor, admin immutability, current 026-029 manifest bytes and least-privilege roles", async () => {
  assert.equal(git(["rev-parse", `${DONOR}^{commit}`]).trim(), DONOR);
  assert.equal(git(["diff", "--name-only", `${BASE}...HEAD`, "--", "apps/admin"]).trim(), "");
  const manifest = JSON.parse(await read(MANIFEST));
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.artifacts.length, 12);
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
});

test("added implementation content has no credentials, private browser authority, unsafe CSP, activated navigation, or test network", async () => {
  const added = addedLines().join("\n");
  const forbidden = [
    /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i,
    /postgres(?:ql)?:\/\/[^\s"']+:[^\s"'@]+@/i,
    /(?:merchant[_-]?(?:key|salt)|client_secret|service_role_key)\s*[:=]\s*["'][^"']+/i,
    /@supabase|\/api\/admin\/|legacy[-_ ]admin/i,
    /frame-src\s+(?:\*|https:(?:\s|$)|'self'(?:\s|$)|[^;\n]*unsafe-inline)/i,
  ];
  for (const pattern of forbidden) assert.equal(pattern.test(added), false, `forbidden material pattern ${pattern}`);
  const navigation = await read("apps/customer-panel/lib/panel-ui/navigation.ts");
  assert.doesNotMatch(navigation, /quick[-_ ]?(?:order|link)|hızlı\s+sipariş/i);
  const runtimeTests = [
    "tests/saas-phase3/quick-order-runtime/isolated-staging-runner.test.mjs",
    "tests/saas-phase3/quick-order-runtime/static-security.test.mjs",
  ];
  for (const file of runtimeTests) {
    const source = await read(file);
    assert.doesNotMatch(source, /\b(?:fetch|httpRequest|httpsRequest|createConnection)\s*\(/i, `external test I/O: ${file}`);
  }
  const browserAndRsc = await Promise.all([
    read("apps/customer-panel/components/orders/QuickOrderLinksConsole.tsx"),
    read("apps/storefront-shared/app/odeme/hizli/page.tsx"),
  ]);
  assert.doesNotMatch(browserAndRsc.join("\n"), /\b(?:tenantId|storeId|principalId|membershipId|planId|tokenDigest|sealedToken|providerTokenDigest|callbackDigest|session(?:Id|Credential)?)\b/);
  const hostAuthority = await read("apps/storefront-shared/lib/trusted-host-authority.ts");
  assert.match(hostAuthority, /selectTrustedStorefrontHostAuthority/);
});

test("PayTR iframe emits its provider token exactly once after the exact secure origin", async () => {
  const runtime = await read("apps/storefront-shared/lib/checkout/runtime.ts");
  const proof = await read("apps/storefront-shared/lib/checkout/paytr.test.ts");
  assert.match(runtime, /<iframe src="https:\/\/www[.]paytr[.]com\/odeme\/guvenli\/\$\{token\}"/);
  assert.match(proof, /body[.]split\(fixture[.]providerToken\)[.]length - 1, 1/);
  assert.doesNotMatch(runtime, /Response[.]json\([^)]*token|Location[^\n]+paytr[.]com/i);
});
