import Link from "next/link";
import type { PublicStorefront } from "@celebix/saas-contracts";
import { StoreUtilities } from "./StoreUtilities";

export function Header({ storefront }: { storefront: PublicStorefront }) {
  const { displayName, logo } = storefront.presentation;
  return <header className="store-header"><div className="store-container header-row"><Link className="wordmark" href="/" aria-label={`${displayName} ana sayfa`}>{logo ? <img className="store-logo" src={logo.url} alt={logo.altText} width={logo.width} height={logo.height} /> : displayName}</Link><nav className="desktop-nav" aria-label="Ana menü"><Link href="/">Ana Sayfa</Link><Link href="/products">Ürünler</Link></nav><div className="header-actions"><StoreUtilities /><details className="mobile-menu"><summary aria-label="Menüyü aç">Menü</summary><nav aria-label="Mobil menü"><Link href="/">Ana Sayfa</Link><Link href="/products">Ürünler</Link></nav></details></div></div></header>;
}
