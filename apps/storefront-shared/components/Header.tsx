import Link from "next/link";
import type { PublicStorefront } from "../../../packages/saas-contracts/src/storefront/index.ts";

export function Header({ storefront }: { storefront: PublicStorefront }) {
  return <header className="store-header"><div className="store-container header-row"><Link className="wordmark" href="/" aria-label={`${storefront.name} ana sayfa`}>{storefront.name}</Link><nav className="desktop-nav" aria-label="Ana menü"><Link href="/">Ana Sayfa</Link><Link href="/products">Ürünler</Link></nav><details className="mobile-menu"><summary aria-label="Menüyü aç">Menü</summary><nav aria-label="Mobil menü"><Link href="/">Ana Sayfa</Link><Link href="/products">Ürünler</Link></nav></details><span className="header-bag" aria-label="Sepet yakında">Çanta <b>0</b></span></div></header>;
}
