"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useState, useTransition } from "react";

interface FormState {
  name: string;
  slug: string;
  domain: string;
  databaseMode: "light_postgres" | "full_supabase";
  theme: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  packageStartDate: string;
  packageDurationMonths: string;
}

interface CreateStorePayload {
  error?: string;
  store?: { slug: string };
}

interface CreateStoreFormProps {
  ownerDeploymentBranch: string;
  storefrontBranchPrefix: string;
  disabled?: boolean;
  disabledReason?: string;
}

function getTodayDateValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

const INITIAL_STATE: FormState = {
  name: "",
  slug: "",
  domain: "",
  databaseMode: "light_postgres",
  theme: "atelier",
  tagline: "",
  supportEmail: "",
  supportPhone: "",
  packageStartDate: getTodayDateValue(),
  packageDurationMonths: "1",
};

const THEME_OPTIONS = [
  { value: "atelier", label: "Atelier" },
  { value: "leather", label: "Leather" },
  { value: "editorial", label: "Editorial" },
];

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("tr")
    .replace(/Ä±/g, "i")
    .replace(/ÄŸ/g, "g")
    .replace(/Ã¼/g, "u")
    .replace(/ÅŸ/g, "s")
    .replace(/Ã¶/g, "o")
    .replace(/Ã§/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CreateStoreForm({
  ownerDeploymentBranch,
  storefrontBranchPrefix,
  disabled = false,
  disabledReason,
}: CreateStoreFormProps) {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL_STATE);
  const [error, setError] = useState<string | null>(null);
  const [showLegacyOptions, setShowLegacyOptions] = useState(false);
  const [isPending, startTransition] = useTransition();

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleNameChange(event: ChangeEvent<HTMLInputElement>) {
    const nextName = event.target.value;
    setForm((current) => ({
      ...current,
      name: nextName,
      slug: current.slug ? current.slug : slugify(nextName),
    }));
  }

  function handleSlugChange(event: ChangeEvent<HTMLInputElement>) {
    updateField("slug", slugify(event.target.value));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (disabled) {
      setError(disabledReason || "Önizleme ortamında yazma ve kurulum işlemleri kapalıdır.");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as CreateStorePayload;

      if (!response.ok || !payload.store) {
        setError(payload.error || "Mağaza oluşturulamadı.");
        return;
      }

      router.push(`/stores/${payload.store.slug}`);
      router.refresh();
    });
  }

  const branchSlugPreview = form.slug || slugify(form.name) || "store-slug";
  const storefrontBranchPreview = `${storefrontBranchPrefix}/${branchSlugPreview}`;
  const legacyModeVisible = showLegacyOptions || form.databaseMode === "full_supabase";

  return (
    <form className="form-grid form-grid-2" onSubmit={handleSubmit}>
      <fieldset className="preview-form-fieldset field-full" disabled={disabled}>
        <section className="owner-form-block field-full">
          <div className="owner-form-block-title">
            <strong>Mağaza bilgileri</strong>
            <span>Adım 01</span>
          </div>
          <div className="form-grid form-grid-2">
            <label className="field">
              <span>Mağaza adı</span>
              <input value={form.name} onChange={handleNameChange} placeholder="Deri Kordon" required />
            </label>

            <label className="field">
              <span>Slug</span>
              <input value={form.slug} onChange={handleSlugChange} placeholder="deri-kordon" required />
            </label>

            <label className="field field-full">
              <span>Tagline</span>
              <input
                value={form.tagline}
                onChange={(event) => updateField("tagline", event.target.value)}
                placeholder="El yapimi deri kordon ve aksesuarlar"
              />
            </label>
          </div>
        </section>

        <section className="owner-form-block field-full">
          <div className="owner-form-block-title">
            <strong>Domain ve tema</strong>
            <span>Adım 02-03</span>
          </div>
          <div className="form-grid form-grid-2">
            <label className="field">
              <span>Domain</span>
              <input
                value={form.domain}
                onChange={(event) => updateField("domain", event.target.value)}
                placeholder="derikordon.com"
                required
              />
              <small className="muted">
                Vitrin ve admin domaini. Demo domain kaydı <code>&lt;slug&gt;.demo.celebix.co</code> olarak tutulur.
              </small>
            </label>

            <label className="field">
              <span>Tema</span>
              <select value={form.theme} onChange={(event) => updateField("theme", event.target.value)}>
                {THEME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="owner-standard-card field-full">
          <div className="owner-form-block-title">
            <strong>Yeni Celebix Standardı</strong>
            <span>Adım 06</span>
          </div>
          <p>
            Yeni mağaza akışı varsayılan olarak Yeni Standart + R2 + generated admin/vitrin
            düzeninde açılır. Teknik veritabanı modu yalnızca Advanced Legacy alanında değişir.
          </p>
          <div className="actions compact-actions wrap stack-top-sm">
            <span className="pill pill-success">Yeni Standart</span>
            <span className="pill">R2 default</span>
            <span className="pill provisioning-tone-pending_auth">Auth Kurulumu Bekleyen</span>
            <span className="pill provisioning-tone-pending_analytics">Analytics Kurulumu Bekleyen</span>
            <span className="pill provisioning-tone-pending_payment">Ödeme Kurulumu Bekleyen</span>
          </div>
          <div className="actions stack-top-sm">
            <button
              type="button"
              className="button button-ghost"
              onClick={() => {
                if (legacyModeVisible && form.databaseMode === "full_supabase") {
                  updateField("databaseMode", "light_postgres");
                  setShowLegacyOptions(false);
                  return;
                }

                setShowLegacyOptions((current) => !current);
              }}
            >
              {legacyModeVisible ? "Advanced Legacy alanını gizle" : "Advanced Legacy"}
            </button>
          </div>
          {legacyModeVisible ? (
            <div className="stack-top-sm">
              <label className="field">
                <span>Veritabanı modu</span>
                <select
                  value={form.databaseMode}
                  onChange={(event) =>
                    updateField("databaseMode", event.target.value as FormState["databaseMode"])
                  }
                >
                  <option value="light_postgres">Yeni Standart</option>
                  <option value="full_supabase">Legacy</option>
                </select>
                <small className="muted">
                  Legacy yalnızca özel/onaylı durumlarda açılır; varsayılan seçim Yeni Standart olarak korunur.
                </small>
              </label>
              {form.databaseMode === "full_supabase" ? (
                <div className="inline-card" style={{ borderColor: "rgba(254,97,0,.24)" }}>
                  <div>
                    <strong>Legacy kurulum açılır</strong>
                    <p>Yeni Standart değildir</p>
                    <p>Sadece özel/onaylı durumlarda kullanılır</p>
                  </div>
                  <span className="pill pill-legacy">legacy</span>
                </div>
              ) : (
                <p className="card-note">
                  Legacy paneli açık, ancak Yeni Standart seçimi aktif kalır.
                </p>
              )}
            </div>
          ) : null}
        </section>

        <section className="owner-form-block field-full">
          <div className="owner-form-block-title">
            <strong>Admin, ödeme ve başlangıç</strong>
            <span>Adım 04-05</span>
          </div>
          <div className="form-grid form-grid-2">
            <label className="field">
              <span>Destek e-postası</span>
              <input
                type="email"
                value={form.supportEmail}
                onChange={(event) => updateField("supportEmail", event.target.value)}
                placeholder="destek@derikordon.com"
              />
            </label>

            <label className="field">
              <span>Destek Telefonu</span>
              <input
                value={form.supportPhone}
                onChange={(event) => updateField("supportPhone", event.target.value)}
                placeholder="+90 532 000 00 00"
              />
            </label>

            <label className="field">
              <span>Paket başlangıç tarihi</span>
              <input
                type="date"
                value={form.packageStartDate}
                onChange={(event) => updateField("packageStartDate", event.target.value)}
              />
            </label>

            <label className="field">
              <span>Paket süresi (ay)</span>
              <input
                type="number"
                min="1"
                step="1"
                value={form.packageDurationMonths}
                onChange={(event) => updateField("packageDurationMonths", event.target.value)}
                placeholder="1"
              />
              <small className="muted">Aylık paket için 1, yıllık paket için 12 gir.</small>
            </label>
          </div>
        </section>

        <section className="owner-form-block field-full">
          <div className="owner-form-block-title">
            <strong>Yayın branch planı</strong>
            <span>Yetki</span>
          </div>
          <div className="meta-pairs">
            <span>Owner/Admin branch: <strong>{ownerDeploymentBranch}</strong></span>
            <span>Vitrin branch: <strong>{storefrontBranchPreview}</strong></span>
          </div>
          <p className="card-note">
            Owner ve admin yayını aynı branch'te kalır. Her yeni vitrin kendi slug'ı için ayrı branch alır.
          </p>
        </section>
      </fieldset>

      {error ? <p className="form-error field-full">{error}</p> : null}
      {disabledReason ? <p className="form-notice form-notice-preview field-full">{disabledReason}</p> : null}

      <div className="actions field-full actions-end stack-top-sm">
        <button
          type="button"
          className="button button-ghost"
          onClick={() => router.back()}
          disabled={isPending}
        >
          İptal
        </button>
        <button
          type="submit"
          className={`button button-primary${disabledReason ? " button-preview-disabled" : ""}`}
          disabled={disabled || isPending}
        >
          {isPending ? "Oluşturuluyor..." : "Mağaza Oluştur"}
        </button>
      </div>
    </form>
  );
}
