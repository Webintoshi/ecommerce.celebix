import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateAffiliateForm } from "@/components/CreateAffiliateForm";
import { CreateStoreAdminForm } from "@/components/CreateStoreAdminForm";
import { LaunchStorefrontButton } from "@/components/LaunchStorefrontButton";
import { UpdateStoreProfileForm } from "@/components/UpdateStoreProfileForm";
import { formatCurrency, formatDate, formatDateTime, formatPercent } from "@/lib/formatters";
import { requireOwnerAuth, isSuperAdmin } from "@/lib/owner-auth";
import { getStoreDetail } from "@/lib/control-plane";

interface StoreDetailPageProps {
  params: Promise<{ slug: string }>;
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
          <Link href="/stores" className="eyebrow-link">
            Tum projelere don
          </Link>
          <h1>{store.name}</h1>
          <p>{store.tagline || "Proje detaylari, operasyon sagligi ve owner yonetim katmani."}</p>
          <div className="actions" style={{ marginTop: 10 }}>
            <span className="pill pill-accent">{store.status}</span>
            <span className={`pill ${store.health.label === "hazir" ? "pill-success" : "pill-accent"}`}>{store.health.label}</span>
            <span className="pill">{store.storefrontDomain}</span>
          </div>
        </div>
        <div className="actions">
          <Link className="button button-secondary" href={`https://${store.adminDomain}/admin`} target="_blank">
            Admini ac
          </Link>
          {superAdmin ? <LaunchStorefrontButton slug={store.slug} currentStatus={store.storefrontStatus} /> : null}
        </div>
      </div>

      <div className="metric-row metric-row-6">
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
          <div className="metric-box-label">Sepet ortalamasi</div>
          <div className="metric-box-value">{formatCurrency(store.averageOrderValue)}</div>
        </div>
      </div>

      <div className="info-row info-row-3">
        <div className="card">
          <div className="card-title">Client profili</div>
          <div className="meta-pairs">
            <span>Marka: {store.management.clientCompanyName || store.name}</span>
            <span>Yetkili: {store.management.clientContactName || "-"}</span>
            <span>E-posta: {store.management.clientContactEmail || "-"}</span>
            <span>Telefon: {store.management.clientContactPhone || "-"}</span>
            <span>Ic sorumlu: {store.management.internalOwner || "-"}</span>
            <span>Tahsilat: {store.management.billingStatus}</span>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Yasam dongusu</div>
          <div className="meta-pairs">
            <span>Asama: {store.management.lifecycleStage}</span>
            <span>Oncelik: {store.management.priority}</span>
            <span>Hedef yayin: {formatDate(store.management.launchTarget)}</span>
            <span>Storefront: {store.storefrontStatus}</span>
            <span>Affiliate orani: %{formatPercent(store.totalAffiliateRate)}</span>
            <span>Store admin: {store.storeAdminCount}</span>
          </div>
          <p className="card-note">{store.management.nextAction || "Sonraki aksiyon tanimlanmamis."}</p>
        </div>

        <div className="card">
          <div className="card-title">Altyapi</div>
          <div className="meta-pairs">
            <span>Supabase ref: {store.supabaseProjectRef || "-"}</span>
            <span>R2 bucket: {store.r2BucketName || "-"}</span>
            <span>Admin domain: {store.adminDomain}</span>
            <span>Support e-posta: {store.supportEmail || "-"}</span>
            <span>Support telefon: {store.supportPhone || "-"}</span>
            <span>Son sync: {formatDateTime(store.lastSyncedAt)}</span>
          </div>
        </div>
      </div>

      <div className="split-grid">
        <div className="card">
          <div className="card-title">Store adminleri</div>
          {store.storeAdmins.length === 0 ? (
            <p className="muted">Atanmis store admin yok.</p>
          ) : (
            <div className="stack-list">
              {store.storeAdmins.map((admin) => (
                <div key={admin.id} className="inline-card">
                  <div>
                    <strong>{admin.fullName || admin.email}</strong>
                    <p>{admin.email}</p>
                  </div>
                  <div className="actions compact-actions">
                    <span className="pill">{admin.role}</span>
                    <span className="pill">{admin.taskDefinition || "Genel operasyon"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Affiliate erisimi</div>
          {store.affiliateAssignments.length === 0 ? (
            <p className="muted">Atanmis affiliate yok.</p>
          ) : (
            <div className="stack-list">
              {store.affiliateAssignments.map((assignment) => (
                <div key={assignment.profileId} className="inline-card">
                  <div>
                    <strong>{assignment.fullName || assignment.email}</strong>
                    <p>{assignment.email}</p>
                  </div>
                  <span className="pill">%{formatPercent(assignment.commissionRate)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="split-grid">
        <div className="card">
          <div className="card-title">Son owner aktiviteleri</div>
          {store.recentActivity.length === 0 ? (
            <p className="muted">Bu proje icin audit kaydi henuz yok.</p>
          ) : (
            <div className="activity-list">
              {store.recentActivity.map((item) => (
                <div key={item.id} className="activity-item">
                  <div>
                    <strong>{item.action.replaceAll("_", " ")}</strong>
                    <p>{item.actorName}</p>
                  </div>
                  <div className="activity-meta">
                    <span>{item.targetLabel}</span>
                    <span>{formatDateTime(item.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Ozellikler ve owner notu</div>
          <div className="actions compact-actions" style={{ marginBottom: 16 }}>
            {store.features.map((feature) => (
              <span key={feature} className="pill">
                {feature}
              </span>
            ))}
          </div>
          <p className="card-note">{store.management.ownerNotes || "Ic owner notu girilmemis."}</p>
        </div>
      </div>

      {superAdmin ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-title">Proje profilini yonet</div>
          <p className="section-copy">Client iletisimini, ic sorumluyu, owner notlarini ve durum akisini buradan guncelle.</p>
          <UpdateStoreProfileForm
            store={{
              slug: store.slug,
              status: store.status,
              tagline: store.tagline,
              supportEmail: store.supportEmail,
              supportPhone: store.supportPhone,
              management: store.management
            }}
          />
        </div>
      ) : null}

      {superAdmin ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-title">Bu projeye affiliate ata</div>
          <CreateAffiliateForm stores={[{ slug: store.slug, name: store.name }]} defaultStoreSlug={store.slug} />
        </div>
      ) : null}

      <div className="card">
        <div className="card-title">Bu projeye store admin ata</div>
        <p className="section-copy">Bu magazaya bagli operasyon kullanicilarini owner panelden yonet.</p>
        <CreateStoreAdminForm storeSlug={store.slug} />
      </div>
    </>
  );
}
