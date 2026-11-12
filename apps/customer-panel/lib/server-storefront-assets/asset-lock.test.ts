import assert from "node:assert/strict";
import test from "node:test";
import { createStorefrontAssetLock } from "./asset-lock.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const ASSET = "30000000-0000-4000-8000-000000000001";

test("storefront mutations hold the tenant asset lock through publication and release it on failure", async () => {
  const calls: unknown[][] = [];
  const lock = createStorefrontAssetLock({
    async connect() {
      return {
        on() {},
        off() {},
        async query(query: string, args?: unknown[]) { calls.push([query, args]); },
        release(destroy: boolean) { calls.push(["release", destroy]); },
      };
    },
  } as never);
  const publishFailure = new Error("storage unavailable");
  await assert.rejects(lock(STORE, ASSET, async () => {
    calls.push(["mutation and publication"]);
    throw publishFailure;
  }), publishFailure);
  assert.deepEqual(calls, [
    ["BEGIN", undefined],
    ["SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::text, 0))", [`celebix.panel.storefront-asset:${STORE}:${ASSET}`]],
    ["mutation and publication"],
    ["ROLLBACK", undefined],
    ["release", false],
  ]);
});
