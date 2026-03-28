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

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="panel">
          <div className="topbar">
            <span className="eyebrow">Celebix Panel</span>
            <SignOutButton />
          </div>
          <h1 className="title">Tum projeleri tek owner panelden yonet.</h1>
          <p className="muted">
            Giris yapan kullanici: <strong>{auth.profile.full_name || auth.user.email}</strong> | rol:{" "}
            <strong>{superAdmin ? "super_admin" : "affiliate_admin"}</strong>
          </p>
          <div className="actions">
            {superAdmin ? (
              <Link className="button button-primary" href="/stores/new">
                Yeni proje olustur
              </Link>
            ) : null}
            <a className="button button-secondary" href="#projects">
              Projeleri gor
            </a>
            {superAdmin ? (
              <a className="button button-secondary" href="#affiliates">
                Affiliate yonet
              </a>
            ) : null}
          </div>
        </div>

        <div className="panel">
          <h2 className="section-title">Kontrol Plane Durumu</h2>
          <div className="metric-grid metric-grid-tight">
            <div className="metric-card">
              <div className="metric-label">Proje sayisi</div>
              <div className="metric-value">{stores.length}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Toplam ciro</div>
              <div className="metric-value metric-value-small">{formatCurrency(totals.revenue)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Toplam siparis</div>
              <div className="metric-value">{totals.orders}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Toplam musteri</div>
              <div className="metric-value">{totals.customers}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Owner Supabase</div>
              <div className="metric-value metric-value-small">{projectRef ?? "-"}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Affiliate hesabi</div>
              <div className="metric-value">{superAdmin ? affiliates.length : "Projeye gore"}</div>
            </div>
          </div>
        </div>
      </section>

      {dashboardError ? (
        <section className="panel" style={{ marginBottom: 24 }}>
          <h2 className="section-title">Dashboard Hatasi</h2>
          <p className="form-error">{dashboardError}</p>
          <p className="muted">
            Bu hata genelde owner Supabase service role yetkisi, tablo senkronu veya store metrik sorgularindan biri
            basarisiz oldugunda gorunur.
          </p>
        </section>
      ) : null}

      <section id="projects" className="panel">
        <div className="section-header">
          <div>
            <h2 className="section-title">Yonetim</h2>
            <p className="muted">Her proje icin ciro, urun, musteri ve storefront durumunu buradan gorursun.</p>
          </div>
          <div className="actions no-margin">
            <span className="pill">Supabase: {supabaseBootstrap.configured ? "hazir" : "bekliyor"}</span>
            <span className="pill">R2: {r2Bootstrap.configured ? "hazir" : "bekliyor"}</span>
          </div>
        </div>

        <div className="store-grid">
          {stores.map((store) => (
            <article key={store.id} className="store-card">
              <div className="store-card-head">
                <div>
                  <span className="store-meta">{store.themeLabel}</span>
                  <h3>{store.name}</h3>
                </div>
                <span className="pill">{store.status}</span>
              </div>

              <p className="muted">{store.storefrontDomain}</p>

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

              <div className="actions">
                <Link className="button button-secondary" href={`/stores/${store.slug}`}>
                  Detaylari ac
                </Link>
                {superAdmin ? <LaunchStorefrontButton slug={store.slug} currentStatus={store.storefrontStatus} /> : null}
              </div>

              <div className="actions">
                <span className="pill">storefront: {store.storefrontStatus}</span>
                {store.storefrontAppDir ? <span className="pill">{store.storefrontAppDir}</span> : null}
                {!superAdmin && store.commissionRate !== null ? (
                  <span className="pill">komisyon: %{store.commissionRate}</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      {superAdmin ? (
        <section id="affiliates" className="info-grid">
          <div className="info-card">
            <h2 className="section-title">Affiliate sistemi</h2>
            <p className="muted">
              Buradan affiliate kullanicisi olusturup proje bazli komisyon tanimlarsin. O kullanici owner paneline
              girdiginde sadece atanmis projelerini gorur.
            </p>
            <CreateAffiliateForm stores={stores.map((store) => ({ slug: store.slug, name: store.name }))} />
          </div>

          <div className="info-card">
            <h2 className="section-title">Kayitli affiliate hesaplari</h2>
            <div className="stack-list">
              {affiliates.length === 0 ? <p className="muted">Henuz affiliate hesabi yok.</p> : null}
              {affiliates.map((affiliate) => (
                <article key={affiliate.id} className="inline-card">
                  <div>
                    <strong>{affiliate.fullName || affiliate.email}</strong>
                    <p className="muted">{affiliate.email}</p>
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
  );
}
