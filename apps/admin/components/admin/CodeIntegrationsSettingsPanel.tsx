"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Globe,
  Save,
  Search,
  Share2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_STORE_CODE_INTEGRATIONS_SETTINGS,
  extractGoogleSearchConsoleVerification,
  extractGoogleTagManagerId,
  extractMetaPixelId,
  normalizeStoreCodeIntegrationsSettings,
  type StoreCodeIntegrationsSettings,
} from "@celebix/platform-config/src/code-integrations";

type FormField =
  | "googleTagManagerId"
  | "googleSearchConsoleVerification"
  | "metaPixelId"
  | "customHeadHtml"
  | "customBodyEndHtml";

type ValidationErrors = Partial<Record<FormField, string>>;

function IntegrationStatusChip({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] ${
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-[var(--admin-border)] bg-white text-[#9a7c67]"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          active ? "bg-emerald-500" : "bg-[#d8c2b0]"
        }`}
      />
      {label}
    </div>
  );
}

function validateSettings(
  settings: StoreCodeIntegrationsSettings,
): ValidationErrors {
  const errors: ValidationErrors = {};

  if (
    settings.googleTagManagerId &&
    !/^GTM-[A-Z0-9]+$/.test(settings.googleTagManagerId)
  ) {
    errors.googleTagManagerId = "Gecerli bir GTM ID girin. Ornek: GTM-XXXXXXX";
  }

  if (settings.metaPixelId && !/^\d{5,}$/.test(settings.metaPixelId)) {
    errors.metaPixelId = "Meta Pixel ID yalnizca rakamlardan olusmalidir.";
  }

  return errors;
}

function normalizeFieldValue(field: FormField, value: string) {
  switch (field) {
    case "googleTagManagerId":
      return extractGoogleTagManagerId(value);
    case "googleSearchConsoleVerification":
      return extractGoogleSearchConsoleVerification(value);
    case "metaPixelId":
      return extractMetaPixelId(value);
    default:
      return value.trim();
  }
}

function TextField({
  label,
  description,
  value,
  placeholder,
  error,
  onChange,
  onBlur,
}: {
  label: string;
  description: string;
  value: string;
  placeholder: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="rounded-[24px] border border-[var(--admin-border)] bg-white p-5 shadow-[0_8px_24px_rgba(17,24,39,0.05)]">
      <div className="space-y-1">
        <label className="text-sm font-semibold text-[var(--admin-heading)]">{label}</label>
        <p className="text-sm leading-6 text-[#8c7564]">{description}</p>
      </div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className={`mt-4 w-full rounded-2xl border px-4 py-3 text-sm text-[var(--admin-heading)] outline-none transition-all placeholder:text-[var(--admin-text-muted)] focus:ring-4 ${
          error
            ? "border-rose-300 bg-rose-50 focus:border-rose-400 focus:ring-rose-500/10"
            : "border-[var(--admin-border)] bg-white focus:border-[var(--admin-accent-border)] focus:ring-[rgba(255,106,0,0.12)]"
        }`}
      />
      {error ? <p className="mt-2 text-xs font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}

function TextareaField({
  label,
  description,
  value,
  placeholder,
  rows,
  onChange,
  onBlur,
}: {
  label: string;
  description: string;
  value: string;
  placeholder: string;
  rows: number;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="rounded-[24px] border border-[var(--admin-border)] bg-white p-5 shadow-[0_8px_24px_rgba(17,24,39,0.05)]">
      <div className="space-y-1">
        <label className="text-sm font-semibold text-[var(--admin-heading)]">{label}</label>
        <p className="text-sm leading-6 text-[#8c7564]">{description}</p>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={rows}
        className="mt-4 w-full resize-y rounded-2xl border border-[var(--admin-border)] bg-white px-4 py-3 text-sm leading-6 text-[var(--admin-heading)] outline-none transition-all placeholder:text-[var(--admin-text-muted)] focus:border-[var(--admin-accent-border)] focus:ring-4 focus:ring-[rgba(255,106,0,0.12)]"
      />
    </div>
  );
}

export function CodeIntegrationsSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<StoreCodeIntegrationsSettings>(
    DEFAULT_STORE_CODE_INTEGRATIONS_SETTINGS,
  );
  const [errors, setErrors] = useState<ValidationErrors>({});

  useEffect(() => {
    void fetchSettings();
  }, []);

  const activeCount = useMemo(() => {
    return [
      Boolean(formData.googleTagManagerId),
      Boolean(formData.googleSearchConsoleVerification),
      Boolean(formData.metaPixelId),
      Boolean(formData.customHeadHtml),
      Boolean(formData.customBodyEndHtml),
    ].filter(Boolean).length;
  }, [
    formData.customBodyEndHtml,
    formData.customHeadHtml,
    formData.googleSearchConsoleVerification,
    formData.googleTagManagerId,
    formData.metaPixelId,
  ]);

  async function fetchSettings() {
    setLoading(true);

    try {
      const response = await fetch("/api/settings?type=code-integrations", {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Kod entegrasyonlari yuklenemedi");
      }

      setFormData(
        normalizeStoreCodeIntegrationsSettings(payload.codeIntegrations),
      );
    } catch (error) {
      console.error("Failed to fetch code integrations:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Kod entegrasyonlari yuklenemedi",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleFieldChange(field: FormField, value: string) {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));

    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[field];
      return nextErrors;
    });
  }

  function handleFieldBlur(field: FormField) {
    setFormData((current) => ({
      ...current,
      [field]: normalizeFieldValue(field, current[field]),
    }));
  }

  async function handleSave() {
    const normalizedSettings = normalizeStoreCodeIntegrationsSettings(formData);
    const nextErrors = validateSettings(normalizedSettings);

    setFormData(normalizedSettings);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      toast.error("Lutfen hatali alanlari duzeltin.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "code-integrations",
          codeIntegrations: normalizedSettings,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Kod entegrasyonlari kaydedilemedi");
      }

      setFormData(normalizedSettings);
      toast.success("Kod entegrasyonlari kaydedildi");
    } catch (error) {
      console.error("Failed to save code integrations:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Kod entegrasyonlari kaydedilemedi",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-[30px] border border-[var(--admin-border)] bg-white/95 shadow-[0_18px_45px_rgba(105,78,54,0.08)]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--admin-border)] border-t-[var(--admin-accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[34px] border border-[var(--admin-border)] bg-white p-8 shadow-[var(--shadow-md)] md:p-10">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center rounded-full border border-[var(--admin-border)] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">
              SEO kod entegrasyonlari
            </div>
            <div className="mt-5 flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] border border-[var(--admin-accent-border)] bg-[var(--admin-accent)] text-white shadow-[var(--shadow-md)]">
                <Code2 className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--admin-heading)] md:text-4xl">
                  Kod Entegrasyonlari
                </h1>
                <p className="mt-3 text-sm leading-7 text-[#7f6858] md:text-base">
                  Google Tag Manager, Search Console ve Meta Pixel gibi kodlari
                  tek yerden yonetin. Dilerseniz tum sayfalar icin head veya body
                  sonuna ek kod da girebilirsiniz.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-[var(--admin-border)] bg-white/90 p-5 shadow-[var(--shadow-md)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-[var(--admin-border)] bg-[#fff4ea] text-[var(--admin-accent-hover)]">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--admin-heading)]">
                  {activeCount} aktif entegrasyon
                </p>
                <p className="text-sm text-[#8c7564]">
                  Bos alanlar pasif kalir, env fallback korunur.
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="hidden" />
      </section>

      <section className="rounded-[30px] border border-[var(--admin-border)] bg-white/95 p-6 shadow-[0_18px_45px_rgba(105,78,54,0.08)] md:p-8">
        <div className="flex flex-wrap gap-3">
          <IntegrationStatusChip label="GTM" active={Boolean(formData.googleTagManagerId)} />
          <IntegrationStatusChip
            label="Search Console"
            active={Boolean(formData.googleSearchConsoleVerification)}
          />
          <IntegrationStatusChip label="Meta Pixel" active={Boolean(formData.metaPixelId)} />
          <IntegrationStatusChip label="Head Kodu" active={Boolean(formData.customHeadHtml)} />
          <IntegrationStatusChip
            label="Body Sonu Kodu"
            active={Boolean(formData.customBodyEndHtml)}
          />
        </div>
      </section>

      <section className="rounded-[30px] border border-[var(--admin-border)] bg-white/95 p-6 shadow-[0_18px_45px_rgba(105,78,54,0.08)] md:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-[var(--admin-border)] bg-[#fff4ea] text-[var(--admin-accent-hover)]">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--admin-heading)]">
              Hazir Entegrasyonlar
            </h2>
            <p className="text-sm leading-6 text-[#8c7564]">
              Tam snippet yapistirabilirsiniz; sistem gerekli ID veya dogrulama
              kodunu ayiklar.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
          <TextField
            label="Google Tag Manager"
            description="GTM ID veya tam Tag Manager snippet yapistirabilirsiniz."
            value={formData.googleTagManagerId}
            placeholder="GTM-XXXXXXX"
            error={errors.googleTagManagerId}
            onChange={(value) => handleFieldChange("googleTagManagerId", value)}
            onBlur={() => handleFieldBlur("googleTagManagerId")}
          />

          <TextField
            label="Google Search Console"
            description="Meta etiketi veya sadece verification content degerini yapistirin."
            value={formData.googleSearchConsoleVerification}
            placeholder="google-site-verification content degeri"
            onChange={(value) =>
              handleFieldChange("googleSearchConsoleVerification", value)
            }
            onBlur={() => handleFieldBlur("googleSearchConsoleVerification")}
          />

          <TextField
            label="Meta Pixel"
            description="Meta Pixel ID veya yaygin pixel snippet yapistirabilirsiniz."
            value={formData.metaPixelId}
            placeholder="123456789012345"
            error={errors.metaPixelId}
            onChange={(value) => handleFieldChange("metaPixelId", value)}
            onBlur={() => handleFieldBlur("metaPixelId")}
          />
        </div>
      </section>

      <section className="rounded-[30px] border border-[var(--admin-border)] bg-white/95 p-6 shadow-[0_18px_45px_rgba(105,78,54,0.08)] md:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-[var(--admin-border)] bg-[#FCFDFE] text-[#7d6959]">
            <Share2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--admin-heading)]">
              Gelismis Kod Alanlari
            </h2>
            <p className="text-sm leading-6 text-[#8c7564]">
              Bu alanlara yapistirdiginiz kodlar storefront genelinde calisir.
              Ne yaptigindan emin olmadiginiz kodlari eklemeyin.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <TextareaField
            label="Head Kodu (Tum Sayfalar)"
            description="Meta, script, link veya benzeri kodlar icin genel head alani."
            value={formData.customHeadHtml}
            placeholder="<script>/* head kodunuz */</script>"
            rows={9}
            onChange={(value) => handleFieldChange("customHeadHtml", value)}
            onBlur={() => handleFieldBlur("customHeadHtml")}
          />
          <TextareaField
            label="Body Sonu Kodu (Tum Sayfalar)"
            description="Body kapanisina yakin calismasi gereken script veya noscript alanlari."
            value={formData.customBodyEndHtml}
            placeholder="<noscript>...</noscript>"
            rows={9}
            onChange={(value) => handleFieldChange("customBodyEndHtml", value)}
            onBlur={() => handleFieldBlur("customBodyEndHtml")}
          />
        </div>

        <div className="mt-5 rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Dikkat</p>
              <p className="mt-1">
                Bu kodlar admin alanina degil, sadece vitrine eklenir. Kaydedilen
                head ve body kodlari tum storefront sayfalarinda calisir.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-2xl bg-[var(--admin-accent)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(255,106,0,0.18)] transition-all duration-300 ease-out hover:bg-[var(--admin-accent-hover)] hover:translate-y-[-1px] disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
        >
          {saving ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Kod Entegrasyonlarini Kaydet
        </button>
      </div>

      <section className="rounded-[30px] border border-[var(--admin-border)] bg-[#2f241d] p-6 text-white shadow-[var(--shadow-md)]">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-white/10 bg-white/10 text-[#ffd2af]">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-[-0.02em]">
              Kullanim mantigi
            </p>
            <p className="mt-2 text-sm leading-6 text-[#ead9c9]">
              Hazir alanlari doldurursan sistem gerekli GTM, Search Console ve
              Meta Pixel etiketlerini kendisi basar. Gelismis alanlar ise ek
              ozellestirme gereken durumlar icindir.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
