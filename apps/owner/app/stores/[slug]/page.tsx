import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateAffiliateForm } from "@/components/CreateAffiliateForm";
import { CreateStoreAdminForm } from "@/components/CreateStoreAdminForm";
import { LaunchStorefrontButton } from "@/components/LaunchStorefrontButton";
import { MigrateStoreDomainForm } from "@/components/MigrateStoreDomainForm";
import { ProvisionAdminDeploymentButton } from "@/components/ProvisionAdminDeploymentButton";
import { RepairStoreDeploymentAuthorityButton } from "@/components/RepairStoreDeploymentAuthorityButton";
import { DeleteStoreButton } from "@/components/DeleteStoreButton";
import { ProvisioningLifecycleCard } from "@/components/ProvisioningLifecycleCard";
import {
  OwnerActionPanel,
  OwnerLifecycleStepper,
  OwnerMetricCard,
  OwnerSectionHeader,
  OwnerStatusChip,
} from "@/components/owner-control";
import { getStoreAdminDeploymentBlueprint } from "@/lib/admin-deployment";
import { repairStoreDeploymentAuthorityOnce } from "@/lib/coolify-store-deployment";
import { getStorefrontDeploymentBlueprint } from "@/lib/storefront-deployment";
import { listCleanupRuns } from "@/lib/store-lifecycle";
import { UpdateStoreProfileForm } from "@/components/UpdateStoreProfileForm";
import { formatCurrency, formatDate, formatDateTime, formatPercent } from "@/lib/formatters";
import {
  getDatabaseModeLabel,
  getDatabaseModePillClass,
  getProvisioningLabel,
  getProvisioningToneClass,
  getSetupSignals,
  isLegacyDatabaseMode,
} from "@/lib/lifecycle-ui";
import { requireOwnerAuth, isSuperAdmin } from "@/lib/owner-auth";
import { getStoreDetail } from "@/lib/control-plane";
import {
  getOwnerPreviewDisabledNotice,
  getOwnerPreviewFlags,
  isOwnerActionDisabled,
} from "@/lib/preview-mode";

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

function buildDeploymentAuthorityNote(
  target: {
    status: "repaired" | "already_configured" | "missing";
    branchChanged: boolean;
    autoDeployChanged: boolean;
    desiredBranch: string;
  } | null,
): string | null {
  if (!target) {
    return null;
  }

  if (target.status === "repaired") {
    const fragments = [
      target.branchChanged ? `branch ${target.desiredBranch}` : null,
      target.autoDeployChanged ? "auto deploy" : null,
    ].filter(Boolean);

    return `Authority self-heal: ${fragments.join(" + ") || "ayarlar"} onarıldı.`;
  }

  if (target.status === "missing") {
    return "Coolify resource'u bulunamadi; deployment authority sonraki provisioning adiminda kurulacak.";
  }

  return null;
}

export default async function StoreDetailPage({ params }: StoreDetailPageProps) {
  const auth = await requireOwnerAuth();
  const { slug } = await params;
  const store = await getStoreDetail(auth, slug);
  const superAdmin = isSuperAdmin(auth);
  const previewFlags = getOwnerPreviewFlags();
  const writeDisabled = isOwnerActionDisabled("write", previewFlags);
  const deployDisabled = isOwnerActionDisabled("deploy", previewFlags);
  const cleanupDisabled = isOwnerActionDisabled("cleanup", previewFlags);
  const repairDisabled = isOwnerActionDisabled("repair", previewFlags);
  const writeDisabledReason = getOwnerPreviewDisabledNotice("write", previewFlags) ?? undefined;
  const deployDisabledReason = getOwnerPreviewDisabledNotice("deploy", previewFlags) ?? undefined;
  const cleanupDisabledReason = getOwnerPreviewDisabledNotice("cleanup", previewFlags) ?? undefined;
  const repairDisabledReason = getOwnerPreviewDisabledNotice("repair", previewFlags) ?? undefined;

  if (!store) {
    notFound();
  }

  const deploymentAuthorityRepair = superAdmin && !repairDisabled
    ? await repairStoreDeploymentAuthorityOnce(store.slug)
    : null;
  const cleanupRuns = await listCleanupRuns({ unresolvedOnly: true, limit: 3, slug: store.slug }).catch(
    () => [],
  );
  const adminDeployment = await getStoreAdminDeploymentBlueprint(store.slug).catch(() => null);
  const storefrontDeployment = await getStorefrontDeploymentBlueprint(store.slug).catch(() => null);
  const storefrontDeploymentAuthority = deploymentAuthorityRepair?.targets.find(
    (target) => target.target === "storefront",
  ) ?? null;
  const adminDeploymentAuthority = deploymentAuthorityRepair?.targets.find(
    (target) => target.target === "admin",
  ) ?? null;
  const storefrontDeploymentAuthorityNote = buildDeploymentAuthorityNote(storefrontDeploymentAuthority);
  const adminDeploymentAuthorityNote = buildDeploymentAuthorityNote(adminDeploymentAuthority);
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
  const subscription = store.management.subscription;
  const subscriptionStatusClass =
    subscription.status === "active" ? "pill-success" : "pill-warning";
  const subscriptionProgress = subscription.progressPercent ?? 0;
  const showSupabaseInfrastructure = isLegacyDatabaseMode(store.databaseMode);
  const setupSignals = getSetupSignals(store.setup);
  const pendingSetupSignals = setupSignals.filter((signal) => signal.pending);
  const orphanedTargetCount = cleanupRuns.reduce(
    (total, run) =>
      total +
      run.targets.filter((target) => target.status === "failed" || target.status === "skipped").length,
    0,
  );
  const healthToneClass =
    store.health.label === "hazir"
      ? "pill-success"
      : store.health.label === "kritik"
        ? "pill-danger"
        : "pill-warning";
  const provisioningToneClass = getProvisioningToneClass(provisioning.state);
  const progressToneClass = subscription.status === "active" ? "is-success" : "is-warning";
  const setupStepState = pendingSetupSignals.length > 0 ? "current" : "done";
  const deploymentStepState =
    provisioning.state === "failed" || provisioning.state === "pending_repair"
      ? "blocked"
      : provisioning.state === "ready"
        ? "done"
        : "current";

  return (
    <>
      <section className="dashboard-hero">
        <div className="dashboard-hero-content">
          <div className="hero-stack">
            <Link href="/stores" className="eyebrow-link">
              ← Tüm mağazalara dön
            </Link>
            <span className="hero-overline">Mağaza Kontrol Paneli</span>
            <div>
              <h1>{store.name}</h1>
              <p>{store.tagline || "Mağaza detayı, operasyon sağlığı ve kurulum akışı tek ekranda izlenir."}</p>
            </div>
            <div className="actions hero-actions">
              <span className="pill pill-capitalize">{store.status}</span>
              <span className={`pill ${healthToneClass}`}>{store.health.label}</span>
              <span className={`pill ${provisioningToneClass}`}>{getProvisioningLabel(provisioning.state)}</span>
              <span className={getDatabaseModePillClass(store.databaseMode)}>
                {getDatabaseModeLabel(store.databaseMode)}
              </span>
              {showSupabaseInfrastructure ? <span className="pill pill-legacy">Legacy özel mod</span> : null}
              {pendingSetupSignals.map((signal) => (
                <span key={signal.key} className={signal.pillClassName}>
                  {signal.shortLabel}
                </span>
              ))}
              <span className="pill pill-ink">{store.storefrontDomain}</span>
            </div>
          </div>

          <div className="actions hero-actions">
            <Link className="button button-secondary" href={`https://${store.adminDomain}/admin`} target="_blank" rel="noreferrer">
              Admini aç
            </Link>
            {superAdmin ? (
              <LaunchStorefrontButton
                slug={store.slug}
                currentStatus={store.storefrontStatus}
                disabled={deployDisabled}
                disabledReason={deployDisabledReason}
              />
            ) : null}
          </div>
        </div>

        <aside className="dashboard-hero-panel">
          <div className="card-title">Mağaza özeti</div>
          <div className="hero-list">
            <div className="hero-list-item">
              <span>Müşteri</span>
              <strong>{store.management.clientCompanyName || store.name}</strong>
            </div>
            <div className="hero-list-item">
              <span>Paket ritmi</span>
              <strong>{subscription.cadenceLabel}</strong>
            </div>
            <div className="hero-list-item">
              <span>Hedef yayın</span>
              <strong>{formatDate(store.management.launchTarget)}</strong>
            </div>
            <div className="hero-list-item">
              <span>Affiliate oranı</span>
              <strong>%{formatPercent(store.totalAffiliateRate)}</strong>
            </div>
            <div className="hero-list-item">
              <span>Kurulum kuyruğu</span>
              <strong>
                {pendingSetupSignals.length > 0
                  ? `${pendingSetupSignals.length} bekleyen adım`
                  : "owner hazır"}
              </strong>
            </div>
          </div>
          <div className={`progress-track ${progressToneClass}`} aria-hidden="true">
            <span style={{ width: `${subscriptionProgress}%` }} />
          </div>
          <div className="hero-chip-row">
            <span className={`hero-chip ${subscription.status === "active" ? "hero-chip-accent" : "hero-chip-neutral"}`}>
              {subscription.countdownLabel}
            </span>
            <span className="hero-chip hero-chip-neutral">{store.storeAdminCount} mağaza admini</span>
            <span className={`hero-chip ${showSupabaseInfrastructure ? "hero-chip-neutral" : "hero-chip-accent"}`}>
              {showSupabaseInfrastructure ? "Legacy özel mod" : "Yeni Standart"}
            </span>
            <span className={`hero-chip ${cleanupRuns.length > 0 ? "hero-chip-neutral" : "hero-chip-accent"}`}>
              {cleanupRuns.length > 0 ? `${cleanupRuns.length} temizlik kaydı` : "Temizlik temiz"}
            </span>
          </div>
        </aside>
      </section>

      <div className="owner-metric-grid">
        <OwnerMetricCard label="Ürün" value={store.productCount.toLocaleString("tr-TR")} note="Katalog hacmi" />
        <OwnerMetricCard label="Sipariş" value={store.orderCount.toLocaleString("tr-TR")} note="Toplam operasyon" tone="accent" />
        <OwnerMetricCard label="Müşteri" value={store.customerCount.toLocaleString("tr-TR")} note="Müşteri tabanı" />
        <OwnerMetricCard label="Bekleyen" value={store.pendingOrderCount} note="Aksiyon bekleyen sipariş" tone={store.pendingOrderCount > 0 ? "warning" : "success"} />
        <OwnerMetricCard label="Toplam ciro" value={formatCurrency(store.totalRevenue)} note="Store performansi" tone="accent" />
        <OwnerMetricCard label="Sepet ort." value={formatCurrency(store.averageOrderValue)} note="Ortalama sipariş" />
      </div>

      <div className="split-grid">
        <OwnerActionPanel
          title="Kurulum Akışı"
          copy="Kurulum akışı teknik loglardan ayrıldı; mağazanın işletime hazır olma durumu adım adım okunur."
          tone={deploymentStepState === "blocked" ? "danger" : "accent"}
          actions={
            <>
              <OwnerStatusChip tone={showSupabaseInfrastructure ? "legacy" : "accent"}>
                {showSupabaseInfrastructure ? "Legacy özel mod" : "Yeni Celebix Standardı"}
              </OwnerStatusChip>
              <OwnerStatusChip tone={pendingSetupSignals.length > 0 ? "warning" : "success"}>
                {pendingSetupSignals.length > 0 ? `${pendingSetupSignals.length} kurulum aksiyonu` : "Kurulum temiz"}
              </OwnerStatusChip>
            </>
          }
        >
          <OwnerLifecycleStepper
            steps={[
              { label: "Mağaza kaydı", detail: `${store.slug} owner kaydı`, state: "done" },
              { label: "Veritabanı", detail: showSupabaseInfrastructure ? "Legacy Supabase modu" : "Yeni Standart", state: "done" },
              { label: "Auth / Analytics / Ödeme", detail: pendingSetupSignals.length > 0 ? "Engelleyici olmayan kurulum aksiyonları bekliyor" : "Kurulum sinyalleri temiz", state: setupStepState },
              { label: "Admin panel", detail: store.health.adminRuntimeConsistent ? "Runtime hazır" : "Runtime drift izleniyor", state: store.health.adminRuntimeConsistent ? "done" : "current" },
              { label: "Vitrin yayını", detail: store.storefrontStatus, state: deploymentStepState },
            ]}
          />
        </OwnerActionPanel>

        <OwnerActionPanel
          title="Altyapı Durumu"
          copy="Yeni Standart mağazalarda Supabase eksikliği hata gibi sunulmaz; Legacy mağazalar ayrı mod olarak izlenir."
        >
          <div className="setup-signal-grid">
            <div className={`setup-signal-card ${showSupabaseInfrastructure ? "tone-legacy" : "tone-ready"}`}>
              <span className="setup-signal-kicker">Veritabanı</span>
              <div className="setup-signal-value">{getDatabaseModeLabel(store.databaseMode)}</div>
              <p className="setup-signal-note">
                {showSupabaseInfrastructure
                  ? "Legacy full_supabase özel mod olarak ayrıldı."
                  : "Yeni Celebix Standardı Light Postgres ile çalışır."}
              </p>
            </div>
            <div className={`setup-signal-card ${store.health.r2Ready ? "tone-ready" : "tone-cleanup"}`}>
              <span className="setup-signal-kicker">R2</span>
              <div className="setup-signal-value">{store.health.r2Ready ? "Hazır" : "Eksik"}</div>
              <p className="setup-signal-note">{store.r2BucketName || "Medya authority sonraki operasyon adımında tamamlanır."}</p>
            </div>
          </div>
        </OwnerActionPanel>
      </div>

      <OwnerSectionHeader
        eyebrow="Kurulum Akışı"
        title="Bekleyen kurulum aksiyonları"
        copy="Auth, analytics, ödeme ve temizlik sinyalleri mağaza detayında teknik hata yerine operasyon sırası olarak okunur."
      />

      <div className="setup-signal-grid">
        {setupSignals.map((signal) => (
          <div key={signal.key} className={`setup-signal-card ${signal.cardToneClass}`}>
            <span className="setup-signal-kicker">{signal.title}</span>
            <div className="actions compact-actions wrap stack-top-sm">
              <span className={signal.pillClassName}>{signal.shortLabel}</span>
              <span className="pill pill-ink">{signal.providerLabel}</span>
            </div>
            <div className="setup-signal-value">
              {signal.pending
                ? "Operasyon sirasinda"
                : signal.key === "auth" && showSupabaseInfrastructure
                  ? "Legacy authority"
                  : "Owner hazır"}
            </div>
            <p className="setup-signal-note">{signal.note}</p>
          <div className="setup-signal-footer">
              <span>
                Sağlayıcı <strong>{signal.providerLabel}</strong>
              </span>
              <span>
                Durum <strong>{signal.statusLabel}</strong>
              </span>
            </div>
          </div>
        ))}

        <div className={`setup-signal-card ${cleanupRuns.length > 0 ? "tone-cleanup" : "tone-neutral"}`}>
          <span className="setup-signal-kicker">Temizlik</span>
          <div className="actions compact-actions wrap stack-top-sm">
            <span className={`pill ${cleanupRuns.length > 0 ? "pill-danger" : "pill-success"}`}>
              {cleanupRuns.length > 0 ? "temizlik bekliyor" : "temizlik temiz"}
            </span>
            <Link className="button button-ghost" href="/operations">
              Operasyonu ac
            </Link>
          </div>
          <div className="setup-signal-value">
            {cleanupRuns.length > 0 ? `${cleanupRuns.length} açık kayıt` : "Açık kayıt yok"}
          </div>
          <p className="setup-signal-note">
            {cleanupRuns.length > 0
              ? "Bu mağaza için dış kaynak temizliği tamamlanmamış kayıtlar owner panelde izleniyor."
              : "Bu mağaza için açık temizlik kaydı görünmüyor."}
          </p>
          <div className="setup-signal-footer">
            <span>
              Temizlik hedefi <strong>{orphanedTargetCount}</strong>
            </span>
            <span>
              Kapsam <strong>{store.slug}</strong>
            </span>
          </div>
        </div>
      </div>

      {cleanupRuns.length > 0 ? (
        <div className="card surface-alert section-tight">
          <div className="section-head">
            <div>
              <div className="card-title">Mağaza Temizlik Takibi</div>
              <p className="section-copy">
                Bu mağaza için authority silindikten sonra açık kalan temizlik kayıtları burada izlenir.
              </p>
            </div>
            <Link href="/operations" className="button button-secondary">
              Tüm temizlik kayıtları
            </Link>
          </div>
          <div className="stack-list stack-top-sm">
            {cleanupRuns.map((run) => (
              <div key={run.id} className="inline-card">
                <div>
                  <strong>{run.storeName || store.name}</strong>
                  <p>{run.status}</p>
                </div>
                <div className="activity-meta">
                  <span>{run.targets.length} hedef</span>
                  <span>
                    {
                      run.targets.filter(
                        (target) => target.status === "failed" || target.status === "skipped",
                      ).length
                    }{" "}
                    orphan
                  </span>
                  <span>{formatDateTime(run.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Info Cards */}
      <div className="info-row info-row-3">
        <div className="card">
          <div className="card-title">Müşteri Profili</div>
          <div className="meta-pairs">
            <span>Marka: <strong>{store.management.clientCompanyName || store.name}</strong></span>
            <span>Yetkili: <strong>{store.management.clientContactName || "-"}</strong></span>
            <span>E-posta: <strong>{store.management.clientContactEmail || "-"}</strong></span>
            <span>Telefon: <strong>{store.management.clientContactPhone || "-"}</strong></span>
            <span>İç sorumlu: <strong>{store.management.internalOwner || "-"}</strong></span>
            <span>Tahsilat: <strong>{store.management.billingStatus}</strong></span>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Yaşam Döngüsü</div>
          <div className="actions compact-actions wrap stack-top-sm">
            <span className={`pill ${subscriptionStatusClass}`}>{subscription.cadenceLabel}</span>
            <span className={`pill ${subscriptionStatusClass}`}>{subscription.countdownLabel}</span>
            <span className={getDatabaseModePillClass(store.databaseMode)}>
              {getDatabaseModeLabel(store.databaseMode)}
            </span>
            {showSupabaseInfrastructure ? <span className="pill pill-legacy">Legacy özel mod</span> : null}
            <span className={`pill ${provisioningToneClass}`}>{getProvisioningLabel(provisioning.state)}</span>
          </div>
          <div className="meta-pairs">
            <span>Aşama: <strong>{store.management.lifecycleStage}</strong></span>
            <span>Öncelik: <strong>{store.management.priority}</strong></span>
            <span>Hedef yayın: <strong>{formatDate(store.management.launchTarget)}</strong></span>
            <span>Vitrin: <strong>{store.storefrontStatus}</strong></span>
            <span>Kurulum: <strong>{getProvisioningLabel(provisioning.state)}</strong></span>
            <span>Affiliate oranı: <strong>%{formatPercent(store.totalAffiliateRate)}</strong></span>
            <span>Mağaza admini: <strong>{store.storeAdminCount}</strong></span>
            <span>Paket başlangıcı: <strong>{formatDate(subscription.startDate)}</strong></span>
            <span>Paket bitisi: <strong>{formatDate(subscription.endDate)}</strong></span>
            <span>Paket suresi: <strong>{subscription.durationMonths ? `${subscription.durationMonths} ay` : "-"}</strong></span>
            <span>Kalan sure: <strong>{subscription.countdownLabel}</strong></span>
          </div>
          <div aria-hidden="true" className={`progress-track ${progressToneClass} stack-top-sm`}>
            <span style={{ width: `${subscriptionProgress}%` }} />
          </div>
          <p className="card-note">{store.management.nextAction || "Sonraki aksiyon tanımlanmamış."}</p>
        </div>

        <div className={`card ${showSupabaseInfrastructure ? "" : "surface-brand"}`}>
          <div className="card-title">Altyapi</div>
          <div className="actions compact-actions wrap stack-top-sm">
            <span className={getDatabaseModePillClass(store.databaseMode)}>
              {getDatabaseModeLabel(store.databaseMode)}
            </span>
            {showSupabaseInfrastructure ? <span className="pill pill-legacy">Legacy özel mod</span> : null}
            <span className={`pill ${provisioningToneClass}`}>{getProvisioningLabel(provisioning.state)}</span>
          </div>
          <div className="meta-pairs">
            <span>Veritabanı modu: <strong>{getDatabaseModeLabel(store.databaseMode)}</strong></span>
            {showSupabaseInfrastructure ? (
              <span>Supabase: <strong>{store.supabaseProjectRef || "Eksik"}</strong></span>
            ) : (
              <span>Light Postgres DB: <strong>{store.slug}</strong></span>
            )}
            {showSupabaseInfrastructure ? (
              <span>Supabase Host: <strong>{store.supabaseUrl || "Eksik"}</strong></span>
            ) : (
              <span>DB authority: <strong>{store.health.secretAuthorityReady ? "Hazır" : "Bekleniyor"}</strong></span>
            )}
            {showSupabaseInfrastructure ? (
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
            ) : (
              <span>Auth: <strong>{store.setup.auth.provider} / {store.setup.auth.status}</strong></span>
            )}
            <span>Analytics: <strong>{store.setup.analytics.provider} / {store.setup.analytics.status}</strong></span>
              <span>Ödeme: <strong>{store.setup.payments.defaultProvider} / {store.setup.payments.status}</strong></span>
            <span>Legacy Auth: <strong>{store.health.legacyAuthConfigured ? "Var" : "Yok"}</strong></span>
            <span>Admin runtime: <strong>{store.health.adminDeploymentReady ? (store.health.adminRuntimeConsistent ? "Hazır" : "Drift") : "Kapalı"}</strong></span>
            <span>Admin branch: <strong>{adminDeploymentBranch || "-"}</strong></span>
            <span>R2 Bucket: <strong>{store.r2BucketName || "Eksik"}</strong></span>
            <span>R2 Public URL: <strong>{store.r2PublicUrl || "-"}</strong></span>
            <span>R2 Managed Domain: <strong>{store.r2ManagedDomain || "-"}</strong></span>
            <span>Admin Domain: <strong>{store.adminDomain}</strong></span>
            <span>Vitrin domain: <strong>{store.storefrontDomain}</strong></span>
            <span>Vitrin branch: <strong>{storefrontDeploymentBranch || "-"}</strong></span>
            <span>Destek e-postası: <strong>{store.supportEmail || "-"}</strong></span>
            <span>Destek telefonu: <strong>{store.supportPhone || "-"}</strong></span>
            <span>Son Sync: <strong>{formatDateTime(store.lastSyncedAt)}</strong></span>
          </div>
          <p className="card-note">
            {store.health.adminRuntimeMessage
              ? `Admin runtime notu: ${store.health.adminRuntimeMessage}`
              : showSupabaseInfrastructure
                ? "Legacy Supabase stack authority ve istisnai auth modeli bu kartta ayrı izlenir."
                : "Light Postgres mağaza veritabanı, R2 zinciri ve bekleyen kurulum aksiyonları bu kartta okunur."}
          </p>
        </div>
      </div>

      {/* Store Admins & Affiliates */}
      <div className="split-grid">
        <div className="card">
          <div className="card-title">Mağaza Adminleri</div>
          {store.storeAdmins.length === 0 ? (
            <p className="muted">Atanmış mağaza admini yok.</p>
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
          <div className="card-title">Affiliate Erişimi</div>
          {store.affiliateAssignments.length === 0 ? (
            <p className="muted">Atanmış affiliate yok.</p>
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
            <p className="muted">Bu mağaza için audit kaydı henüz yok.</p>
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
          <div className="card-title">Özellikler ve Notlar</div>
          <div className="actions compact-actions wrap stack-top-sm">
            {store.features.length === 0 ? (
              <span className="muted">Tanımlı özellik yok</span>
            ) : (
              store.features.map((feature) => (
                <span key={feature} className="pill">
                  {feature}
                </span>
              ))
            )}
          </div>
          <p className="card-note">{store.management.ownerNotes || "İç owner notu girilmemiş."}</p>
        </div>
      </div>

      <div className="info-row info-row-3">
        <div className="card">
          <div className="card-title">Teknik Kimlikler</div>
          <div className="meta-pairs">
            <span>Slug: <strong>{store.slug}</strong></span>
            <span>Tema: <strong>{store.themeKey}</strong></span>
            <span>Vitrin app: <strong>{store.storefrontAppDir || "-"}</strong></span>
            <span>Vitrin durumu: <strong>{store.storefrontStatus}</strong></span>
            <span>Vitrin yayını: <strong>{storefrontDeploymentStatus || storefrontDeployment?.status || "-"}</strong></span>
            <span>Oluşturma: <strong>{createdAt}</strong></span>
            <span>Güncelleme: <strong>{updatedAt}</strong></span>
          </div>
        </div>

        <div className={`card ${showSupabaseInfrastructure ? "" : "surface-brand"}`}>
          <div className="card-title">
            {showSupabaseInfrastructure ? "Legacy Supabase Kurulumu" : "Kurulum Aksiyonu Durumu"}
          </div>
          <div className="actions compact-actions wrap stack-top-sm">
            {pendingSetupSignals.length > 0 ? (
              pendingSetupSignals.map((signal) => (
                <span key={signal.key} className={signal.pillClassName}>
                  {signal.shortLabel}
                </span>
              ))
            ) : (
              <span className="pill pill-success">kurulum sinyali temiz</span>
            )}
          </div>
          <div className="meta-pairs">
            {showSupabaseInfrastructure ? (
              <>
                <span>Servis adı: <strong>{supabaseProjectName || "-"}</strong></span>
                <span>Resource ID: <strong>{supabaseResourceId || "-"}</strong></span>
                <span>Kurulum: <strong>{supabaseProvisioning || "-"}</strong></span>
                <span>Kurulum zamanı: <strong>{provisionedAt}</strong></span>
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
              </>
            ) : (
              <>
                <span>Auth sağlayıcı: <strong>{store.setup.auth.provider}</strong></span>
                <span>Auth durumu: <strong>{store.setup.auth.status}</strong></span>
                <span>Analytics sağlayıcı: <strong>{store.setup.analytics.provider}</strong></span>
                <span>Analytics durumu: <strong>{store.setup.analytics.status}</strong></span>
                <span>Ödeme sağlayıcı: <strong>{store.setup.payments.defaultProvider}</strong></span>
                <span>Ödeme durumu: <strong>{store.setup.payments.status}</strong></span>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Admin Yayın Özeti</div>
          <div className="meta-pairs">
            <span>Yayın adı: <strong>{adminDeploymentName || adminDeployment?.appName || "-"}</strong></span>
            <span>Yayın durumu: <strong>{adminDeploymentStatus || adminDeployment?.status || "-"}</strong></span>
            <span>Runtime URL: <strong>{adminDeploymentRuntimeUrl || adminDeployment?.runtimeUrl || "-"}</strong></span>
            <span>Hazırlanma zamanı: <strong>{adminDeploymentPreparedAt}</strong></span>
            <span>Resource ID: <strong>{adminDeployment?.resourceId || "-"}</strong></span>
          </div>
        </div>
      </div>

      <ProvisioningLifecycleCard
        slug={store.slug}
        storeName={store.name}
        provisioning={provisioning}
        superAdmin={superAdmin}
        repairDisabled={repairDisabled}
        repairDisabledReason={repairDisabledReason}
      />

      <div className="card section-tight">
        <div className="card-title">Vitrin Yayın Planı</div>
        {storefrontDeployment ? (
          <>
            <div className="actions compact-actions stack-top-sm">
              <LaunchStorefrontButton
                slug={store.slug}
                currentStatus={store.storefrontStatus}
                disabled={deployDisabled}
                disabledReason={deployDisabledReason}
              />
              {superAdmin ? (
                <RepairStoreDeploymentAuthorityButton
                  slug={store.slug}
                  disabled={repairDisabled}
                  disabledReason={repairDisabledReason}
                />
              ) : null}
            </div>
            <div className="meta-pairs">
              <span>Yayın adı: <strong>{storefrontDeploymentName || storefrontDeployment.appName}</strong></span>
              <span>Durum: <strong>{storefrontDeploymentStatus || storefrontDeployment.status}</strong></span>
              <span>Runtime URL: <strong>{storefrontRuntimeUrl || storefrontDeployment.runtimeUrl}</strong></span>
              <span>Hazırlanma zamanı: <strong>{storefrontPreparedAt}</strong></span>
              <span>Yayın zamanı: <strong>{storefrontDeployedAt}</strong></span>
              <span>Resource ID: <strong>{storefrontDeployment.resourceId || "-"}</strong></span>
            <span>Çalışma alanı: <strong>{storefrontDeployment.workspace}</strong></span>
              <span>Repo sync: <strong>{storefrontDeployment.repoSynced ? "senkron" : storefrontRepoSyncStatus || "bekliyor"}</strong></span>
              <span>Repo sync zamanı: <strong>{storefrontRepoSyncedAt}</strong></span>
              <span>Repo Commit: <strong>{storefrontRepoCommitSha || "-"}</strong></span>
              <span>Env Local: <strong>{storefrontDeployment.envLocalPath || "-"}</strong></span>
              <span>Env Template: <strong>{storefrontDeployment.envTemplatePath || "-"}</strong></span>
              <span>Build: <strong>{storefrontDeployment.buildCommand}</strong></span>
              <span>Start: <strong>{storefrontDeployment.startCommand}</strong></span>
            </div>
            <p className="card-note">
              {storefrontDeploymentAuthorityNote ||
                (storefrontDeployment.runtimeMessage
                  ? `Vitrin yayın notu: ${storefrontDeployment.runtimeMessage}`
                  : "Vitrin yayın standardı owner tarafında hazır.")}
            </p>
          </>
        ) : (
          <p className="muted">Vitrin yayın planı okunamadı.</p>
        )}
      </div>

      <div className="card section-tight">
        <div className="card-title">Admin Yayın Planı</div>
        {adminDeployment ? (
          <>
            <div className="actions compact-actions stack-top-sm">
              <ProvisionAdminDeploymentButton
                slug={store.slug}
                currentStatus={adminDeployment.status}
                disabled={deployDisabled}
                disabledReason={deployDisabledReason}
              />
            </div>
            <div className="meta-pairs">
              <span>App adı: <strong>{adminDeployment.appName}</strong></span>
              <span>Durum: <strong>{adminDeployment.status}</strong></span>
              <span>Runtime URL: <strong>{adminDeployment.runtimeUrl}</strong></span>
              <span>Resource ID: <strong>{adminDeployment.resourceId || "-"}</strong></span>
            <span>Çalışma alanı: <strong>{adminDeployment.workspace}</strong></span>
              <span>Env Local: <strong>{adminDeployment.envLocalPath}</strong></span>
              <span>Env Template: <strong>{adminDeployment.envTemplatePath}</strong></span>
              <span>Build: <strong>{adminDeployment.buildCommand}</strong></span>
              <span>Start: <strong>{adminDeployment.startCommand}</strong></span>
            </div>
            <p className="card-note">
              {adminDeploymentAuthorityNote ||
                (adminDeployment.runtimeMessage
                  ? `Yayın notu: ${adminDeployment.runtimeMessage}`
                  : "Bu mağaza için admin yayın standardı owner tarafında hazır.")}
            </p>
          </>
        ) : (
          <p className="muted">Admin yayın planı okunamadı.</p>
        )}
      </div>

      <div className="card section-tight">
        <div className="card-title">Tutarlılık Kontrolü</div>
        <div className="meta-pairs">
          <span>Toplam konu: <strong>{store.consistency.issueCount}</strong></span>
          <span>Bloklayan konu: <strong>{store.consistency.blockingIssueCount}</strong></span>
          <span>Durum: <strong>{store.consistency.blocking ? "Bloklu" : "Temiz"}</strong></span>
          <span>Kontrol zamanı: <strong>{formatDateTime(store.consistency.checkedAt)}</strong></span>
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
          <p className="card-note">Config, owner secrets ve canlı admin runtime aynı authoritative mağaza kaynağını izliyor.</p>
        )}
      </div>

      {/* Forms - Only for Super Admin */}
      {superAdmin ? (
        <>
          <div className="card section-tight">
            <div className="card-title">Demo Domain'den Özel Domain'e Geçiş</div>
            <p className="section-copy">
              Demo subdomain ile kurulan mağazayı owner panelden kontrollü şekilde gerçek domaine taşır.
            </p>
            <MigrateStoreDomainForm
              slug={store.slug}
              storefrontDomain={store.storefrontDomain}
              adminDomain={store.adminDomain}
              domainMigration={store.domainMigration}
              disabled={deployDisabled}
              disabledReason={deployDisabledReason}
            />
          </div>

          <div className="card section-tight">
            <div className="card-title">Mağaza Profilini Güncelle</div>
            <p className="section-copy">Müşteri iletişimini, iç sorumluyu, owner notlarını ve durum akışını buradan güncelle.</p>
            <UpdateStoreProfileForm
              store={{
                slug: store.slug,
                status: store.status,
                tagline: store.tagline,
                supportEmail: store.supportEmail,
                supportPhone: store.supportPhone,
                management: store.management
              }}
              disabled={writeDisabled}
              disabledReason={writeDisabledReason}
            />
          </div>

          <div className="card section-tight">
            <div className="card-title">Bu Mağazaya Affiliate Ata</div>
            <CreateAffiliateForm
              stores={[{ slug: store.slug, name: store.name }]}
              defaultStoreSlug={store.slug}
              disabled={writeDisabled}
              disabledReason={writeDisabledReason}
            />
          </div>

          <div className="card section-tight surface-alert">
            <div className="section-head">
              <div>
                <div className="card-title">Tehlikeli İşlem</div>
                <p className="section-copy">
                  Bu mağaza silindiğinde owner kaydı, yayınlar, Supabase, R2 ve generated vitrin izleri temizlenir.
                </p>
              </div>
            </div>
            <div className="actions">
              <DeleteStoreButton
                slug={store.slug}
                name={store.name}
                disabled={cleanupDisabled}
                disabledReason={cleanupDisabledReason}
              />
            </div>
          </div>
        </>
      ) : null}

      <div className="card">
        <div className="card-title">Bu Mağazaya Admin Ata</div>
        <p className="section-copy">Bu mağazaya bağlı operasyon kullanıcılarını yönet.</p>
        <CreateStoreAdminForm
          storeSlug={store.slug}
          disabled={writeDisabled}
          disabledReason={writeDisabledReason}
        />
      </div>
    </>
  );
}
