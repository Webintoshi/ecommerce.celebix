import Link from "next/link";
import type { PublicStorefront } from "@celebix/saas-contracts";

export function Header({ storefront }: { storefront: PublicStorefront }) {
  const displayName = storefront.presentation.displayName;
  return <header className="store-header"><div className="store-container header-row"><Link className="wordmark" href="/" aria-label={`${displayName} ana sayfa`}>{displayName}</Link><nav className="desktop-nav" aria-label="Ana menü"><Link href="/">Ana Sayfa</Link><Link href="/products">Ürünler</Link></nav><details className="mobile-menu"><summary aria-label="Menüyü aç">Menü</summary><nav aria-label="Mobil menü"><Link href="/">Ana Sayfa</Link><Link href="/products">Ürünler</Link></nav></details></div></header>;
}
