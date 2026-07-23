import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogImportPreview } from "@celebix/saas-contracts";

import {
  createCatalogImportPreparationController,
  type CatalogImportPreparationApi,
  type CatalogImportPreparationFile,
} from "./catalog-admin-ui/import-preparation-controller.ts";

const PREVIEW_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-07-23T10:00:00.000Z");
const CONTENT = "title,slug,priceCents,sku,stockQuantity\nYerel,yerel,1000,YRL,1";
const FILE: CatalogImportPreparationFile = Object.freeze({
  name: "products.csv",
  size: CONTENT.length,
  async text() { return CONTENT; },
});

function preview(
  status: CatalogImportPreview["status"] = "prepared",
  overrides: Partial<CatalogImportPreview> = {},
): CatalogImportPreview {
  const row = Object.freeze({ title: "Kalıcı", slug: "kalici", priceCents: 2500, sku: "KLC", stockQuantity: 3 });
  return Object.freeze({
    id: PREVIEW_ID,
    format: "native_csv",
    fileName: "products.csv",
    digest: "a".repeat(64),
    status,
    rows: Object.freeze([row]),
    totalRows: 1,
    version: status === "consumed" ? 4 : 3,
    expiresAt: "2026-07-23T10:05:00.000Z",
    createdAt: "2026-07-23T09:59:00.000Z",
    updatedAt: "2026-07-23T10:00:00.000Z",
    ...overrides,
  });
}

function mutation(id = JOB_ID) {
  return Object.freeze({ id, version: 1, status: "completed", updatedAt: "2026-07-23T10:00:01.000Z", replayed: false });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function tick() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

function controller(api: CatalogImportPreparationApi) {
  return createCatalogImportPreparationController({
    api,
    canImport: true,
    format: "native_csv",
    now: () => NOW,
  });
}

test("prepares persisted rows before an explicit versioned commit and refreshes the original preview ID", async () => {
  const prepareCalls: unknown[] = [];
  const getCalls: string[] = [];
  const commitCalls: Array<readonly [string, number]> = [];
  const canonical = preview("prepared");
  const consumed = preview("consumed");
  const api: CatalogImportPreparationApi = {
    async prepareImportPreview(input, signal) {
      prepareCalls.push({ input, signal });
      return preview("prepared", { rows: Object.freeze([{ title: "Hazırlık cevabı", slug: "hazirlik", priceCents: 1, stockQuantity: 1 }]) });
    },
    async getImportPreview(id) {
      getCalls.push(id);
      return getCalls.length === 1 ? canonical : consumed;
    },
    async commitImportPreview(id, version) {
      commitCalls.push([id, version]);
      return mutation(JOB_ID);
    },
  };
  const subject = controller(api);

  await subject.prepare(FILE);
  assert.equal(prepareCalls.length, 1);
  assert.equal(commitCalls.length, 0);
  assert.deepEqual(subject.getSnapshot().preview?.rows, canonical.rows);
  assert.equal(subject.getSnapshot().preview?.rows[0]?.title, "Kalıcı");

  await subject.commit();
  assert.deepEqual(commitCalls, [[PREVIEW_ID, 3]]);
  assert.deepEqual(getCalls, [PREVIEW_ID, PREVIEW_ID]);
  assert.equal(subject.getSnapshot().phase, "consumed");
  assert.match(subject.getSnapshot().notice, /1 ürün kalıcı kataloğa aktarıldı/);
});

test("keeps commit locked and reports verification unavailable when post-commit refresh fails", async () => {
  let getCount = 0;
  let commitCount = 0;
  const subject = controller({
    async prepareImportPreview() { return preview(); },
    async getImportPreview(id) {
      assert.equal(id, PREVIEW_ID);
      getCount += 1;
      if (getCount === 1) return preview();
      throw new Error("refresh unavailable");
    },
    async commitImportPreview() { commitCount += 1; return mutation(); },
  });
  await subject.prepare(FILE);
  await subject.commit();

  assert.equal(subject.getSnapshot().phase, "verification_unavailable");
  assert.equal(subject.getSnapshot().canCommit, false);
  assert.match(subject.getSnapshot().notice, /sonucu doğrulanamadı/i);
  assert.doesNotMatch(subject.getSnapshot().notice, /kataloğa aktarıldı/i);
  await subject.commit();
  assert.equal(commitCount, 1);
});

test("does not announce completion or unlock when a successful commit refresh remains prepared", async () => {
  let getCount = 0;
  let commitCount = 0;
  const subject = controller({
    async prepareImportPreview() { return preview(); },
    async getImportPreview(id) { assert.equal(id, PREVIEW_ID); getCount += 1; return preview("prepared", { version: getCount + 2 }); },
    async commitImportPreview() { commitCount += 1; return mutation(); },
  });
  await subject.prepare(FILE);
  await subject.commit();

  assert.equal(subject.getSnapshot().phase, "verification_unavailable");
  assert.equal(subject.getSnapshot().canCommit, false);
  assert.doesNotMatch(subject.getSnapshot().notice, /kataloğa aktarıldı/i);
  await subject.commit();
  assert.equal(commitCount, 1);
});

test("distinguishes a rejected mutation when canonical state proves a retry is safe", async () => {
  let getCount = 0;
  let commitCount = 0;
  const subject = controller({
    async prepareImportPreview() { return preview(); },
    async getImportPreview() { getCount += 1; return preview("prepared", { version: getCount + 2 }); },
    async commitImportPreview() { commitCount += 1; throw new Error("request rejected"); },
  });
  await subject.prepare(FILE);
  await subject.commit();

  assert.equal(subject.getSnapshot().phase, "mutation_rejected");
  assert.equal(subject.getSnapshot().canCommit, true);
  assert.match(subject.getSnapshot().error, /uygulanmadı/i);
  assert.doesNotMatch(subject.getSnapshot().error, /tamamlanamadı/i);
  assert.equal(commitCount, 1);
});

test("invalidates stale prepare and persisted-preview reads on file transitions", async () => {
  const preparePending = deferred<CatalogImportPreview>();
  let prepareSignal: AbortSignal | undefined;
  let getCount = 0;
  const first = controller({
    async prepareImportPreview(_input, signal) { prepareSignal = signal; return preparePending.promise; },
    async getImportPreview() { getCount += 1; return preview(); },
    async commitImportPreview() { return mutation(); },
  });
  const preparing = first.prepare(FILE);
  await tick();
  first.resetSelection();
  assert.equal(prepareSignal?.aborted, true);
  preparePending.resolve(preview());
  await preparing;
  assert.equal(getCount, 0);
  assert.equal(first.getSnapshot().phase, "idle");

  const getPending = deferred<CatalogImportPreview>();
  let getSignal: AbortSignal | undefined;
  const second = controller({
    async prepareImportPreview() { return preview(); },
    async getImportPreview(_id, signal) { getSignal = signal; return getPending.promise; },
    async commitImportPreview() { return mutation(); },
  });
  const reading = second.prepare(FILE);
  await tick();
  second.resetSelection();
  assert.equal(getSignal?.aborted, true);
  getPending.resolve(preview());
  await reading;
  assert.equal(second.getSnapshot().phase, "idle");
  assert.equal(second.getSnapshot().preview, undefined);
});

test("dispose aborts in-flight work and suppresses unmounted updates", async () => {
  const pending = deferred<CatalogImportPreview>();
  let signal: AbortSignal | undefined;
  const states: string[] = [];
  const subject = createCatalogImportPreparationController({
    api: {
      async prepareImportPreview(_input, requestSignal) { signal = requestSignal; return pending.promise; },
      async getImportPreview() { return preview(); },
      async commitImportPreview() { return mutation(); },
    },
    canImport: true,
    format: "native_csv",
    now: () => NOW,
    onChange(snapshot) { states.push(snapshot.phase); },
  });
  const work = subject.prepare(FILE);
  await tick();
  subject.dispose();
  const countAtDispose = states.length;
  assert.equal(signal?.aborted, true);
  pending.resolve(preview());
  await work;
  assert.equal(states.length, countAtDispose);
});

test("a synchronous double commit invokes mutation exactly once", async () => {
  const commitPending = deferred<ReturnType<typeof mutation>>();
  let getCount = 0;
  let commitCount = 0;
  const subject = controller({
    async prepareImportPreview() { return preview(); },
    async getImportPreview() { getCount += 1; return getCount === 1 ? preview() : preview("consumed"); },
    async commitImportPreview() { commitCount += 1; return commitPending.promise; },
  });
  await subject.prepare(FILE);
  const first = subject.commit();
  const second = subject.commit();
  assert.equal(commitCount, 1);
  commitPending.resolve(mutation());
  await Promise.all([first, second]);
  assert.equal(commitCount, 1);
  assert.equal(subject.getSnapshot().phase, "consumed");
});

test("expired, consumed, and expiry-boundary previews deny commit", async () => {
  for (const canonical of [
    preview("expired"),
    preview("consumed"),
    preview("prepared", { expiresAt: new Date(NOW).toISOString() }),
  ]) {
    let commitCount = 0;
    const subject = controller({
      async prepareImportPreview() { return preview(); },
      async getImportPreview() { return canonical; },
      async commitImportPreview() { commitCount += 1; return mutation(); },
    });
    await subject.prepare(FILE);
    assert.equal(subject.getSnapshot().canCommit, false);
    await subject.commit();
    assert.equal(commitCount, 0);
  }
});
