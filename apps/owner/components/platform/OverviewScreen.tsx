"use client";

import Link from "next/link";
import { usePlatformResource } from "./resource";
import type { Overview } from "./types";
import { count, Metric, money, Panel, ResourceStatus, Screen } from "./ui";

export function OverviewScreen() {
  const overview = usePlatformResource<Overview>("/api/platform/overview");
  const data = overview.data;
  const missing = overview.loading ? "Yükleniyor…" : "Veri alınamadı";
  const metricMoney = (value?: number) => typeof value === "number" ? money(value) : missing;
  const metricCount = (value?: number) => typeof value === "number" ? count(value) : missing;
  return <Screen title="Özet" description="Mağazaların durumu ve platform hizmetlerinin finansal görünümü." actions={<Link className="platform-button is-primary" href="/stores/new">Yeni mağaza</Link>}>
    <ResourceStatus resource={overview} />
    <div className="platform-metrics"><Metric title="Toplam mağaza" value={metricCount(data?.storeCount)} /><Metric title="Aktif mağaza" value={metricCount(data?.activeStoreCount)} /><Metric title="Platform alacağı" value={metricMoney(data?.receivableCents)} accent /><Metric title="Tahsil edilen" value={metricMoney(data?.collectedCents)} /><Metric title="Vadesi geçen" value={metricMoney(data?.overdueCents)} note="Yalnızca uyarı; otomatik kapatma yok." /></div>
    <div className="platform-metrics is-three"><Metric title="Kurulum bekleyen" value={metricCount(data?.pendingSetupCount)} /><Metric title="Yaklaşan vadeler" value={metricCount(data?.upcomingDueCount)} note="Önümüzdeki 7 gündeki açık dönemler." /><Metric title="İlgi gereken sorunlar" value={metricCount(data?.attentionIssueCount)} /></div>
    <Panel title="Mağazaların tamamlanmış satışları"><p>TRY ile tamamlanmış mağaza siparişlerinin toplamıdır. Celebix hizmet ücretleri ve tahsilatları yukarıda ayrı gösterilir.</p><div className="platform-metrics is-three"><Metric title="Mağaza toplam cirosu" value={data?.merchantSales?.available ? money(data.merchantSales.totalCents) : "Veri kullanılamıyor"} /><Metric title="WEB satışları" value={data?.merchantSales?.available ? money(data.merchantSales.webCents) : "Veri kullanılamıyor"} /><Metric title="POS satışları" value={data?.merchantSales?.available ? money(data.merchantSales.posCents) : "Veri kullanılamıyor"} /></div>{Boolean(data?.merchantSales?.excludedCurrencyOrders) && <p className="platform-panel-note">{count(data?.merchantSales?.excludedCurrencyOrders)} farklı para birimindeki sipariş bu toplama dahil edilmedi.</p>}</Panel>
    {typeof data?.financialSetupRequired === "number" && data.financialSetupRequired > 0 && <div className="platform-notice"><p>{count(data.financialSetupRequired)} mağazada finansal kurulum gerekli. Gerçek hizmet bedelini borç dönemi oluşturarak kaydedin.</p></div>}
    <div className="platform-two-column"><Panel title="Mağaza yönetimi"><p>Ortak mağaza kayıtları, doğrulanmış sahiplik ve paket kullanımı tek yerde.</p><div className="platform-shortcuts"><Link href="/stores">Mağazaları görüntüle <span aria-hidden="true">→</span></Link><Link href="/plans">Paket sürümlerini yönet <span aria-hidden="true">→</span></Link></div></Panel><Panel title="Platform hizmet finansı"><p>Buradaki tutarlar platform hizmet bedelleri ve elle kaydedilen tahsilatlardır. Her mağazanın ticari siparişleri kendi yönetim panelindedir.</p><div className="platform-shortcuts"><Link href="/finance">Abonelik ve finansı aç <span aria-hidden="true">→</span></Link><Link href="/operations">Operasyon durumunu izle <span aria-hidden="true">→</span></Link></div></Panel></div>
  </Screen>;
}
