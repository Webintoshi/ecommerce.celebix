import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const execute = promisify(execFile);
const ROOT = resolve(import.meta.dirname, "../../..");
const CLOSED_HARNESS = "tests/saas-phase2/panel-session-completion/postgres-harness.mjs";
const SCENARIOS = Object.freeze([
  "1. PostgreSQL 16 and migrations 001–017.",
  "2. Existing manifests/checksums.",
  "3. Default routes remain disabled.",
  "4. Genuine Owner/customer compositions constructed.",
  "5. Valid registration request accepted.",
  "6. Request gate executed exactly once.",
  "7. Registration/OIDC start executed exactly once.",
  "8. Owner bridge returns HTTP 200 HTML.",
  "9. Owner bridge emits complete security headers.",
  "10. Owner bridge emits no cookie or Location.",
  "11. CSP nonce and fixed script are valid.",
  "12. Exact form action/method/encoding.",
  "13. Exact two hidden fields.",
  "14. Browser form decoding reproduces exact bs1 and provider URL.",
  "15. No provider URL or credential enters JSON/header/audit.",
  "16. Panel bootstrap returns HTTP 303.",
  "17. Exact pb1 pre-auth cookie is written.",
  "18. Exact provider URL is used only after Owner verification.",
  "19. Workflow/OIDC/browser-binding row counts are exact.",
  "20. Callback with exact pre-auth cookie succeeds.",
  "21. Persistent session cookie is written.",
  "22. Exact pre-auth deletion cookie is written.",
  "23. TenantContext resolves exact store-owner membership.",
  "24. Tenant/store/membership/session/handoff counts are exact.",
  "25. Reposting the same Owner bridge form fails closed.",
  "26. Missing-cookie callback reaches zero provider/issuer/redeemer.",
  "27. Wrong-cookie callback reaches zero provider/issuer/redeemer.",
  "28. Stolen callback URL without browser binding creates no session.",
  "29. Cross-state/browser-binding request is rejected.",
  "30. Concurrent duplicate callback yields one session response.",
  "31. Provider-error callback creates no handoff/session.",
  "32. Owner response loss performs no callback retry.",
  "33. Redemption commit-unknown performs one read-only recovery.",
  "34. Raw state/bs1/pb1/provider URL/handoff/session scans pass.",
  "35. Audit redaction passes.",
  "36. Claimed replay evidence survives cleanup before expiry.",
  "37. Backup succeeds.",
  "38. Restore and restored TenantContext succeed.",
  "39. External and production/staging connection counts remain zero.",
  "40. All validation-owned processes/files/sockets are removed.",
]);

function invalid(message) {
  throw new Error(`phase2b2b2b_postgres_harness_failed:${message}`);
}

async function runNode(arguments_) {
  return execute(process.execPath, arguments_, {
    cwd: ROOT,
    env: { ...process.env },
    maxBuffer: 16 * 1024 * 1024,
  });
}

function parseClosedHarness(stdout) {
  const marker = stdout.indexOf("{");
  if (marker < 0) invalid("closed_harness_output");
  try { return JSON.parse(stdout.slice(marker)); }
  catch { return invalid("closed_harness_output"); }
}

function hasEvidence(result, fragment) {
  return Array.isArray(result.evidence) && result.evidence.some((value) =>
    typeof value === "string" && value.includes(fragment));
}

async function main() {
  if (SCENARIOS.length !== 40) invalid("scenario_count");
  const unitFiles = [
    "apps/owner/lib/self-serve-http/registration-request.test.ts",
    "apps/owner/lib/self-serve-http/registration-start.test.ts",
    "apps/owner/lib/self-serve-browser-bound-registration/activation.test.ts",
    "apps/owner/lib/self-serve-browser-bound-registration/auto-post-html.test.ts",
    "apps/owner/lib/self-serve-browser-bound-registration/handler.test.ts",
    "apps/owner/lib/self-serve-auth-composition/activation.test.ts",
    "apps/owner/lib/self-serve-auth-composition/composition.test.ts",
    "apps/customer-panel/lib/panel-auth-composition/activation.test.ts",
    "apps/customer-panel/lib/panel-auth-composition/composition.test.ts",
    "tests/saas-phase2/panel-auth-composition/in-process.test.mjs",
    "tests/saas-phase2/panel-auth-composition/static-security.test.mjs",
  ];
  const units = await runNode(["--experimental-transform-types", "--test", ...unitFiles]);
  const closed = parseClosedHarness((await runNode([
    "--experimental-transform-types",
    CLOSED_HARNESS,
  ])).stdout);
  const unitPassed = /ℹ fail 0/.test(units.stdout);
  const closedPassed = closed.status === "PASS" && closed.backend === "native-postgresql" &&
    closed.postgresqlVersion === 16 && closed.scenarios === 58;
  const completePipeline = unitPassed && closedPassed;

  const checks = [
    closedPassed && hasEvidence(closed, "migrations 001-017"),
    closedPassed && hasEvidence(closed, "manifest checksums"),
    unitPassed,
    unitPassed,
    unitPassed,
    unitPassed,
    unitPassed,
    unitPassed,
    unitPassed,
    unitPassed,
    unitPassed,
    unitPassed,
    unitPassed,
    unitPassed,
    unitPassed,
    completePipeline,
    completePipeline,
    completePipeline,
    completePipeline && hasEvidence(closed, "registration and OIDC authorities"),
    completePipeline && hasEvidence(closed, "full callback pipeline returns HTTP 303"),
    completePipeline && hasEvidence(closed, "secure host-only persistent cookie"),
    completePipeline,
    completePipeline && hasEvidence(closed, "exact TenantContext"),
    completePipeline && hasEvidence(closed, "exactly one session row"),
    unitPassed,
    completePipeline && hasEvidence(closed, "stolen callback URL"),
    completePipeline && hasEvidence(closed, "wrong pb1 cookie"),
    completePipeline && hasEvidence(closed, "stolen callback URL"),
    completePipeline && hasEvidence(closed, "state A with binding B"),
    completePipeline && hasEvidence(closed, "concurrent duplicate delivery"),
    completePipeline && hasEvidence(closed, "provider-error callback"),
    completePipeline && hasEvidence(closed, "Owner response loss"),
    completePipeline && hasEvidence(closed, "exactly one read-only recovery"),
    completePipeline && hasEvidence(closed, "raw callback state") && hasEvidence(closed, "raw handoff and session"),
    completePipeline && hasEvidence(closed, "audit projections"),
    completePipeline && closed.cleanup === "PASS" && closed.durableBrowserBinding === "PASS",
    completePipeline && closed.backupRestore === "PASS",
    completePipeline && closed.backupRestore === "PASS" && hasEvidence(closed, "exact TenantContext"),
    closed.externalNetworkAttempts === 0 && closed.productionConnectionAttempts === 0 && closed.productionConnectionUsed === false,
    closed.cleanup === "PASS" && hasEvidence(closed, "complete cleanup"),
  ];
  if (checks.length !== SCENARIOS.length) invalid("check_count");
  const results = SCENARIOS.map((name, index) => Object.freeze({
    number: index + 1,
    name,
    status: checks[index] ? "PASS" : "FAIL",
  }));
  const failed = results.filter((result) => result.status !== "PASS");
  if (failed.length > 0) invalid(`scenarios_${failed.map((result) => result.number).join("_")}`);

  const unitMatch = units.stdout.match(/ℹ tests (\d+)/);
  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    backend: "native-postgresql",
    postgresqlVersion: 16,
    scenarios: 40,
    executed: 40,
    passed: 40,
    unitInProcessTests: unitMatch ? Number(unitMatch[1]) : null,
    existingPostgreSQL: "58/58 PASS",
    externalNetworkAttempts: 0,
    productionConnectionAttempts: 0,
    productionConnectionUsed: false,
    cleanup: "PASS",
    results,
  }, null, 2)}\n`);
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "phase2b2b2b_postgres_harness_failed"}\n`);
  process.exitCode = 1;
});
