import Link from "next/link";
import { LaunchStorefrontButton } from "@/components/LaunchStorefrontButton";
import {
  OwnerCommandHero,
  OwnerMetricCard,
  OwnerSectionHeader,
  OwnerStatusChip,
} from "@/components/owner-control";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import {
  getDatabaseModePillClass,
  getProvisioningLabel,
  getProvisioningToneClass,
  getSetupSignals,
  isLegacyDatabaseMode,
} from "@/lib/lifecycle-ui";
import { isSuperAdmin, requireOwnerAuth } from "@/lib/owner-auth";
import { repairOwnerDeploymentBranchOnce } from "@/lib/coolify-owner-deployment";
import { getOwnerDashboard } from "@/lib/control-plane";
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
    affiliateExposure: 0
  };

  const portfolioCount = totals.activeStores + totals.draftStores;
  const readinessRate = portfolioCount > 0 ? Math.round((totals.liveStorefronts / portfolioCount) * 100) : 0;
  const attentionCount = dashboard?.attentionStores.length ?? 0;
  const dashboardStores = dashboard?.stores ?? [];
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
  const heroTitle = superAdmin ? "Celebix Owner Paneli" : "Affiliate Portföy Kontrolü";
  const heroCopy = superAdmin
    ? "Mağaza kurulumlarını, operasyon sinyallerini ve canlı vitrin sağlığını tek ekranda takip et."
    : "Kendi mağaza portföyünü, bekleyen kurulum adımlarını ve gelir etkini tek panelden izle.";

  return (
    <>
      <OwnerCommandHero
        overline={superAdmin ? "Genel Bakış" : "Affiliate Paneli"}
        title={heroTitle}
        copy={heroCopy}
        metrics={[
          {
            label: "Kurulum geliri",
            value: formatCurrency(totals.setupRevenue),
            note: `${totals.activeStores} aktif, ${totals.draftStores} taslak mağaza`,
          },
          {
            label: "Ekosistem GMV",
            value: formatCurrency(totals.revenue),
            note: `${totals.orders.toLocaleString("tr-TR")} siparis ve ${totals.customers.toLocaleString("tr-TR")} musteri`,
          },
          {
            label: "Affiliate etkisi",
            value: formatCurrency(totals.affiliateExposure),
            note: `${readinessRate}% canli cikis orani`,
          },
        ]}
        actions={
          <>
            <Link href="/stores" className="button button-secondary">Tüm mağazalar</Link>
            {superAdmin ? (
              <Link
                href="/stores/new"
                className={`button ${createStoreDisabled ? "button-secondary" : "button-primary"}`}
              >
              {createStoreDisabled ? "Yeni Mağaza formu" : "+ Yeni Mağaza"}
              </Link>
            ) : null}
            <OwnerStatusChip tone="accent">{totals.liveStorefronts} canlı vitrin</OwnerStatusChip>
            <OwnerStatusChip tone={attentionCount > 0 ? "warning" : "success"}>
              {attentionCount > 0 ? `${attentionCount} dikkat gerekiyor` : "Durum temiz"}
            </OwnerStatusChip>
            <OwnerStatusChip tone={setupQueueCount > 0 ? "warning" : "success"}>
              {setupQueueCount > 0 ? `${setupQueueCount} kurulum aksiyonu` : "Kurulum aksiyonu temiz"}
            </OwnerStatusChip>
          </>
        }
        panelTitle="Bugünün özeti"
        panelItems={[
          { label: "Kurulumdaki mağaza", value: portfolioCount },
          { label: "Bekleyen sipariş", value: totals.pendingOrders.toLocaleString("tr-TR") },
          { label: "Canlı vitrin", value: totals.liveStorefronts.toLocaleString("tr-TR") },
          { label: "Yeni Standart Dışı Mağazalar", value: legacyStoreCount },
        ]}
        chips={
          <>
            <span className="hero-chip hero-chip-accent">{superAdmin ? "Yönetim modu" : "Portföy modu"}</span>
            <span className="hero-chip hero-chip-neutral">{dashboard?.cleanupRuns.length ?? 0} orphan cleanup</span>
            <span className="hero-chip hero-chip-neutral">{legacyStoreCount} yeni standart dışı</span>
          </>
        }
      />

      {/* Metrics Row */}
      <div className="owner-metric-grid">
        <OwnerMetricCard label="Toplam sipariş" value={totals.orders.toLocaleString("tr-TR")} note="Ekosistem hacmi" tone="accent" />
        <OwnerMetricCard label="Toplam müşteri" value={totals.customers.toLocaleString("tr-TR")} note="Tüm mağaza portföyü" />
        <OwnerMetricCard label="Aktif mağaza" value={totals.activeStores} note="Canlı operasyon" tone="success" />
        <OwnerMetricCard label="Taslak mağaza" value={totals.draftStores} note="Kurulum ritmi" tone="warning" />
        <OwnerMetricCard label="Canlı vitrin" value={totals.liveStorefronts} note="Yayın hazırlığı" tone="success" />
        <OwnerMetricCard label="Bekleyen sipariş" value={totals.pendingOrders} note="Operasyon izlemi" />
      </div>

      <OwnerSectionHeader
        eyebrow="Genel Bakış"
        title="Kurulum Akışı ve iş etkisi"
        copy="Genel Bakış ekranı mağaza kurulumlarını, gelir etkisini, affiliate sinyallerini ve operasyon durumunu tek yerde toplar."
      />

      <div className="insight-grid">
        <div className="insight-card insight-card-dark">
          <div>
            <div className="hero-card-label">Affiliate Paneli</div>
            <div className="insight-stat">{formatCurrency(totals.affiliateExposure)}</div>
            <p>Affiliate kanalinin ekosistem icindeki tahmini gelir etkisi.</p>
          </div>
          <div className="insight-list">
            <div className="insight-list-row">
              <span>Aktif mağaza</span>
              <strong>{totals.activeStores}</strong>
            </div>
            <div className="insight-list-row">
              <span>Taslak mağaza</span>
              <strong>{totals.draftStores}</strong>
            </div>
            <div className="insight-list-row">
              <span>Bekleyen siparis</span>
              <strong>{totals.pendingOrders}</strong>
            </div>
          </div>
        </div>

        <div className="insight-card insight-card-accent">
          <div>
            <div className="hero-card-label">Kurulum Akışı</div>
            <div className="insight-stat">{attentionCount}</div>
            <p>Kurulum Aksiyonu Bekleyenler ve operasyon sinyalleri bu blokta toparlanır.</p>
          </div>
          <div className="insight-list">
            <div className="insight-list-row">
              <span>Auth Kurulumu Bekleyen</span>
              <strong>{pendingAuthCount}</strong>
            </div>
            <div className="insight-list-row">
              <span>Analytics Kurulumu Bekleyen</span>
              <strong>{pendingAnalyticsCount}</strong>
            </div>
            <div className="insight-list-row">
              <span>Ödeme Kurulumu Bekleyen</span>
              <strong>{pendingPaymentCount}</strong>
            </div>
          </div>
        </div>

        <div className="insight-card">
          <div>
            <div className="hero-card-label">Canli Cikis Orani</div>
            <div className="insight-stat">%{readinessRate}</div>
            <p>Celebix kurulum zincirinden geçen mağazaların vitrine çıkma hızı.</p>
          </div>
          <div className="insight-list">
            <div className="insight-list-row">
              <span>Toplam portfoy</span>
              <strong>{portfolioCount}</strong>
            </div>
            <div className="insight-list-row">
              <span>Toplam musteri</span>
              <strong>{totals.customers.toLocaleString("tr-TR")}</strong>
            </div>
            <div className="insight-list-row">
              <span>Toplam siparis</span>
              <strong>{totals.orders.toLocaleString("tr-TR")}</strong>
            </div>
          </div>
        </div>
      </div>

      {(setupQueueCount > 0 || legacyStoreCount > 0) && (
        <div className="setup-signal-grid">
          <div className={`setup-signal-card ${pendingAuthCount > 0 ? "tone-auth" : "tone-ready"}`}>
            <span className="setup-signal-kicker">Auth Kurulumu Bekleyen</span>
            <div className="actions compact-actions wrap stack-top-sm">
              <span className={`pill ${pendingAuthCount > 0 ? "provisioning-tone-pending_auth" : "pill-success"}`}>
                {pendingAuthCount > 0 ? "auth bekliyor" : "auth hazir"}
              </span>
            </div>
            <div className="setup-signal-value">{pendingAuthCount}</div>
            <p className="setup-signal-note">
              Logto-ready placeholder ile izlenen bekleyen auth authority sayisi.
            </p>
          </div>

          <div className={`setup-signal-card ${pendingAnalyticsCount > 0 ? "tone-analytics" : "tone-ready"}`}>
            <span className="setup-signal-kicker">Analytics Kurulumu Bekleyen</span>
            <div className="actions compact-actions wrap stack-top-sm">
              <span className={`pill ${pendingAnalyticsCount > 0 ? "provisioning-tone-pending_analytics" : "pill-success"}`}>
                {pendingAnalyticsCount > 0 ? "analytics bekliyor" : "analytics hazir"}
              </span>
            </div>
            <div className="setup-signal-value">{pendingAnalyticsCount}</div>
            <p className="setup-signal-note">
              Umami-ready placeholder ile operasyon sirasina birakilan store sayisi.
            </p>
          </div>

          <div className={`setup-signal-card ${pendingPaymentCount > 0 ? "tone-payment" : "tone-ready"}`}>
            <span className="setup-signal-kicker">Ödeme Kurulumu Bekleyen</span>
            <div className="actions compact-actions wrap stack-top-sm">
              <span className={`pill ${pendingPaymentCount > 0 ? "provisioning-tone-pending_payment" : "pill-success"}`}>
                {pendingPaymentCount > 0 ? "odeme bekliyor" : "odeme hazir"}
              </span>
            </div>
            <div className="setup-signal-value">{pendingPaymentCount}</div>
            <p className="setup-signal-note">
              Tahsilat authority sonraki operasyon adimi olarak izlenen store sayisi.
            </p>
          </div>

          <div className={`setup-signal-card ${legacyStoreCount > 0 ? "tone-legacy" : "tone-neutral"}`}>
            <span className="setup-signal-kicker">Yeni Standart Dışı Mağazalar</span>
            <div className="actions compact-actions wrap stack-top-sm">
              <span className={`pill ${legacyStoreCount > 0 ? "pill-legacy" : "pill-ink"}`}>
                {legacyStoreCount > 0 ? "Legacy mağaza" : "Legacy yok"}
              </span>
            </div>
            <div className="setup-signal-value">{legacyStoreCount}</div>
            <p className="setup-signal-note">
              Yeni Standart dışında kalan Legacy istisnaları.
            </p>
          </div>
        </div>
      )}

      {dashboard && dashboard.orphanedCleanupRuns > 0 && (
        <div className="card surface-alert">
          <div className="section-head">
            <div>
              <div className="card-title">Temizlik Takibi</div>
              <p className="section-copy">
                Authority silinmiş ancak dış kaynak temizliği tamamlanmamış {dashboard.orphanedCleanupRuns} kayıt var.
              </p>
            </div>
            <Link href="/operations" className="button button-secondary">
              Operasyona git
            </Link>
          </div>
          <div className="stack-list stack-top-sm">
            {dashboard.cleanupRuns.map((run) => (
              <div key={run.id || run.slug} className="inline-card">
                <div>
                  <strong>{run.storeName}</strong>
                  <p>{run.slug}</p>
                </div>
                <div className="activity-meta">
                  <span>{run.orphanedTargetCount} hedef</span>
                  <span>{formatDateTime(run.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {dashboardError && (
        <div className="card surface-alert">
          <p className="form-error">{dashboardError}</p>
        </div>
      )}

      {/* Attention Stores */}
      {dashboard && dashboard.attentionStores.length > 0 && (
        <div className="card section-tight">
          <div className="section-head">
            <div>
              <div className="card-title">Dikkat Gerektiren Mağazalar</div>
              <p className="section-copy">Kurulum, admin kapsama alanı veya operasyon açısından takip gerektiren mağazalar.</p>
            </div>
          </div>
          <div className="status-grid">
            {dashboard.attentionStores.map((store) => (
              <Link key={store.id} href={`/stores/${store.slug}`} className="status-card">
                <div className="status-card-top">
                  <strong>{store.name}</strong>
                  <span
                    className={`pill ${
                      store.health.label === "hazir"
                        ? "pill-success"
                        : store.health.label === "kritik"
                          ? "pill-danger"
                          : "pill-warning"
                    }`}
                  >
                    {store.health.label}
                  </span>
                </div>
                <p>
                  {store.management.nextAction ||
                    (store.management.subscription.status === "expiring" ||
                    store.management.subscription.status === "expired"
                      ? `Paket takibi gerekiyor: ${store.management.subscription.countdownLabel}`
                      : "Sonraki aksiyon bekleniyor...")}
                </p>
                <div className="table-pill-row">
                  <span className={`pill ${getProvisioningToneClass(store.provisioning.state)}`}>
                    {getProvisioningLabel(store.provisioning.state)}
                  </span>
                  <span className={getDatabaseModePillClass(store.databaseMode)}>
                    {store.databaseMode}
                  </span>
                  {getSetupSignals(store.setup)
                    .filter((signal) => signal.pending)
                    .map((signal) => (
                      <span key={signal.key} className={signal.pillClassName}>
                        {signal.shortLabel}
                      </span>
                    ))}
                </div>
                <div className="status-card-meta">
                  <span>Kurulum: {getProvisioningLabel(store.provisioning.state)}</span>
                  <span>
                    Adımlar: {store.provisioning.failedStepCount} fail / {store.provisioning.pendingStepCount} bekleyen
                  </span>
                  <span>Admin: {store.storeAdminCount}</span>
                  <span>Secrets: {store.health.secretAuthorityReady ? "Hazır" : "Drift"}</span>
                  <span>Runtime: {store.health.adminRuntimeConsistent ? "Hazır" : "Sorun"}</span>
                  <span>Tutarlılık: {store.consistency.blocking ? `${store.consistency.blockingIssueCount} blok` : "Temiz"}</span>
                  <span>Bekleyen: {store.pendingOrderCount}</span>
                  <span>Paket: {store.management.subscription.countdownLabel}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Split Grid */}
      <div className="split-grid">
        {/* Spotlight Stores */}
        <div className="card">
          <div className="section-head">
            <div>
              <div className="card-title">En Çok Gelir Üreten Mağazalar</div>
              <p className="section-copy">En yüksek hacimli mağazalar</p>
            </div>
            <Link href="/finance" className="button button-secondary">Faturalar</Link>
          </div>

          {!dashboard || dashboard.spotlightStores.length === 0 ? (
            <div className="empty-state">
              <h3>Henüz veri yok</h3>
              <p>İlk senkronizasyondan sonra mağazalar burada listelenecek.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mağaza</th>
                    <th>Durum</th>
                    <th>Ciro</th>
                    <th>Sipariş</th>
                    <th className="table-cell-right">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.spotlightStores.map((store) => (
                    <tr key={store.id}>
                      <td>
                        <strong>{store.name}</strong>
                        <div className="table-inline-meta">{store.storefrontDomain}</div>
                      </td>
                      <td>
                        <div className="actions compact-actions wrap">
                          <span
                            className={`pill ${
                              store.health.label === "hazir"
                                ? "pill-success"
                                : store.health.label === "kritik"
                                  ? "pill-danger"
                                  : "pill-warning"
                            }`}
                          >
                            {store.health.label}
                          </span>
                          <span className={`pill ${getProvisioningToneClass(store.provisioning.state)}`}>
                            {getProvisioningLabel(store.provisioning.state)}
                          </span>
                          <span className={getDatabaseModePillClass(store.databaseMode)}>
                            {store.databaseMode}
                          </span>
                          {store.provisioning.failedStepCount > 0 ? (
                            <span className="pill pill-danger">{store.provisioning.failedStepCount} hata</span>
                          ) : null}
                        </div>
                      </td>
                      <td>{formatCurrency(store.totalRevenue)}</td>
                      <td>{store.orderCount}</td>
                      <td className="table-cell-right">
                        <div className="actions no-margin actions-end">
                          <Link href={`/stores/${store.slug}`} className="button button-secondary">Detay</Link>
                          {superAdmin && (
                            <LaunchStorefrontButton
                              slug={store.slug}
                              currentStatus={store.storefrontStatus}
                              disabled={deployDisabled}
                              disabledReason={deployDisabledReason}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card">
          <div className="section-head">
            <div>
              <div className="card-title">Son Aktiviteler</div>
              <p className="section-copy">Atama, profil güncelleme ve mağaza hareketleri</p>
            </div>
          </div>

          {!dashboard || dashboard.recentActivity.length === 0 ? (
            <div className="empty-state empty-state-compact">
              <p className="muted">Henüz aktivite kaydı yok.</p>
            </div>
          ) : (
            <div className="activity-list">
              {dashboard.recentActivity.map((item) => (
                <div key={item.id} className="activity-item">
                  <div>
                    <strong>{item.targetLabel}</strong>
                    <p>{item.action.replace(/_/g, " ")}</p>
                  </div>
                  <div className="activity-meta">
                    <span>{item.actorName}</span>
                    <span>{formatDateTime(item.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
