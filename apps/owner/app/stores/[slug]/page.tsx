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
      <div className="page-header">
        <div>
          <h1>{store.name}</h1>
          <p>{store.tagline || "Store detaylari ve operasyon ozeti."}</p>
          <div className="actions" style={{ marginTop: 10 }}>
            <span className="pill pill-accent">{store.status}</span>
            <span className="pill">{store.storefrontDomain}</span>
            <span className="pill">storefront: {store.storefrontStatus}</span>
          </div>
        </div>
        {superAdmin ? (
          <LaunchStorefrontButton slug={store.slug} currentStatus={store.storefrontStatus} />
        ) : null}
      </div>

      <div className="metric-row">
        <div className="metric-box">
          <div className="metric-box-label">Urun</div>
          <div className="metric-box-value">{store.productCount}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Siparis</div>
          <div className="metric-box-value">{store.orderCount}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Musteri</div>
          <div className="metric-box-value">{store.customerCount}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Bekleyen siparis</div>
          <div className="metric-box-value">{store.pendingOrderCount}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Toplam ciro</div>
          <div className="metric-box-value">{formatCurrency(store.totalRevenue)}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Ortalama sepet</div>
          <div className="metric-box-value">{formatCurrency(store.averageOrderValue)}</div>
        </div>
      </div>

      <div className="info-row info-row-3">
        <div className="card">
          <div className="card-title">Altyapi</div>
          <p>Supabase: {store.supabaseProjectRef ?? "-"}</p>
          <p>URL: {store.supabaseUrl ?? "-"}</p>
          <p>R2 bucket: {store.r2BucketName ?? "-"}</p>
          <p>Admin domain: {store.adminDomain}</p>
        </div>

        <div className="card">
          <div className="card-title">Iletisim</div>
          <p>Destek: {store.supportEmail ?? "-"}</p>
          <p>Telefon: {store.supportPhone ?? "-"}</p>
          <p>Not: {store.ownerNotes ?? "-"}</p>
          <div className="actions compact-actions">
            {store.features.map((feature) => (
              <span key={feature} className="pill">
                {feature}
              </span>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Store adminleri</div>
          {store.storeAdmins.length === 0 ? (
            <p>Atanmis admin yok.</p>
          ) : (
            <div className="stack-list">
              {store.storeAdmins.map((admin) => (
                <div key={admin.id} className="inline-card">
                  <div>
                    <strong>{admin.fullName || admin.email}</strong>
                    <p>{admin.email}</p>
                  </div>
                  <span className="pill">{admin.role}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Affiliate erisimi</div>
        {store.affiliateAssignments.length === 0 ? (
          <p>Atanmis affiliate yok.</p>
        ) : (
          <div className="stack-list">
            {store.affiliateAssignments.map((assignment) => (
              <div key={assignment.profileId} className="inline-card">
                <div>
                  <strong>{assignment.fullName || assignment.email}</strong>
                  <p>{assignment.email}</p>
                </div>
                <span className="pill">%{assignment.commissionRate}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {superAdmin ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Bu projeye affiliate ata</div>
          <CreateAffiliateForm stores={[{ slug: store.slug, name: store.name }]} defaultStoreSlug={store.slug} />
        </div>
      ) : null}

      <div className="card">
        <div className="card-title">Bu projeye store admin ata</div>
        <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--text-muted)" }}>
          Magazaya ozel admin hesabi olustur veya sifresini yenile.
        </p>
        <CreateStoreAdminForm storeSlug={store.slug} />
      </div>
    </>
  );
}
