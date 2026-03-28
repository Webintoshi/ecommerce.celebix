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
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(form)
      });

      const payload = (await response.json()) as { error?: string; store?: { slug: string } };

      if (!response.ok || !payload.store) {
        setError(payload.error || "Magaza olusturulamadi.");
        return;
      }

      router.push(`/stores/${payload.store.slug}`);
      router.refresh();
    });
  }

  return (
    <form className="form-grid form-grid-2" onSubmit={handleSubmit}>
      <label className="field">
        <span>Magaza adi</span>
        <input value={form.name} onChange={handleNameChange} placeholder="Deri Kordon" required />
      </label>

      <label className="field">
        <span>Slug</span>
        <input value={form.slug} onChange={handleSlugChange} placeholder="deri-kordon" required />
      </label>

      <label className="field">
        <span>Domain</span>
        <input value={form.domain} onChange={(event) => updateField("domain", event.target.value)} placeholder="derikordon.com" required />
      </label>

      <label className="field">
        <span>Tema</span>
        <select value={form.theme} onChange={(event) => updateField("theme", event.target.value)}>
          <option value="atelier">atelier</option>
          <option value="leather">leather</option>
          <option value="editorial">editorial</option>
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

      <label className="field">
        <span>Destek e-postasi</span>
        <input
          type="email"
          value={form.supportEmail}
          onChange={(event) => updateField("supportEmail", event.target.value)}
          placeholder="destek@derikordon.com"
        />
      </label>

      <label className="field">
        <span>Destek telefonu</span>
        <input value={form.supportPhone} onChange={(event) => updateField("supportPhone", event.target.value)} placeholder="+90 532 000 00 00" />
      </label>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="actions field-full">
        <button type="submit" className="button button-primary" disabled={isPending}>
          {isPending ? "Olusturuluyor..." : "Magazayi Olustur"}
        </button>
      </div>
    </form>
  );
}
