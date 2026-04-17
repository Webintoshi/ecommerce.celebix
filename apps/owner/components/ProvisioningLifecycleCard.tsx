import { RepairProjectButton } from "@/components/RepairProjectButton";
import { formatDateTime } from "@/lib/formatters";
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
    stage: "Yayin rotasi",
    copy: "Dogru deployment hattina giris kontrolu yapiliyor.",
  },
  supabase_preflight: {
    stage: "Veri nabzi",
    copy: "Supabase altyapisinin tum kapilari test ediliyor.",
  },
  r2_preflight: {
    stage: "Medya raflari",
    copy: "R2 depolama raflari gorselleri kabul etmeye hazirlaniyor.",
  },
  coolify_preflight: {
    stage: "Makine odasi",
    copy: "Coolify uzerindeki sahne makineleri senkronlaniyor.",
  },
  github_preflight: {
    stage: "Kod koreografisi",
    copy: "Kaynak repo ve yayin zinciri birbirine kilitleniyor.",
  },
  starter_source_preflight: {
    stage: "Ilk taslak",
    copy: "Starter kaynaklari vitrin iskeletini kurmak icin aciliyor.",
  },
  generated_apps_toggle: {
    stage: "Otomasyon anahtari",
    copy: "Generated app politikasi acilis ritmine gore ayarlaniyor.",
  },
  authority_repo_sync: {
    stage: "Marka otoritesi",
    copy: "Store authority kayitlari ana sahneye tasiniyor.",
  },
  management_profile: {
    stage: "Marka kimligi",
    copy: "Musteri notlari, sahiplik ve operasyon profili yerlestiriliyor.",
  },
  supabase_provision: {
    stage: "Veri odasi",
    copy: "Magazanin cekirdek veritabani ve servis odasi kuruluyor.",
  },
  starter_seed: {
    stage: "Ilk vitrin",
    copy: "Demo urunler ve ilk vitrin hikayesi sahneye serpistiriliyor.",
  },
  r2_provision: {
    stage: "Gorsel deposu",
    copy: "Gorsel upload zinciri icin medya deposu aciliyor.",
  },
  admin_blueprint: {
    stage: "Kontrol plani",
    copy: "Admin panelinin blueprint cizimi sahneye aliniyor.",
  },
  admin_deploy: {
    stage: "Arka ofis",
    copy: "Admin kontrol masasi canliya alinmak uzere kuruluyor.",
  },
  storefront_scaffold: {
    stage: "Cephe kurulumu",
    copy: "Storefront iskeleti markanin cephesine gore yukseliyor.",
  },
  storefront_blueprint: {
    stage: "Vitrin plani",
    copy: "Storefront blueprinti yayin sahnesine yerlesiyor.",
  },
  storefront_repo_sync: {
    stage: "Tema senkronu",
    copy: "Tema, asset ve branch akisi vitrine dogru kilitleniyor.",
  },
  storefront_deploy: {
    stage: "Perde acilisi",
    copy: "Storefront son kez isinirken acilis perdesi hazirlaniyor.",
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
    key: "admin_deploy",
    title: "Kontrol",
    caption: "Admin masasi ve arka ofis",
    keys: ["admin_blueprint", "admin_deploy"],
  },
  {
    key: "storefront_deploy",
    title: "Acilis",
    caption: "Storefront ve vitrin perdesi",
    keys: ["storefront_scaffold", "storefront_blueprint", "storefront_repo_sync", "storefront_deploy"],
  },
];

function getStepStatusRank(status: ProvisioningStepStatus): number {
  switch (status) {
    case "failed":
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
      return "danger";
    case "skipped":
      return "muted";
    case "pending":
    default:
      return "pending";
  }
}

function summarizeActStatus(statuses: ProvisioningStepStatus[]): ProvisioningStepStatus {
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
      eyebrow: "Perde acildi",
      title: `${storeName} sahneye cikti`,
      body:
        "Magaza kurulumu tamamlandi. Owner artik operasyonu izliyor, vitrin ve kontrol masasi canli akista.",
    };
  }

  if (state === "pending_repair") {
    return {
      eyebrow: "Teknik mola",
      title: "Kurulum takildi ama akis kontrol altinda",
      body: currentStepLabel
        ? `${currentStepLabel} adiminda duraksama var. Owner panel onar akisini ve kalan adimlari bu sahneden yonetiyor.`
        : "Kurulum zincirinde duzeltilmesi gereken bir adim var. Owner panel geri kalan adimlari kaybetmeden onar akisini surduruyor.",
    };
  }

  return {
    eyebrow: "Acilis seremonisi",
    title: currentStepLabel ? `${currentStepLabel} hazirlaniyor` : "Magaza kuruluyor",
    body: `${storeName} icin vitrin, veri odasi ve kontrol masasi sira ile ayaga kalkiyor. Bu alan kurulumun canli ritmini gosterir.`,
  };
}

function getStatusLabel(status: ProvisioningStepStatus): string {
  switch (status) {
    case "completed":
      return "tamam";
    case "running":
      return "suruyor";
    case "failed":
      return "bloklu";
    case "skipped":
      return "atlanmis";
    case "pending":
    default:
      return "sirada";
  }
}

export function ProvisioningLifecycleCard({
  provisioning,
  storeName,
  slug,
  superAdmin,
}: ProvisioningLifecycleCardProps) {
  const currentStep =
    provisioning.steps.find((step) => step.status === "failed") ??
    provisioning.steps.find((step) => step.status === "running") ??
    provisioning.steps.find((step) => step.status === "pending") ??
    provisioning.steps.at(-1) ??
    null;

  const completedCount = provisioning.steps.filter(
    (step) => step.status === "completed" || step.status === "skipped",
  ).length;
  const progressPercent =
    provisioning.steps.length > 0
      ? Math.max(6, Math.round((completedCount / provisioning.steps.length) * 100))
      : 0;
  const heroCopy = getHeroCopy(provisioning.state, storeName, currentStep?.label ?? null);

  const actStatuses = ACTS.map((act) => {
    const currentActSteps = provisioning.steps.filter((step) => act.keys.includes(step.key));

    return {
      ...act,
      status: summarizeActStatus(currentActSteps.map((step) => step.status)),
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
              <span className={`pill provisioning-tone-${provisioning.state}`}>{provisioning.state}</span>
              {currentStep ? <span className="pill pill-accent">{currentStep.label}</span> : null}
              <span className="pill">{completedCount}/{provisioning.steps.length} adim tamam</span>
            </div>
          </div>
          <div className="provisioning-stage-actions">
            {superAdmin ? <RepairProjectButton slug={slug} /> : null}
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
              Bloklayan: <strong>{provisioning.steps.filter((step) => step.status === "failed").length}</strong>
            </span>
            <span>
              Sirada: <strong>{provisioning.steps.filter((step) => step.status === "pending").length}</strong>
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

            return (
              <div key={step.key} className={`provisioning-step-card tone-${getStatusTone(step.status)}`}>
                <div className="provisioning-step-top">
                  <div>
                    <strong>{step.label}</strong>
                    <p>{story.stage}</p>
                  </div>
                  <span className="pill">{getStatusLabel(step.status)}</span>
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
