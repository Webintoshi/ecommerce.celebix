import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

export function percentile95(samples) {
  assert.ok(Array.isArray(samples) && samples.length >= 5, "at least five performance samples are required");
  assert.ok(samples.every((value) => Number.isFinite(value) && value >= 0), "performance samples must be finite non-negative milliseconds");
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.95) - 1];
}

export function assertPromotionPerformanceBudget({ warmSamplesMs, coldSamplesMs }) {
  const warmP95Ms = percentile95(warmSamplesMs);
  const coldP95Ms = percentile95(coldSamplesMs);
  assert.ok(warmP95Ms <= 100, `warm promotion evaluator p95 exceeded 100 ms: ${warmP95Ms}`);
  assert.ok(coldP95Ms <= 250, `cold promotion evaluator p95 exceeded 250 ms: ${coldP95Ms}`);
  return Object.freeze({
    warmP95Ms: Number(warmP95Ms.toFixed(3)),
    coldP95Ms: Number(coldP95Ms.toFixed(3)),
    warmSampleCount: warmSamplesMs.length,
    coldSampleCount: coldSamplesMs.length,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(percentile95([5, 1, 4, 2, 3]), 5);
  process.stdout.write("PASS 1/2 percentile selection is stable\n");
  assert.deepEqual(assertPromotionPerformanceBudget({
    warmSamplesMs: [10, 11, 12, 13, 14],
    coldSamplesMs: [30, 35, 40, 45, 50],
  }), { warmP95Ms: 14, coldP95Ms: 50, warmSampleCount: 5, coldSampleCount: 5 });
  process.stdout.write("PASS 2/2 performance budget rejects regressions\n");
  process.stdout.write("PROMOTIONS_PERFORMANCE_HELPER_COMPLETE 2/2\n");
}
