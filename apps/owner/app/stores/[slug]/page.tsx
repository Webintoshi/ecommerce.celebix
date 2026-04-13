import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateAffiliateForm } from "@/components/CreateAffiliateForm";
import { CreateStoreAdminForm } from "@/components/CreateStoreAdminForm";
import { LaunchStorefrontButton } from "@/components/LaunchStorefrontButton";
import { ProvisionAdminDeploymentButton } from "@/components/ProvisionAdminDeploymentButton";
import { DeleteStoreButton } from "@/components/DeleteStoreButton";
import { RepairProjectButton } from "@/components/RepairProjectButton";
import { getStoreAdminDeploymentBlueprint } from "@/lib/admin-deployment";
import { getStorefrontDeploymentBlueprint } from "@/lib/storefront-deployment";
import { UpdateStoreProfileForm } from "@/components/UpdateStoreProfileForm";
import { formatCurrency, formatDate, formatDateTime, formatPercent } from "@/lib/formatters";
import { requireOwnerAuth, isSuperAdmin } from "@/lib/owner-auth";
import { getStoreDetail } from "@/lib/control-plane";

interface StoreDetailPageProps {
  params: Promise<{ slug: string }>;
}

function readStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readDateValue(value: unknown): string | null {
  const parsed = readStringValue(value);
  return parsed ? formatDateTime(parsed) : "-";
}

export default async function StoreDetailPage({ params }: StoreDetailPageProps) {
  const auth = await requireOwnerAuth();
  const { slug } = await params;
  const store = await getStoreDetail(auth, slug);
  const superAdmin = isSuperAdmin(auth);

  if (!store) {
    notFound();
  }

  const adminDeployment = await getStoreAdminDeploymentBlueprint(store.slug).catch(() => null);
  const storefrontDeployment = await getStorefrontDeploymentBlueprint(store.slug).catch(() => null);
  const bootstrap = (store.bootstrap ?? {}) as Record<string, unknown>;
  const supabaseProjectName = readStringValue(bootstrap.supabaseProjectName);
  const supabaseResourceId = readStringValue(bootstrap.supabaseResourceId);
  const supabaseProvisioning = readStringValue(bootstrap.supabaseProvisioning);
  const supabaseDashboardUrl = readStringValue(bootstrap.supabaseDashboardUrl) || store.supabaseDashboardUrl;
  const adminDeploymentName = readStringValue(bootstrap.adminDeploymentName);
  const adminDeploymentBranch = readStringValue(bootstrap.adminDeploymentBranch);
  const adminDeploymentStatus = readStringValue(bootstrap.adminDeploymentStatus);
  const adminDeploymentRuntimeUrl = readStringValue(bootstrap.adminDeploymentRuntimeUrl);
  const adminDeploymentPreparedAt = readDateValue(bootstrap.adminDeploymentPreparedAt);
  const storefrontConfig = (store.storefront ?? {}) as Record<string, unknown>;
  const storefrontDeploymentName = readStringValue(storefrontConfig.deploymentName);
  const storefrontDeploymentBranch = readStringValue(storefrontConfig.deploymentBranch);
  const storefrontDeploymentStatus = readStringValue(storefrontConfig.deploymentStatus);
  const storefrontRuntimeUrl = readStringValue(storefrontConfig.runtimeUrl);
  const storefrontRepoSyncStatus = readStringValue(storefrontConfig.repoSyncStatus);
  const storefrontRepoCommitSha = readStringValue(storefrontConfig.repoCommitSha);
  const storefrontRepoSyncedAt = readDateValue(storefrontConfig.repoSyncedAt);
  const storefrontPreparedAt = readDateValue(storefrontConfig.preparedAt);
  const storefrontDeployedAt = readDateValue(storefrontConfig.deployedAt);
  const provisionedAt = readDateValue(bootstrap.provisionedAt);
  const createdAt = formatDateTime(store.createdAt);
  const updatedAt = formatDateTime(store.updatedAt);
  const provisioning = store.provisioning;
  const pendingProvisioningSteps = provisioning.steps.filter(
    (step) => step.status === "failed" || step.status === "pending",
  );
  const subscription = store.management.subscription;
  const subscriptionStatusClass =
    subscription.status === "active" ? "pill-success" : "pill-accent";
  const subscriptionProgress = subscription.progressPercent ?? 0;

  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/stores" className="eyebrow-link">
            ← Tum projelere don
          </Link>
          <h1>{store.name}</h1>
          <p>{store.tagline || "Proje detaylari, operasyon sagligi ve yonetim katmani."}</p>
          <div className="actions stack-top-sm">
            <span className="pill pill-capitalize">{store.status}</span>
            <span className={`pill ${store.health.label === "hazir" ? "pill-success" : "pill-accent"}`}>
              {store.health.label}
            </span>
            <span className={`pill ${provisioning.state === "ready" ? "pill-success" : "pill-accent"}`}>
              {provisioning.state}
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
          <div className="actions compact-actions wrap stack-top-sm">
            <span className={`pill ${subscriptionStatusClass}`}>{subscription.cadenceLabel}</span>
            <span className={`pill ${subscriptionStatusClass}`}>{subscription.countdownLabel}</span>
          </div>
          <div className="meta-pairs">
            <span>Asama: <strong>{store.management.lifecycleStage}</strong></span>
            <span>Oncelik: <strong>{store.management.priority}</strong></span>
            <span>Hedef yayin: <strong>{formatDate(store.management.launchTarget)}</strong></span>
            <span>Storefront: <strong>{store.storefrontStatus}</strong></span>
            <span>Provisioning: <strong>{provisioning.state}</strong></span>
            <span>Affiliate orani: <strong>%{formatPercent(store.totalAffiliateRate)}</strong></span>
            <span>Store admin: <strong>{store.storeAdminCount}</strong></span>
            <span>Paket baslangici: <strong>{formatDate(subscription.startDate)}</strong></span>
            <span>Paket bitisi: <strong>{formatDate(subscription.endDate)}</strong></span>
            <span>Paket suresi: <strong>{subscription.durationMonths ? `${subscription.durationMonths} ay` : "-"}</strong></span>
            <span>Kalan sure: <strong>{subscription.countdownLabel}</strong></span>
          </div>
          <div
            aria-hidden="true"
            className="stack-top-sm"
            style={{
              width: "100%",
              height: "8px",
              borderRadius: "999px",
              background: "var(--surface-3)",
              overflow: "hidden"
            }}
          >
            <div
              style={{
                width: `${subscriptionProgress}%`,
                height: "100%",
                borderRadius: "999px",
                background:
                  subscription.status === "active"
                    ? "linear-gradient(90deg, rgba(25,155,99,.85), rgba(25,155,99,.45))"
                    : "linear-gradient(90deg, rgba(254,97,0,.9), rgba(254,97,0,.42))"
              }}
            />
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
            <span>Secret Authority: <strong>{store.health.secretAuthorityReady ? "Hazir" : "Drift"}</strong></span>
            <span>Legacy Auth: <strong>{store.health.legacyAuthConfigured ? "Var" : "Yok"}</strong></span>
            <span>Admin Runtime: <strong>{store.health.adminDeploymentReady ? (store.health.adminRuntimeConsistent ? "Hazir" : "Drift") : "Kapali"}</strong></span>
            <span>Admin Branch: <strong>{adminDeploymentBranch || "-"}</strong></span>
            <span>R2 Bucket: <strong>{store.r2BucketName || "Eksik"}</strong></span>
            <span>R2 Public URL: <strong>{store.r2PublicUrl || "-"}</strong></span>
            <span>R2 Managed Domain: <strong>{store.r2ManagedDomain || "-"}</strong></span>
            <span>Admin Domain: <strong>{store.adminDomain}</strong></span>
            <span>Storefront Domain: <strong>{store.storefrontDomain}</strong></span>
            <span>Storefront Branch: <strong>{storefrontDeploymentBranch || "-"}</strong></span>
            <span>Support E-posta: <strong>{store.supportEmail || "-"}</strong></span>
            <span>Support Telefon: <strong>{store.supportPhone || "-"}</strong></span>
            <span>Son Sync: <strong>{formatDateTime(store.lastSyncedAt)}</strong></span>
          </div>
          <p className="card-note">
            {store.health.adminRuntimeMessage
              ? `Admin runtime notu: ${store.health.adminRuntimeMessage}`
              : "Supabase tarafi musteri domaini kullanmaz; her proje stock-host uzerinden izole calisir."}
          </p>
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
          <div className="actions compact-actions wrap stack-top-sm">
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

      <div className="info-row info-row-3">
        <div className="card">
          <div className="card-title">Teknik Kimlikler</div>
          <div className="meta-pairs">
            <span>Slug: <strong>{store.slug}</strong></span>
            <span>Theme: <strong>{store.themeKey}</strong></span>
            <span>Storefront App: <strong>{store.storefrontAppDir || "-"}</strong></span>
            <span>Storefront Status: <strong>{store.storefrontStatus}</strong></span>
            <span>Storefront Deploy: <strong>{storefrontDeploymentStatus || storefrontDeployment?.status || "-"}</strong></span>
            <span>Olusturma: <strong>{createdAt}</strong></span>
            <span>Guncelleme: <strong>{updatedAt}</strong></span>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Supabase Provisioning</div>
          <div className="meta-pairs">
            <span>Service Name: <strong>{supabaseProjectName || "-"}</strong></span>
            <span>Resource ID: <strong>{supabaseResourceId || "-"}</strong></span>
            <span>Provisioning: <strong>{supabaseProvisioning || "-"}</strong></span>
            <span>Provisioned At: <strong>{provisionedAt}</strong></span>
            <span>
              Studio URL:{" "}
              <strong>
                {supabaseDashboardUrl ? (
                  <a href={supabaseDashboardUrl} target="_blank" rel="noreferrer">
                    {supabaseDashboardUrl}
                  </a>
                ) : (
                  "-"
                )}
              </strong>
            </span>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Admin Deployment</div>
          <div className="meta-pairs">
            <span>Deployment Name: <strong>{adminDeploymentName || adminDeployment?.appName || "-"}</strong></span>
            <span>Deployment Status: <strong>{adminDeploymentStatus || adminDeployment?.status || "-"}</strong></span>
            <span>Runtime URL: <strong>{adminDeploymentRuntimeUrl || adminDeployment?.runtimeUrl || "-"}</strong></span>
            <span>Prepared At: <strong>{adminDeploymentPreparedAt}</strong></span>
            <span>Resource ID: <strong>{adminDeployment?.resourceId || "-"}</strong></span>
          </div>
        </div>
      </div>

      <div className="card section-tight">
        <div className="section-head">
          <div>
            <div className="card-title">Provisioning Lifecycle</div>
            <p className="section-copy">
              Owner panel create ve repair akisinin hangi adimda oldugunu bu bloktan izle.
            </p>
          </div>
          {superAdmin ? <RepairProjectButton slug={store.slug} /> : null}
        </div>
        <div className="meta-pairs">
          <span>State: <strong>{provisioning.state}</strong></span>
          <span>Last Run: <strong>{formatDateTime(provisioning.lastRunAt)}</strong></span>
          <span>Blocking Step: <strong>{provisioning.blockingStepCount}</strong></span>
          <span>Failed Step: <strong>{provisioning.failedStepCount}</strong></span>
          <span>Pending Step: <strong>{provisioning.pendingStepCount}</strong></span>
        </div>
        {provisioning.lastError ? (
          <p className="card-note">Son hata: {provisioning.lastError}</p>
        ) : (
          <p className="card-note">Provisioning metadata owner authority icinde senkron tutuluyor.</p>
        )}
        {pendingProvisioningSteps.length > 0 ? (
          <div className="stack-list stack-top-md">
            {pendingProvisioningSteps.map((step) => (
              <div key={step.key} className="inline-card">
                <div>
                  <strong>{step.key}</strong>
                  <p>{step.message || step.status}</p>
                </div>
                <div className="actions compact-actions">
                  <span className={`pill ${step.status === "failed" ? "pill-accent" : "pill-success"}`}>
                    {step.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="card section-tight">
        <div className="card-title">Storefront Deployment Blueprint</div>
        {storefrontDeployment ? (
          <>
            <div className="actions compact-actions stack-top-sm">
              <LaunchStorefrontButton slug={store.slug} currentStatus={store.storefrontStatus} />
            </div>
            <div className="meta-pairs">
              <span>Deployment Name: <strong>{storefrontDeploymentName || storefrontDeployment.appName}</strong></span>
              <span>Durum: <strong>{storefrontDeploymentStatus || storefrontDeployment.status}</strong></span>
              <span>Runtime URL: <strong>{storefrontRuntimeUrl || storefrontDeployment.runtimeUrl}</strong></span>
              <span>Prepared At: <strong>{storefrontPreparedAt}</strong></span>
              <span>Deployed At: <strong>{storefrontDeployedAt}</strong></span>
              <span>Resource ID: <strong>{storefrontDeployment.resourceId || "-"}</strong></span>
              <span>Workspace: <strong>{storefrontDeployment.workspace}</strong></span>
              <span>Repo Sync: <strong>{storefrontDeployment.repoSynced ? "synced" : storefrontRepoSyncStatus || "pending"}</strong></span>
              <span>Repo Synced At: <strong>{storefrontRepoSyncedAt}</strong></span>
              <span>Repo Commit: <strong>{storefrontRepoCommitSha || "-"}</strong></span>
              <span>Env Local: <strong>{storefrontDeployment.envLocalPath || "-"}</strong></span>
              <span>Env Template: <strong>{storefrontDeployment.envTemplatePath || "-"}</strong></span>
              <span>Build: <strong>{storefrontDeployment.buildCommand}</strong></span>
              <span>Start: <strong>{storefrontDeployment.startCommand}</strong></span>
            </div>
            <p className="card-note">
              {storefrontDeployment.runtimeMessage
                ? `Storefront deployment notu: ${storefrontDeployment.runtimeMessage}`
                : "Storefront deployment standardi owner tarafinda hazir."}
            </p>
          </>
        ) : (
          <p className="muted">Storefront deployment blueprint okunamadi.</p>
        )}
      </div>

      <div className="card section-tight">
        <div className="card-title">Admin Deployment Blueprint</div>
        {adminDeployment ? (
          <>
            <div className="actions compact-actions stack-top-sm">
              <ProvisionAdminDeploymentButton slug={store.slug} currentStatus={adminDeployment.status} />
            </div>
            <div className="meta-pairs">
              <span>App Name: <strong>{adminDeployment.appName}</strong></span>
              <span>Durum: <strong>{adminDeployment.status}</strong></span>
              <span>Runtime URL: <strong>{adminDeployment.runtimeUrl}</strong></span>
              <span>Resource ID: <strong>{adminDeployment.resourceId || "-"}</strong></span>
              <span>Workspace: <strong>{adminDeployment.workspace}</strong></span>
              <span>Env Local: <strong>{adminDeployment.envLocalPath}</strong></span>
              <span>Env Template: <strong>{adminDeployment.envTemplatePath}</strong></span>
              <span>Build: <strong>{adminDeployment.buildCommand}</strong></span>
              <span>Start: <strong>{adminDeployment.startCommand}</strong></span>
            </div>
            <p className="card-note">
              {adminDeployment.runtimeMessage
                ? `Deployment notu: ${adminDeployment.runtimeMessage}`
                : "Bu store icin admin deployment standardi owner tarafinda hazir."}
            </p>
          </>
        ) : (
          <p className="muted">Admin deployment blueprint okunamadi.</p>
        )}
      </div>

      <div className="card section-tight">
        <div className="card-title">Consistency Guardrail</div>
        <div className="meta-pairs">
          <span>Toplam issue: <strong>{store.consistency.issueCount}</strong></span>
          <span>Blocking issue: <strong>{store.consistency.blockingIssueCount}</strong></span>
          <span>Durum: <strong>{store.consistency.blocking ? "Bloklu" : "Temiz"}</strong></span>
          <span>Kontrol zamani: <strong>{formatDateTime(store.consistency.checkedAt)}</strong></span>
        </div>
        {store.consistency.issues.length > 0 ? (
          <div className="stack-list stack-top-md">
            {store.consistency.issues.map((issue, index) => (
              <div key={`${issue.code}-${index}`} className="inline-card">
                <div>
                  <strong>{issue.code}</strong>
                  <p>{issue.message}</p>
                </div>
                <div className="actions compact-actions">
                  <span className={`pill ${issue.severity === "blocking" ? "pill-accent" : "pill-success"}`}>
                    {issue.severity}
                  </span>
                  <span className="pill">{issue.source}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="card-note">Config, owner secrets ve canlı admin runtime aynı authoritative store kaynağını izliyor.</p>
        )}
      </div>

      {/* Forms - Only for Super Admin */}
      {superAdmin ? (
        <>
          <div className="card section-tight">
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

          <div className="card section-tight">
            <div className="card-title">Bu Projeye Affiliate Ata</div>
            <CreateAffiliateForm stores={[{ slug: store.slug, name: store.name }]} defaultStoreSlug={store.slug} />
          </div>

          <div className="card section-tight surface-alert">
            <div className="section-head">
              <div>
                <div className="card-title">Tehlikeli Islem</div>
                <p className="section-copy">
                  Bu proje silindiginde owner kaydi, deploymentlar, Supabase, R2 ve generated storefront izleri temizlenir.
                </p>
              </div>
            </div>
            <div className="actions">
              <DeleteStoreButton slug={store.slug} name={store.name} />
            </div>
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
