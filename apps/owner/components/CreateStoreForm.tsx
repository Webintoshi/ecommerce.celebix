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

interface ProvisioningStepSummary {
  key: string;
  message: string | null;
  status: string;
}

interface CreateStorePayload {
  error?: string;
  provisioningState?: string;
  blockers?: ProvisioningStepSummary[];
  steps?: ProvisioningStepSummary[];
  store?: { slug: string };
}

interface CreateStoreFormProps {
  ownerDeploymentBranch: string;
  storefrontBranchPrefix: string;
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
}: CreateStoreFormProps) {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL_STATE);
  const [error, setError] = useState<string | null>(null);
  const [provisioningState, setProvisioningState] = useState<string | null>(null);
  const [steps, setSteps] = useState<ProvisioningStepSummary[]>([]);
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
    if (!createdSlug) {
      return;
    }

    router.push(`/stores/${createdSlug}`);
    router.refresh();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setProvisioningState(null);
    setSteps([]);
    setCreatedSlug(null);

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

      if (payload.provisioningState && payload.provisioningState !== "ready") {
        setProvisioningState(payload.provisioningState);
        setSteps(payload.steps ?? []);
        setCreatedSlug(payload.store.slug);
        return;
      }

      router.push(`/stores/${payload.store.slug}`);
      router.refresh();
    });
  }

  const pendingSteps = steps.filter((step) => step.status === "failed" || step.status === "pending");
  const branchSlugPreview = form.slug || slugify(form.name) || "store-slug";
  const storefrontBranchPreview = `${storefrontBranchPrefix}/${branchSlugPreview}`;

  return (
    <form className="form-grid form-grid-2" onSubmit={handleSubmit}>
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
          Bu alan storefront ve admin domaini icindir. Demo kurulum icin `waya.celebix.co` gibi bir subdomain
          girebilir, bu durumda admin host otomatik `admin-waya.celebix.co` olur. Musteri onayindan sonra owner
          panelden gercek domaine gecirebilirsin.
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

      {error ? <p className="form-error field-full">{error}</p> : null}

      {provisioningState && provisioningState !== "ready" && createdSlug ? (
        <div className="card field-full section-tight" style={{ borderColor: "rgba(254,97,0,.22)" }}>
          <div className="card-title">Kurulum pending repair durumda</div>
          <p className="section-copy">
            Proje kaydi olusturuldu ancak provisioning state hazir degil. Kalan adimlar asagida listeleniyor.
          </p>
          <div className="stack-list stack-top-sm">
            {pendingSteps.map((step) => (
              <div key={step.key} className="inline-card">
                <div>
                  <strong>{step.key}</strong>
                  <p>{step.message || step.status}</p>
                </div>
                <div className="activity-meta">
                  <span>{step.status}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="actions field-full actions-end stack-top-sm">
            <button type="button" className="button button-secondary" onClick={openCreatedStore}>
              Proje detayina git
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
          Iptal
        </button>
        <button type="submit" className="button button-primary" disabled={isPending}>
          {isPending ? "Olusturuluyor..." : "Magaza Olustur"}
        </button>
      </div>
    </form>
  );
}
