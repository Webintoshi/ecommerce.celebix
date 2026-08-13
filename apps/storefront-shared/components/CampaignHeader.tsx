import Link from "next/link";
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
            {presentation.navigation.items.map((item) => (
              <div className={styles.megaTrigger} key={item.slug}>
                <Link href={categoryPath(storefront.locale, item.slug)}>{item.name}</Link>
                {item.children.length || item.featured ? (
                  <div
                    className={styles.mega}
                    data-featured={item.featured ? "true" : "false"}
                  >
                    <div className={styles.megaLinks}>
                      <strong>{item.name}</strong>
                      {item.children.map((child) => (
                        <Link
                          href={categoryPath(storefront.locale, child.slug)}
                          key={child.slug}
                        >
                          {child.name}
                        </Link>
                      ))}
                    </div>
                    {item.featured ? (
                      <Link
                        className={styles.featured}
                        href={categoryPath(storefront.locale, item.featured.slug)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.featured.image.url}
                          alt={item.featured.image.altText}
                          width={item.featured.image.width}
                          height={item.featured.image.height}
                        />
                        <span>{item.featured.name}</span>
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </nav>
        }
      />
    </header>
  );
}
