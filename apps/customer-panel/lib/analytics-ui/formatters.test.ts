import assert from "node:assert/strict";
import test from "node:test";

type Formatters = typeof import("./formatters.ts");
async function formatters(): Promise<Partial<Formatters>> {
  return import("./formatters.ts").catch(() => ({}));
}

test("analytics money keeps minor units and each currency distinct", async () => {
  const { analyticsMoney } = await formatters();
  assert.ok(analyticsMoney);
  assert.equal(analyticsMoney(125_000, "TRY"), "₺1.250,00");
  assert.equal(analyticsMoney(125_000, "USD"), "$1.250,00");
  assert.equal(analyticsMoney(0, "TRY"), "₺0,00");
  assert.equal(analyticsMoney(31_250.5, "TRY"), "₺312,51");
});

test("analytics percentages preserve unavailable and measured zero", async () => {
  const { analyticsPercent } = await formatters();
  assert.ok(analyticsPercent);
  assert.equal(analyticsPercent(null), "—");
  assert.equal(analyticsPercent(0), "%0");
  assert.equal(analyticsPercent(0.125), "%12,5");
  assert.equal(analyticsPercent(-0.25), "-%25");
});

test("analytics timestamps use the selected timezone on both sides of midnight", async () => {
  const { analyticsDateTime } = await formatters();
  assert.ok(analyticsDateTime);
  assert.equal(analyticsDateTime("2026-09-25T21:30:00.000Z", "Europe/Istanbul"), "26 Eyl 2026 00:30");
  assert.equal(analyticsDateTime("2026-09-25T21:30:00.000Z", "America/Los_Angeles"), "25 Eyl 2026 14:30");
});

test("calendar-day chart labels keep their day while timestamp labels use the timezone", async () => {
  const { analyticsDayLabel } = await formatters();
  assert.ok(analyticsDayLabel);
  assert.equal(analyticsDayLabel("2026-09-25", "America/Los_Angeles"), "25 Eyl 2026");
  assert.equal(analyticsDayLabel("2026-09-25T21:30:00.000Z", "Europe/Istanbul"), "26 Eyl 2026");
  assert.equal(analyticsDayLabel("2026-09-25T21:30:00.000Z", "America/Los_Angeles"), "25 Eyl 2026");
});

test("repeated money formatting reuses a bounded number of currency formatters", async (context) => {
  const { analyticsMoney } = await formatters();
  assert.ok(analyticsMoney);
  const NumberFormatter = Intl.NumberFormat;
  let constructions = 0;
  context.mock.method(Intl, "NumberFormat", class extends NumberFormatter {
    constructor(...args: ConstructorParameters<typeof NumberFormatter>) {
      super(...args);
      constructions += 1;
    }
  });
  analyticsMoney(100, "QAA");
  analyticsMoney(200, "QAA");
  assert.equal(constructions, 1);
  for (let index = 0; index < 40; index += 1) {
    analyticsMoney(100, `Q${String.fromCharCode(66 + Math.floor(index / 26))}${String.fromCharCode(65 + index % 26)}`);
  }
  analyticsMoney(300, "QAA");
  assert.equal(constructions, 42);
});
