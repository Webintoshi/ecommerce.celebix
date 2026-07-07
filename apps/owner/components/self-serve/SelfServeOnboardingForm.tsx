"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BUSINESS_TYPE_OPTIONS,
  DESIGN_PREFERENCE_OPTIONS,
  SECTOR_OPTIONS,
  SELF_SERVE_LAST_REQUEST_STORAGE_KEY,
  SELF_SERVE_REQUEST_STORAGE_KEY,
  createEmptySelfServeOnboardingInput,
  getSelfServeStatusLabel,
  type SelfServeApplicantInfo,
  type SelfServeOnboardingInput,
  type SelfServeOnboardingRequest,
} from "@/lib/self-serve-onboarding";
import type { SelfServeFeatureFlags } from "@/lib/self-serve-flags";
import { getSelfServeSlugIssue, normalizeSelfServeStoreSlug, suggestSelfServeStoreSlug } from "@/lib/self-serve-store-slug";

interface SelfServeOnboardingFormProps {
  flags: SelfServeFeatureFlags;
  applicantSession: Partial<SelfServeApplicantInfo> | null;
}

const STEPS = [
  { id: 1, title: "Basvuran", description: "Iletisim ve isletme bilgileri" },
  { id: 2, title: "Magaza", description: "Magaza kimligi ve varsayilanlar" },
  { id: 3, title: "Ihtiyaclar", description: "Domain, mail, urun tasima" },
  { id: 4, title: "Onay", description: "Ozet ve basvuru" },
];

function saveRequestToBrowserCache(request: SelfServeOnboardingRequest) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const existingRaw = window.localStorage.getItem(SELF_SERVE_REQUEST_STORAGE_KEY);
    const existing = existingRaw ? (JSON.parse(existingRaw) as SelfServeOnboardingRequest[]) : [];
    const next = [request, ...existing.filter((item) => item.id !== request.id)].slice(0, 25);

    window.localStorage.setItem(SELF_SERVE_REQUEST_STORAGE_KEY, JSON.stringify(next));
    window.localStorage.setItem(SELF_SERVE_LAST_REQUEST_STORAGE_KEY, JSON.stringify(request));
  } catch {
    // Browser cache is only a safe preview convenience; submit already succeeded server-side.
  }
}

export function SelfServeOnboardingForm({ flags, applicantSession }: SelfServeOnboardingFormProps) {
  const [step, setStep] = useState(1);
  const [slugTouched, setSlugTouched] = useState(false);
  const [draft, setDraft] = useState<SelfServeOnboardingInput>(() =>
    createEmptySelfServeOnboardingInput(applicantSession),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (slugTouched) {
      return;
    }

    setDraft((current) => ({
      ...current,
      store: {
        ...current.store,
        slug: suggestSelfServeStoreSlug(current.store.storeName),
      },
    }));
  }, [draft.store.storeName, slugTouched]);

  const slugIssue = useMemo(() => getSelfServeSlugIssue(draft.store.slug), [draft.store.slug]);

  const canContinue =
    step === 1
      ? Boolean(draft.applicant.fullName && draft.applicant.email && draft.applicant.phone && draft.business.businessName)
      : step === 2
        ? Boolean(draft.store.storeName && draft.store.slug && !slugIssue)
        : step === 3
          ? Boolean(draft.needs.approximateProductCount && draft.needs.designPreference)
          : Boolean(draft.termsAccepted && draft.privacyAccepted);

  function updateApplicant(field: keyof SelfServeOnboardingInput["applicant"], value: string) {
    setDraft((current) => ({ ...current, applicant: { ...current.applicant, [field]: value } }));
  }

  function updateBusiness(field: keyof SelfServeOnboardingInput["business"], value: string) {
    setDraft((current) => ({ ...current, business: { ...current.business, [field]: value } }));
  }

  function updateStore(field: keyof SelfServeOnboardingInput["store"], value: string) {
    setDraft((current) => ({ ...current, store: { ...current.store, [field]: value } }));
  }

  function updateNeed(field: keyof SelfServeOnboardingInput["needs"], value: boolean | string) {
    setDraft((current) => ({ ...current, needs: { ...current.needs, [field]: value } }));
  }

  async function submitRequest() {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/self-serve/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draft),
      });
      const payload = (await response.json()) as {
        request?: SelfServeOnboardingRequest;
        errors?: string[];
        message?: string;
      };

      if (!response.ok || !payload.request) {
        setError(payload.errors?.join(" ") || payload.message || "Basvuru kaydedilemedi.");
        return;
      }

      saveRequestToBrowserCache(payload.request);
      window.location.assign(`/onboarding/status?id=${encodeURIComponent(payload.request.id)}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Basvuru kaydedilemedi.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!flags.signupEnabled) {
    return (
      <section className="self-serve-card self-serve-card-center">
        <span className="pill pill-accent">Basvuru kapali</span>
        <h1>Self-serve basvuru akisi su anda aktif degil.</h1>
        <p>Bu bayrak kapaliyken kullanicilar yanlislikla magaza basvurusu olusturamaz.</p>
      </section>
    );
  }

  return (
    <div className="self-serve-flow">
      <aside className="self-serve-stepper" aria-label="Basvuru adimlari">
        {STEPS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`self-serve-step ${step === item.id ? "is-active" : ""} ${step > item.id ? "is-complete" : ""}`}
            onClick={() => setStep(item.id)}
          >
            <span>{item.id}</span>
            <strong>{item.title}</strong>
            <small>{item.description}</small>
          </button>
        ))}
      </aside>

      <section className="self-serve-card">
        <div className="self-serve-card-head">
          <div>
            <span className="pill pill-accent">Kontrollu self-serve</span>
            <h1>{STEPS[step - 1].title}</h1>
            <p>{STEPS[step - 1].description}</p>
          </div>
          <span className="pill">Adim {step}/4</span>
        </div>

        {applicantSession?.email ? null : (
          <div className="self-serve-notice">
            <strong>Logto oturumu bekleniyor.</strong>
            <span>
              Basvuruya baslamadan once Logto ile giris/kayit akisi onerilir. Bu form Supabase Auth kullanmaz.
            </span>
            <a className="button button-secondary" href="/api/self-serve/auth/start?returnTo=/onboarding">
              Logto ile devam et
            </a>
          </div>
        )}

        {step === 1 ? (
          <div className="form-grid form-grid-2">
            <label className="field">
              <span>Ad soyad</span>
              <input value={draft.applicant.fullName} onChange={(event) => updateApplicant("fullName", event.target.value)} />
            </label>
            <label className="field">
              <span>E-posta</span>
              <input type="email" value={draft.applicant.email} onChange={(event) => updateApplicant("email", event.target.value)} />
            </label>
            <label className="field">
              <span>Telefon</span>
              <input value={draft.applicant.phone} onChange={(event) => updateApplicant("phone", event.target.value)} />
            </label>
            <label className="field">
              <span>Isletme adi</span>
              <input value={draft.business.businessName} onChange={(event) => updateBusiness("businessName", event.target.value)} />
            </label>
            <label className="field field-full">
              <span>Isletme turu</span>
              <select value={draft.business.businessType} onChange={(event) => updateBusiness("businessType", event.target.value)}>
                {BUSINESS_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="form-grid form-grid-2">
            <label className="field">
              <span>Magaza adi</span>
              <input value={draft.store.storeName} onChange={(event) => updateStore("storeName", event.target.value)} />
            </label>
            <label className="field">
              <span>Suggested slug</span>
              <input
                value={draft.store.slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  updateStore("slug", normalizeSelfServeStoreSlug(event.target.value));
                }}
              />
              {slugIssue ? <small className="form-error">{slugIssue}</small> : <small>Canli duplicate check bu fazda calismaz.</small>}
            </label>
            <label className="field">
              <span>Sektor</span>
              <select value={draft.store.sector} onChange={(event) => updateStore("sector", event.target.value)}>
                {SECTOR_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Varsayilan dil</span>
              <select value={draft.store.defaultLanguage} onChange={(event) => updateStore("defaultLanguage", event.target.value)}>
                <option value="tr">Turkce</option>
                <option value="en">Ingilizce</option>
              </select>
            </label>
            <label className="field">
              <span>Para birimi</span>
              <input value="TRY" disabled />
            </label>
            <label className="field">
              <span>Iletisim e-postasi</span>
              <input type="email" value={draft.store.contactEmail} onChange={(event) => updateStore("contactEmail", event.target.value)} />
            </label>
            <label className="field">
              <span>Iletisim telefonu</span>
              <input value={draft.store.contactPhone} onChange={(event) => updateStore("contactPhone", event.target.value)} />
            </label>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="self-serve-choice-grid">
            {[
              ["hasDomain", "Domainim var"],
              ["wantsDomain", "Domain isterim"],
              ["wantsCorporateEmail", "Kurumsal mail isterim"],
              ["wantsProductMigration", "Urun tasima isterim"],
            ].map(([field, label]) => (
              <label key={field} className="self-serve-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(draft.needs[field as keyof SelfServeOnboardingInput["needs"]])}
                  onChange={(event) => updateNeed(field as keyof SelfServeOnboardingInput["needs"], event.target.checked)}
                />
                <span>{label}</span>
              </label>
            ))}
            <label className="field">
              <span>Yaklasik urun sayisi</span>
              <select value={draft.needs.approximateProductCount} onChange={(event) => updateNeed("approximateProductCount", event.target.value)}>
                <option value="1-50">1-50</option>
                <option value="51-250">51-250</option>
                <option value="251-1000">251-1000</option>
                <option value="1000+">1000+</option>
              </select>
            </label>
            <label className="field">
              <span>Tasarim tercihi</span>
              <select value={draft.needs.designPreference} onChange={(event) => updateNeed("designPreference", event.target.value)}>
                {DESIGN_PREFERENCE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="self-serve-summary">
            <div>
              <span>Basvuran</span>
              <strong>{draft.applicant.fullName || "Eksik"}</strong>
              <p>{draft.applicant.email || "E-posta bekleniyor"} · {draft.applicant.phone || "Telefon bekleniyor"}</p>
            </div>
            <div>
              <span>Magaza</span>
              <strong>{draft.store.storeName || "Eksik"}</strong>
              <p>{draft.store.slug || "slug-yok"} · {draft.store.sector}</p>
            </div>
            <div>
              <span>Durum</span>
              <strong>{getSelfServeStatusLabel("pending_owner_approval")}</strong>
              <p>Store create ve provisioning bu fazda kapali.</p>
            </div>
            <label className="self-serve-check">
              <input
                type="checkbox"
                checked={draft.termsAccepted}
                onChange={(event) => setDraft((current) => ({ ...current, termsAccepted: event.target.checked }))}
              />
              <span>Kullanim sartlarini kabul ediyorum.</span>
            </label>
            <label className="self-serve-check">
              <input
                type="checkbox"
                checked={draft.privacyAccepted}
                onChange={(event) => setDraft((current) => ({ ...current, privacyAccepted: event.target.checked }))}
              />
              <span>Gizlilik ve KVKK bilgilendirmesini kabul ediyorum.</span>
            </label>
          </div>
        ) : null}

        {error ? <p className="form-error self-serve-form-error">{error}</p> : null}

        <div className="self-serve-actions">
          <button className="button button-secondary" type="button" disabled={step === 1 || isSubmitting} onClick={() => setStep((current) => Math.max(1, current - 1))}>
            Geri
          </button>
          {step < 4 ? (
            <button className="button button-primary" type="button" disabled={!canContinue} onClick={() => setStep((current) => Math.min(4, current + 1))}>
              Devam et
            </button>
          ) : (
            <button className="button button-primary" type="button" disabled={!canContinue || isSubmitting} onClick={submitRequest}>
              {isSubmitting ? "Gonderiliyor..." : "Basvuruyu gonder"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
