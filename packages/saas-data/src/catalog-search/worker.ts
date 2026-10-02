import { randomUUID } from "node:crypto";
import { storefrontContentDate, storefrontContentUuid } from "../storefront-content/validation.ts";
import { assertCatalogSearchServer, boundedInteger, searchFailure } from "./common.ts";
import { parseCatalogSearchJobs } from "./validation.ts";
import type { CatalogSearchWorkerOptions, CatalogSearchWorkerResult } from "./types.ts";

export async function runCatalogSearchWorkerOnce(options: CatalogSearchWorkerOptions): Promise<CatalogSearchWorkerResult> {
  assertCatalogSearchServer();
  const limit = boundedInteger(options.limit ?? 20, 1, 100);
  const leaseId = storefrontContentUuid(options.leaseId ?? randomUUID());
  const now = options.now ?? (() => new Date());
  // Bootstrap precedes claiming, so settings tasks cannot consume a job lease.
  await options.indexer.ensureReady();
  const jobs = parseCatalogSearchJobs(await options.repository.claim({ now: storefrontContentDate(now()), limit, leaseId }), limit);
  // Bounded concurrent tasks complete inside the database's 60 second lease.
  const outcomes = await Promise.allSettled(jobs.map(async (job) => {
    let error: string | null = null;
    try { await options.indexer.apply(job); }
    catch { error = "catalog_search_indexing_failed"; }
    return options.repository.acknowledge({ leaseId, storeId: job.storeId, productId: job.productId, generation: job.generation, now: storefrontContentDate(now()), error });
  }));
  const counts = { claimed: jobs.length, acknowledged: 0, retried: 0, stale: 0 };
  for (const outcome of outcomes) {
    if (outcome.status !== "fulfilled") searchFailure();
    if (outcome.value === "acknowledged") counts.acknowledged++;
    else if (outcome.value === "retry") counts.retried++;
    else if (outcome.value === "stale") counts.stale++;
    else searchFailure();
  }
  return Object.freeze(counts);
}
