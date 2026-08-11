import assert from "node:assert/strict";
import test from "node:test";

import {
  FIXED_STOREFRONT_POLICIES,
  type PublicPolicyPage,
  type PublicStarterThemePresentationV3,
} from "@celebix/saas-contracts";

import { mergePublishedPolicyFooterGroups } from "./footer-policies.ts";

type FooterGroups = PublicStarterThemePresentationV3["footer"]["groups"];

function policyIndex(...publishedKeys: readonly PublicPolicyPage["key"][]) {
  const published = new Set(publishedKeys);
  return Object.freeze(FIXED_STOREFRONT_POLICIES.map((definition) => Object.freeze({
    ...definition,
    published: published.has(definition.key),
  })));
}

test("footer policy projection keeps only published routes in fixed order", () => {
  const groups: FooterGroups = Object.freeze([
    Object.freeze({ heading: "Mağaza", links: Object.freeze([Object.freeze({ label: "Ürünler", destination: "/products" })]) }),
  ]);
  const result = mergePublishedPolicyFooterGroups(groups, policyIndex("kvkk", "privacy_security"));
  assert.deepEqual(result.at(-1), {
    heading: "Politikalar",
    links: [
      { label: "Gizlilik ve Güvenlik", destination: "/policies/privacy-security" },
      { label: "KVKK", destination: "/policies/kvkk" },
    ],
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.at(-1)?.links), true);
});

test("footer policy projection removes duplicates and preserves non-policy links", () => {
  const groups: FooterGroups = Object.freeze([
    Object.freeze({
      heading: "Politikalar",
      links: Object.freeze([
        Object.freeze({ label: "Eski gizlilik", destination: "/policies/privacy-security" }),
        Object.freeze({ label: "İletişim", destination: "/contact" }),
      ]),
    }),
    Object.freeze({
      heading: "Mağaza",
      links: Object.freeze([
        Object.freeze({ label: "Tekrar", destination: "/policies/privacy-security" }),
        Object.freeze({ label: "Ürünler", destination: "/products" }),
      ]),
    }),
  ]);
  const result = mergePublishedPolicyFooterGroups(groups, policyIndex("privacy_security"));
  assert.equal(result.flatMap(({ links }) => links).filter(({ destination }) => destination === "/policies/privacy-security").length, 1);
  assert.equal(result.some(({ links }) => links.some(({ destination }) => destination === "/contact")), true);
  assert.equal(result.some(({ links }) => links.some(({ destination }) => destination === "/products")), true);
});

test("footer policy projection hides every fixed route when all policies are drafts", () => {
  const groups: FooterGroups = Object.freeze([
    Object.freeze({ heading: "Politikalar", links: Object.freeze([Object.freeze({ label: "KVKK", destination: "/policies/kvkk" })]) }),
    Object.freeze({ heading: "Mağaza", links: Object.freeze([Object.freeze({ label: "Ürünler", destination: "/products" })]) }),
  ]);
  const result = mergePublishedPolicyFooterGroups(groups, policyIndex());
  assert.deepEqual(result, [{ heading: "Mağaza", links: [{ label: "Ürünler", destination: "/products" }] }]);
});
