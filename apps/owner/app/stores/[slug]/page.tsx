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
  getOperationalStatus,
  getProvisioningTimeline,
  getStoreReadinessItems,
} from "@/lib/control-center-ui";
import {
  OwnerActionPanel,
  OwnerActionQueue,
  OwnerEmptyState,
  OwnerLifecycleStepper,
  OwnerMetricCard,
  OwnerPageHeader,
  OwnerSectionCard,
  OwnerSectionHeader,
  OwnerStatusChip,
  OwnerTimeline,
} from "@/components/owner-control";
import { getStoreAdminDeploymentBlueprint } from "@/lib/admin-deployment";
import { getStorefrontDeploymentBlueprint } from "@/lib/storefront-deployment";
import { listCleanupRuns } from "@/lib/store-lifecycle";
import { UpdateStoreProfileForm } from "@/components/UpdateStoreProfileForm";
import { formatCurrency, formatDate, formatDateTime, formatPercent } from "@/lib/formatters";
import {
  getDatabaseModeLabel,
  getDatabaseModePillClass,
  getSetupSignals,
  isLegacyDatabaseMode,
} from "@/lib/lifecycle-ui";
import { requireOwnerAuth, isSuperAdmin } from "@/lib/owner-auth";
import { getStoreDetail, type DashboardStoreSummary, type StoreDetailSummary } from "@/lib/control-plane";
import {
  getOwnerPreviewDisabledNotice,
  getOwnerPreviewFlags,
  isOwnerActionDisabled,
} from "@/lib/preview-mode";
import {
  getPreviewDashboardStores,
  getPreviewOwnerAuthContext,
  hasOwnerPreviewDataFallback,
} from "@/lib/owner-preview-fixtures";

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

function getStoreStatusLabel(status: string) {
  if (status === "active") {
    return "Aktif";
  }
  if (status === "paused") {
    return "Duraklatıldı";
  }
  return "Taslak";
}

function buildPreviewStoreDetail(store: DashboardStoreSummary): StoreDetailSummary {
  return {
    ...store,
    supportEmail: store.management.clientContactEmail,
    supportPhone: store.management.clientContactPhone,
    tagline: store.management.nextAction,
    supabaseProjectRef: null,
    supabaseUrl: null,
    supabaseDashboardUrl: null,
    r2BucketName: store.r2?.bucketName ?? (store.health.r2Ready ? `${store.slug}-assets` : null),
    r2PublicUrl: store.r2?.publicUrl ?? null,
    r2ManagedDomain: store.r2?.managedDomain ?? null,
    bootstrap: {
      adminDeploymentName: `${store.slug}-admin`,
      adminDeploymentBranch: `generated-admin/${store.slug}`,
      adminDeploymentStatus: store.health.adminDeploymentReady ? "configured" : "pending-owner-env",
      adminDeploymentRuntimeUrl: `https://${store.adminDomain}`,
      provisionedAt: store.provisioning.lastRunAt,
    },
    storefront: {
      deploymentName: `${store.slug}-storefront`,
      deploymentBranch: `generated-storefront/${store.slug}`,
      deploymentStatus: store.health.storefrontRuntimeConsistent ? "configured" : "pending",
      runtimeUrl: `https://${store.storefrontDomain}`,
      repoSyncStatus: store.storefrontAppDir ? "synced" : "pending",
      preparedAt: store.provisioning.lastRunAt,
      deployedAt: store.smoke?.finishedAt ?? store.provisioning.lastRunAt,
    },
    features: ["owner-preview", "light-postgres", "logto", "r2", "umami"],
    createdAt: store.lastSyncedAt ?? "2026-06-04T18:30:00.000Z",
    updatedAt: store.lastSyncedAt ?? "2026-06-04T18:30:00.000Z",
    affiliateAssignments: [],
    storeAdmins: [],
    recentActivity: [],
  };
}

export default async function StoreDetailPage({ params }: StoreDetailPageProps) {
  const previewFallback = hasOwnerPreviewDataFallback();
  const auth = previewFallback ? getPreviewOwnerAuthContext() : await requireOwnerAuth();
  const { slug } = await params;
  const previewStore = previewFallback
    ? getPreviewDashboardStores().find((item) => item.slug === slug)
    : null;
  const store = previewStore ? buildPreviewStoreDetail(previewStore) : await getStoreDetail(auth, slug);
  const superAdmin = isSuperAdmin(auth);
  const previewFlags = getOwnerPreviewFlags();
  const writeDisabled = isOwnerActionDisabled("write", previewFlags);
  const writeDisabledReason = getOwnerPreviewDisabledNotice("write", previewFlags) ?? undefined;
  const deployDisabledReason = getOwnerPreviewDisabledNotice("deploy", previewFlags) ?? undefined;
  const cleanupDisabledReason = getOwnerPreviewDisabledNotice("cleanup", previewFlags) ?? undefined;
  const repairDisabledReason = getOwnerPreviewDisabledNotice("repair", previewFlags) ?? undefined;
  const deployActionLockedReason =
    deployDisabledReason || "Deploy ve repair mutasyonları ayrı onaylı deploy workflow'u üzerinden çalıştırılır.";
  const repairActionLockedReason =
    repairDisabledReason || "Repair mutasyonları ayrı onaylı deploy workflow'u üzerinden çalıştırılır.";
  const cleanupActionLockedReason =
    cleanupDisabledReason || "Cleanup ve delete aksiyonları ayrı onaylı bakım workflow'u üzerinden çalıştırılır.";

  if (!store) {
    notFound();
  }

  const cleanupRuns = await listCleanupRuns({ unresolvedOnly: true, limit: 3, slug: store.slug }).catch(
    () => [],
  );
  const adminDeployment = await getStoreAdminDeploymentBlueprint(store.slug).catch(() => null);
  const storefrontDeployment = await getStorefrontDeploymentBlueprint(store.slug).catch(() => null);
  const storefrontDeploymentAuthorityNote: string | null = null;
  const adminDeploymentAuthorityNote: string | null = null;
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
  const authSignal = setupSignals.find((signal) => signal.key === "auth");
  const analyticsSignal = setupSignals.find((signal) => signal.key === "analytics");
  const paymentSignal = setupSignals.find((signal) => signal.key === "payment");
  const logto = store.logto;
  const logtoAdminRedirectCount = logto?.adminRedirectUris?.length ?? 0;
  const logtoAdminLogoutCount = logto?.adminPostLogoutRedirectUris?.length ?? 0;
  const logtoCustomerRedirectCount = logto?.customerRedirectUris?.length ?? 0;
  const logtoCustomerLogoutCount = logto?.customerPostLogoutRedirectUris?.length ?? 0;
  const umami = store.umami;
  const r2 = store.r2;
  const media = store.media;
  const smoke = store.smoke;
  const operationalStatus = getOperationalStatus(store);
  const readinessItems = getStoreReadinessItems(store);
  const provisioningTimeline = getProvisioningTimeline(store);
  const smokePassedCount = smoke?.checks.filter((check) => check.status === "passed").length ?? 0;
  const smokeFailedCount = smoke?.checks.filter((check) => check.status === "failed").length ?? 0;
  const smokePendingCount = smoke?.checks.filter((check) => check.status === "pending").length ?? 0;
  const pendingSetupSignals = setupSignals.filter((signal) => signal.pending);
  const orphanedTargetCount = cleanupRuns.reduce(
    (total, run) =>
      total +
      run.targets.filter((target) => target.status === "failed" || target.status === "skipped").length,
    0,
  );
  const progressToneClass = subscription.status === "active" ? "is-success" : "is-warning";
  const setupStepState = pendingSetupSignals.length > 0 ? "current" : "done";
  const deploymentStepState =
    provisioning.state === "failed" || (provisioning.state === "pending_repair" && operationalStatus.needsAttention)
      ? "blocked"
      : provisioning.state === "ready" || operationalStatus.label === "Ready with metadata warning"
        ? "done"
        : "current";
  const warningItems = [
    operationalStatus.metadataWarning
      ? "Store operational görünüyor; üst seviye provisioning/runtime metadata stale olabilir."
      : null,
    operationalStatus.smokeIncomplete
      ? "Smoke verification is missing or incomplete."
      : null,
    store.health.storefrontDataMessage?.toLocaleLowerCase("en").includes("runtime_unreachable")
      ? store.health.storefrontDataMessage
      : null,
    provisioning.failedStepCount > 0
      ? `${provisioning.failedStepCount} provisioning step failed.`
      : null,
    store.consistency.blocking
      ? `${store.consistency.blockingIssueCount} blocking consistency issue exists.`
      : null,
  ].filter(Boolean) as string[];

  return (
    <div className="store-detail-page">
      <OwnerPageHeader
        eyebrow="Mağaza Kontrol Paneli"
        title={store.name}
        copy={store.tagline || "Mağaza kimliği, kurulum akışı, erişim ve yayın sağlığı tek sayfada yönetilir."}
        className="store-detail-header"
        chips={
          <>
            <OwnerStatusChip>{getStoreStatusLabel(store.status)}</OwnerStatusChip>
            <OwnerStatusChip tone={operationalStatus.metadataWarning ? "warning" : store.health.label === "hazir" ? "success" : store.health.label === "kritik" ? "danger" : "warning"}>
              {operationalStatus.metadataWarning ? "Metadata warning" : store.health.label}
            </OwnerStatusChip>
            <OwnerStatusChip tone={showSupabaseInfrastructure ? "legacy" : "accent"}>
              {showSupabaseInfrastructure ? "Legacy" : "Yeni Standart"}
            </OwnerStatusChip>
            <span className={getDatabaseModePillClass(store.databaseMode)}>
              {getDatabaseModeLabel(store.databaseMode)}
            </span>
            <OwnerStatusChip tone={operationalStatus.tone}>{operationalStatus.label}</OwnerStatusChip>
          </>
        }
        actions={
          <>
            <Link className="button button-ghost" href="/stores">
              Mağazalara Dön
            </Link>
            <Link className="button button-secondary" href={`https://${store.storefrontDomain}`} target="_blank" rel="noreferrer">
              Vitrini Aç
            </Link>
            <Link className="button button-primary" href={`https://${store.adminDomain}/admin`} target="_blank" rel="noreferrer">
              Admini Aç
            </Link>
          </>
        }
        aside={
          <div className="store-command-card">
            <span>Domain</span>
            <strong>{store.storefrontDomain}</strong>
            <p>{store.adminDomain}</p>
            <div className={`progress-track ${progressToneClass}`} aria-hidden="true">
              <span style={{ width: `${subscriptionProgress}%` }} />
            </div>
            <small>{subscription.countdownLabel}</small>
          </div>
        }
      />

      <nav className="store-section-nav" aria-label="Mağaza detay bölümleri">
        <a href="#genel-bakis">Genel Bakış</a>
        <a href="#identity">Identity</a>
        <a href="#readiness">Infrastructure</a>
        <a href="#kurulum">Kurulum</a>
        <a href="#timeline">Timeline</a>
        <a href="#domain-deploy">Deployments</a>
        <a href="#warnings">Warnings</a>
        <a href="#erisim">Erişim</a>
        <a href="#aktivite">Aktivite</a>
        <a href="#tehlikeli">Tehlikeli İşlemler</a>
      </nav>

      <section id="genel-bakis" className="store-detail-section">
        <OwnerSectionHeader
          eyebrow="Genel Bakış"
          title="Mağaza sağlık özeti"
          copy="Uzun metadata listesi yerine karar aldıran sinyaller, KPI kartları ve mağaza kimliği öne çıkarılır."
        />
        <div className="owner-metric-grid store-detail-kpis">
          <OwnerMetricCard label="Ürün" value={store.productCount.toLocaleString("tr-TR")} note="Katalog hacmi" />
          <OwnerMetricCard label="Sipariş" value={store.orderCount.toLocaleString("tr-TR")} note="Toplam operasyon" tone="accent" />
          <OwnerMetricCard label="Müşteri" value={store.customerCount.toLocaleString("tr-TR")} note="Müşteri tabanı" />
          <OwnerMetricCard label="Bekleyen" value={store.pendingOrderCount} note="Aksiyon bekleyen sipariş" tone={store.pendingOrderCount > 0 ? "warning" : "success"} />
          <OwnerMetricCard label="Toplam ciro" value={formatCurrency(store.totalRevenue)} note="Mağaza performansı" tone="accent" />
          <OwnerMetricCard label="Sepet ort." value={formatCurrency(store.averageOrderValue)} note="Ortalama sipariş" />
        </div>

        <div className="store-detail-two-column">
          <OwnerSectionCard
            title="Operational status"
            copy={operationalStatus.note}
            tone={operationalStatus.tone}
            actions={<OwnerStatusChip tone={operationalStatus.tone}>{operationalStatus.label}</OwnerStatusChip>}
          >
            {warningItems.length > 0 ? (
              <div className="warning-banner-list">
                {warningItems.map((warning) => (
                  <div key={warning} className="owner-warning-banner">
                    <strong>Warning</strong>
                    <p>{warning}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="card-note">Blocking provisioning, deploy, smoke veya metadata alarmı görünmüyor.</p>
            )}
          </OwnerSectionCard>

          <OwnerSectionCard
            title="Warnings"
            copy="Runtime/provisioning metadata uyarıları operational status'tan ayrı gösterilir; gerçek blocking issue varsa saklanmaz."
            tone={warningItems.length > 0 ? "warning" : "success"}
          >
            {warningItems.length > 0 ? (
              <div id="warnings" className="warning-banner-list">
                {warningItems.map((warning) => (
                  <div key={warning} className="owner-warning-banner">
                    <strong>Warning</strong>
                    <p>{warning}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p id="warnings" className="card-note">No warnings.</p>
            )}
          </OwnerSectionCard>

          <OwnerSectionCard title="Müşteri ve Yaşam Döngüsü" copy={store.management.nextAction || "Sonraki aksiyon tanımlanmamış."}>
            <div className="meta-pairs">
              <span>Marka: <strong>{store.management.clientCompanyName || store.name}</strong></span>
              <span>Yetkili: <strong>{store.management.clientContactName || "-"}</strong></span>
              <span>E-posta: <strong>{store.management.clientContactEmail || "-"}</strong></span>
              <span>Telefon: <strong>{store.management.clientContactPhone || "-"}</strong></span>
              <span>İç sorumlu: <strong>{store.management.internalOwner || "-"}</strong></span>
              <span>Aşama: <strong>{store.management.lifecycleStage}</strong></span>
              <span>Hedef yayın: <strong>{formatDate(store.management.launchTarget)}</strong></span>
              <span>Paket: <strong>{subscription.cadenceLabel} / {subscription.countdownLabel}</strong></span>
            </div>
          </OwnerSectionCard>

          <OwnerSectionCard
            title="Altyapı Kartları"
            copy="Light Postgres mağazalarda Supabase eksikliği hata gibi gösterilmez; Legacy ayrı mod olarak görünür."
            tone={showSupabaseInfrastructure ? "legacy" : "accent"}
          >
            <div className="store-infrastructure-grid">
              <article>
                <span>Veritabanı</span>
                <strong>{showSupabaseInfrastructure ? "Legacy" : "Yeni Standart"}</strong>
                <p>{showSupabaseInfrastructure ? "Full Supabase özel mod." : "Light Postgres owner standardı."}</p>
              </article>
              <article>
                <span>R2</span>
                <strong>{store.health.r2Ready ? "Hazır" : "Bekliyor"}</strong>
                <p>{store.r2BucketName || "Medya authority kurulum akışında tamamlanır."}</p>
              </article>
              <article>
                <span>Auth</span>
                <strong>{authSignal?.shortLabel || authSignal?.statusLabel || "Kontrol"}</strong>
                <p>{authSignal?.providerLabel || store.setup.auth.provider}</p>
              </article>
              <article>
                <span>Analytics</span>
                <strong>{analyticsSignal?.shortLabel || analyticsSignal?.statusLabel || "Kontrol"}</strong>
                <p>{analyticsSignal?.providerLabel || store.setup.analytics.provider}</p>
              </article>
              <article>
                <span>Ödeme</span>
                <strong>{paymentSignal?.shortLabel || paymentSignal?.statusLabel || "Kontrol"}</strong>
                <p>{paymentSignal?.providerLabel || store.setup.payments.defaultProvider}</p>
              </article>
              <article>
                <span>Admin Uygulaması</span>
                <strong>{store.health.adminRuntimeConsistent ? "Kararlı" : "Kontrol"}</strong>
                <p>{adminDeploymentStatus || adminDeployment?.status || "Bekliyor"}</p>
              </article>
              <article>
                <span>Vitrin Uygulaması</span>
                <strong>{store.health.storefrontRuntimeConsistent ? "Kararlı" : "Kontrol"}</strong>
                <p>{storefrontDeploymentStatus || storefrontDeployment?.status || store.storefrontStatus}</p>
              </article>
            </div>
          </OwnerSectionCard>
        </div>
      </section>

      <section id="identity" className="store-detail-section">
        <OwnerSectionHeader
          eyebrow="Identity"
          title="Store identity and domains"
          copy="Store name, slug, Store ID, storefront/admin domains ve audit zamanları teknik arama gerektirmeden okunur."
        />
        <OwnerSectionCard title="Identity">
          <div className="control-center-facts">
            <div>
              <span>Store name</span>
              <strong>{store.name}</strong>
            </div>
            <div>
              <span>Slug</span>
              <strong>{store.slug}</strong>
            </div>
            <div>
              <span>Store ID</span>
              <strong>{store.id}</strong>
            </div>
            <div>
              <span>Storefront domain</span>
              <strong>{store.storefrontDomain}</strong>
            </div>
            <div>
              <span>Admin domain</span>
              <strong>{store.adminDomain}</strong>
            </div>
            <div>
              <span>Created</span>
              <strong>{createdAt}</strong>
            </div>
            <div>
              <span>Updated</span>
              <strong>{updatedAt}</strong>
            </div>
          </div>
        </OwnerSectionCard>
      </section>

      <section id="readiness" className="store-detail-section">
        <OwnerSectionHeader
          eyebrow="Infrastructure"
          title="Tenant infrastructure readiness"
          copy="Database, storage, auth, analytics, deploy, image, DNS ve build server sinyalleri aynı grid içinde gösterilir."
        />
        <OwnerSectionCard title="System readiness for this store" actions={<OwnerStatusChip tone={operationalStatus.tone}>{operationalStatus.label}</OwnerStatusChip>}>
          <div className="system-readiness-grid">
            {readinessItems.map((item) => (
              <article key={item.key} className={`system-readiness-card status-${item.status}`}>
                <div className="system-readiness-top">
                  <strong>{item.label}</strong>
                  <OwnerStatusChip tone={item.tone}>{item.status}</OwnerStatusChip>
                </div>
                <p>{item.description}</p>
                <span>{item.checkedAt ? `Son kontrol: ${formatDateTime(item.checkedAt)}` : "Son kontrol zamanı yok"}</span>
              </article>
            ))}
          </div>
        </OwnerSectionCard>
      </section>

      <section id="kurulum" className="store-detail-section">
        <OwnerSectionHeader
          eyebrow="Kurulum Akışı"
          title="Hazırlık ve aksiyon sırası"
          copy="Teknik log hissi yerine, mağazanın işletime hazır olma durumu adım adım okunur."
        />
        <section id="timeline" className="store-detail-section">
          <OwnerSectionCard
            title="Provisioning timeline"
            copy="Fresh-store acceptance sırası, mevcut owner/store config kanıtlarından okunur. Eksik backend endpoint için fake mutation eklenmez."
            actions={<OwnerStatusChip tone={operationalStatus.tone}>{operationalStatus.label}</OwnerStatusChip>}
          >
            <div className="control-center-timeline">
              {provisioningTimeline.map((item) => (
                <article key={item.key} className={`control-center-timeline-item status-${item.status}`}>
                  <span className="control-center-timeline-dot" />
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.message}</p>
                  </div>
                  <div className="control-center-timeline-meta">
                    <OwnerStatusChip tone={item.tone}>{item.status}</OwnerStatusChip>
                    <span>{item.timestamp ? formatDateTime(item.timestamp) : "timestamp yok"}</span>
                  </div>
                </article>
              ))}
            </div>
          </OwnerSectionCard>
        </section>

        <div className="store-detail-two-column">
          <OwnerActionPanel
            title="Kurulum Akışı"
            tone={deploymentStepState === "blocked" ? "danger" : "accent"}
            actions={
              <>
                <OwnerStatusChip tone={pendingSetupSignals.length > 0 ? "warning" : "success"}>
                  {pendingSetupSignals.length > 0 ? `${pendingSetupSignals.length} kurulum aksiyonu` : "Kurulum temiz"}
                </OwnerStatusChip>
                <OwnerStatusChip tone={showSupabaseInfrastructure ? "legacy" : "accent"}>
                  {showSupabaseInfrastructure ? "Legacy" : "Yeni Standart"}
                </OwnerStatusChip>
              </>
            }
          >
            <OwnerLifecycleStepper
              steps={[
                { label: "Mağaza kaydı", detail: `${store.slug} owner kaydı`, state: "done" },
                { label: "Veritabanı", detail: showSupabaseInfrastructure ? "Legacy özel mod" : "Yeni Standart", state: "done" },
                { label: "Auth / Analytics / Ödeme", detail: pendingSetupSignals.length > 0 ? "Kurulum aksiyonları bekliyor" : "Kurulum sinyalleri temiz", state: setupStepState },
                { label: "Admin panel", detail: store.health.adminRuntimeConsistent ? "Runtime hazır" : "Runtime drift izleniyor", state: store.health.adminRuntimeConsistent ? "done" : "current" },
                { label: "Vitrin yayını", detail: store.storefrontStatus, state: deploymentStepState },
              ]}
            />
          </OwnerActionPanel>

          <OwnerActionQueue
            items={[
              ...setupSignals.map((signal) => ({
                id: signal.key,
                title: signal.title,
                detail: signal.note,
                meta: <strong>{signal.pending ? "Bekliyor" : "Hazır"}</strong>,
                chips: (
                  <>
                    <span className={signal.pillClassName}>{signal.shortLabel}</span>
                    <OwnerStatusChip tone="ink">{signal.providerLabel}</OwnerStatusChip>
                  </>
                ),
                tone: signal.pending ? "warning" as const : "success" as const,
              })),
              {
                id: "cleanup",
                title: "Temizlik",
                detail: cleanupRuns.length > 0 ? "Açık temizlik kaydı operasyon ekranında izleniyor." : "Açık temizlik kaydı görünmüyor.",
                meta: <strong>{cleanupRuns.length}</strong>,
                chips: <OwnerStatusChip tone={cleanupRuns.length > 0 ? "danger" : "success"}>{cleanupRuns.length > 0 ? "Takipte" : "Temiz"}</OwnerStatusChip>,
                tone: cleanupRuns.length > 0 ? "danger" as const : "success" as const,
              },
            ]}
          />
        </div>

        <ProvisioningLifecycleCard
          slug={store.slug}
          storeName={store.name}
          provisioning={provisioning}
          superAdmin={superAdmin}
          repairDisabled
          repairDisabledReason={repairActionLockedReason}
          metadataWarning={operationalStatus.metadataWarning}
        />

        {!showSupabaseInfrastructure ? (
          <OwnerSectionCard
            title="Logto kimlik doğrulama"
            copy="Yeni Standart mağazalarda admin ve müşteri giriş uygulamaları ayrı Logto config olarak hazırlanır."
            tone="accent"
          >
            <div className="store-infrastructure-grid">
              <article>
                <span>Admin uygulaması</span>
                <strong>{logto?.adminAppStatus === "configured" ? "Hazır" : "Hazırlanacak"}</strong>
                <p>{logto?.adminBootstrapConfigPath || "Bootstrap config pending apply."}</p>
              </article>
              <article>
                <span>Müşteri uygulaması</span>
                <strong>{logto?.customerAppStatus === "configured" ? "Hazır" : "Hazırlanacak"}</strong>
                <p>{logto?.customerBootstrapConfigPath || "Bootstrap config pending apply."}</p>
              </article>
              <article>
                <span>Redirect URI</span>
                <strong>{logtoAdminRedirectCount + logtoCustomerRedirectCount} kayıt</strong>
                <p>Admin ve müşteri callback domainleri public HTTPS olarak tutulur.</p>
              </article>
              <article>
                <span>Çıkış yönlendirmeleri</span>
                <strong>{logtoAdminLogoutCount + logtoCustomerLogoutCount} kayıt</strong>
                <p>Admin login ve müşteri hesap dönüşleri hazır.</p>
              </article>
              <article>
                <span>Google ile giriş</span>
                <strong>{logto?.googleSignIn === "enabled" ? "Aktif" : "Bekliyor"}</strong>
                <p>Central connector hazır olunca customer app kullanabilir.</p>
              </article>
              <article>
                <span>Şifre sıfırlama</span>
                <strong>{logto?.emailRecovery === "enabled" ? "Aktif" : "Bekliyor"}</strong>
                <p>SMTP recovery connector hazır olunca akış açılır.</p>
              </article>
            </div>
          </OwnerSectionCard>
        ) : null}

        {!showSupabaseInfrastructure ? (
          <OwnerSectionCard
            title="Umami analitik"
            copy="Yeni Standart mağazalarda vitrin tracking ve admin analytics server-side token authority ile hazırlanır."
            tone="accent"
          >
            <div className="store-infrastructure-grid">
              <article>
                <span>Website kaydı</span>
                <strong>{umami?.websiteStatus === "configured" ? "Hazır" : "Hazırlanacak"}</strong>
                <p>{umami?.bootstrapConfigPath || "Bootstrap config pending apply."}</p>
              </article>
              <article>
                <span>Website ID</span>
                <strong>{umami?.websiteId ? "Tanımlı" : "Pending"}</strong>
                <p>{umami?.canonicalDomain || store.storefrontDomain}</p>
              </article>
              <article>
                <span>Storefront script</span>
                <strong>{umami?.storefrontTrackingStatus === "configured" ? "Aktif" : "Hazırlanacak"}</strong>
                <p>{umami?.scriptUrl || "https://analytics.celebix.co/script.js"}</p>
              </article>
              <article>
                <span>Admin analytics</span>
                <strong>{umami?.adminAnalyticsStatus === "configured" ? "Aktif" : "Pending"}</strong>
                <p>{umami?.adminSummaryEndpoint || "/api/admin/analytics/summary"}</p>
              </article>
              <article>
                <span>Token authority</span>
                <strong>{umami?.serverTokenStatus === "configured" ? "Server hazır" : "Owner env bekliyor"}</strong>
                <p>Token browser'a taşınmaz; admin özetleri server-side okunur.</p>
              </article>
              <article>
                <span>Store scope</span>
                <strong>{umami?.domain || store.storefrontDomain}</strong>
                <p>{umami?.timezone || "Europe/Istanbul"}</p>
              </article>
            </div>
          </OwnerSectionCard>
        ) : null}

        {!showSupabaseInfrastructure ? (
          <OwnerSectionCard
            title="R2 medya depolama"
            copy="Yeni Standart mağazalarda ürün, sayfa ve marka görselleri R2 public media authority üzerinden okunur; Supabase Storage kullanılmaz."
            tone="accent"
          >
            <div className="store-infrastructure-grid">
              <article>
                <span>Bucket / public URL</span>
                <strong>{r2?.bucketName ? "Tanımlı" : "Pending"}</strong>
                <p>{r2?.publicUrl || "R2 public base URL owner env/apply bekliyor."}</p>
              </article>
              <article>
                <span>Mağaza prefix</span>
                <strong>{r2?.prefix || media?.prefix || `stores/${store.slug}/`}</strong>
                <p>Her mağaza kendi prefix scope'u içinde tutulur.</p>
              </article>
              <article>
                <span>Ürün görselleri</span>
                <strong>{media?.productImagesPrefix || r2?.productImagesPrefix || `stores/${store.slug}/products/`}</strong>
                <p>{media?.publicUrlTemplate || r2?.publicUrlTemplate || "Public URL template pending."}</p>
              </article>
              <article>
                <span>Sayfa / marka görselleri</span>
                <strong>{media?.pageImagesPrefix || r2?.pageImagesPrefix || `stores/${store.slug}/pages/`}</strong>
                <p>{media?.brandingPrefix || r2?.brandingPrefix || `stores/${store.slug}/branding/`}</p>
              </article>
              <article>
                <span>Admin upload</span>
                <strong>{media?.adminUploadStatus === "configured" ? "Server hazır" : "Pending"}</strong>
                <p>R2 credential sadece server-side kullanılır; browser'a secret taşınmaz.</p>
              </article>
              <article>
                <span>Vitrin okuma</span>
                <strong>{media?.storefrontReadStatus === "configured" ? "Aktif" : "Pending"}</strong>
                <p>{media?.noSupabaseStorage !== false ? "Supabase Storage kullanılmıyor." : "Legacy storage kontrol edilmeli."}</p>
              </article>
            </div>
          </OwnerSectionCard>
        ) : null}

        {!showSupabaseInfrastructure ? (
          <OwnerSectionCard
            title="New-store smoke"
            copy="Package 7 smoke runner planı mağaza canlıya alınmadan önce runtime, auth, analytics, medya ve Supabase-free kontrollerini izler."
            tone={smoke?.overallStatus === "failed" ? "danger" : smoke?.overallStatus === "passed" ? "success" : "accent"}
          >
            <div className="store-infrastructure-grid">
              <article>
                <span>Durum</span>
                <strong>
                  {smoke?.overallStatus === "passed"
                    ? "Smoke geçti"
                    : smoke?.overallStatus === "failed"
                      ? "Smoke başarısız"
                      : smoke?.overallStatus === "partial"
                        ? "Kısmi"
                        : "Smoke bekliyor"}
                </strong>
                <p>{smoke?.mode === "execute" ? "Execute sonucu" : "Plan mode; canlı request çalıştırılmadı."}</p>
              </article>
              <article>
                <span>Check sayısı</span>
                <strong>{smoke?.checks.length ?? 0}</strong>
                <p>{smokePassedCount} geçti / {smokeFailedCount} fail / {smokePendingCount} pending</p>
              </article>
              <article>
                <span>Son çalışma</span>
                <strong>{smoke?.finishedAt ? formatDateTime(smoke.finishedAt) : "Bekliyor"}</strong>
                <p>{smoke?.startedAt ? `Plan başlangıcı: ${formatDateTime(smoke.startedAt)}` : "Smoke runner henüz planlanmadı."}</p>
              </article>
              <article>
                <span>Repair action</span>
                <strong>{smokeFailedCount > 0 ? "Gerekli" : "Yok"}</strong>
                <p>{smoke?.checks.find((check) => check.status === "failed")?.repairAction || "Fail oluşursa ilgili check repairAction alanı doldurulur."}</p>
              </article>
            </div>
          </OwnerSectionCard>
        ) : null}
      </section>

      <section id="domain-deploy" className="store-detail-section">
        <OwnerSectionHeader
          eyebrow="Domain ve Deploy"
          title="Yayın planı ve runtime sağlığı"
          copy="Admin ve vitrin deployment bilgileri ayrı kartlarda, preview aksiyonları kilitli biçimde görünür."
        />
        <div className="store-detail-two-column">
          <OwnerSectionCard
            title="Vitrin Yayın Planı"
            actions={
              <>
                <LaunchStorefrontButton slug={store.slug} currentStatus={store.storefrontStatus} disabled disabledReason={deployActionLockedReason} />
                {superAdmin ? <RepairStoreDeploymentAuthorityButton slug={store.slug} disabled disabledReason={repairActionLockedReason} /> : null}
              </>
            }
          >
            {storefrontDeployment ? (
              <>
                <div className="meta-pairs">
                  <span>Yayın adı: <strong>{storefrontDeploymentName || storefrontDeployment.appName}</strong></span>
                  <span>Durum: <strong>{storefrontDeploymentStatus || storefrontDeployment.status}</strong></span>
                  <span>Runtime: <strong>{storefrontRuntimeUrl || storefrontDeployment.runtimeUrl}</strong></span>
                  <span>Branch: <strong>{storefrontDeploymentBranch || "-"}</strong></span>
                  <span>Repo sync: <strong>{storefrontDeployment.repoSynced ? "Senkron" : storefrontRepoSyncStatus || "Bekliyor"}</strong></span>
                  <span>Son sync: <strong>{storefrontRepoSyncedAt}</strong></span>
                </div>
                <p className="card-note">{storefrontDeploymentAuthorityNote || storefrontDeployment.runtimeMessage || "Vitrin yayın standardı owner tarafında hazır."}</p>
              </>
            ) : (
              <OwnerEmptyState title="Vitrin yayın planı okunamadı" copy="Bu kayıt sonraki kurulum adımında yeniden doğrulanır." />
            )}
          </OwnerSectionCard>

          <OwnerSectionCard
            title="Admin Yayın Planı"
            actions={adminDeployment ? <ProvisionAdminDeploymentButton slug={store.slug} currentStatus={adminDeployment.status} disabled disabledReason={deployActionLockedReason} /> : null}
          >
            {adminDeployment ? (
              <>
                <div className="meta-pairs">
                  <span>App adı: <strong>{adminDeploymentName || adminDeployment.appName}</strong></span>
                  <span>Durum: <strong>{adminDeploymentStatus || adminDeployment.status}</strong></span>
                  <span>Runtime: <strong>{adminDeploymentRuntimeUrl || adminDeployment.runtimeUrl}</strong></span>
                  <span>Branch: <strong>{adminDeploymentBranch || "-"}</strong></span>
                  <span>Hazırlanma: <strong>{adminDeploymentPreparedAt}</strong></span>
                  <span>Resource: <strong>{adminDeployment.resourceId || "-"}</strong></span>
                </div>
                <p className="card-note">{adminDeploymentAuthorityNote || adminDeployment.runtimeMessage || "Admin yayın standardı owner tarafında hazır."}</p>
              </>
            ) : (
              <OwnerEmptyState title="Admin yayın planı okunamadı" copy="Bu kayıt sonraki kurulum adımında yeniden doğrulanır." />
            )}
          </OwnerSectionCard>
        </div>

        {superAdmin ? (
          <OwnerSectionCard title="Demo Domain'den Özel Domain'e Geçiş" copy="Domain taşıma aksiyonu preview modunda kilitli kalır.">
            <MigrateStoreDomainForm
              slug={store.slug}
              storefrontDomain={store.storefrontDomain}
              adminDomain={store.adminDomain}
              domainMigration={store.domainMigration}
              disabled
              disabledReason={deployActionLockedReason}
            />
          </OwnerSectionCard>
        ) : null}
      </section>

      <section id="erisim" className="store-detail-section">
        <OwnerSectionHeader
          eyebrow="Erişim"
          title="Admin, affiliate ve profil erişimi"
          copy="Kullanıcı atamaları ile müşteri profil güncelleme aksiyonları tek bölümde toplanır."
        />
        <div className="store-detail-two-column">
          <OwnerSectionCard title="Mağaza Adminleri">
            {store.storeAdmins.length === 0 ? (
              <OwnerEmptyState title="Admin atanmadı" copy="İlk mağaza admini aşağıdaki formdan atanır." />
            ) : (
              <OwnerActionQueue
                items={store.storeAdmins.map((admin) => ({
                  id: admin.id,
                  title: admin.fullName || admin.email,
                  detail: admin.email,
                  chips: (
                    <>
                      <OwnerStatusChip>{admin.role}</OwnerStatusChip>
                      <OwnerStatusChip tone="ink">{admin.taskDefinition || "Genel"}</OwnerStatusChip>
                    </>
                  ),
                }))}
              />
            )}
          </OwnerSectionCard>

          <OwnerSectionCard title="Affiliate Erişimi">
            {store.affiliateAssignments.length === 0 ? (
              <OwnerEmptyState title="Affiliate atanmadı" copy="Bu mağaza için affiliate erişimi henüz yok." />
            ) : (
              <OwnerActionQueue
                items={store.affiliateAssignments.map((assignment) => ({
                  id: assignment.profileId,
                  title: assignment.fullName || assignment.email,
                  detail: assignment.email,
                  meta: <strong>%{formatPercent(assignment.commissionRate)}</strong>,
                  tone: "accent" as const,
                }))}
              />
            )}
          </OwnerSectionCard>
        </div>

        <div className="store-detail-two-column">
          {superAdmin ? (
            <OwnerSectionCard title="Mağaza Profilini Güncelle" copy="Müşteri iletişimi, iç sorumlu, owner notu ve durum akışı burada tutulur.">
              <UpdateStoreProfileForm
                store={{
                  slug: store.slug,
                  status: store.status,
                  tagline: store.tagline,
                  supportEmail: store.supportEmail,
                  supportPhone: store.supportPhone,
                  management: store.management,
                }}
                disabled={writeDisabled}
                disabledReason={writeDisabledReason}
              />
            </OwnerSectionCard>
          ) : null}

          <OwnerSectionCard title="Bu Mağazaya Admin Ata" copy="Bu mağazaya bağlı operasyon kullanıcılarını yönet.">
            <CreateStoreAdminForm storeSlug={store.slug} disabled={writeDisabled} disabledReason={writeDisabledReason} />
          </OwnerSectionCard>
        </div>

        {superAdmin ? (
          <OwnerSectionCard title="Bu Mağazaya Affiliate Ata">
            <CreateAffiliateForm
              stores={[{ slug: store.slug, name: store.name }]}
              defaultStoreSlug={store.slug}
              disabled={writeDisabled}
              disabledReason={writeDisabledReason}
            />
          </OwnerSectionCard>
        ) : null}
      </section>

      <section id="aktivite" className="store-detail-section">
        <OwnerSectionHeader
          eyebrow="Aktivite"
          title="Son olaylar ve tutarlılık"
          copy="Audit kayıtları, tutarlılık blokajları ve teknik kimlikler sıkıştırılmış bir aktivite alanında görünür."
        />
        <div className="store-detail-two-column">
          <OwnerSectionCard title="Son Aktiviteler">
            <OwnerTimeline
              items={store.recentActivity.map((item) => ({
                id: item.id,
                title: item.action.replaceAll("_", " "),
                detail: item.actorName,
                meta: (
                  <>
                    <span>{item.targetLabel}</span>
                    <strong>{formatDateTime(item.createdAt)}</strong>
                  </>
                ),
              }))}
              empty={<OwnerEmptyState title="Audit kaydı yok" copy="Bu mağaza için henüz görünür aktivite oluşmadı." />}
            />
          </OwnerSectionCard>

          <OwnerSectionCard title="Tutarlılık Kontrolü" tone={store.consistency.blocking ? "danger" : "success"}>
            <div className="meta-pairs">
              <span>Toplam konu: <strong>{store.consistency.issueCount}</strong></span>
              <span>Bloklayan konu: <strong>{store.consistency.blockingIssueCount}</strong></span>
              <span>Durum: <strong>{store.consistency.blocking ? "Bloklu" : "Temiz"}</strong></span>
              <span>Kontrol zamanı: <strong>{formatDateTime(store.consistency.checkedAt)}</strong></span>
            </div>
            <OwnerActionQueue
              items={store.consistency.issues.map((issue, index) => ({
                id: `${issue.code}-${index}`,
                title: issue.code,
                detail: issue.message,
                chips: (
                  <>
                    <OwnerStatusChip tone={issue.severity === "blocking" ? "danger" : "warning"}>{issue.severity}</OwnerStatusChip>
                    <OwnerStatusChip>{issue.source}</OwnerStatusChip>
                  </>
                ),
                tone: issue.severity === "blocking" ? "danger" as const : "warning" as const,
              }))}
              empty={<p className="card-note">Config, owner secrets ve canlı admin runtime aynı authoritative mağaza kaynağını izliyor.</p>}
            />
          </OwnerSectionCard>
        </div>

        <OwnerSectionCard title="Teknik Kimlikler" copy="Teknik detaylar karar alanlarının altına taşındı; ana ekranı domine etmez.">
          <div className="meta-pairs">
            <span>Slug: <strong>{store.slug}</strong></span>
            <span>Tema: <strong>{store.themeKey}</strong></span>
            <span>Vitrin app: <strong>{store.storefrontAppDir || "-"}</strong></span>
            <span>Vitrin durumu: <strong>{store.storefrontStatus}</strong></span>
            <span>Oluşturma: <strong>{createdAt}</strong></span>
            <span>Güncelleme: <strong>{updatedAt}</strong></span>
            <span>Destek e-postası: <strong>{store.supportEmail || "-"}</strong></span>
            <span>Destek telefonu: <strong>{store.supportPhone || "-"}</strong></span>
            <span>Son sync: <strong>{formatDateTime(store.lastSyncedAt)}</strong></span>
            {showSupabaseInfrastructure ? <span>Legacy servis: <strong>{supabaseProjectName || supabaseResourceId || "Ayrı mod"}</strong></span> : null}
            {showSupabaseInfrastructure ? <span>Legacy kurulum: <strong>{supabaseProvisioning || provisionedAt}</strong></span> : null}
            {showSupabaseInfrastructure && supabaseDashboardUrl ? (
              <span>Legacy Studio: <strong><a href={supabaseDashboardUrl} target="_blank" rel="noreferrer">Aç</a></strong></span>
            ) : null}
          </div>
        </OwnerSectionCard>
      </section>

      <section id="tehlikeli" className="store-detail-section">
        <OwnerSectionHeader
          eyebrow="Tehlikeli İşlemler"
          title="Kilitli onarım ve silme aksiyonları"
          copy="Preview modunda deploy, repair, cleanup ve delete aksiyonları açık uyarıyla kapalı kalır."
        />
        {cleanupRuns.length > 0 ? (
          <OwnerSectionCard title="Mağaza Temizlik Takibi" tone="danger" actions={<Link href="/operations" className="button button-secondary">Operasyonlara Git</Link>}>
            <OwnerActionQueue
              items={cleanupRuns.map((run) => ({
                id: run.id,
                title: run.storeName || store.name,
                detail: `${run.targets.length} hedef / ${orphanedTargetCount} temizlik hedefi`,
                meta: <strong>{formatDateTime(run.createdAt)}</strong>,
                chips: <OwnerStatusChip tone="danger">{run.status}</OwnerStatusChip>,
                tone: "danger" as const,
              }))}
            />
          </OwnerSectionCard>
        ) : null}

        {superAdmin ? (
          <OwnerSectionCard title="Tehlikeli İşlem" copy="Bu mağaza silindiğinde owner kaydı, yayınlar, Legacy kaynaklar, R2 ve generated vitrin izleri temizlenir." tone="danger">
            <div className="store-danger-actions">
              <DeleteStoreButton slug={store.slug} name={store.name} disabled disabledReason={cleanupActionLockedReason} />
              <p className="form-notice form-notice-preview">{cleanupActionLockedReason}</p>
            </div>
          </OwnerSectionCard>
        ) : null}
      </section>
    </div>
  );
}
