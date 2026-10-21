import type { PublicStorefront, PublicStorefrontDesign } from "@celebix/saas-contracts";
import { HizliHeaderClient } from "./HizliHeaderClient";
import { hizliMenuImages } from "./model.ts";
import { localizeStorefrontPath } from "../../lib/storefront-routes.ts";

export function HizliHeader({ storefront, design }: { storefront: PublicStorefront; design: PublicStorefrontDesign }) {
  const p = storefront.presentation;
  const logo = design.publicationVersion > 1 ? design.brand.logo ?? p.logo : p.logo;
  const announcement = p.schemaVersion === 1 ? p.marquee : p.announcement;
  return <HizliHeaderClient displayName={p.displayName} locale={storefront.locale} logo={logo}
    navigation={p.schemaVersion === 1 ? [] : p.navigation.items} images={hizliMenuImages(p)}
    announcement={announcement ? { text: announcement.items.join(" · "), destination: "destination" in announcement && announcement.destination ? localizeStorefrontPath(announcement.destination, storefront.locale) : undefined } : undefined}
    layout={p.schemaVersion === 3 || p.schemaVersion === 4 ? p.visual.headerLayout : "menu_logo_actions"}
    width={p.schemaVersion === 3 || p.schemaVersion === 4 ? p.visual.headerWidth : "wide"} />;
}
