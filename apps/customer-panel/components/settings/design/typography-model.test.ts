import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { StorefrontDesignFontOption, StorefrontDesignTypography } from "@celebix/saas-contracts";
import {
  filterTypographyFonts,
  normalizeTypographySearch,
  selectTypographyFont,
  selectTypographySize,
  selectTypographyWeight,
} from "./typography-model.ts";

const INTER = Object.freeze({ family: "Inter", category: "sans-serif", availableWeights: Object.freeze(["400", "500", "600", "700", "800"] as const), source: "google" } as const);
const PLAYFAIR = Object.freeze({ family: "Playfair Display", category: "serif", availableWeights: Object.freeze(["500", "600", "700"] as const), source: "google" } as const);
const MONO = Object.freeze({ family: "Roboto Mono", category: "monospace", availableWeights: Object.freeze(["400", "700"] as const), source: "google" } as const);
const TYPOGRAPHY: StorefrontDesignTypography = Object.freeze({ headingFont: PLAYFAIR, bodyFont: INTER, headingWeight: "700", bodyWeight: "400", headingSizePx: 48, bodySizePx: 16 });

test("typography search is locale-stable and keeps the selected family pinned", () => {
  assert.equal(normalizeTypographySearch("  PLÁYFAIR   Display "), "playfair display");
  const result = filterTypographyFonts([INTER, PLAYFAIR, MONO], "mono", PLAYFAIR, 20);
  assert.deepEqual(result.map(({ family }) => family), ["Playfair Display", "Roboto Mono"]);
  assert.equal(Object.isFrozen(result), true);
});

test("heading and body choices remain independent and reset only an unsupported weight", () => {
  const heading = selectTypographyFont(TYPOGRAPHY, "heading", INTER);
  assert.equal(heading.headingFont.family, "Inter");
  assert.equal(heading.bodyFont.family, "Inter");
  assert.equal(heading.headingWeight, "700");
  assert.equal(heading.bodyWeight, "400");

  const body = selectTypographyFont(TYPOGRAPHY, "body", PLAYFAIR);
  assert.equal(body.headingFont.family, "Playfair Display");
  assert.equal(body.bodyFont.family, "Playfair Display");
  assert.equal(body.headingWeight, "700");
  assert.equal(body.bodyWeight, "500");
  assert.equal(Object.isFrozen(body), true);
});

test("weight and exact integer size updates are bounded by the selected catalog authority", () => {
  assert.equal(selectTypographyWeight(TYPOGRAPHY, "heading", "600").headingWeight, "600");
  assert.equal(selectTypographyWeight(TYPOGRAPHY, "heading", "400"), TYPOGRAPHY);
  assert.equal(selectTypographyWeight(TYPOGRAPHY, "body", "800").bodyWeight, "800");
  assert.equal(selectTypographySize(TYPOGRAPHY, "heading", 80).headingSizePx, 72);
  assert.equal(selectTypographySize(TYPOGRAPHY, "heading", 24.8).headingSizePx, 25);
  assert.equal(selectTypographySize(TYPOGRAPHY, "body", 2).bodySizePx, 14);
  assert.equal(selectTypographySize(TYPOGRAPHY, "body", Number.NaN), TYPOGRAPHY);
});

test("editor contract is accessible, fail-safe, and has no browser or arbitrary URL authority", async () => {
  const source = await readFile(new URL("./TypographyEditor.tsx", import.meta.url), "utf8");
  assert.match(source, /const title = heading \? "Başlık" : "Metin"/);
  for (const label of ["{title} yazı tipi", "{title} kalınlığı", "{title} boyutu"]) assert.match(source, new RegExp(label.replace(/[{}]/g, "\\$&")));
  assert.match(source, /Google Fonts kataloğunun güvenli yedek listesi kullanılıyor/);
  assert.match(source, /disabled=\{disabled/);
  assert.match(source, /\/api\/storefront-design\/fonts/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|x-store-id|tenantContext|stylesheetUrl|dangerouslySetInnerHTML/);
});

test("catalog values have the exact immutable editor shape", () => {
  const selected: StorefrontDesignFontOption = filterTypographyFonts([INTER], "", INTER, 20)[0]!;
  assert.deepEqual(Object.keys(selected).sort(), ["availableWeights", "category", "family", "source"]);
  assert.equal(selected.source, "google");
});
