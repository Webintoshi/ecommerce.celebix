import type {
  PublicPolicyPage,
  PublicStarterThemePresentationV3,
  PublicStorefront,
  PublicDesignMedia,
} from "@celebix/saas-contracts";
import { cache } from "react";

import { mergePublishedPolicyFooterGroups } from "@/lib/footer-policies.ts";
import { mergePublishedRequiredPageFooterGroups, readPublishedRequiredPageFooterLinks } from "@/lib/footer-required-pages.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";

import { RetailFooter } from "./RetailFooter";
import { GuzideFooter } from "../themes/guzide/GuzideFooter";
import { guzideThemeFor } from "../themes/guzide/theme.ts";
import { CheckoutFooter } from "./checkout/CheckoutChrome";
import { AlplerFooter } from "../themes/alpler/AlplerFooter";
import { alplerThemeFor } from "../themes/alpler/theme.ts";
import { SioraFooter } from "../themes/siora/SioraFooter";
import { sioraThemeFor } from "../themes/siora/theme.ts";
import { FooterPaymentBranding } from "./PaymentTrust";
import { LilyumFooter } from "../themes/lilyum/LilyumFooter";
import { lilyumThemeFor } from "../themes/lilyum/theme.ts";
import { hizliThemeFor } from "../themes/hizli-kutu/theme.ts";
import { HizliFooter } from "../themes/hizli-kutu/HizliFooter";

const EMPTY_POLICY_INDEX = Object.freeze([]) as readonly PublicPolicyPage[];
const LEGACY_GROUPS = Object.freeze([
  Object.freeze({
    heading: "Keşfet",
    links: Object.freeze([
      Object.freeze({ label: "Ana Sayfa", destination: "/" }),
      Object.freeze({ label: "Tüm Ürünler", destination: "/products" }),
      Object.freeze({ label: "Favoriler", destination: "/favorites" }),
    ]),
  }),
]) satisfies PublicStarterThemePresentationV3["footer"]["groups"];

const publicPolicyIndex = cache(async (hostname: string) => {
  const resolution = await resolveStorefrontPage();
  if (
    resolution.kind !== "active"
    || resolution.context.storefront.hostname !== hostname
  ) return EMPTY_POLICY_INDEX;
  return resolution.context.runtime.content.listPolicies({
    hostname,
    now: new Date(),
  }).catch(() => Object.freeze([]) as readonly PublicPolicyPage[]);
});

const publicRequiredPageIndex = cache(async (hostname: string) => {
  const resolution = await resolveStorefrontPage();
  if (resolution.kind !== "active" || resolution.context.storefront.hostname !== hostname) return Object.freeze([]);
  return readPublishedRequiredPageFooterLinks(resolution.context.runtime.content, hostname, new Date());
});

export async function Footer({ storefront, logo, checkout = false }: { storefront: PublicStorefront; logo?: PublicDesignMedia; checkout?: boolean }) {
  const [policies, requiredPages] = await Promise.all([
    publicPolicyIndex(storefront.hostname),
    checkout ? Promise.resolve(Object.freeze([])) : publicRequiredPageIndex(storefront.hostname),
  ]);
  const modernPresentation = storefront.presentation.schemaVersion === 3 || storefront.presentation.schemaVersion === 4;
  const footerTone = checkout || (modernPresentation && guzideThemeFor(storefront)) ? "light"
    : lilyumThemeFor(storefront) ? "dark"
    : storefront.presentation.schemaVersion === 3 || storefront.presentation.schemaVersion === 4 ? storefront.presentation.footer.tone : "dark";
  const signature = <FooterPaymentBranding tone={footerTone} />;
  if (checkout) {
    const groups = mergePublishedPolicyFooterGroups(
      storefront.presentation.schemaVersion === 3 || storefront.presentation.schemaVersion === 4 ? storefront.presentation.footer.groups : LEGACY_GROUPS,
      policies,
    );
    return <CheckoutFooter groups={groups} storefront={storefront} signature={signature} />;
  }
  if (storefront.presentation.schemaVersion === 3 || storefront.presentation.schemaVersion === 4) {
    const groups = mergePublishedRequiredPageFooterGroups(
      mergePublishedPolicyFooterGroups(storefront.presentation.footer.groups, policies), requiredPages,
    );
    if (hizliThemeFor(storefront)) return <HizliFooter storefront={storefront} logo={logo} groups={groups} signature={signature} />;
    if (lilyumThemeFor(storefront)) return <LilyumFooter storefront={storefront} logo={logo} groups={groups} signature={signature} />;
    if (alplerThemeFor(storefront)) return <AlplerFooter groups={groups} presentation={storefront.presentation} storefront={storefront} logo={logo} checkout={checkout} signature={signature} />;
    if (sioraThemeFor(storefront)) return <SioraFooter groups={groups} presentation={storefront.presentation} storefront={storefront} logo={logo} checkout={checkout} signature={signature} />;
    if (guzideThemeFor(storefront)) {
      return <GuzideFooter groups={groups} presentation={storefront.presentation} storefront={storefront} logo={logo} signature={signature} />;
    }
    return (
      <RetailFooter
        groups={groups}
        presentation={storefront.presentation}
        storefront={storefront}
        logo={logo}
        signature={signature}
      />
    );
  }
  const { displayName, supportEmail } = storefront.presentation;
  const groups = mergePublishedRequiredPageFooterGroups(mergePublishedPolicyFooterGroups(LEGACY_GROUPS, policies), requiredPages);
  if (hizliThemeFor(storefront)) return <HizliFooter storefront={storefront} logo={logo} groups={groups} signature={signature} />;
  return <RetailFooter storefront={storefront} logo={logo} groups={groups} signature={signature} presentation={{ displayName, supportEmail, footer: { tone: "dark", social: [] } }} />;
}
