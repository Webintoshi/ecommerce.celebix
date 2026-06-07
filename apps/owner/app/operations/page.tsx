import {
  OwnerActionPanel,
  OwnerActionQueue,
  OwnerActionButton,
  OwnerEmptyState,
  OwnerKpiCard,
  OwnerPageHeader,
  OwnerSectionCard,
  OwnerStatusChip,
  OwnerTimeline,
  type OwnerTone,
} from "@/components/owner-control";
import { RepairAllStoreDeploymentAuthoritiesButton } from "@/components/RepairAllStoreDeploymentAuthoritiesButton";
import { RepairOwnerDeploymentBranchButton } from "@/components/RepairOwnerDeploymentBranchButton";
import type { AuditLogSummary, DashboardStoreSummary } from "@/lib/control-plane";
import { getOperationsSummary, listDashboardStores } from "@/lib/control-plane";
import { formatDateTime } from "@/lib/formatters";
import {
  getDatabaseModeLabel,
  getProvisioningLabel,
  getSetupSignals,
  isLegacyDatabaseMode,
} from "@/lib/lifecycle-ui";
import { isSuperAdmin, requireOwnerAuth } from "@/lib/owner-auth";
import {
  getOwnerPreviewDisabledNotice,
  getOwnerPreviewFlags,
  isOwnerActionDisabled,
} from "@/lib/preview-mode";
import {
  getPreviewDashboardStores,
  getPreviewOperationsSummary,
  getPreviewOwnerAuthContext,
  hasOwnerPreviewDataFallback,
} from "@/lib/owner-preview-fixtures";

type QueueReason = {
  label: string;
  tone: OwnerTone;
};

function getProvisioningTone(state: DashboardStoreSummary["provisioning"]["state"]): OwnerTone {
  switch (state) {
    case "failed":
      return "danger";
    case "pending_repair":
    case "pending_auth":
    case "pending_analytics":
    case "pending_payment":
    case "pending_smoke":
    case "pending_dns":
      return "warning";
    case "ready":
    case "database_ready":
    case "storage_ready":
    case "auth_ready":
    case "analytics_ready":
    case "admin_ready":
    case "storefront_ready":
    case "smoke_ready":
      return "success";
    case "running":
    case "provisioning":
      return "accent";
    default:
      return "neutral";
  }
}

function getActionReasons(store: DashboardStoreSummary): QueueReason[] {
  const reasons: QueueReason[] = [];
  const pendingSignals = getSetupSignals(store.setup).filter((signal) => signal.pending);

  if (store.provisioning.state === "failed") {
    reasons.push({ label: "Kritik onarım", tone: "danger" });
  } else if (store.provisioning.state === "pending_repair") {
    reasons.push({ label: "Onarım kuyruğu", tone: "warning" });
  }

  if (pendingSignals.length > 0) {
    reasons.push({ label: `${pendingSignals.length} kurulum işi`, tone: "warning" });
  }

  if (store.consistency.blocking) {
    reasons.push({ label: `${store.consistency.blockingIssueCount} blokaj`, tone: "danger" });
  }

  if (!store.health.adminRuntimeConsistent || !store.health.adminDeploymentReady) {
    reasons.push({ label: "Admin panel", tone: store.health.adminDeploymentReady ? "warning" : "danger" });
  }

  if (!store.health.storefrontRuntimeConsistent || !store.health.storefrontReady) {
    reasons.push({ label: "Storefront", tone: store.storefrontStatus === "active" ? "warning" : "neutral" });
  }

  if (!store.health.r2Ready) {
    reasons.push({ label: "Medya altyapısı", tone: "warning" });
  }

  return reasons;
}

function getActionSummary(store: DashboardStoreSummary) {
  const pendingSignals = getSetupSignals(store.setup).filter((signal) => signal.pending);

  if (store.provisioning.state === "failed") {
    return store.provisioning.lastError || "Kurulum adımlarından biri hata verdi, mağaza manuel onarım bekliyor.";
  }

  if (store.provisioning.state === "pending_repair") {
    return "Otomatik akış dışına düştü. Onarım kuyruğundan tekrar standarda alınmalı.";
  }

  if (pendingSignals.length > 0) {
    return `Kurulum zincirinde ${pendingSignals.map((signal) => signal.title.toLowerCase()).join(", ")} tarafı tamamlanmadı.`;
  }

  if (store.consistency.blocking) {
    return store.consistency.issues[0]?.message || "Tutarlılık blokajı owner otoritesi ile runtime arasında fark oluşturuyor.";
  }

  if (!store.health.adminDeploymentReady || !store.health.adminRuntimeConsistent) {
    return store.health.adminRuntimeMessage || "Yönetici paneli erişimi veya runtime çıktısı tekrar doğrulanmalı.";
  }

  if (!store.health.storefrontReady || !store.health.storefrontRuntimeConsistent) {
    return store.health.storefrontDataMessage || "Storefront yüzeyi günlük sağlık kontrolünde yeniden incelenmeli.";
  }

  if (!store.health.r2Ready) {
    return "Medya altyapısı eksik görünüyor, görsel yayın akışı tamamlanmadan işaretlenmemeli.";
  }

  return store.management.nextAction || "Bu mağaza gözlem kuyruğunda tutuluyor.";
}

function getActionPriority(store: DashboardStoreSummary): number {
  let score = 0;

  if (store.provisioning.state === "failed") score += 10;
  if (store.provisioning.state === "pending_repair") score += 8;
  if (store.consistency.blocking) score += 7;
  if (!store.health.adminRuntimeConsistent || !store.health.adminDeploymentReady) score += 5;
  if (!store.health.storefrontRuntimeConsistent || !store.health.storefrontReady) score += 4;
  if (!store.health.r2Ready) score += 3;
  score += getSetupSignals(store.setup).filter((signal) => signal.pending).length * 2;

  return score;
}

function getTimelineTitle(item: AuditLogSummary) {
  const action = item.action.toLowerCase();

  if (action.includes("repair_owner_deployment_branch")) {
    return "Owner yayın hattı güncellendi";
  }

  if (action.includes("repair_store_deployment_authorities")) {
    return "Mağaza yayın otoriteleri tarandı";
  }

  if (action.includes("cleanup")) {
    return "Temizlik kuyruğunda hareket var";
  }

  if (action.includes("store")) {
    return "Mağaza kaydında hareket";
  }

  return item.action
    .replaceAll("_", " ")
    .replace(/\b\w/g, (value) => value.toLocaleUpperCase("tr-TR"));
}

export default async function OperationsPage() {
  const previewFallback = hasOwnerPreviewDataFallback();
  const auth = previewFallback ? getPreviewOwnerAuthContext() : await requireOwnerAuth("/operations");
  const superAdmin = isSuperAdmin(auth);
  const previewFlags = getOwnerPreviewFlags();
  const repairDisabled = isOwnerActionDisabled("repair", previewFlags);
  const repairDisabledReason = getOwnerPreviewDisabledNotice("repair", previewFlags) ?? undefined;
  const [summary, stores] = previewFallback
    ? [getPreviewOperationsSummary(), getPreviewDashboardStores()]
    : await Promise.all([getOperationsSummary(auth), listDashboardStores(auth)]);

  const legacyStores = stores.filter((store) => isLegacyDatabaseMode(store.databaseMode));
  const pendingAuthCount = stores.filter((store) => store.setup.auth.status === "pending_auth_setup").length;
  const pendingAnalyticsCount = stores.filter(
    (store) => store.setup.analytics.status === "pending_analytics_setup",
  ).length;
  const pendingPaymentCount = stores.filter(
    (store) => store.setup.payments.status === "pending_payment_setup",
  ).length;
  const setupQueueCount = stores.filter((store) => getSetupSignals(store.setup).some((signal) => signal.pending)).length;
  const repairQueueStores = stores.filter(
    (store) => store.provisioning.state === "pending_repair" || store.provisioning.state === "failed",
  );
  const actionRequiredStores = stores
    .filter((store) => getActionReasons(store).length > 0)
    .sort((left, right) => getActionPriority(right) - getActionPriority(left));

  const openQueueCount =
    setupQueueCount +
    repairQueueStores.length +
    summary.totals.secretDrift +
    summary.totals.adminRuntimeIssues +
    summary.totals.orphanedCleanupRuns;

  return (
    <>
      <OwnerPageHeader
        eyebrow="Operasyon Merkezi"
        title="Operasyonlar"
        copy="Kurulum kuyruğu, olay akışı, temizlik kayıtları ve Yeni Standart dışı mağazalar tek ekranda toplanır. Yüzey teknik log yerine karar aldıran operasyon merkezi gibi davranır."
        chips={
          <>
            <OwnerStatusChip tone={setupQueueCount > 0 ? "warning" : "success"}>
              {setupQueueCount > 0 ? `${setupQueueCount} mağaza kurulum bekliyor` : "Kurulum kuyruğu temiz"}
            </OwnerStatusChip>
            <OwnerStatusChip tone={repairQueueStores.length > 0 ? "danger" : "success"}>
              {repairQueueStores.length > 0 ? `${repairQueueStores.length} mağaza onarım istiyor` : "Onarım kuyruğu temiz"}
            </OwnerStatusChip>
            <OwnerStatusChip tone={legacyStores.length > 0 ? "legacy" : "success"}>
              {legacyStores.length > 0 ? `${legacyStores.length} Legacy mağaza` : "Legacy istisna yok"}
            </OwnerStatusChip>
          </>
        }
        actions={
          <OwnerActionButton href="/stores" tone="secondary">
            Mağazalara Dön
          </OwnerActionButton>
        }
        aside={
          <div className="owner-header-summary">
            <div className="owner-header-summary-item">
              <span>Hazır mağaza</span>
              <strong>{summary.totals.readyStores}</strong>
            </div>
            <div className="owner-header-summary-item">
              <span>Açık kuyruk</span>
              <strong>{openQueueCount}</strong>
            </div>
            <div className="owner-header-summary-item">
              <span>Temizlik kaydı</span>
              <strong>{summary.totals.orphanedCleanupRuns}</strong>
            </div>
            <div className="owner-header-summary-item">
              <span>Yetki uyumsuzluğu</span>
              <strong>{summary.totals.secretDrift}</strong>
            </div>
          </div>
        }
      />

      <div className="owner-metric-grid">
        <OwnerKpiCard
          label="Hazır mağaza"
          value={summary.totals.readyStores}
          note="Kurulum ve panel sağlığı birlikte tamamlananlar"
          tone="success"
        />
        <OwnerKpiCard
          label="Açık aksiyon kuyruğu"
          value={openQueueCount}
          note="Kurulum, onarım, temizlik ve yetki farkları"
          tone={openQueueCount > 0 ? "warning" : "success"}
        />
        <OwnerKpiCard
          label="Panel sağlığı uyarısı"
          value={summary.totals.adminRuntimeIssues}
          note="Owner tarafından yeniden doğrulanması gereken panel çıktıları"
          tone={summary.totals.adminRuntimeIssues > 0 ? "danger" : "success"}
        />
        <OwnerKpiCard
          label="Yeni Standart dışı"
          value={legacyStores.length}
          note="Legacy modda kalan mağazalar"
          tone={legacyStores.length > 0 ? "legacy" : "neutral"}
        />
      </div>

      <OwnerActionPanel
        title="Kontrollü operasyon aksiyonları"
        copy="Preview güvenliği korunur. Onarım ve yayın otoritesi aksiyonları yalnızca yetkili kullanıcıda görünür, önizleme modunda ise uyarı ile kapalı kalır."
        tone={repairDisabled ? "accent" : "neutral"}
        actions={
          <>
            <OwnerStatusChip tone={repairDisabled ? "warning" : "success"}>
              Onarım {repairDisabled ? "kapalı" : "hazır"}
            </OwnerStatusChip>
            <OwnerStatusChip tone="ink">{summary.totals.orphanedCleanupRuns} temizlik kaydı</OwnerStatusChip>
          </>
        }
      >
        {superAdmin ? (
          <div className="operations-toolbar">
            <p className="operations-toolbar-note">
              Owner hattı ve mağaza yayın ayarları burada tutulur. Preview modunda bu aksiyonlar yazma güvenliği nedeniyle bilerek kapalı bırakılır.
            </p>
            <div className="operations-toolbar-actions">
              <RepairOwnerDeploymentBranchButton
                disabled={repairDisabled}
                disabledReason={repairDisabledReason}
              />
              <RepairAllStoreDeploymentAuthoritiesButton
                disabled={repairDisabled}
                disabledReason={repairDisabledReason}
              />
            </div>
          </div>
        ) : null}
      </OwnerActionPanel>

      <OwnerSectionCard
        eyebrow="Operasyon Özeti"
        title="Bugünün operasyon görünümü"
        copy="Hangi kuyrukların açıldığını, hangilerinin günlük izleme modunda kaldığını ve nerede manuel dokunuş gerektiğini Türkçe operasyon diliyle özetler."
      >
        <div className="operations-summary-grid">
          <article className="operations-summary-card tone-warning">
            <span>Kimlik kurulumu bekleyen</span>
            <strong>{pendingAuthCount}</strong>
            <p>Admin veya customer auth hazırlığı tamamlanmamış mağazalar.</p>
          </article>
          <article className="operations-summary-card tone-warning">
            <span>Analytics bekleyen</span>
            <strong>{pendingAnalyticsCount}</strong>
            <p>Raporlama katmanı tamamlanmadığı için ilk veri akışı açılmayan mağazalar.</p>
          </article>
          <article className="operations-summary-card tone-warning">
            <span>Ödeme bekleyen</span>
            <strong>{pendingPaymentCount}</strong>
            <p>Tahsilat tarafı kapanmadan yayına alınmaması gereken mağazalar.</p>
          </article>
          <article className="operations-summary-card tone-danger">
            <span>Panel sağlığı uyarısı</span>
            <strong>{summary.totals.adminRuntimeIssues}</strong>
            <p>Owner panelinin yeniden doğrulama beklediği admin runtime sinyalleri.</p>
          </article>
          <article className="operations-summary-card tone-accent">
            <span>Tutarlılık blokajı</span>
            <strong>{summary.totals.consistencyBlockingStores}</strong>
            <p>Authority ile runtime arasında blokaj oluşturan farklar.</p>
          </article>
          <article className="operations-summary-card tone-legacy">
            <span>Yeni Standart dışı</span>
            <strong>{legacyStores.length}</strong>
            <p>Legacy modda tutulduğu için ayrı gözle izlenmesi gereken portföy.</p>
          </article>
        </div>
      </OwnerSectionCard>

      <OwnerSectionCard
        eyebrow="Aksiyon Gerektirenler"
        title="Öncelikli mağaza kuyruğu"
        copy="Kurulum, onarım, runtime veya tutarlılık sinyali taşıyan mağazalar önce burada görünür."
        actions={
          <OwnerStatusChip tone={actionRequiredStores.length > 0 ? "warning" : "success"}>
            {actionRequiredStores.length > 0 ? `${actionRequiredStores.length} mağaza sırada` : "Aksiyon kuyruğu boş"}
          </OwnerStatusChip>
        }
      >
        <OwnerActionQueue
          items={actionRequiredStores.map((store) => {
            const reasons = getActionReasons(store);

            return {
              id: store.id,
              title: store.name,
              detail: getActionSummary(store),
              tone: reasons.some((reason) => reason.tone === "danger")
                ? "danger"
                : reasons.some((reason) => reason.tone === "warning")
                  ? "warning"
                  : "accent",
              chips: (
                <>
                  <OwnerStatusChip tone={isLegacyDatabaseMode(store.databaseMode) ? "legacy" : "ink"}>
                    {getDatabaseModeLabel(store.databaseMode)}
                  </OwnerStatusChip>
                  <OwnerStatusChip tone={getProvisioningTone(store.provisioning.state)}>
                    {getProvisioningLabel(store.provisioning.state)}
                  </OwnerStatusChip>
                  {reasons.map((reason) => (
                    <OwnerStatusChip key={`${store.id}-${reason.label}`} tone={reason.tone}>
                      {reason.label}
                    </OwnerStatusChip>
                  ))}
                </>
              ),
              meta: (
                <>
                  <strong>{formatDateTime(store.lastSyncedAt)}</strong>
                  <span>Son aktivite</span>
                </>
              ),
              actions: (
                <OwnerActionButton href={`/stores/${store.slug}`} tone="secondary">
                  Mağazayı Aç
                </OwnerActionButton>
              ),
            };
          })}
          empty={
            <OwnerEmptyState
              title="Öncelikli aksiyon yok"
              copy="Kurulum, runtime ve temizlik kuyrukları şu an günlük izleme seviyesinde."
            />
          }
        />
      </OwnerSectionCard>

      <div className="operations-split-grid">
        <OwnerSectionCard
          eyebrow="Olay Akışı"
          title="Son operasyon hareketleri"
          copy="Kim ne yaptı, hangi mağaza etkilendi ve hareket ne zaman gerçekleşti bilgisini tek akışta toplar."
        >
          <OwnerTimeline
            items={summary.recentActivity.map((item) => ({
              id: item.id,
              title: getTimelineTitle(item),
              detail: `${item.targetLabel} · ${item.actorName}`,
              chips: <OwnerStatusChip tone="ink">{item.targetType}</OwnerStatusChip>,
              meta: (
                <>
                  <strong>{formatDateTime(item.createdAt)}</strong>
                  <span>İşlem zamanı</span>
                </>
              ),
            }))}
            empty={<OwnerEmptyState title="Henüz hareket yok" copy="İlk operasyon kaydı geldiğinde bu akış dolacak." />}
          />
        </OwnerSectionCard>

        <OwnerSectionCard
          eyebrow="Cleanup / Repair Queue"
          title="Temizlik ve onarım kayıtları"
          copy="Açıkta kalan temizlik kayıtları ile manuel onarım bekleyen mağazalar aynı blokta tutulur."
          actions={
            <OwnerStatusChip tone={summary.cleanupRuns.length + repairQueueStores.length > 0 ? "warning" : "success"}>
              {summary.cleanupRuns.length + repairQueueStores.length > 0
                ? `${summary.cleanupRuns.length + repairQueueStores.length} kayıt`
                : "Açık kuyruk yok"}
            </OwnerStatusChip>
          }
        >
          <OwnerActionQueue
            items={[
              ...summary.cleanupRuns.map((run) => ({
                id: `cleanup-${run.id}`,
                title: run.storeName,
                detail: `${run.slug} için ${run.orphanedTargetCount} hedef hâlâ temizlenmeyi bekliyor.`,
                tone: "warning" as const,
                chips: <OwnerStatusChip tone="warning">{run.status}</OwnerStatusChip>,
                meta: (
                  <>
                    <strong>{formatDateTime(run.createdAt)}</strong>
                    <span>Temizlik kaydı açıldı</span>
                  </>
                ),
                actions: (
                  <OwnerActionButton href={`/stores/${run.slug}`} tone="secondary">
                    Detayı Aç
                  </OwnerActionButton>
                ),
              })),
              ...repairQueueStores.map((store) => ({
                id: `repair-${store.id}`,
                title: store.name,
                detail: store.provisioning.lastError || "Kurulum veya yayın otoritesi tekrar ele alınmalı.",
                tone: store.provisioning.state === "failed" ? ("danger" as const) : ("warning" as const),
                chips: (
                  <>
                    <OwnerStatusChip tone={getProvisioningTone(store.provisioning.state)}>
                      {getProvisioningLabel(store.provisioning.state)}
                    </OwnerStatusChip>
                    <OwnerStatusChip tone={isLegacyDatabaseMode(store.databaseMode) ? "legacy" : "ink"}>
                      {getDatabaseModeLabel(store.databaseMode)}
                    </OwnerStatusChip>
                  </>
                ),
                meta: (
                  <>
                    <strong>{formatDateTime(store.provisioning.lastRunAt || store.lastSyncedAt)}</strong>
                    <span>Son kontrol</span>
                  </>
                ),
                actions: (
                  <OwnerActionButton href={`/stores/${store.slug}`} tone="secondary">
                    Mağazayı Aç
                  </OwnerActionButton>
                ),
              })),
            ]}
            empty={<OwnerEmptyState title="Temizlik ve onarım kuyruğu boş" copy="Şu anda açıkta kalan kayıt görünmüyor." />}
          />
        </OwnerSectionCard>
      </div>

      <OwnerSectionCard
        eyebrow="Yeni Standart Dışı Mağazalar"
        title="Legacy portföy"
        copy="Geçiş planı veya özel istisna sebebiyle Legacy modda tutulan mağazalar ayrı blokta görünür."
      >
        <OwnerActionQueue
          items={legacyStores.map((store) => ({
            id: store.id,
            title: store.name,
            detail:
              store.management.nextAction ||
              "Bu mağaza Yeni Standart dışında tutuluyor; auth, analytics ve ödeme akışı ayrıca gözden geçirilmeli.",
            tone: "legacy",
            chips: (
              <>
                <OwnerStatusChip tone="legacy">Legacy</OwnerStatusChip>
                <OwnerStatusChip tone={getProvisioningTone(store.provisioning.state)}>
                  {getProvisioningLabel(store.provisioning.state)}
                </OwnerStatusChip>
              </>
            ),
            meta: (
              <>
                <strong>{formatDateTime(store.lastSyncedAt)}</strong>
                <span>Son aktivite</span>
              </>
            ),
            actions: (
              <OwnerActionButton href={`/stores/${store.slug}`} tone="secondary">
                Detayı Aç
              </OwnerActionButton>
            ),
          }))}
          empty={
            <OwnerEmptyState
              title="Legacy mağaza yok"
              copy="Portföyün tamamı Yeni Standart çizgisinde ilerliyor."
            />
          }
        />
      </OwnerSectionCard>
    </>
  );
}
