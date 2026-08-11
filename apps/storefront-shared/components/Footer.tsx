import type {
  PublicPolicyPage,
  PublicStarterThemePresentationV3,
  PublicStorefront,
} from "@celebix/saas-contracts";
import Link from "next/link";

import { mergePublishedPolicyFooterGroups } from "@/lib/footer-policies.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";

import { RetailFooter } from "./RetailFooter";

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

async function publicPolicyIndex(storefront: PublicStorefront) {
  const resolution = await resolveStorefrontPage();
  if (
    resolution.kind !== "active"
    || resolution.context.storefront.hostname !== storefront.hostname
  ) return EMPTY_POLICY_INDEX;
  return resolution.context.runtime.content.listPolicies({
    hostname: storefront.hostname,
    now: new Date(),
  }).catch(() => Object.freeze([]) as readonly PublicPolicyPage[]);
}

export async function Footer({ storefront }: { storefront: PublicStorefront }) {
  const policies = await publicPolicyIndex(storefront);
  if (storefront.presentation.schemaVersion === 3) {
    return (
      <RetailFooter
        groups={mergePublishedPolicyFooterGroups(storefront.presentation.footer.groups, policies)}
        presentation={storefront.presentation}
        storefront={storefront}
      />
    );
  }
  const { displayName, supportEmail } = storefront.presentation;
  const groups = mergePublishedPolicyFooterGroups(LEGACY_GROUPS, policies);
  return (
    <footer className="store-footer">
      <div className="store-container footer-grid">
        <div>
          <strong>{displayName}</strong>
          <p>Özenle seçilen ürünler, güvenli ve sade bir mağaza deneyimi.</p>
        </div>
        {groups.map((group) => (
          <nav aria-label={group.heading} key={group.heading}>
            <span>{group.heading}</span>
            {group.links.map((link) => (
              <Link href={link.destination} key={`${link.destination}-${link.label}`}>
                {link.label}
              </Link>
            ))}
          </nav>
        ))}
        <div>
          <span>Mağaza</span>
          <p>{storefront.hostname}</p>
          {supportEmail ? <a href={`mailto:${supportEmail}`}>{supportEmail}</a> : null}
          <p>TRY · Türkçe</p>
        </div>
      </div>
      <div className="store-container footer-bottom">
        <span>© {new Date().getUTCFullYear()} {displayName}</span>
        <span>Celebix altyapısıyla sunulur</span>
      </div>
    </footer>
  );
}
