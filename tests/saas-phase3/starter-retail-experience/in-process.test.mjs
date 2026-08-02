import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildDefaultStarterPresentation, FIXED_STOREFRONT_POLICIES } from "@celebix/saas-contracts";
import { createNewsletterSubscribeRoute } from "../../../apps/storefront-shared/lib/newsletter/runtime.ts";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");
const HOST = "retail.example.test";

test("new stores receive the complete truthful retail default without invented merchant content", () => {
  const presentation = buildDefaultStarterPresentation({ name: "Yeni Mağaza" });
  assert.equal(presentation.schemaVersion, 3);
  assert.deepEqual(presentation.footer.groups.find(({ heading }) => heading === "Politikalar")?.links, FIXED_STOREFRONT_POLICIES.map(({ label, route }) => ({ label, destination: route })));
  assert.equal(presentation.footer.newsletter.enabled, false);
  assert.deepEqual(presentation.footer.social, []);
  assert.equal(presentation.sections.some(({ kind }) => kind === "testimonials"), false);
  assert.doesNotMatch(JSON.stringify(presentation), /https?:\/\/|stock|discount|rating|reviewer/iu);
});

test("newsletter route binds the trusted hostname and never accepts browser tenant authority", async () => {
  const calls = [];
  const route = createNewsletterSubscribeRoute({
    selectAuthority: () => Object.freeze({ kind: "trusted", hostname: HOST }),
    resolveRepository: async () => ({ async subscribe(input) { calls.push(input); return Object.freeze({ outcome: "subscribed" }); }, async list() { throw new Error("not_used"); } }),
    now: () => new Date("2026-08-02T12:00:00.000Z"),
  });
  const request = (body) => new Request("http://storefront.internal:3450/api/newsletter/subscriptions", { method: "POST", headers: { origin: `https://${HOST}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const response = await route(request({ email: "ADA@EXAMPLE.TEST", consent: true }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { outcome: "subscribed" });
  assert.deepEqual(calls, [{ hostname: HOST, now: new Date("2026-08-02T12:00:00.000Z"), email: "ada@example.test", consentVersion: "starter-v1" }]);
  for (const privateInput of [{ email: "ada@example.test", consent: true, storeId: crypto.randomUUID() }, { email: "ada@example.test", consent: true, tenantId: crypto.randomUUID() }]) {
    assert.equal((await route(request(privateInput))).status, 400);
  }
  assert.equal(calls.length, 1);
});

test("retail CSS and semantics own the exact responsive accessibility gates", () => {
  const globalCss = read("apps/storefront-shared/app/globals.css");
  const headerCss = read("apps/storefront-shared/components/campaign-header.module.css");
  const homeCss = read("apps/storefront-shared/components/campaign-home.module.css");
  const detailCss = read("apps/storefront-shared/components/product-detail-experience.module.css");
  const sources = [
    read("apps/storefront-shared/components/CampaignHeaderClient.tsx"),
    read("apps/storefront-shared/components/ProductGallery.tsx"),
    read("apps/storefront-shared/components/SideCartDrawer.tsx"),
    read("apps/storefront-shared/components/NewsletterForm.tsx"),
  ].join("\n");
  assert.match(globalCss, /body\s*\{[^}]*min-width:\s*320px[^}]*overflow-x:\s*clip/u);
  assert.match(`${globalCss}\n${headerCss}\n${homeCss}\n${detailCss}`, /@media\s*\(max-width:\s*1024px\)/u);
  assert.match(headerCss, /[.]desktopNav\{[^}]*display:flex/u);
  assert.match(headerCss, /[.]sentinel\{top:0\}/u);
  assert.match(headerCss, /:global\([.]has-announcement\)\s+[.]bar:not\([.]opaque\)\{top:48px\}/u);
  assert.match(homeCss, /[.]announcement\{min-height:48px;padding-block:0\}/u);
  assert.match(headerCss, /@media\(max-width:1024px\)\{[\s\S]*?[.]desktopNav\{display:none/u);
  assert.match(globalCss, /\*, \*::before, \*::after\s*\{[^}]*animation-duration:\s*[.]01ms[^}]*transition-duration:\s*[.]01ms/u);
  assert.match(`${globalCss}\n${headerCss}\n${homeCss}\n${detailCss}`, /min-(?:width|height):\s*48px/u);
  assert.match(globalCss, /[.]retail-newsletter-consent\s*\{[^}]*min-height:\s*48px/u);
  assert.match(globalCss, /@media\s*\(max-width:\s*1180px\)\s*\{[^}]*[.]retail-footer-grid\s*\{[^}]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/u);
  for (const semantic of [/role="dialog"/u, /aria-modal="true"/u, /aria-label=/u, /aria-live=/u]) assert.match(sources, semantic);
  assert.doesNotMatch(sources, /tabIndex=\{?[1-9]|onClick=\{[^}]+\}>\s*<div/iu);
});

test("browser acceptance is loopback-only and covers every approved visual surface", () => {
  const relative = "tests/saas-phase3/starter-retail-experience/browser-acceptance.mjs";
  assert.equal(existsSync(path.join(ROOT, relative)), true);
  const source = read(relative);
  for (const proof of ["1440, 1000", "1025, 768", "1024, 768", "390, 844", "320, 720", "horizontalOverflow", "minimumTarget", "primaryContrast", "reducedMotionDuration", "home", "navigation", "listing", "product-detail", "side-cart", "footer-newsletter", "empty-partial"]) assert.match(source, new RegExp(proof, "u"));
  assert.match(source, /[.]codex-artifacts\/starter-retail-experience/u);
  assert.match(source, /127[.]0[.]0[.]1|localhost/u);
  assert.doesNotMatch(source, /https:\/\/|production|staging|--disable-web-security/iu);
});
