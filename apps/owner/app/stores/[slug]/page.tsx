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
            ← Tum projelere don
          </Link>
          <h1>{store.name}</h1>
          <p>{store.tagline || "Proje detaylari, operasyon sagligi ve yonetim katmani."}</p>
          <div className="actions" style={{ marginTop: 12 }}>
            <span className="pill" style={{ textTransform: "capitalize" }}>{store.status}</span>
            <span className={`pill ${store.health.label === "hazir" ? "pill-success" : "pill-accent"}`}>
              {store.health.label}
            </span>
            <span className="pill">{store.storefrontDomain}</span>
          </div>
        </div>
        <div className="actions">
          <Link className="button button-secondary" href={`https://${store.adminDomain}/admin`} target="_blank">
            Admini Ac
          </Link>
          {superAdmin ? <LaunchStorefrontButton slug={store.slug} currentStatus={store.storefrontStatus} /> : null}
        </div>
      </div>

      {/* Metric Boxes */}
      <div className="metric-row metric-row-6">
        <div className="metric-box">
          <div className="metric-box-label">Urun</div>
          <div className="metric-box-value">{store.productCount.toLocaleString('tr-TR')}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Siparis</div>
          <div className="metric-box-value">{store.orderCount.toLocaleString('tr-TR')}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Musteri</div>
          <div className="metric-box-value">{store.customerCount.toLocaleString('tr-TR')}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Bekleyen</div>
          <div className="metric-box-value">{store.pendingOrderCount}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Toplam Ciro</div>
          <div className="metric-box-value">{formatCurrency(store.totalRevenue)}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Sepet Ort.</div>
          <div className="metric-box-value">{formatCurrency(store.averageOrderValue)}</div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="info-row info-row-3">
        <div className="card">
          <div className="card-title">Client Profili</div>
          <div className="meta-pairs">
            <span>Marka: <strong>{store.management.clientCompanyName || store.name}</strong></span>
            <span>Yetkili: <strong>{store.management.clientContactName || "-"}</strong></span>
            <span>E-posta: <strong>{store.management.clientContactEmail || "-"}</strong></span>
            <span>Telefon: <strong>{store.management.clientContactPhone || "-"}</strong></span>
            <span>Ic sorumlu: <strong>{store.management.internalOwner || "-"}</strong></span>
            <span>Tahsilat: <strong>{store.management.billingStatus}</strong></span>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Yasam Dongusu</div>
          <div className="meta-pairs">
            <span>Asama: <strong>{store.management.lifecycleStage}</strong></span>
            <span>Oncelik: <strong>{store.management.priority}</strong></span>
            <span>Hedef yayin: <strong>{formatDate(store.management.launchTarget)}</strong></span>
            <span>Storefront: <strong>{store.storefrontStatus}</strong></span>
            <span>Affiliate orani: <strong>%{formatPercent(store.totalAffiliateRate)}</strong></span>
            <span>Store admin: <strong>{store.storeAdminCount}</strong></span>
          </div>
          <p className="card-note">{store.management.nextAction || "Sonraki aksiyon tanimlanmamis."}</p>
        </div>

        <div className="card">
          <div className="card-title">Altyapi</div>
          <div className="meta-pairs">
            <span>Supabase: <strong>{store.supabaseProjectRef || "Eksik"}</strong></span>
            <span>Supabase Host: <strong>{store.supabaseUrl || "Eksik"}</strong></span>
            <span>
              Supabase Studio:{" "}
              {store.supabaseDashboardUrl ? (
                <strong>
                  <a href={store.supabaseDashboardUrl} target="_blank" rel="noreferrer">
                    Studio'yu ac
                  </a>
                </strong>
              ) : (
                <strong>Eksik</strong>
              )}
            </span>
            <span>R2 Bucket: <strong>{store.r2BucketName || "Eksik"}</strong></span>
            <span>Admin Domain: <strong>{store.adminDomain}</strong></span>
            <span>Support E-posta: <strong>{store.supportEmail || "-"}</strong></span>
            <span>Support Telefon: <strong>{store.supportPhone || "-"}</strong></span>
            <span>Son Sync: <strong>{formatDateTime(store.lastSyncedAt)}</strong></span>
          </div>
          <p className="card-note">Supabase tarafi musteri domaini kullanmaz; her proje stock-host uzerinden izole calisir.</p>
        </div>
      </div>

      {/* Store Admins & Affiliates */}
      <div className="split-grid">
        <div className="card">
          <div className="card-title">Store Adminleri</div>
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
                    <span className="pill">{admin.taskDefinition || "Genel"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Affiliate Erisimi</div>
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

      {/* Recent Activity & Features */}
      <div className="split-grid">
        <div className="card">
          <div className="card-title">Son Aktiviteler</div>
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
          <div className="card-title">Ozellikler ve Notlar</div>
          <div className="actions compact-actions" style={{ marginBottom: 16, flexWrap: "wrap" }}>
            {store.features.length === 0 ? (
              <span className="muted">Tanimli ozellik yok</span>
            ) : (
              store.features.map((feature) => (
                <span key={feature} className="pill">
                  {feature}
                </span>
              ))
            )}
          </div>
          <p className="card-note">{store.management.ownerNotes || "Ic owner notu girilmemis."}</p>
        </div>
      </div>

      {/* Forms - Only for Super Admin */}
      {superAdmin ? (
        <>
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-title">Proje Profilini Guncelle</div>
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

          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-title">Bu Projeye Affiliate Ata</div>
            <CreateAffiliateForm stores={[{ slug: store.slug, name: store.name }]} defaultStoreSlug={store.slug} />
          </div>
        </>
      ) : null}

      <div className="card">
        <div className="card-title">Bu Projeye Store Admin Ata</div>
        <p className="section-copy">Bu magazaya bagli operasyon kullanicilarini yonet.</p>
        <CreateStoreAdminForm storeSlug={store.slug} />
      </div>
    </>
  );
}
