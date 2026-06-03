import Link from "next/link";
import { LaunchStorefrontButton } from "@/components/LaunchStorefrontButton";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { isSuperAdmin, requireOwnerAuth } from "@/lib/owner-auth";
import { repairOwnerDeploymentBranchOnce } from "@/lib/coolify-owner-deployment";
import { getOwnerDashboard } from "@/lib/control-plane";

export default async function OwnerDashboardPage() {
  const auth = await requireOwnerAuth("/");
  const superAdmin = isSuperAdmin(auth);

  if (superAdmin) {
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
  const heroTitle = superAdmin ? "Celebix commerce command center" : "Affiliate portfoy kontrol katmani";
  const heroCopy = superAdmin
    ? "Kurulum hatlarini, gelir akisini, affiliate etkisini ve canli storefront sagligini tek Celebix diliyle yonet."
    : "Kendi proje portfoyunu, canli kurulum adimlarini ve gelir etkini marka odakli tek panelden izle.";

  return (
    <>
      <section className="dashboard-hero">
        <div className="dashboard-hero-content">
          <div className="hero-stack">
            <span className="hero-overline">{superAdmin ? "Super Admin Layer" : "Affiliate Layer"}</span>
            <div>
              <h1>{heroTitle}</h1>
              <p>{heroCopy}</p>
            </div>
          </div>

          <div className="hero-quick-metrics">
            <div className="hero-kpi">
              <span>Kurulum Geliri</span>
              <strong>{formatCurrency(totals.setupRevenue)}</strong>
              <small>{totals.activeStores} aktif, {totals.draftStores} taslak proje</small>
            </div>
            <div className="hero-kpi">
              <span>Ekosistem GMV</span>
              <strong>{formatCurrency(totals.revenue)}</strong>
              <small>{totals.orders.toLocaleString("tr-TR")} siparis ve {totals.customers.toLocaleString("tr-TR")} musteri</small>
            </div>
            <div className="hero-kpi">
              <span>Affiliate Etkisi</span>
              <strong>{formatCurrency(totals.affiliateExposure)}</strong>
              <small>{readinessRate}% canli cikis orani</small>
            </div>
          </div>

          <div className="actions hero-actions">
            <Link href="/stores" className="button button-secondary">Tum projeler</Link>
            {superAdmin ? (
              <Link href="/stores/new" className="button button-primary">+ Yeni proje</Link>
            ) : null}
            <span className="pill pill-accent">{totals.liveStorefronts} canli vitrin</span>
            <span className={`pill ${attentionCount > 0 ? "pill-warning" : "pill-success"}`}>
              {attentionCount > 0 ? `${attentionCount} dikkat gerekiyor` : "Sahne temiz"}
            </span>
          </div>
        </div>

        <aside className="dashboard-hero-panel">
          <div className="card-title">Bugunun panel ritmi</div>
          <div className="hero-list">
            <div className="hero-list-item">
              <span>Kurulumda ilerleyen proje</span>
              <strong>{portfolioCount}</strong>
            </div>
            <div className="hero-list-item">
              <span>Bekleyen siparis hacmi</span>
              <strong>{totals.pendingOrders.toLocaleString("tr-TR")}</strong>
            </div>
            <div className="hero-list-item">
              <span>Canli storefront</span>
              <strong>{totals.liveStorefronts.toLocaleString("tr-TR")}</strong>
            </div>
            <div className="hero-list-item">
              <span>Son aktivite akisi</span>
              <strong>{dashboard?.recentActivity.length ?? 0} kayit</strong>
            </div>
          </div>
          <div className="hero-chip-row">
            <span className="hero-chip hero-chip-accent">{superAdmin ? "Command mode" : "Portfolio mode"}</span>
            <span className="hero-chip hero-chip-neutral">{dashboard?.cleanupRuns.length ?? 0} orphan cleanup</span>
          </div>
        </aside>
      </section>

      {/* Metrics Row */}
      <div className="metric-row metric-row-6">
        <div className="metric-box">
          <div className="metric-box-label">Toplam Sipariş</div>
          <div className="metric-box-value">{totals.orders.toLocaleString("tr-TR")}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Toplam Müşteri</div>
          <div className="metric-box-value">{totals.customers.toLocaleString("tr-TR")}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Aktif Proje</div>
          <div className="metric-box-value">{totals.activeStores}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Taslak Proje</div>
          <div className="metric-box-value">{totals.draftStores}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Canlı Storefront</div>
          <div className="metric-box-value">{totals.liveStorefronts}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Bekleyen Sipariş</div>
          <div className="metric-box-value">{totals.pendingOrders}</div>
        </div>
      </div>

      <div className="insight-grid">
        <div className="insight-card insight-card-dark">
          <div>
            <div className="hero-card-label">Affiliate Dashboard</div>
            <div className="insight-stat">{formatCurrency(totals.affiliateExposure)}</div>
            <p>Affiliate kanalinin ekosistem icindeki tahmini gelir etkisi.</p>
          </div>
          <div className="insight-list">
            <div className="insight-list-row">
              <span>Aktif proje</span>
              <strong>{totals.activeStores}</strong>
            </div>
            <div className="insight-list-row">
              <span>Taslak proje</span>
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
            <div className="hero-card-label">Kurulum Nabzi</div>
            <div className="insight-stat">{attentionCount}</div>
            <p>Dikkat isteyen sahneler, pending repair ve operasyonel sinyaller bu blokta toparlanir.</p>
          </div>
          <div className="insight-list">
            <div className="insight-list-row">
              <span>Hazir vitrin</span>
              <strong>{totals.liveStorefronts}</strong>
            </div>
            <div className="insight-list-row">
              <span>Cleanup takibi</span>
              <strong>{dashboard?.cleanupRuns.length ?? 0}</strong>
            </div>
            <div className="insight-list-row">
              <span>Son hareket</span>
              <strong>{dashboard?.recentActivity.length ?? 0}</strong>
            </div>
          </div>
        </div>

        <div className="insight-card">
          <div>
            <div className="hero-card-label">Canli Cikis Orani</div>
            <div className="insight-stat">%{readinessRate}</div>
            <p>Celebix kurulum zincirinden gecen projelerin vitrine cikma hizi.</p>
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

      {dashboard && dashboard.orphanedCleanupRuns > 0 && (
        <div className="card surface-alert">
          <div className="section-head">
            <div>
              <div className="card-title">Orphan Cleanup Takibi</div>
              <p className="section-copy">
                Authority silinmis ancak dis kaynak temizligi tamamlanmamis {dashboard.orphanedCleanupRuns} kayit var.
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
                  <span>{run.orphanedTargetCount} orphan</span>
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
              <div className="card-title">Dikkat Gerektiren Projeler</div>
              <p className="section-copy">Kurulum, admin kapsama alanı veya operasyon açısından takip gerektiren mağazalar.</p>
            </div>
          </div>
          <div className="status-grid">
            {dashboard.attentionStores.map((store) => (
              <Link key={store.id} href={`/stores/${store.slug}`} className="status-card">
                <div className="status-card-top">
                  <strong>{store.name}</strong>
                  <span className={`pill ${store.health.label === "hazir" ? "pill-success" : "pill-accent"}`}>
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
                <div className="status-card-meta">
                  <span>Provisioning: {store.provisioning.state}</span>
                  <span>
                    Lifecycle: {store.provisioning.failedStepCount} fail / {store.provisioning.pendingStepCount} pending
                  </span>
                  <span>Admin: {store.storeAdminCount}</span>
                  <span>Secrets: {store.health.secretAuthorityReady ? "Hazir" : "Drift"}</span>
                  <span>Runtime: {store.health.adminRuntimeConsistent ? "Hazir" : "Sorun"}</span>
                  <span>Consistency: {store.consistency.blocking ? `${store.consistency.blockingIssueCount} blok` : "Temiz"}</span>
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
              <div className="card-title">En Çok Gelir Üreten Projeler</div>
              <p className="section-copy">En yüksek hacimli mağazalar</p>
            </div>
            <Link href="/finance" className="button button-secondary">Finans Paneli</Link>
          </div>

          {!dashboard || dashboard.spotlightStores.length === 0 ? (
            <div className="empty-state">
              <h3>Henüz Veri Yok</h3>
              <p>İlk senkronizasyondan sonra projeler burada listelenecek.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Proje</th>
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
                          <span className="pill pill-accent">{store.health.label}</span>
                          <span className={`pill ${store.provisioning.state === "ready" ? "pill-success" : "pill-accent"}`}>
                            {store.provisioning.state}
                          </span>
                          {store.provisioning.failedStepCount > 0 ? (
                            <span className="pill pill-accent">{store.provisioning.failedStepCount} failed</span>
                          ) : null}
                        </div>
                      </td>
                      <td>{formatCurrency(store.totalRevenue)}</td>
                      <td>{store.orderCount}</td>
                      <td className="table-cell-right">
                        <div className="actions no-margin actions-end">
                          <Link href={`/stores/${store.slug}`} className="button button-secondary">Detay</Link>
                          {superAdmin && (
                            <LaunchStorefrontButton slug={store.slug} currentStatus={store.storefrontStatus} />
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
              <p className="section-copy">Atama, profil güncelleme ve proje hareketleri</p>
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
