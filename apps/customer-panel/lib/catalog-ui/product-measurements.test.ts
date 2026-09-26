import assert from "node:assert/strict";
import test from "node:test";
import { formatMeasurementValue, measurementsToDraft, parseProductMeasurements } from "./product-measurements.ts";

test("optional measurements omit blank values, accept comma and dot, and preserve exact three decimals", () => {
  assert.deepEqual(parseProductMeasurements(), { ok: true, value: undefined });
  assert.deepEqual(parseProductMeasurements({ weight: " ", weightUnit: "kg", width: "" }), { ok: true, value: undefined });
  assert.deepEqual(parseProductMeasurements({ weight: "14,89", width: "0.125", volume: "250", packageCount: "6" }), {
    ok: true, value: { weight: { valueMilli: 14890, unit: "g" }, width: { valueMilli: 125, unit: "cm" }, volume: { valueMilli: 250000, unit: "ml" }, packageCount: 6 },
  });
  assert.deepEqual(parseProductMeasurements({ weight: "14.89", weightUnit: "kg", height: "2,005", heightUnit: "m", area: "4,8" }), {
    ok: true, value: { weight: { valueMilli: 14890, unit: "kg" }, height: { valueMilli: 2005, unit: "m" }, area: { valueMilli: 4800, unit: "m2" } },
  });
});

test("stored measurements restore without precision loss through editing, including the safe integer boundary", () => {
  const measurements = { weight: { valueMilli: 14890, unit: "g" as const }, volume: { valueMilli: 9007199254740991, unit: "l" as const }, length: { valueMilli: 1000, unit: "m" as const }, packageCount: 9007199254740991 };
  assert.equal(formatMeasurementValue(9007199254740991), "9007199254740,991");
  assert.deepEqual(parseProductMeasurements(measurementsToDraft(measurements)), { ok: true, value: measurements });
  assert.equal(parseProductMeasurements({ weight: "14,89", injected: "value" } as never).ok, false);
});

test("filled invalid measurements fail without rounding, inventing zero, or requiring other dimensions", () => {
  for (const weight of ["0", "-1", "1.2345", "1,234.5", "1e3", "NaN", "9007199254741"]) assert.equal(parseProductMeasurements({ weight }).ok, false, weight);
  for (const packageCount of ["0", "1,5", "-1", "9007199254740992"]) assert.equal(parseProductMeasurements({ packageCount }).ok, false);
  assert.equal(parseProductMeasurements({ weight: "1", weightUnit: "cm" }).ok, false);
  assert.deepEqual(parseProductMeasurements({ depth: "45" }), { ok: true, value: { depth: { valueMilli: 45000, unit: "cm" } } });
});
