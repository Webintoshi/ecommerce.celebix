import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = path.resolve(import.meta.dirname, "202609050126_promotions_studio.up.sql");

test("promotion migration preserves migration-first checkout compatibility", () => {
  const source = readFileSync(sql, "utf8");
  assert.match(source, /promotion_evaluate_v1/);
  assert.match(source, /promotion_evaluator_context_valid/);
  assert.match(source, /promotion_evaluator_line_matches/);
  assert.doesNotMatch(source, /CREATE OR REPLACE FUNCTION saas[.](?:public_checkout_quote|complete_order|hosted_checkout)/);
  assert.match(source, /SET LOCAL lock_timeout = '5s'/);
  assert.match(source, /SET LOCAL statement_timeout = '120s'/);
});
