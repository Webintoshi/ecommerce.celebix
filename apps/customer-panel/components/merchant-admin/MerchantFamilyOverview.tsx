import Link from "next/link";
import { ArrowUpRight, FileText, LayoutList, NotebookPen } from "lucide-react";

import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import {
  MERCHANT_MODULE_DEFINITIONS,
  type MerchantModuleFamily,
} from "@/lib/merchant-admin-ui/presentation";
import { SettingsOverview } from "@/components/settings/SettingsOverview";
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

export function MerchantFamilyOverview({ family, canManage, embedded = false }: Readonly<{
  family: MerchantModuleFamily;
  canManage: boolean;
  embedded?: boolean;
}>) {
  if (family === "settings") return <SettingsOverview embedded={embedded} />;
  const definitions = MERCHANT_MODULE_DEFINITIONS
    .filter((definition) => definition.family === family);
  const presentation = FAMILY_PRESENTATION[family];

  return (
    <PanelPageShell embedded={embedded}>
      <PanelPageHeader title={presentation.title} description={presentation.description} embedded={embedded} />
      {!embedded ? <h1 className="sr-only">{presentation.title}</h1> : null}
      <nav className={styles.grid} aria-label={`${presentation.title} bölümleri`}>
        {definitions.map((definition) => (
          <Link className={styles.card} key={definition.route} href={definition.route}>
            {definition.kind === "blog_post" ? <NotebookPen aria-hidden="true" /> : definition.kind === "page" ? <LayoutList aria-hidden="true" /> : <FileText aria-hidden="true" />}
            <span className={styles.cardCopy}>
              <strong>{definition.title}</strong>
              <span className="sr-only">{definition.description}</span>
            </span>
            <ArrowUpRight className={styles.arrow} aria-hidden="true" /><small className="sr-only">{canManage ? "Yönet" : "Görüntüle"}</small>
          </Link>
        ))}
      </nav>
    </PanelPageShell>
  );
}
