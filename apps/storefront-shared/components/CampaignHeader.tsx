import Link from "next/link";
import { StorefrontNavigationItems } from "@celebix/storefront-design-ui";
import type {
  PublicStorefront,
  PublicStorefrontDesign,
} from "@celebix/saas-contracts";

import { CampaignHeaderClient } from "./CampaignHeaderClient";
import styles from "./campaign-header.module.css";
import { categoryPath, productIndexPath } from "@/lib/storefront-routes.ts";

export function CampaignHeader({
  storefront,
  design,
}: Readonly<{ storefront: PublicStorefront; design: PublicStorefrontDesign }>) {
  const presentation = storefront.presentation;
  if (presentation.schemaVersion !== 2 && presentation.schemaVersion !== 3)
    return null;
  return (
    <header
      className={styles.header}
      data-header-style={presentation.visual.headerStyle}
      data-header-width={
        presentation.schemaVersion === 3
          ? presentation.visual.headerWidth
          : "wide"
      }
      data-header-layout={
        presentation.schemaVersion === 3
          ? presentation.visual.headerLayout
          : "menu_logo_actions"
      }
    >
      <CampaignHeaderClient
        displayName={presentation.displayName}
        locale={storefront.locale}
        logo={
          design.publicationVersion > 1
            ? (design.brand.logo ?? presentation.logo)
            : presentation.logo
        }
        navigation={presentation.navigation}
        desktopNavigation={
          <nav className={styles.desktopNav} aria-label="Ana menü">
            <Link href="/">Ana Sayfa</Link>
            <Link href={productIndexPath(storefront.locale)}>Ürünler</Link>
            <StorefrontNavigationItems
              items={presentation.navigation.items}
              categoryHref={(slug) => categoryPath(storefront.locale, slug)}
              renderLink={(href, content, className) => <Link href={href} className={className}>{content}</Link>}
              classes={{ root: styles.megaTrigger, summary: styles.megaTrigger, panel: styles.mega, links: styles.megaLinks, featured: styles.featured, branch: styles.megaBranch }}
            />
          </nav>
        }
      />
    </header>
  );
}
