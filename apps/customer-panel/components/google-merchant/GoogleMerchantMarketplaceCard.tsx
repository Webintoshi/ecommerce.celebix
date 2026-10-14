import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { GoogleMerchantLogo } from "@/components/google-marketing/GoogleMerchantLogo";
import { MarketplaceArtwork } from "@/components/marketplaces/MarketplaceArtwork";
import styles from "@/components/marketplaces/marketplaces.module.css";

export function GoogleMerchantMarketplaceCard() {
  return <article className={styles.entry}>
    <MarketplaceArtwork variant="products" className={styles.entryArtwork} />
    <div className={styles.entryContent}><div className={styles.entryIdentity}><GoogleMerchantLogo className={styles.entryLogo} /><h2>Google Merchant Center</h2></div><p>Ürün aktarımı, Google onayları ve eksik bilgiler.</p></div>
    <Link href="/marketplaces/google-merchant" className="button button-secondary">Bağlantıyı aç<ArrowUpRight size={16} aria-hidden="true" /></Link>
  </article>;
}
