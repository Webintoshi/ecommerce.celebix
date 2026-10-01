import assert from "node:assert/strict";
import test from "node:test";

import { ALPLER_STOREFRONT_ID } from "../themes/alpler/theme.ts";
import { ALPLER_NAVY_LOGO_URL, ALPLER_WHITE_LOGO_URL, alplerFooterLogo, alplerLogoDimensions } from "../themes/alpler/logo.ts";

const alpler = { id: ALPLER_STOREFRONT_ID };
const navy = Object.freeze({ url: ALPLER_NAVY_LOGO_URL, altText: "Alpler Spor dağ amblemi" });

test("Alpler's selected navy artwork uses the customer white artwork only on its dark footer", () => {
  assert.deepEqual(alplerFooterLogo(alpler, navy, "dark"), { url: ALPLER_WHITE_LOGO_URL, altText: navy.altText });
  assert.equal(alplerFooterLogo(alpler, navy, "light"), navy);
});

test("a future admin logo selection is preserved even on Alpler's dark footer", () => {
  for (const url of ["https://media.example/new-logo.webp", `${ALPLER_NAVY_LOGO_URL}?v=2`, ALPLER_WHITE_LOGO_URL]) {
    const selected = { url, altText: "Yeni logo" };
    assert.equal(alplerFooterLogo(alpler, selected, "dark"), selected);
    assert.equal(alplerFooterLogo(alpler, selected, "light"), selected);
  }
});

test("logo variants cannot cross trusted storefront identity boundaries", () => {
  for (const id of ["ff465e64-1491-40ef-8840-c66281155a1d", "a828862c-4cc1-475a-89cc-5fbee31eb43f", "alpler-spor", "alpler-spor.saas-staging.celebix.net", "9f1f6aed-8719-407e-b64c-fd8e956d3278"]) {
    assert.equal(alplerFooterLogo({ id }, navy, "dark"), navy);
    assert.equal(alplerLogoDimensions({ id }, navy), null);
  }
});

test("empty logo choices and alternative text are preserved", () => {
  assert.equal(alplerFooterLogo(alpler, null, "dark"), null);
  assert.equal(alplerFooterLogo(alpler, undefined, "dark"), undefined);
  assert.equal(alplerLogoDimensions(alpler, null), null);
  assert.equal(alplerLogoDimensions(alpler, undefined), null);
  assert.equal(alplerFooterLogo(alpler, { ...navy, altText: "" }, "dark")?.altText, "");
});

test("both known Alpler emblems retain the actual uncropped 720 by 540 aspect ratio", () => {
  for (const url of [ALPLER_NAVY_LOGO_URL, ALPLER_WHITE_LOGO_URL]) {
    assert.deepEqual(alplerLogoDimensions(alpler, { url, altText: "Logo" }), { width: 720, height: 540 });
  }
  assert.equal(alplerLogoDimensions(alpler, { url: "https://media.example/new-logo.webp", altText: "Logo" }), null);
});
