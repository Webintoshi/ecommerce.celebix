import { boundedInteger, documentId, record, searchFailure } from "./common.ts";
import { CatalogSearchHttp } from "./http.ts";
import { parseCatalogSearchJob } from "./validation.ts";
import type { CatalogSearchIndexer, MeilisearchCatalogSearchIndexerOptions } from "./types.ts";

class FailedTask extends Error {
  readonly alreadyExists: boolean;
  constructor(alreadyExists: boolean) { super("catalog search task failed"); this.alreadyExists = alreadyExists; }
}

export function createMeilisearchCatalogSearchIndexer(options: MeilisearchCatalogSearchIndexerOptions): CatalogSearchIndexer {
  const http = new CatalogSearchHttp(options);
  const taskTimeoutMs = boundedInteger(options.taskTimeoutMs ?? 10_000, 1, 45_000);
  const pollMs = boundedInteger(options.taskPollMs ?? 100, 1, 1000);
  const onIndexCreated = options.onIndexCreated;
  if (onIndexCreated !== undefined && typeof onIndexCreated !== "function") searchFailure();
  let ready: Promise<void> | undefined;
  let resyncPending = false;
  async function waitTask(taskUid: unknown, deadline: number): Promise<void> {
    const uid = boundedInteger(taskUid, 0, Number.MAX_SAFE_INTEGER);
    while (Date.now() < deadline) {
      const response = await http.request(`/tasks/${uid}`, "GET", undefined, Math.min(http.timeoutMs, deadline - Date.now()));
      if (response.status !== 200 || response.data.uid !== uid || response.data.indexUid !== http.index) searchFailure();
      const status = response.data.status;
      if (status === "succeeded") return;
      if (status === "failed" || status === "canceled") {
        const error = response.data.error;
        throw new FailedTask(Boolean(error && typeof error === "object" && record(error).code === "index_already_exists"));
      }
      if (status !== "enqueued" && status !== "processing") searchFailure();
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(pollMs, remaining)));
    }
    searchFailure();
  }
  async function submit(path: string, method: string, body?: unknown): Promise<void> {
    const deadline = Date.now() + taskTimeoutMs;
    const response = await http.request(path, method, body, Math.min(http.timeoutMs, taskTimeoutMs));
    if (response.status !== 202) searchFailure();
    await waitTask(response.data.taskUid, deadline);
  }
  async function verifyIndex(): Promise<void> {
    const response = await http.request(`/indexes/${http.index}`);
    if (response.status !== 200 || response.data.uid !== http.index || response.data.primaryKey !== "id") searchFailure();
  }
  async function prepare(): Promise<void> {
    const existing = await http.request(`/indexes/${http.index}`);
    if (existing.status === 404 && existing.data.code === "index_not_found") {
      // Retain this flag if creation, settings, or the database resync times out.
      resyncPending = true;
      try { await submit("/indexes", "POST", { uid: http.index, primaryKey: "id" }); }
      catch (error) { if (!(error instanceof FailedTask) || !error.alreadyExists) throw error; await verifyIndex(); }
    } else if (existing.status !== 200 || existing.data.uid !== http.index || existing.data.primaryKey !== "id") searchFailure();
    await submit(`/indexes/${http.index}/settings`, "PATCH", {
      displayedAttributes: ["storeId", "productId"],
      searchableAttributes: ["skus", "barcodes", "searchText", "title"],
      filterableAttributes: ["storeId", "skus", "barcodes"],
      sortableAttributes: [],
      rankingRules: ["words", "typo", "proximity", "attribute", "sort", "exactness"],
      typoTolerance: { disableOnAttributes: ["skus", "barcodes"] },
      pagination: { maxTotalHits: 10_000 },
    });
    if (resyncPending) {
      if (onIndexCreated) await onIndexCreated();
      resyncPending = false;
    }
  }
  async function ensureReady(): Promise<void> {
    if (!ready) ready = prepare().catch(() => { ready = undefined; searchFailure(); });
    await ready;
  }
  return {
    ensureReady,
    async apply(value) {
      const job = parseCatalogSearchJob(value);
      await ensureReady();
      try {
        if (job.document) await submit(`/indexes/${http.index}/documents`, "POST", [job.document]);
        else await submit(`/indexes/${http.index}/documents/${documentId(job.storeId, job.productId)}`, "DELETE");
      } catch {
        // The engine may have lost its index/volume since the last setup.
        ready = undefined;
        searchFailure();
      }
    },
  };
}
