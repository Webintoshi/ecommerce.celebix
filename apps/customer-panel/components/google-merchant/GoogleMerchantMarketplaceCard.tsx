import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { GoogleMerchantLogo } from "@/components/google-marketing/GoogleMerchantLogo";

import styles from "@/components/marketplaces/marketplaces.module.css";

export function GoogleMerchantMarketplaceCard() {
  return <article className={styles.entry}>
    <div className={styles.entryContent}><div className={styles.entryIdentity}><GoogleMerchantLogo className={styles.entryLogo} /><h2>Google Merchant Center</h2></div><p>Ürün aktarımı, Google onayları ve eksik bilgiler.</p></div>
    <Link href="/marketplaces/google-merchant" className="button button-secondary" aria-label="Google Merchant Center bağlantısını aç">Aç<ArrowUpRight size={16} aria-hidden="true" /></Link>
  </article>;
}
