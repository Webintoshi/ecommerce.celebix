import assert from "node:assert/strict";
import test from "node:test";

type ParseDecimal = (value: unknown, fractionDigits: 6 | 8) => string | null;

async function parser(): Promise<ParseDecimal> {
  try {
    const module = await import("./decimal.ts");
    assert.equal(typeof module.parseTurkishPricingDecimal, "function");
    return module.parseTurkishPricingDecimal;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ERR_MODULE_NOT_FOUND") {
      assert.fail("parseTurkishPricingDecimal is not implemented yet");
    }
    throw error;
  }
}

test("plain Turkish amounts become canonical decimal strings without adding precision", async () => {
  const parse = await parser();
  assert.equal(parse("2,5", 8), "2.5");
  assert.equal(parse("125", 8), "125");
  assert.equal(parse("0,00000001", 8), "0.00000001");
  assert.equal(parse("3,1200", 8), "3.12");
});

test("properly grouped Turkish amounts become ungrouped canonical strings", async () => {
  const parse = await parser();
  assert.equal(parse("5.000,50", 8), "5000.5");
  assert.equal(parse("1.234.567,89000000", 8), "1234567.89");
  assert.equal(parse("12.345,00", 8), "12345");
});

test("rates and source amounts allow eight decimal places while grams allow six", async () => {
  const parse = await parser();
  assert.equal(parse("2,12345678", 8), "2.12345678");
  assert.equal(parse("2,12345678", 6), null);
  assert.equal(parse("2,123456", 6), "2.123456");
  assert.equal(parse("2,1234567", 6), null);
  assert.equal(parse("2,123456789", 8), null);
});

test("ambiguous dotted integers and invalid Turkish grouping are rejected", async () => {
  const parse = await parser();
  for (const value of [
    "5.000", "1.234.567", "12.34,50", "1.23.456,78", "1234.567,89",
    "0.123,45", "1,234.56", "1.000.50", "1..000,50",
  ]) {
    assert.equal(parse(value, 8), null, value);
  }
});

test("malformed, signed, scientific, padded, and non-string values are rejected", async () => {
  const parse = await parser();
  for (const value of [
    "", " 2,5", "2,5 ", "01,5", "00", "1,", ",5", "1,2,3",
    "-1", "+1", "1e3", "NaN", "Infinity", "1 000,50", "1\u00a0000,50",
    "2.5", 2.5, null, undefined,
  ]) {
    assert.equal(parse(value, 8), null, String(value));
  }
});

test("canonicalization preserves large decimal digits exactly without floating-point conversion", async () => {
  const parse = await parser();
  assert.equal(parse("9007199254740990,12345678", 8), "9007199254740990.12345678");
  assert.equal(parse("0,000000", 6), "0");
});

test("the strict API safe-integer ceiling is enforced without rounding or truncation", async () => {
  const parse = await parser();
  assert.equal(parse("9007199254740991", 8), "9007199254740991");
  assert.equal(parse("9007199254740991,1", 8), null);
  assert.equal(parse("9007199254740992", 8), null);
  assert.equal(parse("12345678901234567890,1", 8), null);
});
