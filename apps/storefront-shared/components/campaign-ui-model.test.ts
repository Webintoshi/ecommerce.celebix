import assert from "node:assert/strict";
import test from "node:test";

import { campaignAnnouncement, campaignFrameSettings, sideCartPresentation } from "./campaign-ui-model.ts";

const campaign = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  visual: { cornerStyle: "soft" },
  cart: { showCheckoutReadiness: false, showShippingProgress: false, showQuantitySelector: false, trustMessage: "Güvenli ödeme" },
  announcement: { items: ["Aynı gün kargo", "Güvenli ödeme"], destination: "/pages/odeme-teslimat" },
  ...overrides,
});

test("campaign announcement preserves exact parsed text and same-store destination", () => {
  assert.deepEqual(campaignAnnouncement(campaign() as never), {
    text: "Aynı gün kargo · Güvenli ödeme",
    destination: "/pages/odeme-teslimat",
  });
  assert.deepEqual(campaignAnnouncement(campaign({ announcement: { items: ["Duyuru"] } }) as never), { text: "Duyuru" });
  assert.equal(campaignAnnouncement(campaign({ announcement: undefined }) as never), null);
});

test("frame settings expose exact corner class for schema-v2 and schema-v3 cart presentation", () => {
  assert.deepEqual(campaignFrameSettings(campaign() as never), {
    campaignClass: "campaign-storefront",
    cornerClass: "corners-soft",
    cart: campaign().cart,
  });
  assert.deepEqual(campaignFrameSettings(campaign({ schemaVersion: 3 }) as never), {
    campaignClass: "campaign-storefront",
    cornerClass: "corners-soft",
    cart: campaign().cart,
  });
  assert.deepEqual(campaignFrameSettings({ schemaVersion: 1 } as never), { campaignClass: "", cornerClass: "", cart: undefined });
});

test("side-cart visibility follows published authority while legacy fallback stays enabled", () => {
  assert.deepEqual(sideCartPresentation(campaign().cart as never), { showCheckoutReadiness: false, showQuantitySelector: false, trustMessage: "Güvenli ödeme" });
  assert.deepEqual(sideCartPresentation(undefined), { showCheckoutReadiness: true, showQuantitySelector: true, trustMessage: undefined });
});
