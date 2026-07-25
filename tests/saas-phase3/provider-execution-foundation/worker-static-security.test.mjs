import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const WORKER = readFileSync(path.join(ROOT, "apps/owner/lib/merchant-provider-execution/worker.ts"), "utf8");
const REGISTRY = readFileSync(path.join(ROOT, "apps/owner/lib/merchant-provider-execution/registry.ts"), "utf8");
const TYPES = readFileSync(path.join(ROOT, "apps/owner/lib/merchant-provider-execution/types.ts"), "utf8");
const SOURCE = `${WORKER}\n${REGISTRY}\n${TYPES}`;

test("production provider registry is frozen and contains zero adapters", () => {
  const production = /export function createProductionMerchantProviderRegistry[\s\S]*?\n}/.exec(REGISTRY)?.[0] ?? "";
  assert.match(production, /createMerchantProviderAdapterRegistry\(Object\.freeze\(\[\]\)\)/);
  assert.doesNotMatch(production, /providerCode|validateCredential|execute\s*\(/);
  assert.match(REGISTRY, /Object\.isFrozen\(value\)/);
  assert.match(REGISTRY, /entries\.has\(key\)/);
});

test("worker core has no environment scheduler route network or logging authority", () => {
  assert.doesNotMatch(SOURCE, /process\.env|NEXT_PUBLIC_|setInterval|setTimeout|cron|schedule|route\.ts|NextRequest|NextResponse/);
  assert.doesNotMatch(SOURCE, /\bfetch\s*\(|axios|node:https|node:http|https?:\/\//);
  assert.doesNotMatch(SOURCE, /console\.|logger|authorization|cookie|access[_-]?token|refresh[_-]?token|api[_-]?secret/i);
});

test("worker stops before claiming when disabled and zeroes opened credentials", () => {
  const run = /export async function runMerchantProviderWorkerOnce[\s\S]*?\n}/.exec(WORKER)?.[0] ?? "";
  assert.match(run, /options\.registry\.size === 0\) return result\("disabled"\)/);
  assert.ok(run.indexOf("registry.size === 0") < run.indexOf("claimProfileValidation"));
  assert.match(WORKER, /finally \{\s*credential\?\.fill\(0\);\s*}/);
  assert.match(WORKER, /claimProfileValidation[\s\S]*options\.repository\.claim\(/);
  assert.match(WORKER, /options\.repository\.finalize\(/);
  assert.doesNotMatch(WORKER, /queueProviderJob|prepareProviderJob/);
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
