import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateAffiliateForm } from "@/components/CreateAffiliateForm";
import { CreateStoreAdminForm } from "@/components/CreateStoreAdminForm";
import { LaunchStorefrontButton } from "@/components/LaunchStorefrontButton";
import { requireOwnerAuth, isSuperAdmin } from "@/lib/owner-auth";
import { getStoreDetail } from "@/lib/control-plane";

interface StoreDetailPageProps {
  params: Promise<{ slug: string }>;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0
  }).format(value);
}

export default async function StoreDetailPage({ params }: StoreDetailPageProps) {
  const auth = await requireOwnerAuth();
  const { slug } = await params;
  const store = await getStoreDetail(auth, slug);
  const superAdmin = isSuperAdmin(auth);

  if (!store) {
    notFound();
  }

  return (
    <>
      <header className="nav-header">
        <Link href="/" className="logo-text">
          Celebi<span>x</span>
        </Link>
        <div className="actions" style={{ margin: 0 }}>
          <Link className="button button-ghost" href="/">
            Owner paneline don
          </Link>
          {superAdmin ? <LaunchStorefrontButton slug={store.slug} currentStatus={store.storefrontStatus} /> : null}
        </div>
      </header>

      <main className="page-shell">
        <div className="page-header">
          <span className="section-kicker">{store.themeLabel}</span>
          <h1 className="title">{store.name}</h1>
          <p className="muted">{store.tagline || "Bu store icin operasyon, altyapi ve gelir ozetini gorursun."}</p>
          <div className="actions" style={{ marginTop: 12 }}>
            <span className="pill">slug: {store.slug}</span>
            <span className="pill">durum: {store.status}</span>
            <span className="pill">storefront: {store.storefrontStatus}</span>
            {store.commissionRate !== null ? <span className="pill">komisyon: %{store.commissionRate}</span> : null}
          </div>
        </div>

        <section className="hero">
          <div className="panel">
            <h2 className="section-title">Canli metrikler</h2>
            <div className="metric-grid metric-grid-tight">
              <div className="metric-card">
                <div className="metric-label">Urun</div>
                <div className="metric-value">{store.productCount}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Siparis</div>
                <div className="metric-value">{store.orderCount}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Musteri</div>
                <div className="metric-value">{store.customerCount}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Bekleyen siparis</div>
                <div className="metric-value">{store.pendingOrderCount}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Toplam ciro</div>
                <div className="metric-value metric-value-small">{formatCurrency(store.totalRevenue)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Ortalama sepet</div>
                <div className="metric-value metric-value-small">{formatCurrency(store.averageOrderValue)}</div>
              </div>
            </div>
          </div>

          <div className="panel">
            <h2 className="section-title">Domain ve klasorler</h2>
            <p className="muted" style={{ fontSize: 14 }}>
              Storefront domain: <strong>{store.storefrontDomain}</strong>
            </p>
            <p className="muted" style={{ fontSize: 14 }}>
              Admin domain: <strong>{store.adminDomain}</strong>
            </p>
            <p className="muted" style={{ fontSize: 14 }}>
              Storefront app dir: {store.storefrontAppDir ?? "-"}
            </p>
            <p className="muted" style={{ fontSize: 14 }}>
              Son veri senkronu: {store.lastSyncedAt ?? "-"}
            </p>
          </div>
        </section>

        <section className="info-grid">
          <div className="info-card">
            <h2 className="section-title">Altyapi</h2>
            <p className="muted" style={{ fontSize: 14 }}>
              Supabase ref: {store.supabaseProjectRef ?? "-"}
            </p>
            <p className="muted" style={{ fontSize: 14 }}>
              Supabase URL: {store.supabaseUrl ?? "-"}
            </p>
            <p className="muted" style={{ fontSize: 14 }}>
              R2 bucket: {store.r2BucketName ?? "-"}
            </p>
            <p className="muted" style={{ fontSize: 14 }}>
              R2 public URL: {store.r2PublicUrl ?? "-"}
            </p>
          </div>

          <div className="info-card">
            <h2 className="section-title">Store notlari</h2>
            <p className="muted" style={{ fontSize: 14 }}>
              Destek e-postasi: {store.supportEmail ?? "-"}
            </p>
            <p className="muted" style={{ fontSize: 14 }}>
              Destek telefonu: {store.supportPhone ?? "-"}
            </p>
            <p className="muted" style={{ fontSize: 14 }}>
              Owner notu: {store.ownerNotes ?? "-"}
            </p>
            <div className="actions compact-actions">
              {store.features.map((feature) => (
                <span key={feature} className="pill">
                  {feature}
                </span>
              ))}
            </div>
          </div>

          <div className="info-card">
            <h2 className="section-title">Store adminleri</h2>
            <div className="stack-list">
              {store.storeAdmins.length === 0 ? <p className="muted">Bu projeye atanmis store admin yok.</p> : null}
              {store.storeAdmins.map((admin) => (
                <article key={admin.id} className="inline-card">
                  <div>
                    <strong>{admin.fullName || admin.email}</strong>
                    <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                      {admin.email}
                    </p>
                    {admin.taskDefinition ? <p className="muted" style={{ fontSize: 13, margin: 0 }}>{admin.taskDefinition}</p> : null}
                  </div>
                  <span className="pill">{admin.role}</span>
                </article>
              ))}
            </div>
          </div>

          <div className="info-card">
            <h2 className="section-title">Affiliate erisimi</h2>
            <div className="stack-list">
              {store.affiliateAssignments.length === 0 ? <p className="muted">Bu projeye atanmis affiliate yok.</p> : null}
              {store.affiliateAssignments.map((assignment) => (
                <article key={assignment.profileId} className="inline-card">
                  <div>
                    <strong>{assignment.fullName || assignment.email}</strong>
                    <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                      {assignment.email}
                    </p>
                  </div>
                  <span className="pill">%{assignment.commissionRate}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        {superAdmin ? (
          <section className="panel" style={{ marginTop: 24 }}>
            <h2 className="section-title">Bu projeye affiliate ata</h2>
            <CreateAffiliateForm stores={[{ slug: store.slug, name: store.name }]} defaultStoreSlug={store.slug} />
          </section>
        ) : null}

        <section className="panel" style={{ marginTop: 24 }}>
          <h2 className="section-title">Bu projeye store admin ata</h2>
          <p className="muted" style={{ marginBottom: 16, fontSize: 14 }}>
            Buradan atanmis magazaya ozel admin hesabini olusturabilir veya gecici sifresini yenileyebilirsin.
          </p>
          <CreateStoreAdminForm storeSlug={store.slug} />
        </section>
      </main>
    </>
  );
}
