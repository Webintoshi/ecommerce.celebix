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
  analytics_setup: {
    stage: "Olcum katmani",
    copy: "Analitik katmani placeholder ya da canli authority olarak izleniyor; eksikse error yerine bekleyen kurulum olarak gorunur.",
  },
  auth_setup: {
    stage: "Giris kapisi",
    copy: "Admin ve musteri auth modeli placeholder ya da canli authority olarak kayit altinda tutuluyor.",
  },
  payment_setup: {
    stage: "Tahsilat hatti",
    copy: "Odeme kurulumu ayrica tamamlanacaksa bile owner panel bunu broken degil bekleyen operasyon adimi olarak izliyor.",
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
    key: "storefront_deploy",
    title: "Acilis",
    caption: "Storefront ve vitrin perdesi",
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

  if (state === "pending_dns") {
    return {
      eyebrow: "DNS beklemede",
      title: "Uygulamalar ayakta, public rota henuz yayinlanmadi",
      body: currentStepLabel
        ? `${currentStepLabel} ic runtime tarafinda hazir. Owner panel public DNS veya proxy rotasinin tamamlanmasini bekliyor.`
        : "Generated runtime iceride saglikli, ancak public domain authority henuz tam acilmadi. Owner panel bu bekleme durumunu onarimdan ayri tutuyor.",
    };
  }

  if (state === "pending_auth") {
    return {
      eyebrow: "Auth beklemede",
      title: "Altyapi hazir, auth kurulumu bekleniyor",
      body:
        "Store DB, deploy ve runtime hazir. Logto-ready auth placeholder tamamlandigi icin owner panel bunu ariza degil bekleyen operasyon adimi olarak gosteriyor.",
    };
  }

  if (state === "pending_analytics") {
    return {
      eyebrow: "Analytics beklemede",
      title: "Store ayakta, analitik baglantisi bekleniyor",
      body:
        "Generated app kurulumu tamamlandi. Umami-ready placeholder kayitli oldugu icin eksik analytics error yerine bekleyen adim olarak izleniyor.",
    };
  }

  if (state === "pending_payment") {
    return {
      eyebrow: "Odeme beklemede",
      title: "Store yayinda, odeme authority sirada",
      body:
        "Magaza kurulumu tamamlandi; tahsilat kurulumu ayrica tamamlanacak. Owner panel bunu broken degil operasyon kuyrugundaki sonraki adim olarak gorur.",
    };
  }

  if (state === "failed") {
    return {
      eyebrow: "Kritik durus",
      title: "Kurulum fail durumuna gecti",
      body: currentStepLabel
        ? `${currentStepLabel} adiminda terminal bir hata goruldu. Owner panel bu durumu bekleyen placeholder'lardan ayri, gercek ariza olarak isaretliyor.`
        : "Kurulum zincirinde terminal bir hata goruldu. Owner panel bunu bekleyen operasyon adimlarindan ayri olarak gosteriyor.",
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
    case "blocked":
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
            {showRepairButton ? <RepairProjectButton slug={slug} /> : null}
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
