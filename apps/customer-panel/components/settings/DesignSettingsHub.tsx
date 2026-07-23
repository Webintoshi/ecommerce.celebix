import Link from "next/link";

import { PanelPageHeader, PanelPageShell, PanelPanel } from "@/components/panel/PanelPageShell";
import styles from "./design-settings.module.css";

const SURFACES = Object.freeze([
  ["Hero banner", "/settings/hero-banner", "Ana sayfa üst görselini kalıcı ayarlardan yönetin."],
  ["Promosyon banner", "/settings/promotion-banner", "Kalıcı promosyon alanlarını yönetin."],
  ["Kayan duyuru", "/settings/marquee", "Mağaza duyurusunu yönetin."],
  ["Koleksiyonlar", "/products/collections", "Vitrindeki ürün gruplarını yönetin."],
] as const);

export function DesignSettingsHub({ canManage }: Readonly<{ canManage: boolean }>) {
  return <PanelPageShell>
    <PanelPageHeader title="Tasarım ayarları" description="Mevcut kalıcı vitrin yüzeylerini yönetin." />
    <PanelPanel title="Vitrin yüzeyleri">
      <div className={styles.surface}>
      {SURFACES.map(([title, href, description]) => <Link className={styles.card} href={href} key={href}>
        <strong>{title}</strong><span>{description}</span><small>{canManage ? "Yönet" : "Görüntüle"}</small>
      </Link>)}
      </div>
    </PanelPanel>
  </PanelPageShell>;
}
