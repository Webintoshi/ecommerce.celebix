import {
  OwnerActionButton,
  OwnerEmptyState,
  OwnerEntityRow,
  OwnerKpiCard,
  OwnerPageHeader,
  OwnerSectionCard,
  OwnerStatusChip,
} from "@/components/owner-control";
import { repairOwnerDeploymentBranchOnce } from "@/lib/coolify-owner-deployment";
import { getOwnerDashboard } from "@/lib/control-plane";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { isLegacyDatabaseMode } from "@/lib/lifecycle-ui";
import { isSuperAdmin, requireOwnerAuth } from "@/lib/owner-auth";
import {
  getOwnerPreviewDisabledNotice,
  getOwnerPreviewFlags,
  isOwnerActionDisabled,
} from "@/lib/preview-mode";

export default async function OwnerDashboardPage() {
  const auth = await requireOwnerAuth("/");
  const superAdmin = isSuperAdmin(auth);
  const previewFlags = getOwnerPreviewFlags();
  const createStoreDisabled = isOwnerActionDisabled("create_store", previewFlags);
  const deployDisabled = isOwnerActionDisabled("deploy", previewFlags);
  const repairDisabled = isOwnerActionDisabled("repair", previewFlags);
  const deployDisabledReason = getOwnerPreviewDisabledNotice("deploy", previewFlags) ?? undefined;

  if (superAdmin && !repairDisabled) {
    await repairOwnerDeploymentBranchOnce();
  }

  let dashboardError: string | null = null;
  let dashboard: Awaited<ReturnType<typeof getOwnerDashboard>> | null = null;

  try {
    dashboard = await getOwnerDashboard(auth);
  } catch (error) {
    dashboardError = error instanceof Error ? error.message : "Owner dashboard verisi yüklenemedi.";
  }

  const totals = dashboard?.totals ?? {
    setupRevenue: 0,
    revenue: 0,
    orders: 0,
    customers: 0,
    activeStores: 0,
    draftStores: 0,
    pendingOrders: 0,
    liveStorefronts: 0,
    affiliateExposure: 0,
  };

  const dashboardStores = dashboard?.stores ?? [];
  const portfolioCount = totals.activeStores + totals.draftStores;
  const attentionCount = dashboard?.attentionStores.length ?? 0;
  const pendingAuthCount = dashboardStores.filter(
    (store) => store.setup.auth.status === "pending_auth_setup",
  ).length;
  const pendingAnalyticsCount = dashboardStores.filter(
    (store) => store.setup.analytics.status === "pending_analytics_setup",
  ).length;
  const pendingPaymentCount = dashboardStores.filter(
    (store) => store.setup.payments.status === "pending_payment_setup",
  ).length;
  const legacyStoreCount = dashboardStores.filter((store) => isLegacyDatabaseMode(store.databaseMode)).length;
  const setupQueueCount = pendingAuthCount + pendingAnalyticsCount + pendingPaymentCount;
  const cleanupRuns = dashboard?.cleanupRuns.slice(0, 3) ?? [];
  const attentionStores = dashboard?.attentionStores.slice(0, 4) ?? [];

  const queueBuckets = [
    {
      key: "auth",
      title: "Auth Kurulumu Bekleyen",
      count: pendingAuthCount,
      note: "Yeni mağazaların kimlik katmanı kurulumu henüz tamamlanmadı.",
    },
    {
      key: "analytics",
      title: "Analytics Kurulumu Bekleyen",
      count: pendingAnalyticsCount,
      note: "İzleme ve raporlama akışı için kurulumu bekleyen mağazalar var.",
    },
    {
      key: "payment",
      title: "Ödeme Kurulumu Bekleyen",
      count: pendingPaymentCount,
      note: "Tahsilat katmanı devreye alınmadan önce operasyon takibi gerekiyor.",
    },
  ];

  const pageTitle = superAdmin ? "Owner panel genel bakış" : "Affiliate portföy genel bakış";
  const pageCopy = superAdmin
    ? "Kurulum akışını, canlı vitrinleri ve aksiyon bekleyen işleri tek ekranda izleyin."
    : "Kendi portföyünüzdeki mağazaları, canlıya çıkış durumunu ve bekleyen kurulum işlerini sade bir kontrol akışıyla takip edin.";

  return (
    <>
      <OwnerPageHeader
        eyebrow={superAdmin ? "Genel Bakış" : "Affiliate Paneli"}
        title={superAdmin ? "Genel Bakış" : pageTitle}
        copy={pageCopy}
        className="dashboard-page-header"
        chips={
          <>
            <OwnerStatusChip tone="accent">{totals.liveStorefronts} canlı vitrin</OwnerStatusChip>
            <OwnerStatusChip tone={setupQueueCount > 0 ? "warning" : "success"}>
              {setupQueueCount > 0 ? `${setupQueueCount} kurulum aksiyonu` : "Kurulum akışı temiz"}
            </OwnerStatusChip>
            <OwnerStatusChip tone={attentionCount > 0 ? "warning" : "success"}>
              {attentionCount > 0 ? `${attentionCount} mağaza dikkat istiyor` : "Kritik uyarı yok"}
            </OwnerStatusChip>
          </>
        }
        actions={
          <>
            <OwnerActionButton href="/stores" tone="secondary">
              Mağazalar
            </OwnerActionButton>
            {superAdmin ? (
              <OwnerActionButton href="/stores/new" tone="primary">
                {createStoreDisabled ? "Yeni Mağaza Formu" : "Yeni Mağaza"}
              </OwnerActionButton>
            ) : null}
          </>
        }
        aside={
          <div className="owner-header-summary">
            <div className="owner-header-summary-item">
              <span>Toplam mağaza</span>
              <strong>{portfolioCount}</strong>
            </div>
            <div className="owner-header-summary-item">
              <span>Toplam sipariş</span>
              <strong>{totals.orders.toLocaleString("tr-TR")}</strong>
            </div>
            <div className="owner-header-summary-item">
              <span>Kurulum geliri</span>
              <strong>{formatCurrency(totals.setupRevenue)}</strong>
            </div>
            <div className="owner-header-summary-item">
              <span>Affiliate etkisi</span>
              <strong>{formatCurrency(totals.affiliateExposure)}</strong>
            </div>
          </div>
        }
      />

      <div className="dashboard-command-grid">
        <section className="dashboard-command-card">
          <span className="dashboard-command-label">Kontrol Paneli</span>
          <div className="dashboard-command-copy">
            <h2>Bugünkü kurulum, mağaza ve operasyon durumunu özetler.</h2>
            <p>Öncelikli aksiyonları, canlı vitrinleri ve yeni standart dışı mağazaları aynı çalışma yüzeyinde takip edin.</p>
          </div>
          <div className="dashboard-command-chips">
            <span>{totals.liveStorefronts} canlı vitrin</span>
            <span>{setupQueueCount} kurulum aksiyonu</span>
            <span>{attentionCount} mağaza dikkat istiyor</span>
          </div>
          <div className="actions hero-actions">
            {superAdmin ? (
              <OwnerActionButton href="/stores/new" tone="primary" disabled={createStoreDisabled}>
                Yeni Mağaza
              </OwnerActionButton>
            ) : null}
            <OwnerActionButton href="/stores" tone="secondary">
              Mağazaları Gör
            </OwnerActionButton>
          </div>
        </section>

        <OwnerSectionCard
          title="Bugünün Öncelikleri"
          copy="İlk bakışta takip edilmesi gereken kurulum ve standart sinyalleri."
          className="dashboard-priority-card"
        >
          <div className="dashboard-priority-list">
            {queueBuckets.map((bucket) => (
              <div key={bucket.key} className="dashboard-priority-row">
                <div>
                  <strong>{bucket.title}</strong>
                  <span>{bucket.count > 0 ? "Aksiyon bekliyor" : "Tamamlandı"}</span>
                </div>
                <div className="dashboard-priority-count">
                  <strong>{bucket.count}</strong>
                  <OwnerStatusChip tone={bucket.count > 0 ? "warning" : "success"}>
                    {bucket.count > 0 ? "Açık" : "Kapalı"}
                  </OwnerStatusChip>
                </div>
              </div>
            ))}
            <div className="dashboard-priority-row">
              <div>
                <strong>Yeni standart dışı mağazalar</strong>
                <span>{legacyStoreCount > 0 ? "Legacy takipte" : "Yeni standart"}</span>
              </div>
              <div className="dashboard-priority-count">
                <strong>{legacyStoreCount}</strong>
                <OwnerStatusChip tone={legacyStoreCount > 0 ? "legacy" : "success"}>
                  {legacyStoreCount > 0 ? "Takipte" : "Kapalı"}
                </OwnerStatusChip>
              </div>
            </div>
          </div>
        </OwnerSectionCard>
      </div>

      <div className="owner-metric-grid dashboard-kpi-grid">
        <OwnerKpiCard
          label="Toplam mağaza"
          value={portfolioCount}
          note={`${totals.activeStores} aktif, ${totals.draftStores} taslak`}
          tone="accent"
        />
        <OwnerKpiCard
          label="Canlı vitrin"
          value={totals.liveStorefronts}
          note="Yayın hazırlığı tamamlanan mağazalar"
          tone="success"
        />
        <OwnerKpiCard
          label="Bekleyen sipariş"
          value={totals.pendingOrders}
          note="Operasyon takibi gereken siparişler"
          tone={totals.pendingOrders > 0 ? "warning" : "neutral"}
        />
        <OwnerKpiCard
          label="Yeni standart dışı"
          value={legacyStoreCount}
          note="Legacy veya özel modda kalan mağazalar"
          tone={legacyStoreCount > 0 ? "legacy" : "neutral"}
        />
      </div>

      {dashboardError ? (
        <OwnerSectionCard title="Veri uyarısı" tone="danger" className="section-tight">
          <p className="form-error">{dashboardError}</p>
        </OwnerSectionCard>
      ) : null}

      <div className="owner-dashboard-grid">
        <OwnerSectionCard
          eyebrow="Panel Durumu"
          title="Kontrol paneli özeti"
          copy="Package 1 ile shell, light-first yüzey sistemi ve preview güvenliği aynı çerçevede toplanıyor."
        >
          <div className="owner-entity-list">
            <OwnerEntityRow
              title="Yazma ve deploy güvenliği"
              subtitle={
                deployDisabled
                  ? deployDisabledReason || "Önizleme ortamında deploy ve yazma aksiyonları kontrollü kapatıldı."
                  : "Deploy ve yazma aksiyonları yetkili kullanıcılar için aktif."
              }
              tags={
                <>
                  <OwnerStatusChip tone={deployDisabled ? "warning" : "success"}>
                    {deployDisabled ? "Deploy kapalı" : "Deploy açık"}
                  </OwnerStatusChip>
                  <OwnerStatusChip tone={repairDisabled ? "warning" : "success"}>
                    {repairDisabled ? "Onarım kapalı" : "Onarım açık"}
                  </OwnerStatusChip>
                </>
              }
              meta={
                <>
                  <strong>{previewFlags.previewMode ? "Önizleme" : "Canlı"}</strong>
                  <span>ortam</span>
                </>
              }
            />

            <OwnerEntityRow
              title="Ekosistem hacmi"
              subtitle={`${totals.customers.toLocaleString("tr-TR")} müşteri ve ${formatCurrency(totals.revenue)} toplam hacim`}
              tags={
                <>
                  <OwnerStatusChip tone="ink">{totals.orders.toLocaleString("tr-TR")} sipariş</OwnerStatusChip>
                  <OwnerStatusChip tone="accent">{formatCurrency(totals.affiliateExposure)} affiliate etkisi</OwnerStatusChip>
                </>
              }
              meta={
                <>
                  <strong>{totals.activeStores}</strong>
                  <span>aktif mağaza</span>
                </>
              }
            />

            <OwnerEntityRow
              title="Temizlik kuyruğu"
              subtitle={
                cleanupRuns.length > 0
                  ? `Authority silinmiş ancak dış kaynak temizliği süren ${dashboard?.orphanedCleanupRuns ?? 0} kayıt var.`
                  : "Şu anda açıkta kalan temizlik kaydı bulunmuyor."
              }
              tags={
                cleanupRuns.length > 0 ? (
                  cleanupRuns.map((run) => (
                    <OwnerStatusChip key={run.id || run.slug} tone="warning">
                      {run.storeName}
                    </OwnerStatusChip>
                  ))
                ) : (
                  <OwnerStatusChip tone="success">Temizlik kuyruğu temiz</OwnerStatusChip>
                )
              }
              meta={
                cleanupRuns[0] ? (
                  <>
                    <strong>{formatDateTime(cleanupRuns[0].createdAt)}</strong>
                    <span>son kayıt</span>
                  </>
                ) : (
                  <>
                    <strong>0</strong>
                    <span>kayıt</span>
                  </>
                )
              }
            />
          </div>
        </OwnerSectionCard>

        <OwnerSectionCard
          eyebrow="Kurulum Akışı"
          title="Kurulum Aksiyonu Bekleyenler"
          copy="Auth, analytics ve ödeme kurulumları ile manuel takip isteyen mağazalar tek blokta özetlenir."
          tone={setupQueueCount > 0 || attentionCount > 0 ? "accent" : "neutral"}
          actions={
            <OwnerActionButton href="/operations" tone="secondary">
              Operasyonları Aç
            </OwnerActionButton>
          }
        >
          {queueBuckets.some((bucket) => bucket.count > 0) || attentionStores.length > 0 ? (
            <div className="owner-entity-list">
              {queueBuckets.map((bucket) => (
                <OwnerEntityRow
                  key={bucket.key}
                  title={bucket.title}
                  subtitle={bucket.note}
                  tags={
                    <OwnerStatusChip tone={bucket.count > 0 ? "warning" : "success"}>
                      {bucket.count > 0 ? "Aksiyon bekliyor" : "Tamamlandı"}
                    </OwnerStatusChip>
                  }
                  meta={
                    <>
                      <strong>{bucket.count}</strong>
                      <span>mağaza</span>
                    </>
                  }
                />
              ))}

              {attentionStores.map((store) => (
                <OwnerEntityRow
                  key={store.id}
                  title={store.name}
                  subtitle={store.management.nextAction || "Kurulum veya operasyon tarafında manuel takip gerekiyor."}
                  tags={
                    <>
                      <OwnerStatusChip tone="accent">{store.databaseMode}</OwnerStatusChip>
                      <OwnerStatusChip tone={store.health.label === "kritik" ? "danger" : "warning"}>
                        {store.health.label}
                      </OwnerStatusChip>
                    </>
                  }
                  actions={
                    <OwnerActionButton href={`/stores/${store.slug}`} tone="ghost">
                      Detay
                    </OwnerActionButton>
                  }
                  meta={
                    <>
                      <strong>{store.pendingOrderCount}</strong>
                      <span>bekleyen sipariş</span>
                    </>
                  }
                />
              ))}
            </div>
          ) : (
            <OwnerEmptyState
              title="Bekleyen kurulum aksiyonu yok"
              copy="Auth, analytics ve ödeme kurulum zinciri şu an temiz görünüyor."
              action={
                <OwnerActionButton href="/stores" tone="secondary">
                  Mağazaları İncele
                </OwnerActionButton>
              }
            />
          )}
        </OwnerSectionCard>
      </div>
    </>
  );
}
