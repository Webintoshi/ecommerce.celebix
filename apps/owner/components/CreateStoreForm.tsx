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
      setError(disabledReason || "Preview ortaminda yazma/kurulum islemleri kapalidir.");
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
        setError(payload.error || "Magaza olusturulamadi.");
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
      <label className="field">
        <span>Magaza Adi</span>
        <input value={form.name} onChange={handleNameChange} placeholder="Deri Kordon" required />
      </label>

      <label className="field">
        <span>Slug</span>
        <input value={form.slug} onChange={handleSlugChange} placeholder="deri-kordon" required />
      </label>

      <label className="field">
        <span>Domain</span>
        <input
          value={form.domain}
          onChange={(event) => updateField("domain", event.target.value)}
          placeholder="derikordon.com"
          required
        />
        <small className="muted">
          Bu alan storefront ve admin domaini icindir. Demo domain authority icinde ayrica
          <code>&lt;slug&gt;.demo.celebix.co</code> olarak tutulur.
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

      <label className="field field-full">
        <span>Tagline</span>
        <input
          value={form.tagline}
          onChange={(event) => updateField("tagline", event.target.value)}
          placeholder="El yapimi deri kordon ve aksesuarlar"
        />
      </label>

      <div className="card field-full section-tight">
        <div className="card-title">Deploy Branch Plani</div>
        <div className="meta-pairs">
          <span>Owner/Admin branch: <strong>{ownerDeploymentBranch}</strong></span>
          <span>Storefront branch: <strong>{storefrontBranchPreview}</strong></span>
        </div>
        <p className="card-note">
          Owner ve admin deploy ayni branch'te kalir. Her yeni storefront kendi slug'i icin ayri branch alir.
        </p>
      </div>

      <div className="card field-full section-tight">
        <div className="card-title">Varsayilan Standard</div>
        <p className="card-note">
          Yeni store create akisi varsayilan olarak light Postgres + R2 + generated admin/storefront
          standardinda acilir.
        </p>
        <div className="actions compact-actions wrap stack-top-sm">
          <span className="pill pill-success">light_postgres</span>
          <span className="pill">R2 default</span>
          <span className="pill">Logto placeholder</span>
          <span className="pill">Umami placeholder</span>
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
            {legacyModeVisible ? "Advanced / Legacy alani gizle" : "Advanced / Legacy Mode"}
          </button>
        </div>
        {legacyModeVisible ? (
          <div className="stack-top-sm">
            <label className="field">
              <span>Veritabani modu</span>
              <select
                value={form.databaseMode}
                onChange={(event) =>
                  updateField("databaseMode", event.target.value as FormState["databaseMode"])
                }
              >
                <option value="light_postgres">Light Postgres (yeni standart)</option>
                <option value="full_supabase">Full Supabase (legacy)</option>
              </select>
              <small className="muted">
                Full Supabase sadece explicit legacy mod icin acilir; default secim light_postgres olarak korunur.
              </small>
            </label>
            {form.databaseMode === "full_supabase" ? (
              <div className="inline-card" style={{ borderColor: "rgba(254,97,0,.24)" }}>
                <div>
                  <strong>Legacy Supabase stack olusturur</strong>
                  <p>Yeni standart degildir</p>
                  <p>Sadece ozel/onayli durumlarda kullanilir</p>
                </div>
                <span className="pill pill-accent">legacy</span>
              </div>
            ) : (
              <p className="card-note">
                Legacy paneli acik, ancak yeni standard secimi light_postgres olarak aktif kalir.
              </p>
            )}
          </div>
        ) : null}
      </div>

      <label className="field">
        <span>Destek E-postasi</span>
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
        <span>Paket baslangic tarihi</span>
        <input
          type="date"
          value={form.packageStartDate}
          onChange={(event) => updateField("packageStartDate", event.target.value)}
        />
      </label>

      <label className="field">
        <span>Paket suresi (ay)</span>
        <input
          type="number"
          min="1"
          step="1"
          value={form.packageDurationMonths}
          onChange={(event) => updateField("packageDurationMonths", event.target.value)}
          placeholder="1"
        />
        <small className="muted">Aylik paket icin 1, yillik paket icin 12 gir.</small>
      </label>
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
          Iptal
        </button>
        <button
          type="submit"
          className={`button button-primary${disabledReason ? " button-preview-disabled" : ""}`}
          disabled={disabled || isPending}
        >
          {isPending ? "Olusturuluyor..." : "Magaza Olustur"}
        </button>
      </div>
    </form>
  );
}
