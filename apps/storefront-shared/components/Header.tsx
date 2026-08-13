import Link from "next/link";
import type {
  PublicStorefront,
  PublicStorefrontDesign,
} from "@celebix/saas-contracts";
import { StoreUtilities } from "./StoreUtilities";
import { CampaignHeader } from "./CampaignHeader";
import { productIndexPath } from "@/lib/storefront-routes.ts";

export function Header({
  storefront,
  design,
}: {
  storefront: PublicStorefront;
  design: PublicStorefrontDesign;
}) {
  if (
    storefront.presentation.schemaVersion === 2 ||
    storefront.presentation.schemaVersion === 3
  )
    return <CampaignHeader storefront={storefront} design={design} />;
  const { displayName, logo } = storefront.presentation;
  const customLogo = design.publicationVersion > 1 ? design.brand.logo : null;
  return (
    <header className="store-header">
      <div className="store-container header-row">
        <Link
          className="wordmark"
          href="/"
          aria-label={`${displayName} ana sayfa`}
        >
          {customLogo ? (
            <img
              className="store-logo"
              src={customLogo.url}
              alt={customLogo.altText || displayName}
              width={180}
              height={48}
            />
          ) : logo ? (
            <img
              className="store-logo"
              src={logo.url}
              alt={logo.altText}
              width={logo.width}
              height={logo.height}
            />
          ) : (
            displayName
          )}
        </Link>
        <nav className="desktop-nav" aria-label="Ana menü">
          <Link href="/">Ana Sayfa</Link>
          <Link href={productIndexPath(storefront.locale)}>Ürünler</Link>
        </nav>
        <div className="header-actions">
          <StoreUtilities />
          <details className="mobile-menu">
            <summary aria-label="Menüyü aç">Menü</summary>
            <nav aria-label="Mobil menü">
              <Link href="/">Ana Sayfa</Link>
              <Link href={productIndexPath(storefront.locale)}>Ürünler</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
