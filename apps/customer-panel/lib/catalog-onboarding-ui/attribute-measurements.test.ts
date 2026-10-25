import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogAdminResource } from "@celebix/saas-contracts";
import { parseAttributeMeasurementValue, attributeValueIdentity, attributeMeasurementDraft } from "./attribute-measurements.ts";
import { parseProductMeasurements } from "../catalog-ui/product-measurements.ts";

const resource = (config: CatalogAdminResource["config"], key = "net-weight"): CatalogAdminResource => ({ id: key, kind: "attribute", name: "Friendly label", slug: "friendly-label", config: { key, ...config }, status: "active", productIds: [], productCount: 0, version: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });

test("bound measurement values accept exact compatible units and Turkish decimal spacing", () => {
  for (const [field, raw, want] of [
    ["weight", " 250 g ", { weight: "250", weightUnit: "g" }],
    ["weight", "1,250\u00a0kg", { weight: "1,25", weightUnit: "kg" }],
    ["volume", "0.125 l", { volume: "0,125", volumeUnit: "l" }],
    ["volume", "750 ML", { volume: "750", volumeUnit: "ml" }],
    ["length", "1,5m", { length: "1,5", lengthUnit: "m" }],
    ["width", "12.125 cm", { width: "12,125", widthUnit: "cm" }],
    ["height", "10 cm", { height: "10", heightUnit: "cm" }],
    ["packageCount", "6 adet", { packageCount: "6" }],
    ["packageCount", "12", { packageCount: "12" }],
  ] as const) assert.deepEqual(parseAttributeMeasurementValue(field, raw), want, `${field}:${raw}`);
});
test("measurement mapping rejects unknown fields mismatched units ambiguity and unsafe magnitudes", () => {
  for (const [field, raw] of [["weight", "250"], ["weight", "250 ml"], ["weight", "0 g"], ["weight", "-1 g"], ["weight", "1e3 g"], ["weight", "1,2345 g"], ["weight", "1 000 g"], ["weight", "1\ng"], ["weight", "9007199254741 g"], ["volume", "250 g"], ["length", "5 ml"], ["packageCount", "1,5 adet"], ["packageCount", "0"], ["packageCount", "9007199254740992"], ["shippingDesi", "250 g"], ["depth", "5 cm"]]) assert.equal(parseAttributeMeasurementValue(field!, raw!), undefined, `${field}:${raw}`);
  assert.deepEqual(parseAttributeMeasurementValue("weight", "9007199254740,991 g"), { weight: "9007199254740,991", weightUnit: "g" });
});
test("equivalent measured values share identity while unbound custom strings remain independent", () => {
  for (const [field, left, right] of [["weight", "1 kg", "1000 g"], ["volume", "1,5 l", "1500 ml"], ["length", "1 m", "100 cm"], ["packageCount", "6 adet", "6"]]) assert.equal(attributeValueIdentity({ measurementField: field! }, left!), attributeValueIdentity({ measurementField: field! }, right!));
  assert.notEqual(attributeValueIdentity({}, "1 kg"), attributeValueIdentity({}, "1000 g"));
  assert.equal(attributeValueIdentity({}, " SİYAH "), attributeValueIdentity({}, "siyah"));
});
test("only explicitly bound enabled active attributes map by stable key without leaking config metadata", () => {
  const resources = [resource({ measurementField: "weight", values: ["250 g"] }), resource({ measurementField: "volume", enabled: false, values: ["1 l"] }, "volume"), resource({ values: ["10 cm"] }, "length"), { ...resource({ measurementField: "height" }, "height"), status: "archived" as const }];
  const attributes = { "net-weight": "250 g", volume: "1 l", length: "10 cm", height: "20 cm" };
  assert.deepEqual(attributeMeasurementDraft(resources, attributes), { weight: "250", weightUnit: "g" });
  assert.deepEqual(parseProductMeasurements(attributeMeasurementDraft(resources, attributes)), { ok: true, value: { weight: { valueMilli: 250000, unit: "g" } } });
  assert.deepEqual(attributes, { "net-weight": "250 g", volume: "1 l", length: "10 cm", height: "20 cm" });
});
test("conflicting bindings omit only their ambiguous measurement field", () => {
  const resources = [resource({ measurementField: "weight" }, "one"), resource({ measurementField: "weight" }, "two"), resource({ measurementField: "width" }, "width")];
  assert.deepEqual(attributeMeasurementDraft(resources, { one: "250 g", two: "500 g", width: "10 cm" }), { width: "10", widthUnit: "cm" });
  assert.deepEqual(attributeMeasurementDraft(resources, { one: "1 kg", two: "1000 g" }), { weight: "1", weightUnit: "kg" });
});
