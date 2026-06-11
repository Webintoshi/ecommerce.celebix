import type { StoreSmokeReport } from "@celebix/platform-config";
import type { DashboardStoreSummary } from "@/lib/control-plane";
import type { OwnerTone } from "@/components/owner-control";
import type { ProvisioningStepSummary } from "@/lib/store-lifecycle";

export type ControlCenterStatus = "ready" | "warning" | "failed" | "unknown";

export interface OperationalStatus {
  label: string;
  tone: OwnerTone;
  note: string;
  metadataWarning: boolean;
  smokeIncomplete: boolean;
  needsAttention: boolean;
}

export interface ReadinessItem {
  key: string;
  label: string;
  status: ControlCenterStatus;
  tone: OwnerTone;
  description: string;
  checkedAt: string | null;
}

export interface TimelineItem {
  key: string;
  label: string;
  status: "completed" | "running" | "failed" | "skipped" | "warning" | "unknown";
  tone: OwnerTone;
  timestamp: string | null;
  message: string;
}

const EXPECTED_SMOKE_LABELS = [
  "public smoke",
  "customer auth smoke",
  "admin auth smoke",
  "payment smoke",
];

function hasBlockingStep(steps: ProvisioningStepSummary[]): boolean {
  return steps.some((step) => (step.status === "failed" || step.status === "blocked") && step.blocking);
}

function hasFailedStep(steps: ProvisioningStepSummary[]): boolean {
  return steps.some((step) => step.status === "failed" || step.status === "blocked");
}

function hasCompletedProvisioningEvidence(store: DashboardStoreSummary): boolean {
  const steps = store.provisioning.steps;

  if (steps.length === 0) {
    return store.provisioning.pendingStepCount === 0 && store.provisioning.failedStepCount === 0;
  }

  return steps.every((step) => step.status === "completed" || step.status === "skipped");
}

function hasSmokePassed(smoke: StoreSmokeReport | null | undefined): boolean {
  return smoke?.overallStatus === "passed";
}

function hasSmokeMissing(smoke: StoreSmokeReport | null | undefined): boolean {
  return !smoke || smoke.overallStatus === "pending" || smoke.checks.length === 0;
}

function hasInfrastructureReady(store: DashboardStoreSummary): boolean {
  return (
    store.health.supabaseReady &&
    store.health.r2Ready &&
    store.health.adminDeploymentReady &&
    store.health.adminRuntimeConsistent &&
    store.health.storefrontRuntimeConsistent &&
    store.health.storefrontDataReady &&
    store.health.starterSeedReady
  );
}

function hasOperationalProof(store: DashboardStoreSummary): boolean {
  return (
    hasSmokePassed(store.smoke) ||
    store.health.adminRuntimeConsistent ||
    store.health.adminDeploymentReady ||
    store.health.storefrontRuntimeConsistent ||
    store.health.storefrontReady ||
    store.storefrontStatus === "active"
  );
}

export function getOperationalStatus(store: DashboardStoreSummary): OperationalStatus {
  const blocking = store.consistency.blocking || hasBlockingStep(store.provisioning.steps);
  const smokePassed = hasSmokePassed(store.smoke);
  const smokeMissing = hasSmokeMissing(store.smoke);
  const infrastructureReady = hasInfrastructureReady(store);
  const completedProvisioning = hasCompletedProvisioningEvidence(store);
  const operationalProof = hasOperationalProof(store);
  const failedSteps = store.provisioning.failedStepCount > 0 || hasFailedStep(store.provisioning.steps);
  const stalePendingRepair =
    store.provisioning.state === "pending_repair" &&
    completedProvisioning &&
    operationalProof &&
    !blocking &&
    !failedSteps;

  if (blocking || failedSteps) {
    return {
      label: "Needs Attention",
      tone: "danger",
      note: "A blocking provisioning or consistency issue exists.",
      metadataWarning: false,
      smokeIncomplete: false,
      needsAttention: true,
    };
  }

  if (stalePendingRepair) {
    return {
      label: "Ready with metadata warning",
      tone: "warning",
      note: "Store is operational; top-level provisioning/runtime metadata appears stale.",
      metadataWarning: true,
      smokeIncomplete: false,
      needsAttention: false,
    };
  }

  if (completedProvisioning && operationalProof && (!infrastructureReady || !smokePassed) && !blocking) {
    return {
      label: "Ready with metadata warning",
      tone: "warning",
      note: "Store is operational; top-level provisioning/runtime metadata may be stale.",
      metadataWarning: true,
      smokeIncomplete: smokeMissing && !smokePassed,
      needsAttention: false,
    };
  }

  if (infrastructureReady && smokeMissing) {
    return {
      label: "Ready pending smoke verification",
      tone: "warning",
      note: "Provisioned infrastructure is ready; smoke verification is incomplete.",
      metadataWarning: false,
      smokeIncomplete: true,
      needsAttention: false,
    };
  }

  if (infrastructureReady && smokePassed) {
    return {
      label: "Ready",
      tone: "success",
      note: "Provisioning, deploy, runtime and smoke checks are aligned.",
      metadataWarning: false,
      smokeIncomplete: false,
      needsAttention: false,
    };
  }

  if (store.provisioning.state === "running" || store.provisioning.state === "provisioning") {
    return {
      label: "Provisioning",
      tone: "accent",
      note: "Provisioning workflow is still progressing.",
      metadataWarning: false,
      smokeIncomplete: false,
      needsAttention: false,
    };
  }

  return {
    label: "Provisioned, smoke incomplete",
    tone: "warning",
    note: "No blocking failure is visible, but readiness evidence is incomplete.",
    metadataWarning: false,
    smokeIncomplete: smokeMissing,
    needsAttention: false,
  };
}

function toReadinessStatus(ready: boolean, failed: boolean, unknown = false): ControlCenterStatus {
  if (failed) {
    return "failed";
  }

  if (ready) {
    return "ready";
  }

  return unknown ? "unknown" : "warning";
}

function toReadinessTone(status: ControlCenterStatus): OwnerTone {
  switch (status) {
    case "ready":
      return "success";
    case "failed":
      return "danger";
    case "unknown":
      return "neutral";
    case "warning":
    default:
      return "warning";
  }
}

function buildReadinessItem(
  key: string,
  label: string,
  status: ControlCenterStatus,
  description: string,
  checkedAt: string | null,
): ReadinessItem {
  return {
    key,
    label,
    status,
    tone: toReadinessTone(status),
    description,
    checkedAt,
  };
}

export function getStoreReadinessItems(store: DashboardStoreSummary): ReadinessItem[] {
  const operationalStatus = getOperationalStatus(store);
  const smokeFailed = store.smoke?.overallStatus === "failed";

  return [
    buildReadinessItem(
      "light_postgres",
      "light_postgres",
      toReadinessStatus(store.health.supabaseReady, false),
      store.databaseMode === "light_postgres"
        ? "Runtime DB authority is evaluated through light_postgres readiness."
        : "Legacy database mode is tracked separately.",
      store.lastSyncedAt,
    ),
    buildReadinessItem(
      "logto",
      "Logto",
      toReadinessStatus(store.setup.auth.status === "configured", false),
      store.setup.auth.provider === "logto"
        ? "Admin and customer auth authority use Logto."
        : "Auth provider is not Logto for this store.",
      store.lastSyncedAt,
    ),
    buildReadinessItem(
      "r2",
      "R2",
      toReadinessStatus(store.health.r2Ready, false),
      store.r2?.publicUrl || store.r2?.bucketName || "R2 media authority is pending or unavailable.",
      store.lastSyncedAt,
    ),
    buildReadinessItem(
      "umami",
      "Umami",
      toReadinessStatus(store.setup.analytics.status === "configured", false),
      store.setup.analytics.provider === "umami"
        ? "Website analytics authority uses Umami."
        : "Analytics provider is not Umami for this store.",
      store.lastSyncedAt,
    ),
    buildReadinessItem(
      "coolify",
      "Coolify",
      toReadinessStatus(
        store.health.adminDeploymentReady && store.health.storefrontRuntimeConsistent,
        store.provisioning.steps.some((step) => step.key.includes("deploy") && step.status === "failed"),
      ),
      "Admin and storefront deploy resources are checked through runtime/deploy health.",
      store.lastSyncedAt,
    ),
    buildReadinessItem(
      "ghcr",
      "GHCR",
      toReadinessStatus(
        store.health.adminDeploymentReady || store.health.storefrontRuntimeConsistent,
        false,
        !store.storefrontAppDir,
      ),
      "Image availability is inferred from generated app deploy readiness.",
      store.lastSyncedAt,
    ),
    buildReadinessItem(
      "cloudflare_dns",
      "Cloudflare DNS",
      toReadinessStatus(store.storefrontStatus === "active", store.provisioning.state === "pending_dns"),
      store.storefrontStatus === "active" ? "Public storefront route is active." : "Public DNS or proxy route is still being watched.",
      store.lastSyncedAt,
    ),
    buildReadinessItem(
      "build_server",
      "Build Server",
      toReadinessStatus(
        operationalStatus.label === "Ready" || operationalStatus.label === "Ready with metadata warning",
        smokeFailed,
      ),
      smokeFailed ? "Smoke failed after build/deploy." : "Build readiness is inferred from deploy and smoke evidence.",
      store.smoke?.finishedAt ?? store.lastSyncedAt,
    ),
  ];
}

export function summarizeSystemReadiness(stores: DashboardStoreSummary[]): ReadinessItem[] {
  const newestStore = stores.find((store) => store.lastSyncedAt) ?? stores[0] ?? null;
  const aggregate = (key: string, label: string, description: string): ReadinessItem => {
    const itemStatuses = stores.map((store) => getStoreReadinessItems(store).find((item) => item.key === key)?.status ?? "unknown");
    const status: ControlCenterStatus =
      stores.length === 0
        ? "unknown"
        : itemStatuses.some((itemStatus) => itemStatus === "failed")
          ? "failed"
          : itemStatuses.some((itemStatus) => itemStatus === "warning")
            ? "warning"
            : itemStatuses.every((itemStatus) => itemStatus === "ready")
              ? "ready"
              : "unknown";

    return buildReadinessItem(key, label, status, description, newestStore?.lastSyncedAt ?? null);
  };

  return [
    aggregate("light_postgres", "light_postgres", "Tenant DB/role/schema readiness across the store fleet."),
    aggregate("logto", "Logto", "Admin and customer app auth authority across stores."),
    aggregate("r2", "R2", "Media bucket, public URL and prefix readiness."),
    aggregate("umami", "Umami", "Website analytics and admin summary readiness."),
    aggregate("coolify", "Coolify", "Admin and storefront runtime deploy readiness."),
    aggregate("ghcr", "GHCR", "Generated image/build availability inferred from deploy evidence."),
    aggregate("cloudflare_dns", "Cloudflare DNS", "Public storefront/admin route readiness."),
    aggregate("build_server", "Build Server", "Build, deploy and smoke pipeline readiness."),
  ];
}

function getStepByKey(store: DashboardStoreSummary, key: ProvisioningStepSummary["key"]) {
  return store.provisioning.steps.find((step) => step.key === key) ?? null;
}

function mapStepStatus(step: ProvisioningStepSummary | null, fallbackCompleted: boolean): TimelineItem["status"] {
  if (!step) {
    return fallbackCompleted ? "completed" : "unknown";
  }

  if (step.status === "completed") {
    return "completed";
  }

  if (step.status === "running") {
    return "running";
  }

  if (step.status === "failed" || step.status === "blocked") {
    return "failed";
  }

  if (step.status === "skipped") {
    return "skipped";
  }

  return fallbackCompleted ? "completed" : "unknown";
}

function timelineTone(status: TimelineItem["status"]): OwnerTone {
  switch (status) {
    case "completed":
      return "success";
    case "running":
      return "accent";
    case "failed":
      return "danger";
    case "warning":
      return "warning";
    case "skipped":
    case "unknown":
    default:
      return "neutral";
  }
}

function timelineItem(
  store: DashboardStoreSummary,
  key: string,
  label: string,
  stepKey: ProvisioningStepSummary["key"] | null,
  fallbackCompleted: boolean,
  fallbackMessage: string,
): TimelineItem {
  const step = stepKey ? getStepByKey(store, stepKey) : null;
  const status = mapStepStatus(step, fallbackCompleted);

  return {
    key,
    label,
    status,
    tone: timelineTone(status),
    timestamp: step?.updatedAt ?? null,
    message: step?.message ?? fallbackMessage,
  };
}

export function getProvisioningTimeline(store: DashboardStoreSummary): TimelineItem[] {
  const smokePassed = hasSmokePassed(store.smoke);
  const smokeChecks = store.smoke?.checks ?? [];
  const smokeStatusFor = (label: string): TimelineItem["status"] => {
    const check = smokeChecks.find((item) =>
      `${item.category} ${item.label}`.toLocaleLowerCase("en").includes(label.replace(" smoke", "")),
    );

    if (!check) {
      return smokePassed ? "completed" : "unknown";
    }

    if (check.status === "passed") {
      return "completed";
    }

    if (check.status === "failed") {
      return "failed";
    }

    if (check.status === "skipped") {
      return "skipped";
    }

    return "unknown";
  };

  const baseItems: TimelineItem[] = [
    timelineItem(store, "store_record", "Store record created", "management_profile", true, "Owner store record exists."),
    timelineItem(store, "light_postgres_db", "light_postgres DB created", "supabase_provision", store.health.supabaseReady, "Database authority is ready."),
    timelineItem(store, "runtime_role", "runtime role created", "supabase_provision", store.health.supabaseReady, "Runtime role readiness is inferred from DB authority."),
    timelineItem(store, "schema_seeded", "schema seeded", "starter_seed", store.health.starterSeedReady, "Starter schema/content is visible in runtime metrics."),
    timelineItem(store, "r2_configured", "R2 configured", "r2_provision", store.health.r2Ready, "R2 media authority configured."),
    timelineItem(store, "logto_admin", "Logto admin app created", "auth_setup", store.setup.auth.status === "configured", "Admin auth authority configured."),
    timelineItem(store, "logto_customer", "Logto customer app created", "auth_setup", store.setup.auth.status === "configured", "Customer auth authority configured."),
    timelineItem(store, "umami", "Umami website configured", "analytics_setup", store.setup.analytics.status === "configured", "Umami website/config authority ready."),
    timelineItem(store, "storefront_branch", "storefront branch generated", "storefront_repo_sync", Boolean(store.storefrontAppDir), "Storefront app/branch is present."),
    timelineItem(store, "admin_branch", "admin branch generated", "admin_blueprint", store.health.adminDeploymentReady, "Admin deployment blueprint is present."),
    timelineItem(store, "coolify_storefront", "Coolify storefront app created", "storefront_blueprint", store.health.storefrontRuntimeConsistent, "Storefront deploy resource is ready."),
    timelineItem(store, "coolify_admin", "Coolify admin app created", "admin_blueprint", store.health.adminDeploymentReady, "Admin deploy resource is ready."),
    timelineItem(store, "storefront_deployed", "storefront deployed", "storefront_deploy", store.health.storefrontRuntimeConsistent, "Storefront runtime is consistent."),
    timelineItem(store, "admin_deployed", "admin deployed", "admin_deploy", store.health.adminRuntimeConsistent, "Admin runtime is consistent."),
  ];

  const smokeItems = EXPECTED_SMOKE_LABELS.map((label) => {
    const status = smokeStatusFor(label);

    return {
      key: label.replaceAll(" ", "_"),
      label: label.replace(/\b\w/g, (char) => char.toLocaleUpperCase("en")),
      status,
      tone: timelineTone(status),
      timestamp: store.smoke?.finishedAt ?? null,
      message: status === "completed" ? "Smoke check passed." : "Smoke evidence is missing or incomplete.",
    };
  });

  const operationalStatus = getOperationalStatus(store);
  const finalStatus: TimelineItem["status"] =
    operationalStatus.needsAttention ? "failed" : operationalStatus.metadataWarning ? "warning" : operationalStatus.tone === "success" ? "completed" : "unknown";

  return [
    ...baseItems,
    ...smokeItems,
    {
      key: "final_ready",
      label: "Final ready",
      status: finalStatus,
      tone: timelineTone(finalStatus),
      timestamp: store.smoke?.finishedAt ?? store.lastSyncedAt,
      message: operationalStatus.note,
    },
  ];
}
