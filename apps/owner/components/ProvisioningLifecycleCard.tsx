import { RepairProjectButton } from "@/components/RepairProjectButton";
import { formatDateTime } from "@/lib/formatters";
import { getProvisioningLabel, getProvisioningToneClass } from "@/lib/lifecycle-ui";
import type {
  ProvisioningState,
  ProvisioningStepKey,
  ProvisioningStepStatus,
  ProvisioningSummary,
} from "@/lib/store-lifecycle";

interface ProvisioningLifecycleCardProps {
  provisioning: ProvisioningSummary;
  storeName: string;
  slug: string;
  superAdmin: boolean;
  repairDisabled?: boolean;
  repairDisabledReason?: string;
}

interface StepStory {
  stage: string;
  copy: string;
}

const STEP_STORIES: Record<ProvisioningStepKey, StepStory> = {
  owner_supabase_auth: {
    stage: "Sahne anahtari",
    copy: "Owner oturumu ve yetki zinciri aydinlatiliyor.",
  },
  cleanup_guard: {
    stage: "Temizlik turu",
    copy: "Eski izler temizleniyor, yeni acilis alani bosaltiliyor.",
  },
  deployment_branch_preflight: {
    stage: "Yayın rotası",
    copy: "Dogru deployment hattina giris kontrolu yapiliyor.",
  },
  supabase_preflight: {
    stage: "Veri nabzi",
    copy: "Supabase altyapısının tüm kapıları test ediliyor.",
  },
  r2_preflight: {
    stage: "Medya rafları",
    copy: "R2 depolama rafları görselleri kabul etmeye hazırlanıyor.",
  },
  coolify_preflight: {
    stage: "Makine odası",
    copy: "Coolify üzerindeki yayın altyapısı senkronlanıyor.",
  },
  github_preflight: {
    stage: "Kod koreografisi",
    copy: "Kaynak repo ve yayın zinciri birbirine kilitleniyor.",
  },
  starter_source_preflight: {
    stage: "İlk taslak",
    copy: "Starter kaynakları vitrin iskeletini kurmak için açılıyor.",
  },
  generated_apps_toggle: {
    stage: "Otomasyon anahtari",
    copy: "Generated app politikası açılış ritmine göre ayarlanıyor.",
  },
  authority_repo_sync: {
    stage: "Marka otoritesi",
    copy: "Mağaza authority kayıtları owner kaynağına taşınıyor.",
  },
  management_profile: {
    stage: "Marka kimliği",
    copy: "Müşteri notları, sahiplik ve operasyon profili yerleştiriliyor.",
  },
  supabase_provision: {
    stage: "Veri odası",
    copy: "Mağazanın çekirdek veritabanı ve servis odası kuruluyor.",
  },
  starter_seed: {
    stage: "İlk vitrin",
    copy: "Demo ürünler ve ilk vitrin hikayesi hazırlanıyor.",
  },
  r2_provision: {
    stage: "Görsel deposu",
    copy: "Görsel upload zinciri için medya deposu açılıyor.",
  },
  admin_blueprint: {
    stage: "Kontrol planı",
    copy: "Admin panelinin yayın planı hazırlanıyor.",
  },
  admin_deploy: {
    stage: "Arka ofis",
    copy: "Admin kontrol masası canlıya alınmak üzere kuruluyor.",
  },
  analytics_setup: {
    stage: "Ölçüm katmanı",
    copy: "Analitik katmanı placeholder ya da canlı authority olarak izleniyor; eksikse hata yerine bekleyen kurulum olarak görünür.",
  },
  auth_setup: {
    stage: "Giriş kapısı",
    copy: "Admin ve müşteri auth modeli placeholder ya da canlı authority olarak kayıt altında tutuluyor.",
  },
  payment_setup: {
    stage: "Tahsilat hattı",
    copy: "Ödeme kurulumu ayrıca tamamlanacaksa owner panel bunu arıza değil bekleyen operasyon adımı olarak izliyor.",
  },
  storefront_scaffold: {
    stage: "Cephe kurulumu",
    copy: "Vitrin iskeleti markanın cephesine göre yükseliyor.",
  },
  storefront_blueprint: {
    stage: "Vitrin planı",
    copy: "Vitrin yayın planı hazırlanıyor.",
  },
  storefront_repo_sync: {
    stage: "Tema senkronu",
    copy: "Tema, asset ve branch akışı vitrine doğru kilitleniyor.",
  },
  storefront_deploy: {
    stage: "Yayın hazırlığı",
    copy: "Vitrin son kontrollerle canlı yayına hazırlanıyor.",
  },
};

const ACTS: Array<{
  key: ProvisioningStepKey;
  title: string;
  caption: string;
  keys: ProvisioningStepKey[];
}> = [
  {
    key: "authority_repo_sync",
    title: "Kimlik",
    caption: "Marka otoritesi ve yayin rotasi",
    keys: ["owner_supabase_auth", "cleanup_guard", "deployment_branch_preflight", "supabase_preflight", "r2_preflight", "coolify_preflight", "github_preflight", "starter_source_preflight", "generated_apps_toggle", "authority_repo_sync", "management_profile"],
  },
  {
    key: "supabase_provision",
    title: "Altyapi",
    caption: "Veri odasi ve medya depolari",
    keys: ["supabase_provision", "starter_seed", "r2_provision"],
  },
  {
    key: "storefront_deploy",
    title: "Acilis",
    caption: "Vitrin ve yayın akışı",
    keys: ["storefront_scaffold", "storefront_repo_sync", "storefront_blueprint", "storefront_deploy"],
  },
  {
    key: "admin_deploy",
    title: "Kontrol",
    caption: "Admin masasi ve arka ofis",
    keys: ["admin_blueprint", "admin_deploy", "analytics_setup", "auth_setup", "payment_setup"],
  },
];

function getStepStatusRank(status: ProvisioningStepStatus): number {
  switch (status) {
    case "failed":
    case "blocked":
      return 4;
    case "running":
      return 3;
    case "pending":
      return 2;
    case "completed":
      return 1;
    case "skipped":
      return 0;
    default:
      return 0;
  }
}

function getStatusTone(status: ProvisioningStepStatus): string {
  switch (status) {
    case "completed":
      return "success";
    case "running":
      return "running";
    case "failed":
    case "blocked":
      return "danger";
    case "skipped":
      return "muted";
    case "pending":
    default:
      return "pending";
  }
}

function summarizeActStatus(statuses: ProvisioningStepStatus[]): ProvisioningStepStatus {
  if (statuses.some((status) => status === "blocked")) {
    return "blocked";
  }

  if (statuses.some((status) => status === "failed")) {
    return "failed";
  }

  if (statuses.some((status) => status === "running")) {
    return "running";
  }

  if (statuses.some((status) => status === "pending")) {
    return statuses.every((status) => status === "pending") ? "pending" : "running";
  }

  if (statuses.some((status) => status === "completed")) {
    return "completed";
  }

  return "skipped";
}

function getHeroCopy(state: ProvisioningState, storeName: string, currentStepLabel: string | null) {
  if (state === "ready") {
    return {
      eyebrow: "Kurulum tamamlandı",
      title: `${storeName} hazır`,
      body:
        "Mağaza kurulumu tamamlandı. Owner artık operasyonu, vitrini ve kontrol masasını canlı akışta izliyor.",
    };
  }

  if (state === "pending_repair") {
    return {
      eyebrow: "Teknik mola",
      title: "Kurulum takıldı ama akış kontrol altında",
      body: currentStepLabel
        ? `${currentStepLabel} adımında duraksama var. Owner panel onarım akışını ve kalan adımları buradan yönetiyor.`
        : "Kurulum zincirinde düzeltilmesi gereken bir adım var. Owner panel geri kalan adımları kaybetmeden onarım akışını sürdürüyor.",
    };
  }

  if (state === "pending_dns") {
    return {
      eyebrow: "DNS beklemede",
      title: "Uygulamalar ayakta, public rota henüz yayınlanmadı",
      body: currentStepLabel
        ? `${currentStepLabel} iç runtime tarafında hazır. Owner panel public DNS veya proxy rotasının tamamlanmasını bekliyor.`
        : "Generated runtime içeride sağlıklı, ancak public domain authority henüz tam açılmadı. Owner panel bu bekleme durumunu onarımdan ayrı tutuyor.",
    };
  }

  if (state === "pending_auth") {
    return {
      eyebrow: "Auth beklemede",
      title: "Altyapı hazır, auth kurulumu bekleniyor",
      body:
        "Mağaza DB, yayın ve runtime hazır. Auth placeholder tamamlandığı için owner panel bunu arıza değil bekleyen operasyon adımı olarak gösteriyor.",
    };
  }

  if (state === "pending_analytics") {
    return {
      eyebrow: "Analytics beklemede",
      title: "Mağaza ayakta, analitik bağlantısı bekleniyor",
      body:
        "Generated app kurulumu tamamlandı. Analytics placeholder kayıtlı olduğu için eksik analytics hata yerine bekleyen adım olarak izleniyor.",
    };
  }

  if (state === "pending_payment") {
    return {
      eyebrow: "Ödeme beklemede",
      title: "Mağaza yayında, ödeme authority sırada",
      body:
        "Mağaza kurulumu tamamlandı; tahsilat kurulumu ayrıca tamamlanacak. Owner panel bunu arıza değil operasyon kuyruğundaki sonraki adım olarak görür.",
    };
  }

  if (state === "failed") {
    return {
      eyebrow: "Kritik duruş",
      title: "Kurulum fail durumuna geçti",
      body: currentStepLabel
        ? `${currentStepLabel} adımında terminal bir hata görüldü. Owner panel bu durumu bekleyen placeholder'lardan ayrı, gerçek arıza olarak işaretliyor.`
        : "Kurulum zincirinde terminal bir hata görüldü. Owner panel bunu bekleyen operasyon adımlarından ayrı olarak gösteriyor.",
    };
  }

  return {
    eyebrow: "Kurulum Akışı",
    title: currentStepLabel ? `${currentStepLabel} hazırlanıyor` : "Mağaza kuruluyor",
    body: `${storeName} için vitrin, veri odası ve kontrol masası sıra ile ayağa kalkıyor. Bu alan kurulumun canlı ritmini gösterir.`,
  };
}

function getStatusLabel(status: ProvisioningStepStatus): string {
  switch (status) {
    case "completed":
      return "tamam";
    case "running":
      return "suruyor";
    case "failed":
      return "fail";
    case "blocked":
      return "bloklu";
    case "skipped":
      return "atlanmis";
    case "pending":
    default:
      return "sirada";
  }
}

function getFocusedLifecycleStepKey(state: ProvisioningState): ProvisioningStepKey | null {
  switch (state) {
    case "pending_auth":
      return "auth_setup";
    case "pending_analytics":
      return "analytics_setup";
    case "pending_payment":
      return "payment_setup";
    default:
      return null;
  }
}

function getDisplayTone(step: ProvisioningSummary["steps"][number], state: ProvisioningState): string {
  if (state === "pending_auth" && step.key === "auth_setup") {
    return "auth";
  }

  if (state === "pending_analytics" && step.key === "analytics_setup") {
    return "analytics";
  }

  if (state === "pending_payment" && step.key === "payment_setup") {
    return "payment";
  }

  return getStatusTone(step.status);
}

function getDisplayStatusLabel(step: ProvisioningSummary["steps"][number], state: ProvisioningState): string {
  if (
    (state === "pending_auth" && step.key === "auth_setup") ||
    (state === "pending_analytics" && step.key === "analytics_setup") ||
    (state === "pending_payment" && step.key === "payment_setup")
  ) {
    return "beklemede";
  }

  return getStatusLabel(step.status);
}

export function ProvisioningLifecycleCard({
  provisioning,
  storeName,
  slug,
  superAdmin,
  repairDisabled = false,
  repairDisabledReason,
}: ProvisioningLifecycleCardProps) {
  const focusedLifecycleStepKey = getFocusedLifecycleStepKey(provisioning.state);
  const currentStep =
    (focusedLifecycleStepKey
      ? provisioning.steps.find((step) => step.key === focusedLifecycleStepKey)
      : null) ??
    provisioning.steps.find((step) => step.status === "blocked") ??
    provisioning.steps.find((step) => step.status === "failed") ??
    provisioning.steps.find((step) => step.status === "running") ??
    provisioning.steps.find((step) => step.status === "pending") ??
    provisioning.steps.at(-1) ??
    null;
  const blockerCount = provisioning.steps.filter(
    (step) => step.status === "failed" || step.status === "blocked",
  ).length;
  const showRepairButton =
    superAdmin && (provisioning.state === "pending_repair" || provisioning.state === "failed");
  const softPendingState =
    provisioning.state === "pending_auth" ||
    provisioning.state === "pending_analytics" ||
    provisioning.state === "pending_payment";

  const completedCount = provisioning.steps.filter(
    (step) => step.status === "completed" || step.status === "skipped",
  ).length;
  const baseProgressPercent =
    provisioning.steps.length > 0
      ? Math.max(6, Math.round((completedCount / provisioning.steps.length) * 100))
      : 0;
  const progressPercent = softPendingState ? Math.min(baseProgressPercent, 92) : baseProgressPercent;
  const pendingCount =
    provisioning.steps.filter((step) => step.status === "pending").length + (softPendingState ? 1 : 0);
  const heroCopy = getHeroCopy(provisioning.state, storeName, currentStep?.label ?? null);
  const provisioningToneClass = getProvisioningToneClass(provisioning.state);
  const provisioningLabel = getProvisioningLabel(provisioning.state);

  const actStatuses = ACTS.map((act) => {
    const currentActSteps = provisioning.steps.filter((step) => act.keys.includes(step.key));
    const summarizedStatus = summarizeActStatus(currentActSteps.map((step) => step.status));

    return {
      ...act,
      status: softPendingState && act.key === "admin_deploy" ? "pending" : summarizedStatus,
    };
  });

  const orderedSteps = [...provisioning.steps].sort((left, right) => {
    const rankDelta = getStepStatusRank(right.status) - getStepStatusRank(left.status);

    if (rankDelta !== 0) {
      return rankDelta;
    }

    return left.label.localeCompare(right.label, "tr");
  });

  return (
    <div className="card section-tight provisioning-stage">
      <div className="provisioning-stage-shell">
        <div className="provisioning-stage-hero">
          <div className={`provisioning-stage-orbit is-${provisioning.state}`}>
            <span className="provisioning-stage-core" />
            <span className="provisioning-stage-ring provisioning-stage-ring-a" />
            <span className="provisioning-stage-ring provisioning-stage-ring-b" />
            <span className="provisioning-stage-ring provisioning-stage-ring-c" />
          </div>
          <div className="provisioning-stage-copy">
            <span className="provisioning-stage-eyebrow">{heroCopy.eyebrow}</span>
            <div className="card-title provisioning-stage-title">{heroCopy.title}</div>
            <p className="provisioning-stage-body">{heroCopy.body}</p>
            <div className="actions compact-actions wrap stack-top-sm">
              <span className={`pill ${provisioningToneClass}`}>
                {provisioningLabel}
              </span>
              {currentStep ? (
                <span
                  className={
                    focusedLifecycleStepKey && currentStep.key === focusedLifecycleStepKey
                      ? `pill ${provisioningToneClass}`
                      : "pill pill-ink"
                  }
                >
                  {currentStep.label}
                </span>
              ) : null}
              <span className="pill">{completedCount}/{provisioning.steps.length} adim tamam</span>
              {blockerCount > 0 ? <span className="pill pill-danger">{blockerCount} blocker</span> : null}
            </div>
          </div>
          <div className="provisioning-stage-actions">
            {showRepairButton ? (
              <RepairProjectButton
                slug={slug}
                disabled={repairDisabled}
                disabledReason={repairDisabledReason}
              />
            ) : null}
          </div>
        </div>

        <div className="provisioning-stage-progress">
          <div className="provisioning-stage-progress-bar" aria-hidden="true">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="provisioning-stage-meta">
            <span>
              Son calisma: <strong>{formatDateTime(provisioning.lastRunAt)}</strong>
            </span>
            <span>
              Bloklayan: <strong>{blockerCount}</strong>
            </span>
            <span>
              Sirada: <strong>{pendingCount}</strong>
            </span>
          </div>
        </div>

        <div className="provisioning-stage-acts">
          {actStatuses.map((act) => (
            <div key={act.key} className={`provisioning-stage-act tone-${getStatusTone(act.status)}`}>
              <div className="provisioning-stage-act-top">
                <strong>{act.title}</strong>
                <span className="pill">{getStatusLabel(act.status)}</span>
              </div>
              <p>{act.caption}</p>
            </div>
          ))}
        </div>

        {provisioning.lastError ? (
          <div className="provisioning-stage-alert">
            <strong>Sahne arkasindan gelen son not</strong>
            <p>{provisioning.lastError}</p>
          </div>
        ) : (
          <p className="card-note">
            Provisioning metadata owner authority icinde senkron tutuluyor. Kurulum ritmi burada anlik izlenir.
          </p>
        )}

        <div className="provisioning-step-grid">
          {orderedSteps.map((step) => {
            const story = STEP_STORIES[step.key];
            const displayTone = getDisplayTone(step, provisioning.state);
            const displayStatusLabel = getDisplayStatusLabel(step, provisioning.state);

            return (
              <div key={step.key} className={`provisioning-step-card tone-${displayTone}`}>
                <div className="provisioning-step-top">
                  <div>
                    <strong>{step.label}</strong>
                    <p>{story.stage}</p>
                  </div>
                  <span className="pill">{displayStatusLabel}</span>
                </div>
                <p className="provisioning-step-story">{story.copy}</p>
                <div className="provisioning-step-footer">
                  <span>{step.message || "Bu adim sira bilgisiyle owner tarafinda izleniyor."}</span>
                  <span>{step.updatedAt ? formatDateTime(step.updatedAt) : "Beklemede"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
