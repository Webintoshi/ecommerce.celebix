import Link from "next/link";
import { CreateAffiliateForm } from "@/components/CreateAffiliateForm";
import { LaunchStorefrontButton } from "@/components/LaunchStorefrontButton";
import { SignOutButton } from "@/components/SignOutButton";
import { isSuperAdmin, requireOwnerAuth } from "@/lib/owner-auth";
import { listAffiliates, listDashboardStores } from "@/lib/control-plane";
import { getOwnerSupabaseProjectRef } from "@/lib/owner-supabase-shared";
import { getR2BootstrapStatus } from "@/lib/r2-bootstrap";
import { getSupabaseBootstrapStatus } from "@/lib/supabase-bootstrap";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0
  }).format(value);
}

export default async function OwnerDashboardPage() {
  const auth = await requireOwnerAuth("/");
  const superAdmin = isSuperAdmin(auth);
  let dashboardError: string | null = null;
  let stores: Awaited<ReturnType<typeof listDashboardStores>> = [];
  let affiliates: Awaited<ReturnType<typeof listAffiliates>> = [];

  try {
    stores = await listDashboardStores(auth);
    affiliates = superAdmin ? await listAffiliates() : [];
  } catch (error) {
    dashboardError = error instanceof Error ? error.message : "Owner dashboard verisi yuklenemedi.";
  }

  const [supabaseBootstrap, r2Bootstrap] = await Promise.all([
    getSupabaseBootstrapStatus(),
    getR2BootstrapStatus()
  ]);

  const totals = stores.reduce(
    (accumulator, store) => ({
      revenue: accumulator.revenue + store.totalRevenue,
      orders: accumulator.orders + store.orderCount,
      customers: accumulator.customers + store.customerCount
    }),
    { revenue: 0, orders: 0, customers: 0 }
  );

  const projectRef = getOwnerSupabaseProjectRef();
  const featuredStore = stores[0] ?? null;

  return (
    <>
      <header className="nav-header">
        <div className="logo-text">
          Celebi<span>x</span>
        </div>
        <SignOutButton />
      </header>

      <main className="page-shell">
        <div className="page-header">
          <span className="section-kicker">Owner Panel</span>
          <h1 className="title">Tum projelerini tek ekrandan yonet.</h1>
          <p className="muted">
            Store acilislarini, storefront baslangiclarini, affiliate dagitimini ve altyapi baglantilarini tek
            ekranda gor. Burasi artik sadece metrik gosteren bir sayfa degil, dogrudan yon verdigin merkez panel.
          </p>
        </div>

        <section className="hero">
          <div className="panel hero-copy">
            <div className="actions">
              {superAdmin ? (
                <Link className="button button-primary" href="/stores/new">
                  + Yeni proje olustur
                </Link>
              ) : null}
              <a className="button button-secondary" href="#projects">
                Projeleri ac
              </a>
              {superAdmin ? (
                <a className="button button-ghost" href="#affiliates">
                  Affiliate yonet
                </a>
              ) : null}
            </div>

            <div className="hero-summary">
              <article className="hero-summary-card">
                <span className="metric-label">Kullanici</span>
                <strong>{auth.profile.full_name || auth.user.email}</strong>
                <span className="muted" style={{ fontSize: 13 }}>
                  Rol: {superAdmin ? "super_admin" : "affiliate_admin"}
                </span>
              </article>

              <article className="hero-summary-card">
                <span className="metric-label">Proje sayisi</span>
                <strong>{stores.length}</strong>
                <span className="muted" style={{ fontSize: 13 }}>
                  Owner panelde gorunen toplam store
                </span>
              </article>

              <article className="hero-summary-card">
                <span className="metric-label">Toplam ciro</span>
                <strong>{formatCurrency(totals.revenue)}</strong>
                <span className="muted" style={{ fontSize: 13 }}>
                  Tum store metrikleri bir arada
                </span>
              </article>
            </div>
          </div>

          <div className="spotlight-card">
            <span className="section-kicker">One cikan proje</span>

            {featuredStore ? (
              <>
                <div className="spotlight-head" style={{ marginTop: 12 }}>
                  <div>
                    <span className="store-meta">{featuredStore.themeLabel}</span>
                    <h2 className="section-title spotlight-title">{featuredStore.name}</h2>
                  </div>
                  <span className="pill pill-strong">{featuredStore.status}</span>
                </div>

                <p className="store-domain spotlight-domain">{featuredStore.storefrontDomain}</p>
                <p className="muted" style={{ fontSize: 14 }}>
                  Girer girmez ilk gordugun alan bu olsun: hangi store aktif, siradaki aksiyon ne, storefront ne
                  durumda.
                </p>

                <div className="spotlight-stat-strip">
                  <div>
                    <strong>{featuredStore.productCount}</strong>
                    <span>urun</span>
                  </div>
                  <div>
                    <strong>{featuredStore.orderCount}</strong>
                    <span>siparis</span>
                  </div>
                  <div>
                    <strong>{featuredStore.customerCount}</strong>
                    <span>musteri</span>
                  </div>
                  <div>
                    <strong>{formatCurrency(featuredStore.totalRevenue)}</strong>
                    <span>ciro</span>
                  </div>
                </div>

                <div className="actions">
                  <Link className="button button-primary" href={`/stores/${featuredStore.slug}`}>
                    Proje detayina git
                  </Link>
                  {superAdmin ? (
                    <LaunchStorefrontButton slug={featuredStore.slug} currentStatus={featuredStore.storefrontStatus} />
                  ) : null}
                </div>

                <div className="actions compact-actions">
                  <span className="pill">storefront: {featuredStore.storefrontStatus}</span>
                  <span className="pill">admin: {featuredStore.adminDomain}</span>
                </div>
              </>
            ) : (
              <div className="empty-state" style={{ marginTop: 16 }}>
                <h2 className="section-title">Henuz proje gorunmuyor</h2>
                <p className="muted">Ilk store kaydi olusunca owner panel burayi otomatik dolduracak.</p>
              </div>
            )}
          </div>
        </section>

        <section className="status-strip">
          <article className="status-card">
            <span className="metric-label">Owner Supabase</span>
            <strong>{projectRef ?? "-"}</strong>
            <span className="muted" style={{ fontSize: 13 }}>
              Control plane veritabani
            </span>
          </article>

          <article className="status-card">
            <span className="metric-label">Supabase bootstrap</span>
            <strong>{supabaseBootstrap.configured ? "Hazir" : "Bekliyor"}</strong>
            <span className="muted" style={{ fontSize: 13 }}>
              Yeni store kurulum otomasyonu
            </span>
          </article>

          <article className="status-card">
            <span className="metric-label">R2 bootstrap</span>
            <strong>{r2Bootstrap.configured ? "Hazir" : "Bekliyor"}</strong>
            <span className="muted" style={{ fontSize: 13 }}>
              Storage ve gorsel altyapisi
            </span>
          </article>

          <article className="status-card">
            <span className="metric-label">Affiliate hesaplari</span>
            <strong>{superAdmin ? affiliates.length : "Projeye gore"}</strong>
            <span className="muted" style={{ fontSize: 13 }}>
              Yetki dagitimi ve komisyon erisimi
            </span>
          </article>
        </section>

        {dashboardError ? (
          <section className="panel" style={{ marginBottom: 24 }}>
            <h2 className="section-title">Dashboard Hatasi</h2>
            <p className="form-error">{dashboardError}</p>
            <p className="muted" style={{ fontSize: 14 }}>
              Bu hata genelde owner Supabase service role yetkisi, tablo senkronu veya store metrik sorgularindan biri
              basarisiz oldugunda gorunur.
            </p>
          </section>
        ) : null}

        <section id="projects" className="panel">
          <div className="section-header">
            <div>
              <span className="section-kicker">Projeler</span>
              <h2 className="section-title">Tum store listesi</h2>
              <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
                Her proje icin alan adini, durumu, ciroyu ve sonraki aksiyonu burada gorursun.
              </p>
            </div>
            {superAdmin ? <span className="pill pill-strong">{stores.length} proje</span> : null}
          </div>

          {stores.length === 0 ? (
            <div className="empty-state">
              <h3>Gorunecek proje yok</h3>
              <p className="muted">
                Yeni proje olustur dugmesi ile ilk store kaydini acabilir veya mevcut store senkronunu yenileyebilirsin.
              </p>
            </div>
          ) : null}

          <div className="store-grid">
            {stores.map((store) => (
              <article key={store.id} className="store-card">
                <div className="store-card-head">
                  <div>
                    <span className="store-meta">{store.themeLabel}</span>
                    <h3>{store.name}</h3>
                  </div>
                  <span className="pill pill-strong">{store.status}</span>
                </div>

                <p className="store-domain">{store.storefrontDomain}</p>
                <p className="muted" style={{ fontSize: 13 }}>
                  Admin: {store.adminDomain}
                </p>

                <div className="mini-metric-grid">
                  <div>
                    <strong>{store.productCount}</strong>
                    <span>urun</span>
                  </div>
                  <div>
                    <strong>{store.orderCount}</strong>
                    <span>siparis</span>
                  </div>
                  <div>
                    <strong>{store.customerCount}</strong>
                    <span>musteri</span>
                  </div>
                  <div>
                    <strong>{formatCurrency(store.totalRevenue)}</strong>
                    <span>ciro</span>
                  </div>
                </div>

                <div className="actions compact-actions">
                  <span className="pill">storefront: {store.storefrontStatus}</span>
                  {store.storefrontAppDir ? <span className="pill">{store.storefrontAppDir}</span> : null}
                  <span className="pill">bekleyen: {store.pendingOrderCount}</span>
                  {!superAdmin && store.commissionRate !== null ? (
                    <span className="pill">komisyon: %{store.commissionRate}</span>
                  ) : null}
                </div>

                <div className="actions store-card-footer">
                  <Link className="button button-secondary" href={`/stores/${store.slug}`}>
                    Detaylari ac
                  </Link>
                  {superAdmin ? (
                    <LaunchStorefrontButton slug={store.slug} currentStatus={store.storefrontStatus} />
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>

        {superAdmin ? (
          <section id="affiliates" className="info-grid">
            <div className="info-card">
              <span className="section-kicker">Affiliate</span>
              <h2 className="section-title">Gelir ortaklari</h2>
              <p className="muted" style={{ fontSize: 14 }}>
                Buradan affiliate kullanicisi olusturup proje bazli komisyon tanimlarsin. O kullanici owner paneline
                girdiginde sadece atanmis projelerini gorur.
              </p>
              <CreateAffiliateForm stores={stores.map((store) => ({ slug: store.slug, name: store.name }))} />
            </div>

            <div className="info-card">
              <span className="section-kicker">Hesaplar</span>
              <h2 className="section-title">Kayitli affiliate hesaplari</h2>
              <div className="stack-list">
                {affiliates.length === 0 ? <p className="muted">Henuz affiliate hesabi yok.</p> : null}
                {affiliates.map((affiliate) => (
                  <article key={affiliate.id} className="inline-card">
                    <div>
                      <strong>{affiliate.fullName || affiliate.email}</strong>
                      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                        {affiliate.email}
                      </p>
                    </div>
                    <div className="actions no-margin">
                      {affiliate.assignments.map((assignment) => (
                        <span key={`${affiliate.id}-${assignment.storeId}`} className="pill">
                          {assignment.storeName} | %{assignment.commissionRate}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}
