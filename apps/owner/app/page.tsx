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
    dashboardError = error instanceof Error ? error.message : "Owner dashboard verisi yuklenemedi.";
  }

  const totals = dashboard?.totals ?? {
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
      <div className="page-header">
        <div>
          <h1>Control plane</h1>
          <p>Tum projeleri, teknik sagligi ve ticari akisi tek owner merkezinden yonet.</p>
        </div>
        <div className="actions">
          <Link className="button button-secondary" href="/stores">
            Tum projeler
          </Link>
          {superAdmin ? (
            <Link className="button button-primary" href="/stores/new">
              + Yeni proje
            </Link>
          ) : null}
        </div>
      </div>

      <div className="hero-grid">
        <div className="hero-card hero-card-primary">
          <div className="hero-card-label">Toplam ekosistem cirosu</div>
          <div className="hero-card-value">{formatCurrency(totals.revenue)}</div>
          <p>
            {totals.activeStores} aktif proje, {totals.liveStorefronts} canli storefront, {totals.pendingOrders} acik operasyon konusu.
          </p>
        </div>
        <div className="hero-card">
          <div className="hero-card-label">Tahmini affiliate yukumlulugu</div>
          <div className="hero-card-value">{formatCurrency(totals.affiliateExposure)}</div>
          <p>Atanmis partner ve affiliate komisyonlarinin mevcut ciroya gore tahmini etkisi.</p>
        </div>
      </div>

      <div className="metric-row metric-row-6">
        <div className="metric-box">
          <div className="metric-box-label">Toplam siparis</div>
          <div className="metric-box-value">{totals.orders}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Toplam musteri</div>
          <div className="metric-box-value">{totals.customers}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Aktif proje</div>
          <div className="metric-box-value">{totals.activeStores}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Taslak proje</div>
          <div className="metric-box-value">{totals.draftStores}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Canli storefront</div>
          <div className="metric-box-value">{totals.liveStorefronts}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Bekleyen siparis</div>
          <div className="metric-box-value">{totals.pendingOrders}</div>
        </div>
      </div>

      {dashboardError ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <p className="form-error">{dashboardError}</p>
        </div>
      ) : null}

      {dashboard && dashboard.attentionStores.length > 0 ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="section-head">
            <div>
              <div className="card-title">Acil owner dikkati isteyen projeler</div>
              <p className="section-copy">Kurulum, admin kapsama alani veya operasyon baskisi acisindan takip gerektiren magazalar.</p>
            </div>
          </div>
          <div className="status-grid">
            {dashboard.attentionStores.map((store) => (
              <Link key={store.id} href={`/stores/${store.slug}`} className="status-card">
                <div className="status-card-top">
                  <strong>{store.name}</strong>
                  <span className={`pill ${store.health.label === "hazir" ? "pill-success" : "pill-accent"}`}>{store.health.label}</span>
                </div>
                <p>{store.management.nextAction || "Owner tarafinda sonraki aksiyon henuz tanimlanmamis."}</p>
                <div className="status-card-meta">
                  <span>Admin: {store.storeAdminCount}</span>
                  <span>R2: {store.health.r2Ready ? "hazir" : "eksik"}</span>
                  <span>Bekleyen siparis: {store.pendingOrderCount}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="split-grid">
        <div className="card">
          <div className="section-head">
            <div>
              <div className="card-title">En cok gelir ureten projeler</div>
              <p className="section-copy">Tek paket yapisinda hangi magazalarin en cok hacim urettigini gor.</p>
            </div>
            <Link className="button button-secondary" href="/finance">
              Finans paneli
            </Link>
          </div>

          {!dashboard || dashboard.spotlightStores.length === 0 ? (
            <div className="empty-state">
              <h3>Projeler hazir degil</h3>
              <p>Ilk senkronlardan sonra burasi dolacak.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Proje</th>
                    <th>Durum</th>
                    <th>Ciro</th>
                    <th>Siparis</th>
                    <th>Affiliate</th>
                    <th style={{ textAlign: "right" }}>Aksiyon</th>
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
                      <td>%{formatPercent(store.totalAffiliateRate)}</td>
                      <td style={{ textAlign: "right" }}>
                        <div className="actions no-margin" style={{ justifyContent: "flex-end" }}>
                          <Link className="button button-secondary" href={`/stores/${store.slug}`}>
                            Detay
                          </Link>
                          {superAdmin ? (
                            <LaunchStorefrontButton slug={store.slug} currentStatus={store.storefrontStatus} />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="section-head">
            <div>
              <div className="card-title">Son owner aktiviteleri</div>
              <p className="section-copy">Atama, profil guncelleme ve proje hareketleri.</p>
            </div>
          </div>

          {!dashboard || dashboard.recentActivity.length === 0 ? (
            <p className="muted">Henuz owner audit kaydi yok.</p>
          ) : (
            <div className="activity-list">
              {dashboard.recentActivity.map((item) => (
                <div key={item.id} className="activity-item">
                  <div>
                    <strong>{item.targetLabel}</strong>
                    <p>{item.action.replaceAll("_", " ")}</p>
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
