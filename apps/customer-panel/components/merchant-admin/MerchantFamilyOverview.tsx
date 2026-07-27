import Link from "next/link";

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

const SETTINGS_DESIGN_DESTINATION = Object.freeze({
  route: "/settings/design",
  title: "Tasarım",
  description: "Vitrin, banner ve duyuru yüzeylerini tek merkezden yönetin.",
});

export function MerchantFamilyOverview({ family, canManage }: Readonly<{
  family: MerchantModuleFamily;
  canManage: boolean;
}>) {
  const definitions = MERCHANT_MODULE_DEFINITIONS
    .filter((definition) => definition.family === family)
    .flatMap((definition) => family === "settings" && definition.route === "/settings/general"
      ? [definition, SETTINGS_DESIGN_DESTINATION]
      : [definition]);
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
