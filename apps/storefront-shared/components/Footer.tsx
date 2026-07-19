import Link from "next/link";
import type { PublicStorefront } from "../../../packages/saas-contracts/src/storefront/index.ts";

export function Footer({ storefront }: { storefront: PublicStorefront }) {
  return <footer className="store-footer"><div className="store-container footer-grid"><div><strong>{storefront.name}</strong><p>Özenle seçilen ürünler, güvenli ve sade bir mağaza deneyimi.</p></div><nav aria-label="Alt menü"><span>Keşfet</span><Link href="/">Ana Sayfa</Link><Link href="/products">Tüm Ürünler</Link></nav><div><span>Mağaza</span><p>{storefront.hostname}</p><p>TRY · Türkçe</p></div></div><div className="store-container footer-bottom"><span>© {new Date().getUTCFullYear()} {storefront.name}</span><span>Celebix altyapısıyla sunulur</span></div></footer>;
}
