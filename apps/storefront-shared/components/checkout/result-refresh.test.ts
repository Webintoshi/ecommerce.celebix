import assert from "node:assert/strict";
import test from "node:test";

import { nextCheckoutResultRefreshAttempt } from "./result-refresh.ts";

test("processing refresh stops after five server refreshes", () => {
  let attempt: number | null = 0;
  const observed: number[] = [];
  while (attempt !== null) {
    attempt = nextCheckoutResultRefreshAttempt(attempt);
    if (attempt !== null) observed.push(attempt);
  }
  assert.deepEqual(observed, [1, 2, 3, 4, 5]);
  assert.equal(nextCheckoutResultRefreshAttempt(5), null);
});

test("processing refresh rejects invented counters", () => {
  for (const value of [-1, 1.5, 6, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => nextCheckoutResultRefreshAttempt(value),
      /checkout_result_refresh_invalid/,
    );
  }
});
