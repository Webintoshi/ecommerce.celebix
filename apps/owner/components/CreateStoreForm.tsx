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
}

const INITIAL_STATE: FormState = {
  name: "",
  slug: "",
  domain: "",
  theme: "atelier",
  tagline: "",
  supportEmail: "",
  supportPhone: ""
};

const THEME_OPTIONS = [
  { value: "atelier", label: "Atelier" },
  { value: "leather", label: "Leather" },
  { value: "editorial", label: "Editorial" }
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

export function CreateStoreForm() {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL_STATE);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleNameChange(event: ChangeEvent<HTMLInputElement>) {
    const nextName = event.target.value;
    setForm((current) => ({
      ...current,
      name: nextName,
      slug: current.slug ? current.slug : slugify(nextName)
    }));
  }

  function handleSlugChange(event: ChangeEvent<HTMLInputElement>) {
    updateField("slug", slugify(event.target.value));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      const payload = (await response.json()) as { error?: string; store?: { slug: string } };

      if (!response.ok || !payload.store) {
        setError(payload.error || "Mağaza oluşturulamadı.");
        return;
      }

      router.push(`/stores/${payload.store.slug}`);
      router.refresh();
    });
  }

  return (
    <form className="form-grid form-grid-2" onSubmit={handleSubmit}>
      {/* Mağaza Adı */}
      <label className="field">
        <span>Mağaza Adı</span>
        <input
          value={form.name}
          onChange={handleNameChange}
          placeholder="Deri Kordon"
          required
        />
      </label>

      {/* Slug */}
      <label className="field">
        <span>Slug</span>
        <input
          value={form.slug}
          onChange={handleSlugChange}
          placeholder="deri-kordon"
          required
        />
      </label>

      {/* Domain */}
      <label className="field">
        <span>Domain</span>
        <input
          value={form.domain}
          onChange={(e) => updateField("domain", e.target.value)}
          placeholder="derikordon.com"
          required
        />
        <small className="muted">
          Bu alan storefront ve admin domaini icindir. Self-hosted Supabase stock-host ile ayrica uretilir.
        </small>
      </label>

      {/* Tema */}
      <label className="field">
        <span>Tema</span>
        <select
          value={form.theme}
          onChange={(e) => updateField("theme", e.target.value)}
        >
          {THEME_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {/* Tagline */}
      <label className="field field-full">
        <span>Tagline</span>
        <input
          value={form.tagline}
          onChange={(e) => updateField("tagline", e.target.value)}
          placeholder="El yapimi deri kordon ve aksesuarlar"
        />
      </label>

      {/* Destek E-postası */}
      <label className="field">
        <span>Destek E-postasi</span>
        <input
          type="email"
          value={form.supportEmail}
          onChange={(e) => updateField("supportEmail", e.target.value)}
          placeholder="destek@derikordon.com"
        />
      </label>

      {/* Destek Telefonu */}
      <label className="field">
        <span>Destek Telefonu</span>
        <input
          value={form.supportPhone}
          onChange={(e) => updateField("supportPhone", e.target.value)}
          placeholder="+90 532 000 00 00"
        />
      </label>

      {/* Error */}
      {error && <p className="form-error field-full">{error}</p>}

      {/* Submit */}
      <div className="actions field-full" style={{ justifyContent: "flex-end", marginTop: 8 }}>
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
          {isPending ? "Olusturuluyor..." : "Mağaza Olustur"}
        </button>
      </div>
    </form>
  );
}
