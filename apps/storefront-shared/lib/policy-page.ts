import {
  FIXED_STOREFRONT_POLICIES,
  parsePublicPolicyPage,
  type PublicPolicyPage,
} from "@celebix/saas-contracts";
import type { PublicPolicySourcePage } from "@celebix/saas-data";
import { normalizeProductDescriptionHtml } from "@celebix/platform-config/src/product-description-rich-text.ts";

export function resolveStorefrontPolicyRoute(segment: unknown) {
  if (typeof segment !== "string") return null;
  const selected = FIXED_STOREFRONT_POLICIES.find(({ route }) => route === `/policies/${segment}`);
  return selected ? Object.freeze({ ...selected }) : null;
}

export function buildPublicPolicyPage(source: PublicPolicySourcePage): PublicPolicyPage {
  try {
    const definition = FIXED_STOREFRONT_POLICIES.find(({ key }) => key === source.key);
    if (!definition || source.label !== definition.label || source.route !== definition.route) throw new Error();
    if (!source.published) return parsePublicPolicyPage({
      key: definition.key,
      label: definition.label,
      route: definition.route,
      published: false,
      updatedAt: source.updatedAt,
    });
    if (typeof source.body !== "string" || source.body.length === 0) throw new Error();
    const html = normalizeProductDescriptionHtml(source.body, definition.label)
      .replace(/[\r\n\t]+/g, " ")
      .replace(/>\s+</g, "><")
      .trim();
    if (html.length === 0) throw new Error();
    return parsePublicPolicyPage({
      key: definition.key,
      label: definition.label,
      route: definition.route,
      published: true,
      html,
      updatedAt: source.updatedAt,
    });
  } catch {
    throw new TypeError("storefront_policy_page_invalid");
  }
}
