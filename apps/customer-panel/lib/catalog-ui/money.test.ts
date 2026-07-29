import assert from "node:assert/strict";
import test from "node:test";

import { formatTurkishMoney, formatTurkishMoneyInput, parseTurkishMoneyToCents } from "./money.ts";

test("Turkish decimal money converts to exact integer cents", () => {
  assert.equal(parseTurkishMoneyToCents("0"), 0);
  assert.equal(parseTurkishMoneyToCents("12"), 1_200);
  assert.equal(parseTurkishMoneyToCents("12,5"), 1_250);
  assert.equal(parseTurkishMoneyToCents("12,50"), 1_250);
  assert.equal(parseTurkishMoneyToCents("1234,56"), 123_456);
  assert.equal(formatTurkishMoney(123_456), "1.234,56");
  assert.equal(formatTurkishMoneyInput(123_456), "1234,56");
});

test("money precision is rejected instead of rounded", () => {
  for (const value of ["12,501", "12.50", "01,00", "-1", " 12,50", "12,50 ", "", "1e3", "NaN"]) {
    assert.throws(() => parseTurkishMoneyToCents(value), /catalog_money_invalid/);
  }
});

test("money conversion rejects values outside the safe integer range", () => {
  assert.throws(() => parseTurkishMoneyToCents("900719925474099,99"), /catalog_money_invalid/);
});
