import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [drawer, provider, utilities, card, detail, css] = await Promise.all([
  readFile(new URL("./SideCartDrawer.tsx", import.meta.url), "utf8"),
  readFile(new URL("./CartStatusProvider.tsx", import.meta.url), "utf8"),
  readFile(new URL("./StoreUtilities.tsx", import.meta.url), "utf8"),
  readFile(new URL("./ProductCardCartButton.tsx", import.meta.url), "utf8"),
  readFile(new URL("./ProductPurchasePanel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("one provider owns a canonical side-cart and both add surfaces auto-open it", () => {
  assert.match(provider, /<SideCartDrawer\s+presentation=\{presentation\}\s*\/>/u);
  for (const proof of ["drawerOpen", "openDrawer", "closeDrawer"]) assert.match(`${provider}\n${card}\n${detail}`, new RegExp(proof, "u"));
  assert.doesNotMatch(`${provider}\n${drawer}`, /tenantId|storeId|priceCents\s*:/u);
});

test("campaign cart presentation is truthful and never invents shipping progress", () => {
  assert.match(provider, /PublicStarterThemePresentationV2/);
  assert.match(drawer, /showCheckoutReadiness/);
  assert.match(drawer, /trustMessage/);
  assert.doesNotMatch(drawer, /showShippingProgress|freeShippingThreshold|Ücretsiz kargoya/u);
});

test("a stale mount refresh cannot overwrite a later cart mutation", () => {
  for (const proof of ["refreshGenerationRef", "cartEpochRef", "requestGeneration", "requestEpoch"]) assert.match(provider, new RegExp(proof, "u"));
  assert.match(provider, /cartEpochRef[.]current \+= 1/u);
  assert.match(provider, /requestGeneration === refreshGenerationRef[.]current[\s\S]+requestEpoch === cartEpochRef[.]current/u);
});

test("an unavailable refresh is never presented as an empty or recovered cart", () => {
  for (const proof of ["unavailable", "Sepet şu anda kullanılamıyor", "Güncel durum doğrulanamadı", "recovered"]) assert.match(`${provider}\n${drawer}`, new RegExp(proof, "u"));
  assert.match(drawer, /recovered[\s\S]+Güncel sepet yeniden yüklendi/u);
  assert.match(drawer, /!cart && unavailable/u);
});

test("side-cart is modal keyboard-safe and restores the opening control", () => {
  for (const proof of ['role="dialog"', 'aria-modal="true"', "Escape", "Tab", "document.body.style.overflow", "focus()", "aria-labelledby"]) assert.match(drawer, new RegExp(proof, "u"));
  assert.match(utilities, /aria-haspopup="dialog"/u);
  assert.match(utilities, /aria-expanded=\{drawerOpen\}/u);
  assert.match(utilities, /<button/u);
});

test("side-cart renders canonical lines and uses only replay-safe mutations", () => {
  for (const proof of ["line.media", "line.title", "line.variantTitle", "line.unitPriceCents", "line.lineTotalCents", "cart.subtotalCents", "cart.shippingCents", "cart.totalCents", "setQuantity", "remove", "expectedVersion", "Sepeti görüntüle", "Ödemeye geç"]) assert.match(drawer, new RegExp(proof, "u"));
  assert.doesNotMatch(drawer, /fetch\(|localStorage|sessionStorage|document.cookie/u);
  assert.match(drawer, /Ödeme durumunu görüntüle/u);
  assert.match(drawer, /side-cart-notice is-configuration/u);
  assert.match(css, /[.]side-cart-notice[.]is-configuration/u);
});

test("side-cart stays responsive with 48px targets and reduced motion", () => {
  assert.match(css, /[.]side-cart-dialog/u);
  assert.match(css, /[.]side-cart-backdrop/u);
  assert.match(css, /min-height:\s*48px/u);
  assert.match(css, /[.]side-cart-line-copy > a \{[^}]*min-height:\s*48px/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /transition-duration:\s*[.]01ms/u);
});

test("drawer never claims shipping progress without canonical threshold authority", () => {
  assert.match(drawer, /data-campaign-cart="true"/u);
  assert.doesNotMatch(drawer, /Ücretsiz kargoya|shipping-progress/u);
});

test("campaign checkout action preserves the existing checkout route", () => {
  assert.match(drawer, /className="store-button campaign-side-cart-checkout" href="\/checkout"/u);
});

test("campaign line keeps canonical first media and exact variant copy", () => {
  assert.match(drawer, /campaign-side-cart-item/u);
  assert.match(drawer, /line[.]media[.]url/u);
  assert.match(drawer, /line[.]variantTitle/u);
  assert.match(drawer, /loading="lazy"/u);
});

test("campaign summary preserves canonical totals and checkout blocker truth", () => {
  assert.match(drawer, /campaign-side-cart-summary/u);
  for (const proof of ["cart.subtotalCents", "cart.shippingCents", "cart.totalCents", "cart.checkoutBlocker"]) assert.match(drawer, new RegExp(proof.replace(".", "\\."), "u"));
  assert.doesNotMatch(drawer, /reduce\(|computedSubtotal|estimatedShipping/u);
});
