import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { GoogleMerchantLogo } from "@/components/google-marketing/GoogleMerchantLogo";
import styles from "./google-merchant.module.css";

export function GoogleMerchantMarketplaceCard() {
  return <article className={styles.marketplaceCard}>
    <GoogleMerchantLogo className={styles.marketplaceLogo} />
    <div><h2>Google Merchant Center</h2><p>Ürünleri Google’a aktarın, durumlarını ve eksik bilgilerini yönetin.</p></div>
    <Link href="/marketplaces/google-merchant" className="button button-secondary">Bağlantıyı aç<ArrowUpRight size={16} aria-hidden="true" /></Link>
  </article>;
}
