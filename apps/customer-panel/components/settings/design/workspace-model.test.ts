import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultStarterThemeComposition, normalizeStarterThemeCompositionV3, parseStorefrontDesignDocument } from "@celebix/saas-contracts";

import type { HomepageUndo } from "./homepage-command-model.ts";
import { applyDesignEdit, clearHomepageUndo, createDesignEditorState } from "./workspace-model.ts";

test("editor keeps one-level homepage undo in memory without adding it to the design document", () => {
  const design = parseStorefrontDesignDocument({
    schemaVersion: 4,
    brand: { logo: null, favicon: null, primaryColor: "#FF5A00", accentColor: "#171717", backgroundColor: "#FFFFFF", textColor: "#171717", fontFamily: "inter" },
    hero: { enabled: false, slides: [{ headline: "", body: "", desktopImage: null, mobileImage: null, destination: { kind: "none" }, enabled: false }] },
    promotion: { headline: "Kampanya", body: "Kampanya açıklaması", destination: { kind: "none" }, startsAt: null, endsAt: null, enabled: false },
    announcement: { items: ["Güvenli alışveriş"], icon: "none", speed: "normal", direction: "left", animation: "continuous", enabled: false },
    typography: {
      headingFont: { family: "Montserrat", category: "sans-serif", availableWeights: ["400", "500", "600", "700", "800"], source: "google" },
      bodyFont: { family: "Inter", category: "sans-serif", availableWeights: ["400", "500", "600", "700", "800"], source: "google" },
      headingWeight: "700",
      bodyWeight: "400",
      headingSizePx: 48,
      bodySizePx: 16,
    },
    composition: createDefaultStarterThemeComposition(),
  });
  const state = createDesignEditorState({ draft: design, draftVersion: 2, publishedVersion: 1 });
  const undo: HomepageUndo = Object.freeze({ label: "Bölümü geri getir", composition: normalizeStarterThemeCompositionV3(design.composition) });
  const edited = applyDesignEdit(state, design, undo);

  assert.equal(edited.homepageUndo, undo);
  assert.equal(Object.hasOwn(edited.design, "homepageUndo"), false);
  assert.equal(clearHomepageUndo(edited).homepageUndo, undefined);
  assert.equal(Object.isFrozen(edited), true);
});
