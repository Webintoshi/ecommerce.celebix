"use client";

import { type ChangeEvent, type FormEvent, useState } from "react";
import {
  normalizeSelfServeStoreSlug,
  validateSelfServeStoreSlug,
} from "@/lib/self-serve-store-slug";
import {
  OwnerLifecycleStepper,
  OwnerSectionCard,
  OwnerStatusChip,
} from "@/components/owner-control";

interface SelfServeOnboardingDraftProps {
  enabled: boolean;
  disabledMessage: string;
}

interface DraftState {
  storeName: string;
  slug: string;
  industry: string;
  country: string;
  city: string;
  currency: string;
  language: string;
  timezone: string;
  themeType: string;
  productType: string;
  wantsDemoProducts: boolean;
}

const INITIAL_STATE: DraftState = {
  storeName: "",
  slug: "",
  industry: "",
  country: "Türkiye",
  city: "",
  currency: "TRY",
  language: "tr",
  timezone: "Europe/Istanbul",
  themeType: "clean-commerce",
  productType: "physical",
  wantsDemoProducts: true,
};

const READINESS_ITEMS = [
  { label: "Logto identity", detail: "Kimlik sağlayıcı; yetki kaynağı değil." },
  { label: "DB membership authority", detail: "Mağaza sahipliği Celebix platform DB'de tutulacak." },
  { label: "Durable job model", detail: "queueMicrotask yerine kalıcı provisioning job önerisi." },
  { label: "Platform subdomain", detail: "{slug}.celebix.shop hedef modeli." },
  { label: "Central admin", detail: "panel.celebix.co/stores/{slug} kısa vadeli admin hedefi." },
];

function getBooleanLabel(value: boolean): string {
  return value ? "Evet" : "Hayır";
}

export function SelfServeOnboardingDraft({
  enabled,
  disabledMessage,
}: SelfServeOnboardingDraftProps) {
  const [draft, setDraft] = useState(INITIAL_STATE);
  const slugValidation = validateSelfServeStoreSlug(draft.slug);
  const slugPreview = slugValidation.slug || "magaza-slug";
  const storefrontPreview = `https://${slugPreview}.celebix.shop`;
  const adminPreview = `https://panel.celebix.co/stores/${slugPreview}`;
  const provisioningDisabled = true;

  function updateField<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleStoreNameChange(event: ChangeEvent<HTMLInputElement>) {
    const nextName = event.target.value;
    setDraft((current) => ({
      ...current,
      storeName: nextName,
      slug: current.slug ? current.slug : normalizeSelfServeStoreSlug(nextName),
    }));
  }

  function handleSlugChange(event: ChangeEvent<HTMLInputElement>) {
    updateField("slug", normalizeSelfServeStoreSlug(event.target.value));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <div className="owner-wizard-shell">
      <aside className="owner-wizard-rail">
        <OwnerSectionCard
          title="Phase 0/1 güvenlik durumu"
          copy="Bu yüzey sadece self-serve onboarding modelini doğrulamak içindir."
          tone={enabled ? "warning" : "neutral"}
          actions={
            <>
              <OwnerStatusChip tone={enabled ? "warning" : "ink"}>
                {enabled ? "Flag açık" : "Flag kapalı"}
              </OwnerStatusChip>
              <OwnerStatusChip tone="danger">Provisioning kapalı</OwnerStatusChip>
            </>
          }
        >
          <OwnerLifecycleStepper
            steps={[
              { label: "Architecture docs", detail: "Karar kayıtları hazırlanır", state: "done" },
              { label: "Draft wizard", detail: "Canlı create yok", state: "current" },
              { label: "DB proposal", detail: "Apply edilmez", state: "pending" },
              { label: "Durable jobs", detail: "Sonraki faz", state: "pending" },
              { label: "Live provisioning", detail: "Bu fazda kapalı", state: "blocked" },
            ]}
          />
        </OwnerSectionCard>

        <OwnerSectionCard title="Authority ayrımı" copy="Logto kimliği sağlar; Celebix DB yetki verir.">
          <div className="preflight-checklist">
            {READINESS_ITEMS.map((item) => (
              <article key={item.label} className="is-ready">
                <span aria-hidden="true" />
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.detail}</p>
                </div>
                <OwnerStatusChip tone="success">Model</OwnerStatusChip>
              </article>
            ))}
          </div>
        </OwnerSectionCard>
      </aside>

      <form className="owner-create-wizard owner-wizard-form-panel" onSubmit={handleSubmit}>
        <fieldset className="preview-form-fieldset owner-wizard-fieldset">
          <section className="owner-wizard-step-card">
            <div className="owner-wizard-step-index">1</div>
            <div className="owner-wizard-step-content">
              <div className="owner-form-block-title">
                <strong>Platform hesabı</strong>
                <span>Identity ve authority ayrımı</span>
              </div>
              <p className="section-copy">
                Kullanıcı Logto ile kimlik kazanır; mağaza sahipliği ve admin yetkisi Celebix platform DB membership satırlarıyla verilir.
              </p>
              <div className="actions compact-actions wrap">
                <OwnerStatusChip tone="success">Logto identity provider</OwnerStatusChip>
                <OwnerStatusChip tone="ink">DB membership authority</OwnerStatusChip>
                <OwnerStatusChip tone="warning">Live create kapalı</OwnerStatusChip>
              </div>
            </div>
          </section>

          <section className="owner-wizard-step-card">
            <div className="owner-wizard-step-index">2</div>
            <div className="owner-wizard-step-content">
              <div className="owner-form-block-title">
                <strong>Mağaza bilgileri</strong>
                <span>Slug önerisi ve temel profil</span>
              </div>
              <div className="form-grid form-grid-2">
                <label className="field">
                  <span>Mağaza adı</span>
                  <input value={draft.storeName} onChange={handleStoreNameChange} placeholder="Atölye Nova" />
                </label>
                <label className="field">
                  <span>Slug</span>
                  <input value={draft.slug} onChange={handleSlugChange} placeholder="atolye-nova" />
                  {slugValidation.errors.length > 0 ? (
                    <small className="form-error">{slugValidation.errors[0]}</small>
                  ) : (
                    <small className="muted">Canlı duplicate check bu fazda yapılmaz.</small>
                  )}
                </label>
                <label className="field">
                  <span>Sektör</span>
                  <input value={draft.industry} onChange={(event) => updateField("industry", event.target.value)} placeholder="Moda, gıda, aksesuar" />
                </label>
                <label className="field">
                  <span>Ülke / şehir</span>
                  <input value={`${draft.country}${draft.city ? ` / ${draft.city}` : ""}`} readOnly />
                </label>
                <label className="field">
                  <span>Ülke</span>
                  <input value={draft.country} onChange={(event) => updateField("country", event.target.value)} />
                </label>
                <label className="field">
                  <span>Şehir</span>
                  <input value={draft.city} onChange={(event) => updateField("city", event.target.value)} placeholder="İstanbul" />
                </label>
              </div>
            </div>
          </section>

          <section className="owner-wizard-step-card">
            <div className="owner-wizard-step-index">3</div>
            <div className="owner-wizard-step-content">
              <div className="owner-form-block-title">
                <strong>Bölgesel ayarlar</strong>
                <span>Para birimi, dil ve saat dilimi</span>
              </div>
              <div className="form-grid form-grid-3">
                <label className="field">
                  <span>Para birimi</span>
                  <select value={draft.currency} onChange={(event) => updateField("currency", event.target.value)}>
                    <option value="TRY">TRY</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </label>
                <label className="field">
                  <span>Dil</span>
                  <select value={draft.language} onChange={(event) => updateField("language", event.target.value)}>
                    <option value="tr">Türkçe</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <label className="field">
                  <span>Saat dilimi</span>
                  <input value={draft.timezone} onChange={(event) => updateField("timezone", event.target.value)} />
                </label>
              </div>
            </div>
          </section>

          <section className="owner-wizard-step-card">
            <div className="owner-wizard-step-index">4</div>
            <div className="owner-wizard-step-content">
              <div className="owner-form-block-title">
                <strong>Başlangıç ayarı</strong>
                <span>Tema, ürün tipi ve demo içerik</span>
              </div>
              <div className="form-grid form-grid-3">
                <label className="field">
                  <span>Tema tipi</span>
                  <select value={draft.themeType} onChange={(event) => updateField("themeType", event.target.value)}>
                    <option value="clean-commerce">Clean commerce</option>
                    <option value="editorial">Editorial</option>
                    <option value="atelier">Atelier</option>
                  </select>
                </label>
                <label className="field">
                  <span>Ürün tipi</span>
                  <select value={draft.productType} onChange={(event) => updateField("productType", event.target.value)}>
                    <option value="physical">Fiziksel ürün</option>
                    <option value="digital">Dijital ürün</option>
                    <option value="service">Hizmet / rezervasyon</option>
                  </select>
                </label>
                <label className="field">
                  <span>Demo ürün</span>
                  <select
                    value={draft.wantsDemoProducts ? "yes" : "no"}
                    onChange={(event) => updateField("wantsDemoProducts", event.target.value === "yes")}
                  >
                    <option value="yes">İstiyorum</option>
                    <option value="no">İstemiyorum</option>
                  </select>
                </label>
              </div>
            </div>
          </section>

          <section className="owner-wizard-step-card owner-wizard-review-card">
            <div className="owner-wizard-step-index">5</div>
            <div className="owner-wizard-step-content">
              <div className="owner-form-block-title">
                <strong>Review</strong>
                <span>Önerilen runtime kimliği</span>
              </div>
              <div className="owner-review-grid">
                <span>Mağaza <strong>{draft.storeName || "Henüz girilmedi"}</strong></span>
                <span>Slug <strong>{slugPreview}</strong></span>
                <span>Storefront <strong>{storefrontPreview}</strong></span>
                <span>Admin <strong>{adminPreview}</strong></span>
                <span>Para birimi <strong>{draft.currency}</strong></span>
                <span>Dil <strong>{draft.language}</strong></span>
                <span>Demo ürün <strong>{getBooleanLabel(draft.wantsDemoProducts)}</strong></span>
                <span>Provisioning <strong>Bu fazda kapalı</strong></span>
              </div>
            </div>
          </section>
        </fieldset>

        <p className="form-notice form-notice-preview field-full">
          {enabled ? disabledMessage : "Feature flag kapalı. " + disabledMessage}
        </p>

        <div className="owner-wizard-footer">
          <button type="button" className="button button-ghost" disabled>
            Taslağı kaydet kapalı
          </button>
          <div className="owner-wizard-footer-copy">
            <strong>Provisioning bu fazda kapalı</strong>
            <span>Bu form hiçbir API mutation, store create veya canlı kaynak oluşturma işlemi yapmaz.</span>
          </div>
          <button type="submit" className="button button-primary button-preview-disabled" disabled={provisioningDisabled}>
            Mağazayı oluştur
          </button>
        </div>
      </form>
    </div>
  );
}
