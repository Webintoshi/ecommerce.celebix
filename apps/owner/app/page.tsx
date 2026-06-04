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
import { formatDateTime } from "@/lib/formatters";
import {
  getProvisioningLabel,
  getProvisioningToneClass,
  getSetupSignals,
  isLegacyDatabaseMode,
} from "@/lib/lifecycle-ui";
import { isSuperAdmin, requireOwnerAuth } from "@/lib/owner-auth";
import {
  getOwnerPreviewFlags,
  isOwnerActionDisabled,
} from "@/lib/preview-mode";

export default async function OwnerDashboardPage() {
  const auth = await requireOwnerAuth("/");
  const superAdmin = isSuperAdmin(auth);
  const previewFlags = getOwnerPreviewFlags();
  const createStoreDisabled = isOwnerActionDisabled("create_store", previewFlags);
  const repairDisabled = isOwnerActionDisabled("repair", previewFlags);

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
  const readinessRate = portfolioCount > 0 ? Math.round((totals.liveStorefronts / portfolioCount) * 100) : 0;
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
  const setupQueueCount = dashboardStores.filter((store) =>
    getSetupSignals(store.setup).some((signal) => signal.pending),
  ).length;
  const adminIssueCount = dashboardStores.filter(
    (store) => !store.health.adminDeploymentReady || !store.health.adminRuntimeConsistent,
  ).length;
  const storefrontIssueCount = dashboardStores.filter(
    (store) => !store.health.storefrontReady || !store.health.storefrontRuntimeConsistent,
  ).length;
  const infrastructureIssueCount = dashboardStores.filter(
    (store) =>
      !store.health.secretAuthorityReady ||
      store.consistency.blocking ||
      store.provisioning.failedStepCount > 0,
  ).length;
  const setupQueueStores = dashboardStores
    .map((store) => ({
      store,
      signals: getSetupSignals(store.setup).filter((signal) => signal.pending),
    }))
    .filter((entry) => entry.signals.length > 0)
    .slice(0, 5);

  const priorityRows = [
    {
      label: "Auth kurulumu bekleyen mağazalar",
      count: pendingAuthCount,
      tone: pendingAuthCount > 0 ? ("warning" as const) : ("success" as const),
      status: pendingAuthCount > 0 ? "Aksiyon bekliyor" : "Temiz",
    },
    {
      label: "Analytics kurulumu bekleyen mağazalar",
      count: pendingAnalyticsCount,
      tone: pendingAnalyticsCount > 0 ? ("warning" as const) : ("success" as const),
      status: pendingAnalyticsCount > 0 ? "Takipte" : "Temiz",
    },
    {
      label: "Ödeme kurulumu bekleyen mağazalar",
      count: pendingPaymentCount,
      tone: pendingPaymentCount > 0 ? ("warning" as const) : ("success" as const),
      status: pendingPaymentCount > 0 ? "Öncelikli" : "Temiz",
    },
    {
      label: "Yeni standart dışı mağazalar",
      count: legacyStoreCount,
      tone: legacyStoreCount > 0 ? ("warning" as const) : ("success" as const),
      status: legacyStoreCount > 0 ? "Legacy" : "Yeni standart",
    },
  ];

  const kpiCards = [
    {
      label: "Toplam Mağaza",
      value: portfolioCount.toLocaleString("tr-TR"),
      note: `${totals.activeStores} aktif, ${totals.draftStores} taslak`,
      tone: "neutral" as const,
    },
    {
      label: "Canlı Vitrin",
      value: totals.liveStorefronts.toLocaleString("tr-TR"),
      note: `%${readinessRate} canlı çıkış oranı`,
      tone: "success" as const,
    },
    {
      label: "Kurulum Bekleyen",
      value: setupQueueCount.toLocaleString("tr-TR"),
      note: "Auth, analytics veya ödeme adımı bekliyor",
      tone: setupQueueCount > 0 ? ("warning" as const) : ("neutral" as const),
    },
    {
      label: "Yeni Standart Dışı",
      value: legacyStoreCount.toLocaleString("tr-TR"),
      note: "Legacy veritabanı modunda izlenen mağaza",
      tone: legacyStoreCount > 0 ? ("legacy" as const) : ("neutral" as const),
    },
  ];

  const systemHealthCards = [
    {
      label: "Altyapı",
      value: infrastructureIssueCount === 0 ? "Hazır" : `${infrastructureIssueCount} uyarı`,
      tone: infrastructureIssueCount === 0 ? ("success" as const) : ("warning" as const),
      note: "Secret, consistency ve provisioning sinyalleri",
    },
    {
      label: "Admin Uygulamaları",
      value: adminIssueCount === 0 ? "Kararlı" : `${adminIssueCount} takip`,
      tone: adminIssueCount === 0 ? ("success" as const) : ("warning" as const),
      note: "Deploy ve runtime tutarlılığı",
    },
    {
      label: "Storefront",
      value: storefrontIssueCount === 0 ? `${totals.liveStorefronts} canlı` : `${storefrontIssueCount} sorun`,
      tone: storefrontIssueCount === 0 ? ("success" as const) : ("warning" as const),
      note: "Vitrin erişimi ve runtime durumu",
    },
    {
      label: "Veritabanı",
      value: legacyStoreCount === 0 ? "Yeni standart" : `${legacyStoreCount} legacy`,
      tone: legacyStoreCount === 0 ? ("success" as const) : ("warning" as const),
      note: "Light Postgres geçiş standardı",
    },
  ];

  return (
    <>
      <OwnerPageHeader
        className="dashboard-page-header"
        eyebrow="OWNER PANEL"
        title="Genel Bakış"
        copy="Mağaza kurulumlarını, operasyon aksiyonlarını ve platform sağlığını tek ekrandan yönetin."
        chips={
          <>
            {previewFlags.previewMode || previewFlags.writeActionsDisabled ? (
              <OwnerStatusChip tone="warning">Önizleme Modu</OwnerStatusChip>
            ) : null}
            <OwnerStatusChip tone="ink">{superAdmin ? "Süper Yönetici" : "Affiliate Yönetici"}</OwnerStatusChip>
          </>
        }
      />

      <section className="dashboard-command-grid">
        <div className="dashboard-command-card">
          <span className="dashboard-command-label">KONTROL PANELİ</span>
          <div className="dashboard-command-copy">
            <h2>Bugünkü kurulum, mağaza ve operasyon durumunu özetler.</h2>
            <p>Öncelikli aksiyonları, canlı vitrinleri ve yeni standart dışı mağazaları aynı çalışma yüzeyinde takip edin.</p>
          </div>
          <div className="dashboard-command-chips">
            <span>{totals.liveStorefronts.toLocaleString("tr-TR")} canlı vitrin</span>
            <span>{setupQueueCount.toLocaleString("tr-TR")} kurulum aksiyonu</span>
            <span>{attentionCount.toLocaleString("tr-TR")} mağaza dikkat istiyor</span>
          </div>
          <div className="actions no-margin">
            {superAdmin ? (
              <OwnerActionButton href="/stores/new" tone="primary" disabled={createStoreDisabled}>
                Yeni Mağaza
              </OwnerActionButton>
            ) : null}
            <OwnerActionButton href="/stores" tone="secondary">
              Mağazaları Gör
            </OwnerActionButton>
          </div>
        </div>

        <aside className="dashboard-priority-card">
          <div className="section-head">
            <div>
              <div className="card-title">Bugünün Öncelikleri</div>
              <p className="section-copy">İlk bakışta takip edilmesi gereken kurulum ve standart sinyalleri.</p>
            </div>
          </div>
          <div className="dashboard-priority-list">
            {priorityRows.map((row) => (
              <div key={row.label} className="dashboard-priority-row">
                <div>
                  <strong>{row.label}</strong>
                  <span>{row.status}</span>
                </div>
                <div className="dashboard-priority-count">
                  <b>{row.count.toLocaleString("tr-TR")}</b>
                  <OwnerStatusChip tone={row.tone}>{row.count > 0 ? "Açık" : "Kapalı"}</OwnerStatusChip>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="dashboard-kpi-grid" aria-label="Dashboard metrikleri">
        {kpiCards.map((card) => (
          <OwnerKpiCard
            key={card.label}
            label={card.label}
            value={card.value}
            note={card.note}
            tone={card.tone}
          />
        ))}
      </section>

      {dashboardError ? (
        <OwnerSectionCard title="Veri uyarısı" tone="danger" className="section-tight">
          <p className="form-error">{dashboardError}</p>
        </OwnerSectionCard>
      ) : null}

      <section className="dashboard-lower-grid">
        <OwnerSectionCard
          title="Kurulum Aksiyonu Bekleyenler"
          copy="Kurulum zincirinde sıradaki aksiyonu bekleyen mağazalar."
          actions={
            <OwnerActionButton href="/operations" tone="secondary">
              Operasyonlar
            </OwnerActionButton>
          }
        >
          {setupQueueStores.length === 0 ? (
            <OwnerEmptyState
              title="Bekleyen kurulum aksiyonu yok"
              copy="Auth, analytics ve ödeme kurulum zinciri şu an temiz görünüyor."
              action={
                <OwnerActionButton href="/stores" tone="secondary">
                  Mağazaları İncele
                </OwnerActionButton>
              }
            />
          ) : (
            <div className="owner-entity-list dashboard-setup-list">
              {setupQueueStores.map(({ store, signals }) => (
                <OwnerEntityRow
                  key={store.id}
                  title={store.name}
                  subtitle={store.slug}
                  tags={
                    <>
                      <OwnerStatusChip tone={getProvisioningToneClass(store.provisioning.state).includes("danger") ? "danger" : "accent"}>
                        {getProvisioningLabel(store.provisioning.state)}
                      </OwnerStatusChip>
                      {signals.slice(0, 2).map((signal) => (
                        <span key={signal.key} className={`pill ${signal.pillClassName}`}>
                          {signal.shortLabel}
                        </span>
                      ))}
                    </>
                  }
                  actions={
                    <OwnerActionButton href={`/stores/${store.slug}`} tone="ghost">
                      Detay
                    </OwnerActionButton>
                  }
                  meta={
                    <>
                      <strong>{signals.length}</strong>
                      <span>aksiyon</span>
                    </>
                  }
                />
              ))}
            </div>
          )}
        </OwnerSectionCard>

        <OwnerSectionCard
          title="Son Kurulum Olayları"
          copy="Atama, profil güncelleme ve mağaza hareketleri."
        >
          {!dashboard || dashboard.recentActivity.length === 0 ? (
            <OwnerEmptyState title="Henüz aktivite yok" copy="İlk mağaza hareketi sonrası bu alan dolacak." />
          ) : (
            <div className="owner-entity-list dashboard-activity-list">
              {dashboard.recentActivity.slice(0, 5).map((item) => (
                <OwnerEntityRow
                  key={item.id}
                  title={item.targetLabel}
                  subtitle={item.action.replace(/_/g, " ")}
                  meta={
                    <>
                      <strong>{item.actorName}</strong>
                      <span>{formatDateTime(item.createdAt)}</span>
                    </>
                  }
                />
              ))}
            </div>
          )}
        </OwnerSectionCard>
      </section>

      <section className="dashboard-health-strip" aria-label="Sistem sağlığı">
        {systemHealthCards.map((card) => (
          <article key={card.label} className={`dashboard-health-card tone-${card.tone}`}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <p>{card.note}</p>
          </article>
        ))}
      </section>
    </>
  );
}
