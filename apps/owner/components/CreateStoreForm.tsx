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
  adminDeploymentBranchPrefix: string;
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
  adminDeploymentBranchPrefix,
  storefrontBranchPrefix,
  disabled = false,
  disabledReason,
}: CreateStoreFormProps) {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL_STATE);
  const [error, setError] = useState<string | null>(null);
  const [showLegacyOptions, setShowLegacyOptions] = useState(false);
  const [isSlugDirty, setIsSlugDirty] = useState(false);
  const [isPending, startTransition] = useTransition();

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleNameChange(event: ChangeEvent<HTMLInputElement>) {
    const nextName = event.target.value;
    setForm((current) => ({
      ...current,
      name: nextName,
      slug: isSlugDirty ? current.slug : slugify(nextName),
    }));
  }

  function handleSlugChange(event: ChangeEvent<HTMLInputElement>) {
    setIsSlugDirty(true);
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
  const adminBranchPreview = `${adminDeploymentBranchPrefix}/${branchSlugPreview}`;
  const storefrontBranchPreview = `${storefrontBranchPrefix}/${branchSlugPreview}`;
  const storefrontUrlPreview = `https://${branchSlugPreview}.celebix.site`;
  const adminUrlPreview = `https://admin-${branchSlugPreview}.celebix.site`;
  const legacyModeVisible = showLegacyOptions || form.databaseMode === "full_supabase";

  return (
    <form className="owner-create-wizard" onSubmit={handleSubmit}>
      <fieldset className="preview-form-fieldset owner-wizard-fieldset" disabled={disabled}>
        <section className="owner-wizard-step-card">
          <div className="owner-wizard-step-index">1</div>
          <div className="owner-wizard-step-content">
            <div className="owner-form-block-title">
              <strong>Temel Bilgiler</strong>
              <span>Marka kimliği</span>
            </div>
            <p className="section-copy">Mağazanın panelde ve vitrin planında görünecek temel adını belirle.</p>
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
                <span>Mağaza açıklaması</span>
                <input
                  value={form.tagline}
                  onChange={(event) => updateField("tagline", event.target.value)}
                  placeholder="El yapımı deri kordon ve aksesuarlar"
                />
              </label>
            </div>
          </div>
        </section>

        <section className="owner-wizard-step-card">
          <div className="owner-wizard-step-index">2</div>
          <div className="owner-wizard-step-content">
            <div className="owner-form-block-title">
              <strong>Domain</strong>
              <span>Yayın kimliği</span>
            </div>
            <p className="section-copy">Vitrin domaini ana karar alanıdır; admin domaini kurulum zincirinde bundan türetilir.</p>
            <label className="field">
              <span>Vitrin domaini</span>
              <input
                value={form.domain}
                onChange={(event) => updateField("domain", event.target.value)}
                placeholder="derikordon.com"
                required
              />
              <small className="muted">Demo kayıt ve admin host planı kurulum onayında teknik detay olarak görünür.</small>
            </label>
          </div>
        </section>

        <section className="owner-wizard-step-card owner-standard-card">
          <div className="owner-wizard-step-index">3</div>
          <div className="owner-wizard-step-content">
            <div className="owner-form-block-title">
              <strong>Kurulum Standardı</strong>
              <span>Yeni Celebix Standardı</span>
            </div>
            <p>
              Yeni mağazalar varsayılan olarak Postgres veritabanı, Logto kimlik doğrulama,
              Umami analitik, R2 medya depolama ve Build Server/GHCR yayın düzeniyle açılır.
            </p>
            <div className="actions compact-actions wrap stack-top-sm">
              <span className="pill pill-success">Postgres veritabanı</span>
              <span className="pill pill-success">Logto kimlik doğrulama</span>
              <span className="pill pill-success">Umami analitik</span>
              <span className="pill">R2 medya depolama</span>
              <span className="pill">Build Server / GHCR</span>
              <span className="pill pill-ink">Supabase kullanılmıyor</span>
              <span className="pill pill-success">Coolify deploy</span>
              <span className="pill pill-success">Cloudflare DNS izleme</span>
              <span className="pill provisioning-tone-pending_auth">Auth Kurulumu Bekleyen</span>
              <span className="pill provisioning-tone-pending_analytics">Analytics Kurulumu Bekleyen</span>
              <span className="pill provisioning-tone-pending_payment">Ödeme Kurulumu Bekleyen</span>
            </div>
            <div className="create-stack-grid">
              <div>
                <span>Default DB</span>
                <strong>light_postgres</strong>
                <p>DB, runtime role ve schema seed bu standartla açılır.</p>
              </div>
              <div>
                <span>Auth</span>
                <strong>Logto</strong>
                <p>Admin ve customer app ayrı authority olarak hazırlanır.</p>
              </div>
              <div>
                <span>Storage</span>
                <strong>R2</strong>
                <p>Public media URL ve store prefix Supabase Storage yerine kullanılır.</p>
              </div>
              <div>
                <span>Analytics</span>
                <strong>Umami</strong>
                <p>Website config ve admin summary server-side token authority ile izlenir.</p>
              </div>
              <div>
                <span>Supabase status</span>
                <strong>none / not used</strong>
                <p>Yeni mağaza default akışında Supabase runtime geri getirilmez.</p>
              </div>
            </div>
            <div className="owner-advanced-box">
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
                {legacyModeVisible ? "Advanced Legacy alanını kapat" : "Advanced Legacy"}
              </button>
              {legacyModeVisible ? (
                <div className="owner-legacy-panel">
                  <label className="field">
                    <span>Legacy modu</span>
                    <select
                      value={form.databaseMode}
                      onChange={(event) =>
                        updateField("databaseMode", event.target.value as FormState["databaseMode"])
                      }
                    >
                      <option value="light_postgres">Yeni Standart</option>
                      <option value="full_supabase">Legacy</option>
                    </select>
                    <small className="muted">Legacy yalnızca özel/onaylı durumlarda kullanılır.</small>
                  </label>
                  <div className="inline-card">
                    <div>
                      <strong>{form.databaseMode === "full_supabase" ? "Legacy kurulum seçildi" : "Yeni Standart korunuyor"}</strong>
                      <p>{form.databaseMode === "full_supabase" ? "Full Supabase özel modda açılır." : "Advanced panel açık, ana standart değişmedi."}</p>
                    </div>
                    <span className={`pill ${form.databaseMode === "full_supabase" ? "pill-legacy" : "pill-success"}`}>
                      {form.databaseMode === "full_supabase" ? "Legacy" : "Yeni Standart"}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="owner-wizard-step-card">
          <div className="owner-wizard-step-index">4</div>
          <div className="owner-wizard-step-content">
            <div className="owner-form-block-title">
              <strong>Admin Kullanıcı</strong>
              <span>Başlangıç erişimi</span>
            </div>
            <p className="section-copy">İlk destek kanalı ve operasyon iletişimi mağaza teslim akışına eklenir.</p>
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
                <span>Destek telefonu</span>
                <input
                  value={form.supportPhone}
                  onChange={(event) => updateField("supportPhone", event.target.value)}
                  placeholder="+90 532 000 00 00"
                />
              </label>
            </div>
            <div className="create-stack-grid">
              <div>
                <span>Default payment</span>
                <strong>bank_transfer</strong>
                <p>Banka havalesi başlangıç ödeme authority olarak görünür.</p>
              </div>
              <div>
                <span>COD policy</span>
                <strong>ops approval</strong>
                <p>Kapıda ödeme store policy hazır olduğunda açılır.</p>
              </div>
              <div>
                <span>Card policy</span>
                <strong>gateway required</strong>
                <p>Kart tahsilatı provider authority tamamlanmadan aktif sayılmaz.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="owner-wizard-step-card">
          <div className="owner-wizard-step-index">5</div>
          <div className="owner-wizard-step-content">
            <div className="owner-form-block-title">
              <strong>Ödeme ve Kargo Başlangıcı</strong>
              <span>Paket ritmi</span>
            </div>
            <p className="section-copy">Mağaza ticaret başlangıcı için paket süresi ve takip tarihi belirlenir.</p>
            <div className="form-grid form-grid-2">
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
          </div>
        </section>

        <section className="owner-wizard-step-card owner-wizard-review-card">
          <div className="owner-wizard-step-index">6</div>
          <div className="owner-wizard-step-content">
            <div className="owner-form-block-title">
              <strong>Önizleme ve Onay</strong>
              <span>Son kontrol</span>
            </div>
            <div className="owner-review-grid">
              <span>Mağaza <strong>{form.name || "Henüz girilmedi"}</strong></span>
              <span>Slug <strong>{branchSlugPreview}</strong></span>
              <span>Domain <strong>{form.domain || "Bekleniyor"}</strong></span>
              <span>Storefront URL <strong>{storefrontUrlPreview}</strong></span>
              <span>Admin URL <strong>{adminUrlPreview}</strong></span>
              <span>Standart <strong>{form.databaseMode === "full_supabase" ? "Legacy" : "Postgres + Logto + Umami + R2"}</strong></span>
              <span>Tema <strong>{form.theme}</strong></span>
              <span>Paket <strong>{form.packageDurationMonths || "1"} ay</strong></span>
            </div>
            <div className="expected-provisioning-list" aria-label="Beklenen provisioning adımları">
              {[
                "Store record created",
                "light_postgres DB/role/schema seeded",
                "R2 configured",
                "Logto admin/customer apps created",
                "Umami website configured",
                "storefront/admin branches generated",
                "Coolify apps created",
                "storefront/admin deployed",
                "public/customer/admin smoke passed",
                "final ready",
              ].map((step) => (
                <span key={step}>{step}</span>
              ))}
            </div>
            <details className="owner-technical-details">
              <summary>Teknik branch planı</summary>
              <div className="meta-pairs">
                <span>Admin branch: <strong>{adminBranchPreview}</strong></span>
                <span>Vitrin branch: <strong>{storefrontBranchPreview}</strong></span>
              </div>
            </details>
          </div>
        </section>
      </fieldset>

      {error ? <p className="form-error field-full">{error}</p> : null}
      {disabledReason ? <p className="form-notice form-notice-preview field-full">{disabledReason}</p> : null}

      <div className="owner-wizard-footer">
        <button type="button" className="button button-ghost" onClick={() => router.back()} disabled={isPending}>
          İptal
        </button>
        <div className="owner-wizard-footer-copy">
          <strong>{disabled ? "Önizleme Modu" : "Kurulum hazır"}</strong>
          <span>{disabled ? "Yazma işlemleri kapalı" : "Yeni mağaza kaydı oluşturulabilir"}</span>
        </div>
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
