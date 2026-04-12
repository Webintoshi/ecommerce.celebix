import Link from "next/link";
import { LaunchStorefrontButton } from "@/components/LaunchStorefrontButton";
import { formatCurrency, formatDateTime, formatPercent } from "@/lib/formatters";
import { isSuperAdmin, requireOwnerAuth } from "@/lib/owner-auth";
import { getOwnerDashboard } from "@/lib/control-plane";

export default async function OwnerDashboardPage() {
  const auth = await requireOwnerAuth("/");
  const superAdmin = isSuperAdmin(auth);
  
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

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Tüm projeleri, teknik sağlığı ve ticari akışı tek merkezden yönet.</p>
        </div>
        <div className="actions">
          <Link href="/stores" className="button button-secondary">Tüm Projeler</Link>
          {superAdmin && (
            <Link href="/stores/new" className="button button-primary">+ Yeni Proje</Link>
          )}
        </div>
      </div>

      {/* Hero Stats */}
      <div className="hero-grid">
        <div className="hero-card hero-card-primary">
          <div className="hero-card-label">Toplam Proje Geliri</div>
          <div className="hero-card-value">{formatCurrency(totals.setupRevenue)}</div>
          <p>{totals.activeStores} aktif, {totals.draftStores} taslak proje</p>
        </div>
        <div className="hero-card">
          <div className="hero-card-label">Toplam Ekosistem GMV</div>
          <div className="hero-card-value">{formatCurrency(totals.revenue)}</div>
          <p>Affiliate etkisi: {formatCurrency(totals.affiliateExposure)}</p>
        </div>
      </div>

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
                        <span className="pill pill-accent">{store.health.label}</span>
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
