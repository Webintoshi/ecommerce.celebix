import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPublicPolicyPage,
  resolveStorefrontPolicyRoute,
} from "./policy-page.ts";

test("policy page maps only the seven exact public route segments", () => {
  assert.deepEqual(resolveStorefrontPolicyRoute("privacy-security"), {
    key: "privacy_security",
    route: "/policies/privacy-security",
    label: "Gizlilik ve Güvenlik",
  });
  assert.equal(resolveStorefrontPolicyRoute("privacy_security"), null);
  assert.equal(resolveStorefrontPolicyRoute("kvkk/evil"), null);
  assert.equal(resolveStorefrontPolicyRoute(" KVKK "), null);
});

test("published policy Markdown is sanitized while drafts expose no body", () => {
  const published = buildPublicPolicyPage({
    key: "kvkk",
    label: "KVKK",
    route: "/policies/kvkk",
    published: true,
    body: "<h2>Veri sorumlusu</h2><p><strong>Güvenli</strong> metin<script>alert(1)</script></p>",
    updatedAt: "2026-07-31T12:00:00.000Z",
  });
  assert.equal(published.published, true);
  assert.match(published.html ?? "", /<h2>Veri sorumlusu<\/h2>/u);
  assert.match(published.html ?? "", /<strong>Güvenli<\/strong>/u);
  assert.doesNotMatch(published.html ?? "", /javascript|alert/u);

  const draft = buildPublicPolicyPage({
    key: "membership",
    label: "Üyelik",
    route: "/policies/membership",
    published: false,
    body: "gizli taslak",
    updatedAt: "2026-07-31T12:00:00.000Z",
  });
  assert.deepEqual(draft, {
    key: "membership",
    label: "Üyelik",
    route: "/policies/membership",
    published: false,
    updatedAt: "2026-07-31T12:00:00.000Z",
  });
});

test("policy projection rejects mismatched fixed authority", () => {
  assert.throws(() => buildPublicPolicyPage({
    key: "kvkk",
    label: "Üyelik",
    route: "/policies/kvkk",
    published: true,
    body: "Metin",
    updatedAt: "2026-07-31T12:00:00.000Z",
  }), /storefront_policy_page_invalid/u);
});
