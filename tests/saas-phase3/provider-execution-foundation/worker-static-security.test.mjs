import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const WORKER = readFileSync(path.join(ROOT, "apps/owner/lib/merchant-provider-execution/worker.ts"), "utf8");
const REGISTRY = readFileSync(path.join(ROOT, "apps/owner/lib/merchant-provider-execution/registry.ts"), "utf8");
const TYPES = readFileSync(path.join(ROOT, "apps/owner/lib/merchant-provider-execution/types.ts"), "utf8");
const IYZICO = readFileSync(path.join(ROOT, "apps/owner/lib/merchant-provider-execution/iyzico-validation-adapter.ts"), "utf8");
const CONFIG = readFileSync(path.join(ROOT, "apps/owner/lib/merchant-provider-execution/production-config.ts"), "utf8");
const PRODUCTION = readFileSync(path.join(ROOT, "apps/owner/lib/merchant-provider-execution/production.ts"), "utf8");
const SOURCE = `${WORKER}\n${REGISTRY}\n${TYPES}`;

test("production registries keep Iyzico verification separate and compile no PayTR or Iyzico execution authority", () => {
  const production = REGISTRY.slice(REGISTRY.indexOf("export function createProductionMerchantProviderRegistries"));
  assert.match(production, /createMerchantProviderAdapterRegistry\(Object\.freeze\(execution\)\)/);
  assert.match(production, /createMerchantProviderVerificationAdapterRegistry\(Object\.freeze\(verification\)\)/);
  assert.match(production, /createIyzicoValidationAdapter/);
  assert.match(production, /if \(authorities\.iyzico_iframe !== null\) invalid\(\)/);
  assert.match(CONFIG, /Object\.freeze\(\{ iyzico_iframe: null, paytr_iframe: null \}\)/);
  assert.doesNotMatch(production, /process\.env|fetch\s*\(|credential|secret/i);
  assert.match(REGISTRY, /Object\.isFrozen\(value\)/);
  assert.match(REGISTRY, /entries\.has\(key\)/);
});

test("Iyzico verification adapter has validation identity but no execution queue authority", () => {
  assert.match(IYZICO, /validateIyzicoCredentialWithTransport/);
  assert.match(IYZICO, /providerCode: "iyzico_iframe"/);
  assert.match(IYZICO, /validationIdentity:/);
  assert.match(IYZICO, /const UINT8_ARRAY_FILL = Uint8Array[.]prototype[.]fill/);
  assert.match(IYZICO, /Reflect[.]apply\(UINT8_ARRAY_FILL, value, \[0\]\)/);
  assert.doesNotMatch(IYZICO, /credential\?\.fill\(0\)/);
  assert.doesNotMatch(IYZICO, /executionAuthority|\bexecute\s*\(|\breconcile\s*\(/);
});

test("worker core has no environment scheduler route network or logging authority", () => {
  assert.doesNotMatch(SOURCE, /process\.env|NEXT_PUBLIC_|setInterval|setTimeout|cron|schedule|route\.ts|NextRequest|NextResponse/);
  assert.doesNotMatch(SOURCE, /\bfetch\s*\(|axios|node:https|node:http|https?:\/\//);
  assert.doesNotMatch(SOURCE, /console\.|logger|authorization|cookie|access[_-]?token|refresh[_-]?token|api[_-]?secret/i);
});

test("worker exhausts the separate verification lane before legacy validation and execution queues", () => {
  const run = /export async function runMerchantProviderWorkerOnce[\s\S]*?\n}/.exec(WORKER)?.[0] ?? "";
  assert.match(run, /options\.registry\.size === 0 && options\.verificationRegistry\.size === 0/);
  assert.ok(run.indexOf("verificationRegistry.list()") < run.indexOf("registry.list()"));
  assert.ok(run.indexOf("claimProfileVerification") < run.indexOf("claimProfileValidation"));
  assert.ok(run.indexOf("claimProfileValidation") < run.indexOf("repository.claim("));
  assert.match(WORKER, /const UINT8_ARRAY_FILL = Uint8Array[.]prototype[.]fill/);
  assert.match(WORKER, /Reflect[.]apply\(UINT8_ARRAY_FILL, value, \[0\]\)/);
  assert.doesNotMatch(WORKER, /credential\?\.fill\(0\)/);
  assert.match(WORKER, /markProfileVerification/);
  assert.match(WORKER, /classification = "profile_unavailable"/);
  assert.match(WORKER, /classification === "profile_unavailable" \? "unavailable"/);
  assert.match(WORKER, /options\.repository\.finalize\(/);
  assert.doesNotMatch(WORKER, /queueProviderJob|prepareProviderJob/);
});

test("production preflight uses only the literal 056 provider-keyed lifecycle function", () => {
  const preflight = /async function preflight[\s\S]*?\n}/.exec(PRODUCTION)?.[0] ?? "";
  assert.match(preflight, /to_regprocedure\('saas\.payment_provider_keyed_lifecycle_preflight\(\)'\)/);
  assert.match(preflight, /saas\.payment_provider_keyed_lifecycle_preflight\(\)/);
  assert.doesNotMatch(preflight, /paytr_iframe_activation_preflight|EXECUTE|format\s*\(|\$\{/);
});

test("provider audit envelope exposes only fixed safe classification fields", () => {
  assert.match(TYPES, /operation: "validate" \| "execute" \| "reconcile"/);
  assert.match(TYPES, /classification: MerchantProviderWorkerResult\["kind"\]/);
  assert.match(TYPES, /providerCode: string/);
  assert.match(TYPES, /capability: MerchantProviderCapability/);
  const auditBody = /async function audit[\s\S]*?\n}/.exec(WORKER)?.[0] ?? "";
  assert.match(auditBody, /\{ operation, classification, providerCode: adapter\.providerCode, capability: adapter\.capability }/);
  assert.doesNotMatch(auditBody, /credential|publicConfig|job|profileId|storeId/);
});
