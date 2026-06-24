import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDashboardAnalyticsStatus,
  buildDashboardGrowthRows,
  buildDashboardSalesChannels,
  getSalesSummaryPanelTitle,
} from "./dashboard-presentation";

describe("dashboard presentation safety", () => {
  it("marks disconnected analytics without exposing config values", () => {
    const status = buildDashboardAnalyticsStatus({
      provider: "umami",
      source: "internal",
      umami: {
        baseUrlPresent: true,
        apiTokenPresent: false,
        websiteIdPresent: true,
        configured: false,
      },
      storefrontTracking: "internal",
    });

    assert.equal(status.state, "missing");
    assert.equal(status.label, "Analytics bağlantısı yapılandırılmadı");
    assert.equal(status.details.includes("API token"), true);
    assert.equal(status.details.includes("http"), false);
  });

  it("does not present disconnected sales channels as zero revenue", () => {
    const channels = buildDashboardSalesChannels({
      storefrontHost: "hemenaku.com",
      storefrontRevenue: 1250,
      storefrontRevenueChange: 12,
    });

    assert.equal(channels[0]?.value, "₺1.250,00");
    assert.equal(channels[1]?.value, "Kanal bağlantısı yok");
    assert.equal(channels[2]?.value, "Yakında");
    assert.equal(channels.some((channel) => channel.label !== "hemenaku.com" && channel.value === "₺0,00"), false);
  });

  it("uses safe labels for unavailable dashboard aggregates", () => {
    const rows = buildDashboardGrowthRows({
      averageOrderValue: 321,
      averageCartSize: 1.5,
    });

    assert.equal(rows.find((row) => row.key === "returns")?.value, "Bağlı değil");
    assert.equal(rows.find((row) => row.key === "productPrice")?.value, "Yakında");
    assert.equal(rows.find((row) => row.key === "averageOrder")?.value, "₺321,00");
  });

  it("renames recent-order proxy panels away from best-seller wording", () => {
    assert.equal(getSalesSummaryPanelTitle(false), "Son Satılanlar");
  });
});
