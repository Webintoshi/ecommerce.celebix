"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Globe,
  Save,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import {
  AdminActionButton,
  AdminLoadingState,
  AdminPageHeader,
  AdminPageShell,
} from "@/components/admin/AdminPageShell";
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
      className={`inline-flex items-center gap-2 rounded-[8px] border px-3 py-1.5 text-xs font-semibold ${
        active
          ? "border-[#BFE8CE] bg-[#EAF8EF] text-[#16A34A]"
          : "border-[#DCE3EC] bg-[#F9F9F9] text-[#667085]"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          active ? "bg-[#16A34A]" : "bg-[#C9D2DD]"
        }`}
      />
      {label}
    </div>
  );
}

function MetricCell({ label, value, context }: { label: string; value: string; context: string }) {
  return (
    <div className="bg-white px-4 py-4 sm:px-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7D8795]">{label}</p>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-3xl font-semibold leading-none tracking-[-0.04em] text-[#111827]">{value}</span>
        <span className="pb-1 text-sm font-medium text-[#667085]">{context}</span>
      </div>
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
    errors.googleTagManagerId = "Geçerli bir GTM ID girin. Örnek: GTM-XXXXXXX";
  }

  if (settings.metaPixelId && !/^\d{5,}$/.test(settings.metaPixelId)) {
    errors.metaPixelId = "Meta Pixel ID yalnızca rakamlardan oluşmalıdır.";
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
    <div className="rounded-[12px] border border-[var(--admin-border)] bg-white p-5 shadow-[0_8px_24px_rgba(17,24,39,0.05)]">
      <div className="space-y-1">
        <label className="text-sm font-semibold text-[var(--admin-heading)]">{label}</label>
        <p className="text-sm leading-6 text-[#667085]">{description}</p>
      </div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className={`mt-4 w-full rounded-[8px] border px-4 py-3 text-sm text-[var(--admin-heading)] outline-none transition-all placeholder:text-[var(--admin-text-muted)] focus:ring-4 ${
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
    <div className="rounded-[12px] border border-[var(--admin-border)] bg-white p-5 shadow-[0_8px_24px_rgba(17,24,39,0.05)]">
      <div className="space-y-1">
        <label className="text-sm font-semibold text-[var(--admin-heading)]">{label}</label>
        <p className="text-sm leading-6 text-[#667085]">{description}</p>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={rows}
        className="mt-4 w-full resize-y rounded-[8px] border border-[var(--admin-border)] bg-white px-4 py-3 text-sm leading-6 text-[var(--admin-heading)] outline-none transition-all placeholder:text-[var(--admin-text-muted)] focus:border-[var(--admin-accent-border)] focus:ring-4 focus:ring-[rgba(255,106,0,0.12)]"
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
        throw new Error(payload.error || "Kod entegrasyonları yüklenemedi");
      }

      setFormData(
        normalizeStoreCodeIntegrationsSettings(payload.codeIntegrations),
      );
    } catch (error) {
      console.error("Failed to fetch code integrations:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Kod entegrasyonları yüklenemedi",
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
      toast.error("Lütfen hatalı alanları düzeltin.");
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
        throw new Error(payload.error || "Kod entegrasyonları kaydedilemedi");
      }

      setFormData(normalizedSettings);
      toast.success("Kod entegrasyonları kaydedildi");
    } catch (error) {
      console.error("Failed to save code integrations:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Kod entegrasyonları kaydedilemedi",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <AdminLoadingState label="Kod entegrasyonları yükleniyor" />;
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        sectionLabel="SEO"
        title="Kod entegrasyonları"
        description="GTM, Search Console ve Pixel kodlarını yönetin."
        actions={
          <AdminActionButton type="button" tone="primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Kaydet
          </AdminActionButton>
        }
        metrics={
          <>
            <MetricCell label="Aktif" value={String(activeCount)} context="entegrasyon" />
            <MetricCell label="GTM" value={formData.googleTagManagerId ? "Var" : "Yok"} context="etiket" />
            <MetricCell label="Search" value={formData.googleSearchConsoleVerification ? "Var" : "Yok"} context="console" />
            <MetricCell label="Pixel" value={formData.metaPixelId ? "Var" : "Yok"} context="meta" />
          </>
        }
      />

      <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_10px_28px_rgba(16,24,40,0.04)]">
        <div className="border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#182232]">Durum</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-wrap gap-2 p-4">
            <IntegrationStatusChip label="GTM" active={Boolean(formData.googleTagManagerId)} />
            <IntegrationStatusChip
              label="Search Console"
              active={Boolean(formData.googleSearchConsoleVerification)}
            />
            <IntegrationStatusChip label="Meta Pixel" active={Boolean(formData.metaPixelId)} />
            <IntegrationStatusChip label="Head kodu" active={Boolean(formData.customHeadHtml)} />
            <IntegrationStatusChip
              label="Body sonu"
              active={Boolean(formData.customBodyEndHtml)}
            />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_10px_28px_rgba(16,24,40,0.04)]">
        <div className="flex items-center gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#FFC7A8] bg-[#FFF4EC] text-[#FF6A00]">
            <Globe className="h-5 w-5" />
          </span>
          <h2 className="text-sm font-semibold text-[#182232]">Hazır entegrasyonlar</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-3">
          <TextField
            label="Google Tag Manager"
            description="GTM ID veya Tag Manager snippet girin."
            value={formData.googleTagManagerId}
            placeholder="GTM-XXXXXXX"
            error={errors.googleTagManagerId}
            onChange={(value) => handleFieldChange("googleTagManagerId", value)}
            onBlur={() => handleFieldBlur("googleTagManagerId")}
          />

          <TextField
            label="Google Search Console"
            description="Meta etiketi veya doğrulama kodu girin."
            value={formData.googleSearchConsoleVerification}
            placeholder="google-site-verification content değeri"
            onChange={(value) =>
              handleFieldChange("googleSearchConsoleVerification", value)
            }
            onBlur={() => handleFieldBlur("googleSearchConsoleVerification")}
          />

          <TextField
            label="Meta Pixel"
            description="Meta Pixel ID veya pixel snippet girin."
            value={formData.metaPixelId}
            placeholder="123456789012345"
            error={errors.metaPixelId}
            onChange={(value) => handleFieldChange("metaPixelId", value)}
            onBlur={() => handleFieldBlur("metaPixelId")}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_10px_28px_rgba(16,24,40,0.04)]">
        <div className="flex items-center gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white text-[#7D8795]">
            <Share2 className="h-5 w-5" />
          </span>
          <h2 className="text-sm font-semibold text-[#182232]">Gelişmiş kod alanları</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-2">
          <TextareaField
            label="Head kodu"
            description="Tüm sayfalar için head alanı."
            value={formData.customHeadHtml}
            placeholder="<script>/* head kodunuz */</script>"
            rows={9}
            onChange={(value) => handleFieldChange("customHeadHtml", value)}
            onBlur={() => handleFieldBlur("customHeadHtml")}
          />
          <TextareaField
            label="Body sonu kodu"
            description="Body kapanışına yakın çalışan kodlar."
            value={formData.customBodyEndHtml}
            placeholder="<noscript>...</noscript>"
            rows={9}
            onChange={(value) => handleFieldChange("customBodyEndHtml", value)}
            onBlur={() => handleFieldBlur("customBodyEndHtml")}
          />
        </div>

        <div className="mx-4 mb-4 rounded-[10px] border border-[#FFC7A8] bg-[#FFF4EC] p-4 text-sm leading-6 text-[#C24D00]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Dikkat</p>
              <p className="mt-1">
                Bu kodlar admin alanına değil, sadece vitrine eklenir.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[12px] border border-[#DCE3EC] bg-white px-4 py-3 shadow-[0_10px_28px_rgba(16,24,40,0.04)]">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[#BFE8CE] bg-[#EAF8EF] text-[#16A34A]">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[#182232]">Kullanım mantığı</p>
            <p className="mt-1 text-sm leading-6 text-[#667085]">
              Hazır alanlar otomatik etiket üretir; gelişmiş alanlar ek kod ihtiyacı içindir.
            </p>
          </div>
        </div>
      </section>
    </AdminPageShell>
  );
}
