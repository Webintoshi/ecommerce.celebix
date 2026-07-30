import Link from "next/link";
import type { PublicStarterThemePresentation } from "@celebix/saas-contracts";

import { PanelPageHeader, PanelPageShell, PanelPanel } from "@/components/panel/PanelPageShell";
import { StarterThemePreview } from "./StarterThemePreview";
import { StorefrontAssetManager } from "./StorefrontAssetManager";
import styles from "./design-settings.module.css";

const SURFACES = Object.freeze([
  ["Tema", "/settings/theme", "Renk, başlık ve ürün kartı düzenini güvenli seçeneklerle yönetin."],
  ["Mağaza bilgileri", "/settings/general", "Vitrinde görünen mağaza adı ve destek bilgilerini yönetin."],
  ["Hero banner", "/settings/hero-banner", "Ana sayfa karşılama metnini ve hedefini yönetin."],
  ["Promosyon banner", "/settings/promotion-banner", "Zaman sınırı olan promosyon alanlarını yönetin."],
  ["Kayan duyuru", "/settings/marquee", "Mağaza duyuru şeridini yönetin."],
  ["SEO", "/seo", "Vitrinin arama görünürlüğünü kalıcı ayarlardan yönetin."],
  ["Sosyal önizleme", "/seo/social-preview", "Paylaşım başlığı ve görsel ayarlarını yönetin."],
  ["Koleksiyonlar", "/products/collections", "Vitrindeki ürün gruplarını yönetin."],
] as const);

export function DesignSettingsHub({
  canManage,
  presentation,
  storefrontHostname,
}: Readonly<{
  canManage: boolean;
  presentation: PublicStarterThemePresentation;
  storefrontHostname: string | null;
}>) {
  return <PanelPageShell>
    <PanelPageHeader title="Tasarım ayarları" description="Starter vitrinin görünümünü kalıcı, mağaza-bazlı ayarlardan yönetin." />
    <StarterThemePreview presentation={presentation} storefrontHostname={storefrontHostname} />
    <StorefrontAssetManager canManage={canManage} />
    <PanelPanel title="Vitrin kontrolleri">
      <p className={styles.statusCopy}>Yalnız etkin kayıtlar vitrinde yayınlanır. Taslaklar müşterilere gösterilmez.</p>
      <div className={styles.surface}>
      {SURFACES.map(([title, href, description]) => canManage
        ? <Link className={styles.card} href={href} key={href}><strong>{title}</strong><span>{description}</span><small>Düzenle</small></Link>
        : <div aria-disabled="true" className={`${styles.card} ${styles.disabledCard}`} key={href}><strong>{title}</strong><span>{description}</span><small>Görüntüleme yetkisi</small></div>)}
      </div>
    </PanelPanel>
  </PanelPageShell>;
}
