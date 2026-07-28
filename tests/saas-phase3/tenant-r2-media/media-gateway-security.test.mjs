import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");

test("media gateway has one private binding and no deployment authority", () => {
  const wrangler = readFileSync(path.join(ROOT, "apps/media-gateway/wrangler.jsonc"), "utf8");
  assert.match(wrangler, /"binding": "MEDIA_BUCKET"/);
  assert.doesNotMatch(wrangler, /account_id|access_key|secret|production|route/i);
});

test("gateway source cannot list R2 or expose private import and export classes", () => {
  const source = readFileSync(path.join(ROOT, "apps/media-gateway/src/worker.ts"), "utf8");
  assert.doesNotMatch(source, /\.list\s*\(/);
  assert.doesNotMatch(source, /r2\.dev|r2\.cloudflarestorage\.com/);
  const authority = readFileSync(path.join(ROOT, "apps/media-gateway/src/key-authority.ts"), "utf8");
  assert.doesNotMatch(authority, /imports|exports/);
});
