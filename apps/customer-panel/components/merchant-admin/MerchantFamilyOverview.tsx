import Link from "next/link";
import { Bell, Building2, ChevronRight, CreditCard, Globe2, Languages, Palette, Sparkles, Truck, Users, type LucideIcon } from "lucide-react";

import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import {
  MERCHANT_MODULE_DEFINITIONS,
  type MerchantModuleFamily,
} from "@/lib/merchant-admin-ui/presentation";
import styles from "./merchant-family-overview.module.css";

const FAMILY_PRESENTATION: Readonly<Record<MerchantModuleFamily, Readonly<{
  title: string;
  description: string;
}>>> = Object.freeze({
  accounting: Object.freeze({ title: "Muhasebe", description: "Yasal profil ve fatura entegrasyonlarını yönetin." }),
  content: Object.freeze({ title: "İçerik", description: "Blog, sayfa ve politika içeriklerini tek merkezden yönetin." }),
  discounts: Object.freeze({ title: "İndirimler", description: "Kalıcı indirim ve kampanya kayıtlarını yönetin." }),
  marketplaces: Object.freeze({ title: "Pazar Yerleri", description: "Pazar yeri bağlantı hazırlıklarını ve durumlarını yönetin." }),
  marketing: Object.freeze({ title: "Pazarlama", description: "İzinli kitlelere ait kampanya taslaklarını yönetin." }),
  seo: Object.freeze({ title: "SEO", description: "Arama görünürlüğü için kalıcı mağaza yapılandırmalarını yönetin." }),
  settings: Object.freeze({ title: "Ayarlar", description: "Mağaza, ödeme, kargo ve görünüm yapılandırmalarını yönetin." }),
});

const SETTINGS_GROUPS: readonly Readonly<{
  title: string;
  items: readonly Readonly<{ href: string; label: string; icon: LucideIcon }>[];
}>[] = Object.freeze([
  Object.freeze({ title: "Mağaza", items: Object.freeze([
    Object.freeze({ href: "/settings/general", label: "Genel", icon: Building2 }),
    Object.freeze({ href: "/settings/domains", label: "Alan Adı", icon: Globe2 }),
    Object.freeze({ href: "/settings/language", label: "Dil", icon: Languages }),
    Object.freeze({ href: "/settings/administrators", label: "Yöneticiler", icon: Users }),
  ]) }),
  Object.freeze({ title: "Satış ve teslimat", items: Object.freeze([
    Object.freeze({ href: "/settings/payment", label: "Ödeme", icon: CreditCard }),
    Object.freeze({ href: "/settings/shipping", label: "Kargo", icon: Truck }),
  ]) }),
  Object.freeze({ title: "İletişim ve otomasyon", items: Object.freeze([
    Object.freeze({ href: "/settings/notifications", label: "Bildirimler", icon: Bell }),
    Object.freeze({ href: "/settings/artificial-intelligence", label: "Yapay Zeka", icon: Sparkles }),
  ]) }),
  Object.freeze({ title: "Görünüm", items: Object.freeze([
    Object.freeze({ href: "/settings/design", label: "Tasarım", icon: Palette }),
  ]) }),
]);

export function MerchantFamilyOverview({ family, canManage }: Readonly<{
  family: MerchantModuleFamily;
  canManage: boolean;
}>) {
  if (family === "settings") {
    return (
      <PanelPageShell>
        <PanelPageHeader title="Ayarlar" />
        <nav className={styles.settingsGroups} aria-label="Ayar bölümleri">
          {SETTINGS_GROUPS.map((group) => (
            <section className={styles.settingsGroup} key={group.title} aria-labelledby={`settings-${group.title}`}>
              <h2 id={`settings-${group.title}`}>{group.title}</h2>
              <div className={styles.settingsRows}>
                {group.items.map(({ href, label, icon: Icon }) => (
                  <Link className={styles.settingsRow} key={href} href={href}>
                    <span className={styles.settingsIcon} aria-hidden="true"><Icon size={20} strokeWidth={1.8} /></span>
                    <strong>{label}</strong>
                    <ChevronRight className={styles.settingsArrow} size={18} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </nav>
      </PanelPageShell>
    );
  }
  const definitions = MERCHANT_MODULE_DEFINITIONS
    .filter((definition) => definition.family === family);
  const presentation = FAMILY_PRESENTATION[family];

  return (
    <PanelPageShell>
      <PanelPageHeader title={presentation.title} description={presentation.description} />
      <nav className={styles.grid} aria-label={`${presentation.title} bölümleri`}>
        {definitions.map((definition) => (
          <Link className={styles.card} key={definition.route} href={definition.route}>
            <span className={styles.cardCopy}>
              <strong>{definition.title}</strong>
              <span>{definition.description}</span>
            </span>
            <small>{canManage ? "Yönet" : "Görüntüle"}</small>
          </Link>
        ))}
      </nav>
    </PanelPageShell>
  );
}
