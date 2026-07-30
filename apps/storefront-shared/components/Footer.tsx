import Link from "next/link";
import type { PublicStorefront } from "@celebix/saas-contracts";

export function Footer({ storefront }: { storefront: PublicStorefront }) {
  const { displayName, supportEmail } = storefront.presentation;
  return <footer className="store-footer"><div className="store-container footer-grid"><div><strong>{displayName}</strong><p>Özenle seçilen ürünler, güvenli ve sade bir mağaza deneyimi.</p></div><nav aria-label="Alt menü"><span>Keşfet</span><Link href="/">Ana Sayfa</Link><Link href="/products">Tüm Ürünler</Link></nav><div><span>Mağaza</span><p>{storefront.hostname}</p>{supportEmail ? <a href={`mailto:${supportEmail}`}>{supportEmail}</a> : null}<p>TRY · Türkçe</p></div></div><div className="store-container footer-bottom"><span>© {new Date().getUTCFullYear()} {displayName}</span><span>Celebix altyapısıyla sunulur</span></div></footer>;
}
