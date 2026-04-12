"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useState, useTransition } from "react";

interface FormState {
  name: string;
  slug: string;
  domain: string;
  theme: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  packageStartDate: string;
  packageDurationMonths: string;
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
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface CreateStorePayload {
  error?: string;
  warnings?: string[];
  store?: { slug: string };
}

export function CreateStoreForm() {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL_STATE);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
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

  function openCreatedStore() {
    if (!createdSlug) return;
    router.push(`/stores/${createdSlug}`);
    router.refresh();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setWarnings([]);
    setCreatedSlug(null);

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

      if (payload.warnings && payload.warnings.length > 0) {
        setWarnings(payload.warnings);
        setCreatedSlug(payload.store.slug);
        return;
      }

      router.push(`/stores/${payload.store.slug}`);
      router.refresh();
    });
  }

  return (
    <form className="form-grid form-grid-2" onSubmit={handleSubmit}>
      <label className="field">
        <span>Mağaza Adı</span>
        <input
          value={form.name}
          onChange={handleNameChange}
          placeholder="Deri Kordon"
          required
        />
      </label>

      <label className="field">
        <span>Slug</span>
        <input
          value={form.slug}
          onChange={handleSlugChange}
          placeholder="deri-kordon"
          required
        />
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
          Bu alan storefront ve admin domaini içindir. Self-hosted Supabase ayrı
          stock-host ile üretilir.
        </small>
      </label>

      <label className="field">
        <span>Tema</span>
        <select
          value={form.theme}
          onChange={(event) => updateField("theme", event.target.value)}
        >
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
          placeholder="El yapımı deri kordon ve aksesuarlar"
        />
      </label>

      <label className="field">
        <span>Destek E-postası</span>
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

      {error ? <p className="form-error field-full">{error}</p> : null}

      {warnings.length > 0 && createdSlug ? (
        <div className="card field-full section-tight" style={{ borderColor: "rgba(254,97,0,.22)" }}>
          <div className="card-title">Kurulum kısmi tamamlandı</div>
          <p className="section-copy">
            Proje kaydı oluşturuldu fakat bazı otomasyon adımları eksik kaldı. Bu
            yüzden R2, admin veya storefront tarafı tam açılmamış olabilir.
          </p>
          <div className="stack-list stack-top-sm">
            {warnings.map((warning, index) => (
              <div key={`${warning}-${index}`} className="inline-card">
                <p>{warning}</p>
              </div>
            ))}
          </div>
          <div className="actions field-full actions-end stack-top-sm">
            <button
              type="button"
              className="button button-secondary"
              onClick={openCreatedStore}
            >
              Proje detayına git
            </button>
          </div>
        </div>
      ) : null}

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
          className="button button-primary"
          disabled={isPending}
        >
          {isPending ? "Oluşturuluyor..." : "Mağaza Oluştur"}
        </button>
      </div>
    </form>
  );
}
