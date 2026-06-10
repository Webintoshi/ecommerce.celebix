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
  OwnerActionQueue,
  OwnerEmptyState,
  OwnerLifecycleStepper,
  OwnerMetricCard,
  OwnerPageHeader,
  OwnerSectionCard,
  OwnerSectionHeader,
  OwnerStatusChip,
  OwnerTimeline,
  DeploymentCard,
  RuntimeMetadataCard,
  SmokeResultTable,
  StoreStatusCard,
  TechnicalDetailsDisclosure,
  type OwnerTone,
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

function getStoreStatusLabel(status: string) {
  if (status === "active") {
    return "Aktif";
  }
  if (status === "paused") {
    return "Duraklatıldı";
  }
  return "Taslak";
}

function getStatusTone(ready: boolean, warning = false): OwnerTone {
  if (ready) {
    return "success";
  }

  return warning ? "warning" : "danger";
}

function getSetupSignalTone(signal: ReturnType<typeof getSetupSignals>[number] | undefined): OwnerTone {
  if (!signal) {
    return "neutral";
  }

  if (signal.pending) {
    return "warning";
  }

  if (signal.key === "auth" && signal.providerLabel === "supabase") {
    return "legacy";
  }

  return "success";
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
  const authSignal = setupSignals.find((signal) => signal.key === "auth");
  const analyticsSignal = setupSignals.find((signal) => signal.key === "analytics");
  const paymentSignal = setupSignals.find((signal) => signal.key === "payment");
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
  const smokeRows = [
    {
      route: "/",
      expected: "HTTP 200 + storefront shell",
      actual: store.health.homepageOk ? "Homepage ready" : "Bekleyen kontrol",
      passed: store.health.homepageOk,
      checkedAt: formatDateTime(store.lastSyncedAt),
    },
    {
      route: "/kategoriler",
      expected: "Categories data available",
      actual: store.health.categoriesOk ? "Categories ready" : "Bekleyen kontrol",
      passed: store.health.categoriesOk,
      checkedAt: formatDateTime(store.lastSyncedAt),
    },
    {
      route: "/urunler",
      expected: "Products data available",
      actual: store.health.productsOk ? "Products ready" : "Bekleyen kontrol",
      passed: store.health.productsOk,
      checkedAt: formatDateTime(store.lastSyncedAt),
    },
    {
      route: "/admin",
      expected: "Admin runtime consistent",
      actual: store.health.adminRuntimeConsistent ? "Admin ready" : "Runtime drift izleniyor",
      passed: store.health.adminRuntimeConsistent,
      checkedAt: formatDateTime(store.consistency.checkedAt),
    },
  ];
  const smokePassed = smokeRows.every((row) => row.passed === true);
  const metadataDriftWarning =
    provisioning.state === "pending_repair" &&
    provisioning.failedStepCount === 0 &&
    smokePassed;

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
            <OwnerStatusChip tone={store.health.label === "hazir" ? "success" : store.health.label === "kritik" ? "danger" : "warning"}>
              {store.health.label}
            </OwnerStatusChip>
            <OwnerStatusChip tone={showSupabaseInfrastructure ? "legacy" : "accent"}>
              {showSupabaseInfrastructure ? "Legacy" : "Yeni Standart"}
            </OwnerStatusChip>
            <span className={getDatabaseModePillClass(store.databaseMode)}>
              {getDatabaseModeLabel(store.databaseMode)}
            </span>
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
        <a href="#kurulum">Kurulum</a>
        <a href="#domain-deploy">Domain ve Deploy</a>
        <a href="#smoke">Smoke</a>
        <a href="#erisim">Erişim</a>
        <a href="#aktivite">Aktivite</a>
        <a href="#tehlikeli">Tehlikeli İşlemler</a>
      </nav>

      <section className="store-detail-section">
        <OwnerSectionCard
          eyebrow="Status Summary"
          title="Control center özeti"
          copy="Veritabanı, auth, storage, analytics, deploy, payment ve smoke sonuçları tek karar yüzeyinde görünür."
          tone={metadataDriftWarning ? "warning" : smokePassed ? "success" : "accent"}
          actions={
            metadataDriftWarning ? (
              <OwnerStatusChip tone="warning">Ready with metadata warning</OwnerStatusChip>
            ) : (
              <OwnerStatusChip tone={smokePassed ? "success" : "warning"}>
                {smokePassed ? "Smoke PASS" : "Smoke izleniyor"}
              </OwnerStatusChip>
            )
          }
        >
          <div className="store-status-summary-grid">
            <StoreStatusCard
              title="Database"
              label={showSupabaseInfrastructure ? "Legacy Supabase" : "light_postgres"}
              status={store.health.supabaseReady ? "Ready" : "Watch"}
              tone={getStatusTone(store.health.supabaseReady, true)}
              checkedAt={updatedAt}
            />
            <StoreStatusCard
              title="Auth"
              label={authSignal?.providerLabel || store.setup.auth.provider}
              status={authSignal?.shortLabel || "Auth"}
              tone={getSetupSignalTone(authSignal)}
              checkedAt={updatedAt}
            />
            <StoreStatusCard
              title="Storage"
              label={store.r2BucketName || "R2 media"}
              status={store.health.r2Ready ? "Ready" : "Needs setup"}
              tone={getStatusTone(store.health.r2Ready, true)}
              checkedAt={updatedAt}
            />
            <StoreStatusCard
              title="Analytics"
              label={analyticsSignal?.providerLabel || store.setup.analytics.provider}
              status={analyticsSignal?.shortLabel || "Analytics"}
              tone={getSetupSignalTone(analyticsSignal)}
              checkedAt={updatedAt}
            />
            <StoreStatusCard
              title="Storefront Deploy"
              label={storefrontDeploymentStatus || storefrontDeployment?.status || store.storefrontStatus}
              status={store.health.storefrontRuntimeConsistent ? "Ready" : "Watch"}
              tone={getStatusTone(store.health.storefrontRuntimeConsistent, true)}
              checkedAt={storefrontDeployedAt}
            />
            <StoreStatusCard
              title="Admin Deploy"
              label={adminDeploymentStatus || adminDeployment?.status || "Bekliyor"}
              status={store.health.adminRuntimeConsistent ? "Ready" : "Watch"}
              tone={getStatusTone(store.health.adminRuntimeConsistent, true)}
              checkedAt={adminDeploymentPreparedAt}
            />
            <StoreStatusCard
              title="Payment"
              label={paymentSignal?.providerLabel || store.setup.payments.defaultProvider}
              status={paymentSignal?.shortLabel || "Payment"}
              tone={getSetupSignalTone(paymentSignal)}
              checkedAt={updatedAt}
            />
            <StoreStatusCard
              title="Smoke"
              label={smokePassed ? "Acceptance checks passed" : "Acceptance checks pending"}
              status={smokePassed ? "PASS" : "Watch"}
              tone={smokePassed ? "success" : "warning"}
              checkedAt={formatDateTime(store.lastSyncedAt)}
            />
          </div>
          {metadataDriftWarning ? (
            <TechnicalDetailsDisclosure title="Metadata drift details">
              <p>
                Step ve smoke sinyalleri hazır görünüyor; top-level provisioning metadata eski bir onarım
                durumunu taşıyor olabilir. Kullanıcı yüzeyinde mağaza panik durumu yerine uyarılı hazır olarak gösterilir.
              </p>
            </TechnicalDetailsDisclosure>
          ) : null}
        </OwnerSectionCard>
      </section>

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

        <OwnerSectionCard
          title="Runtime Metadata"
          copy="Public-safe metadata operasyon karar alanları için sadeleştirildi."
        >
          <RuntimeMetadataCard
            items={[
              { label: "databaseMode", value: store.databaseMode, tone: showSupabaseInfrastructure ? "legacy" : "success" },
              { label: "storageProvider", value: showSupabaseInfrastructure ? "supabase/r2" : "r2", tone: store.health.r2Ready ? "success" : "warning" },
              { label: "analyticsProvider", value: store.setup.analytics.provider, tone: getSetupSignalTone(analyticsSignal) },
              { label: "supabaseStatus", value: showSupabaseInfrastructure ? "legacy" : "none", tone: showSupabaseInfrastructure ? "legacy" : "success" },
              { label: "customerAuthStatus", value: store.setup.auth.status, tone: getSetupSignalTone(authSignal) },
              { label: "adminAuthStatus", value: store.health.adminRuntimeConsistent ? "runtime_ready" : "runtime_watch", tone: getStatusTone(store.health.adminRuntimeConsistent, true) },
              { label: "paymentStatus", value: store.setup.payments.status, tone: getSetupSignalTone(paymentSignal) },
              { label: "smokeStatus", value: smokePassed ? "pass" : "watch", tone: smokePassed ? "success" : "warning" },
            ]}
          />
        </OwnerSectionCard>
      </section>

      <section id="kurulum" className="store-detail-section">
        <OwnerSectionHeader
          eyebrow="Kurulum Akışı"
          title="Hazırlık ve aksiyon sırası"
          copy="Teknik log hissi yerine, mağazanın işletime hazır olma durumu adım adım okunur."
        />
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
          repairDisabled={repairDisabled}
          repairDisabledReason={repairDisabledReason}
        />
      </section>

      <section id="domain-deploy" className="store-detail-section">
        <OwnerSectionHeader
          eyebrow="Domain ve Deploy"
          title="Yayın planı ve runtime sağlığı"
          copy="Admin ve vitrin deployment bilgileri ayrı kartlarda, preview aksiyonları kilitli biçimde görünür."
        />
        <div className="store-detail-two-column">
          <DeploymentCard
            title="Storefront Deployment"
            status={store.health.storefrontRuntimeConsistent ? "Ready" : "Watch"}
            tone={getStatusTone(store.health.storefrontRuntimeConsistent, true)}
            rows={[
              { label: "Branch", value: storefrontDeploymentBranch || "-" },
              { label: "Commit", value: storefrontRepoCommitSha || "-" },
              { label: "Image", value: readStringValue(storefrontConfig.image) || "-" },
              { label: "Coolify app UUID", value: readStringValue(storefrontConfig.resourceId) || storefrontDeployment?.resourceId || "-" },
              { label: "Deploy status", value: storefrontDeploymentStatus || storefrontDeployment?.status || store.storefrontStatus },
              { label: "Health", value: store.health.storefrontRuntimeConsistent ? "consistent" : "watch" },
              { label: "Last deploy", value: storefrontDeployedAt },
              { label: "Runtime", value: storefrontRuntimeUrl || storefrontDeployment?.runtimeUrl || "-" },
            ]}
            note={storefrontDeploymentAuthorityNote || storefrontDeployment?.runtimeMessage || "Storefront yayın authority owner tarafında izleniyor."}
            actions={
              <>
                <LaunchStorefrontButton slug={store.slug} currentStatus={store.storefrontStatus} disabled={deployDisabled} disabledReason={deployDisabledReason} />
                {superAdmin ? <RepairStoreDeploymentAuthorityButton slug={store.slug} disabled={repairDisabled} disabledReason={repairDisabledReason} /> : null}
              </>
            }
          />

          <DeploymentCard
            title="Admin Deployment"
            status={store.health.adminRuntimeConsistent ? "Ready" : "Watch"}
            tone={getStatusTone(store.health.adminRuntimeConsistent, true)}
            rows={[
              { label: "Branch", value: adminDeploymentBranch || "-" },
              { label: "Commit", value: readStringValue(bootstrap.adminDeploymentCommitSha) || "-" },
              { label: "Image", value: readStringValue(bootstrap.adminDeploymentImage) || "-" },
              { label: "Coolify app UUID", value: adminDeployment?.resourceId || "-" },
              { label: "Deploy status", value: adminDeploymentStatus || adminDeployment?.status || "Bekliyor" },
              { label: "Health", value: store.health.adminRuntimeConsistent ? "consistent" : "watch" },
              { label: "Last deploy", value: adminDeploymentPreparedAt },
              { label: "Runtime", value: adminDeploymentRuntimeUrl || adminDeployment?.runtimeUrl || "-" },
            ]}
            note={adminDeploymentAuthorityNote || adminDeployment?.runtimeMessage || "Admin yayın authority owner tarafında izleniyor."}
            actions={adminDeployment ? <ProvisionAdminDeploymentButton slug={store.slug} currentStatus={adminDeployment.status} disabled={deployDisabled} disabledReason={deployDisabledReason} /> : null}
          />
        </div>

        <div className="store-detail-two-column">
          <OwnerSectionCard
            title="Vitrin Yayın Planı"
            actions={
              <>
                <LaunchStorefrontButton slug={store.slug} currentStatus={store.storefrontStatus} disabled={deployDisabled} disabledReason={deployDisabledReason} />
                {superAdmin ? <RepairStoreDeploymentAuthorityButton slug={store.slug} disabled={repairDisabled} disabledReason={repairDisabledReason} /> : null}
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
            actions={adminDeployment ? <ProvisionAdminDeploymentButton slug={store.slug} currentStatus={adminDeployment.status} disabled={deployDisabled} disabledReason={deployDisabledReason} /> : null}
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
              disabled={deployDisabled}
              disabledReason={deployDisabledReason}
            />
          </OwnerSectionCard>
        ) : null}
      </section>

      <section id="smoke" className="store-detail-section">
        <OwnerSectionHeader
          eyebrow="Smoke Result"
          title="Acceptance smoke kontrolleri"
          copy="Ham runtime hataları ana yüzeye dökülmez; pass/fail sonucu ve gerektiğinde teknik detay ayrı gösterilir."
        />
        <OwnerSectionCard
          title="Smoke sonuçları"
          tone={smokePassed ? "success" : "warning"}
          actions={<OwnerStatusChip tone={smokePassed ? "success" : "warning"}>{smokePassed ? "Smoke passed" : "Smoke izleniyor"}</OwnerStatusChip>}
        >
          <SmokeResultTable rows={smokeRows} />
          {store.health.storefrontDataMessage ? (
            <TechnicalDetailsDisclosure title="Technical details">
              <p>{store.health.storefrontDataMessage}</p>
            </TechnicalDetailsDisclosure>
          ) : null}
        </OwnerSectionCard>
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
              <DeleteStoreButton slug={store.slug} name={store.name} disabled={cleanupDisabled} disabledReason={cleanupDisabledReason} />
              {cleanupDisabledReason ? <p className="form-notice form-notice-preview">{cleanupDisabledReason}</p> : null}
            </div>
          </OwnerSectionCard>
        ) : null}
      </section>
    </div>
  );
}
