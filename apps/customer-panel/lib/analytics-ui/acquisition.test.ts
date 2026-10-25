import assert from "node:assert/strict";
import test from "node:test";

type Acquisition = typeof import("./acquisition.ts");
async function acquisition(): Promise<Partial<Acquisition>> {
  return import("./acquisition.ts").catch(() => ({}));
}

test("acquisition joins retain commerce currencies, first behavioral match and traffic-only rows", async () => {
  const { joinAnalyticsAcquisition } = await acquisition();
  assert.ok(joinAnalyticsAcquisition);
  const commerce = [
    { source: "search", medium: "organic", campaign: null, currency: "TRY" },
    { source: "search", medium: "organic", campaign: null, currency: "USD" },
    { source: "direct", medium: "none", campaign: null, currency: "TRY" },
  ];
  const behavioral = [
    { source: "search", medium: "organic", campaign: null, visitors: 7 },
    { source: "search", medium: "organic", campaign: null, visitors: 10 },
    { source: "social", medium: "paid", campaign: "fall", visitors: 12 },
    { source: "social", medium: "paid", campaign: "fall", visitors: 3 },
  ];
  assert.deepEqual(joinAnalyticsAcquisition(commerce, behavioral), [
    { commerce: commerce[0], behavior: behavioral[0] },
    { commerce: commerce[1], behavior: behavioral[0] },
    { commerce: commerce[2], behavior: undefined },
    { commerce: null, behavior: behavioral[2] },
    { commerce: null, behavior: behavioral[3] },
  ]);
  assert.equal(commerce.length, 3);
  assert.equal(behavioral.length, 4);
});

test("acquisition identities do not merge delimiter characters or null and empty campaigns", async () => {
  const { joinAnalyticsAcquisition } = await acquisition();
  assert.ok(joinAnalyticsAcquisition);
  const commerce = [{ source: "a:b", medium: "c", campaign: null }];
  const behavioral = [
    { source: "a", medium: "b:c", campaign: null },
    { source: "a:b", medium: "c", campaign: "" },
  ];
  assert.deepEqual(joinAnalyticsAcquisition(commerce, behavioral), [
    { commerce: commerce[0], behavior: undefined },
    { commerce: null, behavior: behavioral[0] },
    { commerce: null, behavior: behavioral[1] },
  ]);
});
