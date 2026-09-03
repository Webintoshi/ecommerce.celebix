import assert from "node:assert/strict";
import test from "node:test";

import type { Cache } from "@celebix/saas-cache";

import { createPostCommitInvalidatingRepository } from "./invalidation.ts";

const STORE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const input = Object.freeze({ tenantContext: Object.freeze({ store: Object.freeze({ id: STORE_ID }) }) });

function cacheFixture(fail = false) {
  const rotations: string[] = [];
  const cache = {
    async rotateNamespace(storeId: string, dataClass: "catalog" | "settings") {
      rotations.push(`${storeId}:${dataClass}`);
      if (fail) throw new Error("down");
    },
  } as unknown as Cache;
  return { cache, rotations };
}

test("successful mutation rotates each configured tenant namespace after the repository resolves", async () => {
  const order: string[] = [];
  const selected = cacheFixture();
  const repository = createPostCommitInvalidatingRepository({
    async save(received: typeof input) { assert.equal(received, input); order.push("commit"); return { ok: true }; },
    async get() { return { ok: true }; },
  }, { save: ["catalog", "settings"] }, selected.cache, (event) => order.push(event));
  assert.deepEqual(await repository.save(input), { ok: true });
  assert.deepEqual(selected.rotations, [`${STORE_ID}:catalog`, `${STORE_ID}:settings`]);
  assert.deepEqual(order, ["commit", "invalidation:catalog", "invalidation:settings"]);
  await repository.get();
  assert.equal(selected.rotations.length, 2);
});

test("failed mutation never invalidates", async () => {
  const selected = cacheFixture();
  const repository = createPostCommitInvalidatingRepository({ async save(_received: unknown) { throw new Error("rollback"); } }, { save: ["catalog"] }, selected.cache);
  await assert.rejects(() => repository.save(input), /rollback/);
  assert.deepEqual(selected.rotations, []);
});

test("Redis invalidation failure is fail-open after a successful authoritative commit", async () => {
  const selected = cacheFixture(true);
  const repository = createPostCommitInvalidatingRepository({ async save(_received: unknown) { return { committed: true }; } }, { save: ["catalog"] }, selected.cache);
  assert.deepEqual(await repository.save(input), { committed: true });
});

test("invalid or absent tenant context never manufactures a cache key", async () => {
  const selected = cacheFixture();
  const repository = createPostCommitInvalidatingRepository({ async save(_received: unknown) { return { committed: true }; } }, { save: ["catalog"] }, selected.cache);
  assert.deepEqual(await repository.save({ tenantContext: { store: { id: "../../foreign" } } }), { committed: true });
  assert.deepEqual(selected.rotations, []);
});
