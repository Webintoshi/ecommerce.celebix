"use client";

import { useEffect, useMemo, useState, type ElementType } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Globe2,
  Languages,
  Loader2,
  Save,
  Search,
  ShoppingBag,
  Type,
} from "lucide-react";
import { toast } from "sonner";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/AdminPageShell";
import {
  DEFAULT_STORE_TRANSLATION_SETTINGS,
  normalizeStoreTranslationSettings,
  type StoreTranslationLocale,
  type StoreTranslationSettings,
} from "@celebix/platform-config/src/translation";

type TranslationSettingsResponse = {
  success?: boolean;
  hasEnvKey?: boolean;
  translationSettings?: Partial<StoreTranslationSettings> | null;
  error?: string;
};

type TranslationWarmupScope = "products" | "categories" | "all";

type TranslationWarmupResponse = {
  success?: boolean;
  summary?: {
    locale: Exclude<StoreTranslationLocale, "tr">;
    scope: TranslationWarmupScope;
    productsProcessed: number;
    categoriesProcessed: number;
    newCacheEntries: number;
  };
  error?: string;
};

type TranslationHealthResponse = {
  success?: boolean;
  summary?: {
    locale: Exclude<StoreTranslationLocale, "tr">;
    sourceLocale: StoreTranslationLocale;
    ready: boolean;
    probeSucceeded: boolean;
    enabled: boolean;
    translateCatalog: boolean;
    translateSeo: boolean;
    hasApiKey: boolean;
    localeEnabled: boolean;
    supportedLocale: boolean;
    productsAvailable: number;
    categoriesAvailable: number;
    reasons: string[];
    sampleProduct?: {
      sourceText: string;
      translatedText: string;
      changed: boolean;
    };
    sampleCategory?: {
      sourceText: string;
      translatedText: string;
      changed: boolean;
    };
  };
  error?: string;
};

const TARGET_LOCALE_OPTIONS: Array<{
  locale: Exclude<StoreTranslationLocale, "tr">;
  label: string;
  path: string;
}> = [
  { locale: "en", label: "İngilizce", path: "/en" },
  { locale: "de", label: "Almanca", path: "/de" },
  { locale: "ru", label: "Rusça", path: "/ru" },
  { locale: "ar", label: "Arapça", path: "/ar" },
  { locale: "ka", label: "Gürcüce", path: "/ka" },
];

const PANEL_CLASS =
  "overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]";

const PANEL_HEADER_CLASS =
  "border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 xl:px-5";

const FIELD_CLASS =
  "h-11 w-full rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm text-[#111827] outline-none transition placeholder:text-[#8B95A5] focus:border-[#FFD1B5] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]";

const PRIMARY_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.16)] transition hover:bg-[#E85D04] disabled:cursor-not-allowed disabled:opacity-55";

const SECONDARY_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-4 text-sm font-semibold text-[#374151] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] disabled:cursor-not-allowed disabled:opacity-55";

const LABEL_CLASS = "block text-sm font-semibold text-[#374151]";

function SwitchControl({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex h-6 w-11 items-center rounded-full p-1 transition ${
        enabled ? "bg-[#FF6A00]" : "bg-[#CBD5E1]"
      }`}
    >
      <span
        className={`h-4 w-4 rounded-full bg-white shadow transition ${
          enabled ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </span>
  );
}

function ToggleCard({
  title,
  enabled,
  onToggle,
  icon: Icon,
}: {
  title: string;
  enabled: boolean;
  onToggle: () => void;
  icon: ElementType;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-[10px] border px-4 py-3 text-left transition ${
        enabled
          ? "border-[#FFD1B5] bg-[#FFF8F3] text-[#E85D04]"
          : "border-[#DCE3EC] bg-white text-[#374151] hover:border-[#FFD1B5] hover:bg-[#FFF8F3]"
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] border ${
          enabled ? "border-[#FFD1B5] bg-white text-[#FF6A00]" : "border-[#DCE3EC] bg-[#F9F9F9] text-[#6B7280]"
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{title}</p>
          <SwitchControl enabled={enabled} />
        </div>
      </div>
    </button>
  );
}

function MetricCell({
  label,
  value,
  context,
  tone = "neutral",
}: {
  label: string;
  value: string;
  context: string;
  tone?: "neutral" | "accent" | "success" | "warning";
}) {
  return (
    <div className="min-h-[92px] bg-white px-4 py-3.5 xl:px-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280]">{label}</p>
        <span
          className={`h-2 w-2 rounded-full ${
            tone === "success"
              ? "bg-emerald-500"
              : tone === "warning"
                ? "bg-amber-500"
                : tone === "accent"
                  ? "bg-[#FF6A00]"
                  : "bg-[#94A3B8]"
          }`}
        />
      </div>
      <p className="mt-3 truncate text-2xl font-semibold tracking-[-0.04em] text-[#111827]">{value}</p>
      <p className="mt-1 truncate text-xs font-medium text-[#6B7280]">{context}</p>
    </div>
  );
}

export function TranslationSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [warmingUp, setWarmingUp] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [hasEnvKey, setHasEnvKey] = useState(false);
  const [settings, setSettings] = useState<StoreTranslationSettings>(DEFAULT_STORE_TRANSLATION_SETTINGS);
  const [warmupLocale, setWarmupLocale] = useState<Exclude<StoreTranslationLocale, "tr">>("en");
  const [warmupScope, setWarmupScope] = useState<TranslationWarmupScope>("all");
  const [warmupSummary, setWarmupSummary] = useState<TranslationWarmupResponse["summary"] | null>(null);
  const [healthSummary, setHealthSummary] = useState<TranslationHealthResponse["summary"] | null>(null);

  useEffect(() => {
    void loadSettings();
  }, []);

  const activeLocaleSummary = useMemo(() => {
    return TARGET_LOCALE_OPTIONS.filter((option) => settings.enabledLocales.includes(option.locale))
      .map((option) => option.label)
      .join(", ");
  }, [settings.enabledLocales]);

  async function loadSettings() {
    setLoading(true);
    try {
      const response = await fetch("/api/settings?type=translation", { cache: "no-store" });
      const payload = (await response.json()) as TranslationSettingsResponse;

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Çeviri ayarları alınamadı");
      }

      const normalizedSettings = normalizeStoreTranslationSettings(
        payload.translationSettings,
        DEFAULT_STORE_TRANSLATION_SETTINGS,
      );
      const nextWarmupLocale =
        normalizedSettings.enabledLocales.find(
          (locale): locale is Exclude<StoreTranslationLocale, "tr"> => locale !== "tr",
        ) || "en";

      setSettings(normalizedSettings);
      setWarmupLocale((current) =>
        normalizedSettings.enabledLocales.includes(current) ? current : nextWarmupLocale,
      );
      setHasEnvKey(Boolean(payload.hasEnvKey));
    } catch (error) {
      console.error("Failed to fetch translation settings:", error);
      toast.error("Çeviri ayarları yüklenemedi");
    } finally {
      setLoading(false);
    }
  }

  function updateSettings(
    updater: (current: StoreTranslationSettings) => StoreTranslationSettings,
  ) {
    setSettings((current) => normalizeStoreTranslationSettings(updater(current)));
  }

  function toggleLocale(locale: Exclude<StoreTranslationLocale, "tr">) {
    updateSettings((current) => {
      const nextLocales = current.enabledLocales.includes(locale)
        ? current.enabledLocales.filter((entry) => entry !== locale)
        : [...current.enabledLocales, locale];

      return {
        ...current,
        enabledLocales: nextLocales,
      };
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "translation",
          translationSettings: settings,
        }),
      });

      const payload = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Çeviri ayarları kaydedilemedi");
      }

      toast.success("Çeviri ayarları güncellendi");
    } catch (error) {
      console.error("Failed to save translation settings:", error);
      toast.error(error instanceof Error ? error.message : "Çeviri ayarları kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  async function handleWarmup() {
    setWarmingUp(true);
    setWarmupSummary(null);

    try {
      const response = await fetch("/api/admin/translations/catalog-warmup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locale: warmupLocale,
          scope: warmupScope,
        }),
      });

      const payload = (await response.json()) as TranslationWarmupResponse;

      if (!response.ok || !payload.success || !payload.summary) {
        throw new Error(payload.error || "Katalog hazırlığı başarısız.");
      }

      setWarmupSummary(payload.summary);
      toast.success("Katalog çevirisi hazırlandı");
    } catch (error) {
      console.error("Catalog translation warm-up failed:", error);
      toast.error(error instanceof Error ? error.message : "Katalog hazırlığı başarısız.");
    } finally {
      setWarmingUp(false);
    }
  }

  async function handleHealthCheck() {
    setCheckingHealth(true);
    setHealthSummary(null);

    try {
      const response = await fetch("/api/admin/translations/catalog-health", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locale: warmupLocale,
        }),
      });

      const payload = (await response.json()) as TranslationHealthResponse;

      if (!response.ok || !payload.success || !payload.summary) {
        throw new Error(payload.error || "Katalog sağlık kontrolü başarısız.");
      }

      setHealthSummary(payload.summary);
      toast.success("Katalog çeviri sağlığı kontrol edildi");
    } catch (error) {
      console.error("Catalog translation health check failed:", error);
      toast.error(error instanceof Error ? error.message : "Katalog sağlık kontrolü başarısız.");
    } finally {
      setCheckingHealth(false);
    }
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        sectionLabel="Ayarlar"
        title="Dil ayarları"
        description="Çeviri dillerini ve katalog hazırlığını yönetin."
        actions={
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || loading}
            className={PRIMARY_BUTTON}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Kaydet
          </button>
        }
        metrics={
          <>
            <MetricCell
              label="Durum"
              value={settings.enabled ? "Açık" : "Kapalı"}
              context="canlı çeviri"
              tone={settings.enabled ? "accent" : "neutral"}
            />
            <MetricCell
              label="Dil"
              value={String(settings.enabledLocales.length)}
              context="hedef"
              tone={settings.enabledLocales.length > 0 ? "success" : "warning"}
            />
            <MetricCell
              label="DeepL"
              value={hasEnvKey || settings.apiKey ? "Hazır" : "Eksik"}
              context="anahtar"
              tone={hasEnvKey || settings.apiKey ? "success" : "warning"}
            />
            <MetricCell
              label="Katalog"
              value={settings.translateCatalog ? "Açık" : "Kapalı"}
              context="çeviri"
              tone={settings.translateCatalog ? "accent" : "neutral"}
            />
          </>
        }
      />

      {loading ? (
        <section className={PANEL_CLASS}>
          <div className="flex min-h-[220px] items-center justify-center gap-3 text-sm font-medium text-[#6B7280]">
            <Loader2 className="h-4 w-4 animate-spin text-[#FF6A00]" />
            Dil ayarları yükleniyor...
          </div>
        </section>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <section className={PANEL_CLASS}>
              <div className={PANEL_HEADER_CLASS}>
                <div className="flex items-center gap-2">
                  <Languages className="h-4 w-4 text-[#FF6A00]" />
                  <h2 className="text-sm font-semibold text-[#111827]">Canlı çeviri</h2>
                </div>
              </div>
              <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_260px] xl:p-5">
                <label className={LABEL_CLASS}>
                  DeepL API anahtarı
                  <input
                    type="password"
                    value={settings.apiKey || ""}
                    onChange={(event) =>
                      updateSettings((current) => ({
                        ...current,
                        apiKey: event.target.value,
                      }))
                    }
                    placeholder="API anahtarı"
                    className={`mt-2 ${FIELD_CLASS}`}
                  />
                  {hasEnvKey ? (
                    <span className="mt-2 block text-xs font-medium text-[#6B7280]">
                      Sunucu anahtarı tanımlı.
                    </span>
                  ) : null}
                </label>

                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-[10px] border border-[#DCE3EC] bg-[#F9F9F9] px-4 py-3">
                  <input
                    type="checkbox"
                    checked={settings.enabled}
                    onChange={(event) =>
                      updateSettings((current) => ({
                        ...current,
                        enabled: event.target.checked,
                      }))
                    }
                    className="sr-only"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[#111827]">Canlı çeviri</span>
                    <span className="mt-1 block text-xs font-medium text-[#6B7280]">
                      {settings.enabled ? "Aktif" : "Kapalı"}
                    </span>
                  </span>
                  <SwitchControl enabled={settings.enabled} />
                </label>
              </div>
            </section>

            <section className={PANEL_CLASS}>
              <div className={PANEL_HEADER_CLASS}>
                <h2 className="text-sm font-semibold text-[#111827]">Hedef diller</h2>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5 xl:p-5">
                {TARGET_LOCALE_OPTIONS.map((option) => {
                  const enabled = settings.enabledLocales.includes(option.locale);
                  return (
                    <button
                      key={option.locale}
                      type="button"
                      onClick={() => toggleLocale(option.locale)}
                      className={`rounded-[10px] border px-4 py-3 text-left transition ${
                        enabled
                          ? "border-[#FFD1B5] bg-[#FFF8F3] text-[#E85D04]"
                          : "border-[#DCE3EC] bg-white text-[#374151] hover:border-[#FFD1B5] hover:bg-[#FFF8F3]"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{option.label}</span>
                        {enabled ? <Check className="h-4 w-4" /> : null}
                      </span>
                      <span className="mt-1 block text-xs font-medium text-[#6B7280]">{option.path}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className={PANEL_CLASS}>
              <div className={PANEL_HEADER_CLASS}>
                <h2 className="text-sm font-semibold text-[#111827]">Çeviri alanları</h2>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-3 xl:p-5">
                <ToggleCard
                  title="Katalog"
                  enabled={settings.translateCatalog}
                  onToggle={() =>
                    updateSettings((current) => ({
                      ...current,
                      translateCatalog: !current.translateCatalog,
                    }))
                  }
                  icon={ShoppingBag}
                />
                <ToggleCard
                  title="SEO"
                  enabled={settings.translateSeo}
                  onToggle={() =>
                    updateSettings((current) => ({
                      ...current,
                      translateSeo: !current.translateSeo,
                    }))
                  }
                  icon={Search}
                />
                <ToggleCard
                  title="Arayüz"
                  enabled={settings.translateUi}
                  onToggle={() =>
                    updateSettings((current) => ({
                      ...current,
                      translateUi: !current.translateUi,
                    }))
                  }
                  icon={Type}
                />
              </div>
            </section>

            <section className={PANEL_CLASS}>
              <div className={PANEL_HEADER_CLASS}>
                <h2 className="text-sm font-semibold text-[#111827]">Katalog hazırlığı</h2>
              </div>
              <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] md:items-end xl:p-5">
                <label className={LABEL_CLASS}>
                  Hedef dil
                  <select
                    value={warmupLocale}
                    onChange={(event) =>
                      setWarmupLocale(event.target.value as Exclude<StoreTranslationLocale, "tr">)
                    }
                    className={`mt-2 ${FIELD_CLASS}`}
                  >
                    {TARGET_LOCALE_OPTIONS.map((option) => (
                      <option key={option.locale} value={option.locale}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={LABEL_CLASS}>
                  Kapsam
                  <select
                    value={warmupScope}
                    onChange={(event) => setWarmupScope(event.target.value as TranslationWarmupScope)}
                    className={`mt-2 ${FIELD_CLASS}`}
                  >
                    <option value="all">Ürün + kategori</option>
                    <option value="products">Sadece ürünler</option>
                    <option value="categories">Sadece kategoriler</option>
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => void handleWarmup()}
                  disabled={warmingUp}
                  className={SECONDARY_BUTTON}
                >
                  {warmingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />}
                  Hazırla
                </button>

                <button
                  type="button"
                  onClick={() => void handleHealthCheck()}
                  disabled={checkingHealth}
                  className={SECONDARY_BUTTON}
                >
                  {checkingHealth ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Kontrol et
                </button>
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <section className={PANEL_CLASS}>
              <div className={PANEL_HEADER_CLASS}>
                <h2 className="text-sm font-semibold text-[#111827]">Yayın özeti</h2>
              </div>
              <div className="space-y-3 p-4 xl:p-5">
                <div className="flex items-center justify-between border-b border-[#E3E9F0] pb-3 text-sm">
                  <span className="text-[#6B7280]">Kaynak dil</span>
                  <span className="font-semibold text-[#111827]">Türkçe</span>
                </div>
                <div className="text-sm">
                  <span className="text-[#6B7280]">Hedef diller</span>
                  <p className="mt-1 font-semibold text-[#111827]">
                    {activeLocaleSummary || "Henüz seçilmedi"}
                  </p>
                </div>
              </div>
            </section>

            {warmupSummary ? (
              <section className="rounded-[12px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5" />
                  <div>
                    <p className="font-semibold">{warmupSummary.locale.toUpperCase()} hazırlandı</p>
                    <p className="mt-1 text-emerald-800">
                      {warmupSummary.productsProcessed} ürün, {warmupSummary.categoriesProcessed} kategori,
                      {` ${warmupSummary.newCacheEntries}`} yeni kayıt.
                    </p>
                  </div>
                </div>
              </section>
            ) : null}

            {healthSummary ? (
              <section
                className={`rounded-[12px] border p-4 text-sm ${
                  healthSummary.ready && healthSummary.probeSucceeded
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-amber-200 bg-amber-50 text-amber-950"
                }`}
              >
                <div className="flex items-start gap-3">
                  {healthSummary.ready && healthSummary.probeSucceeded ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-5 w-5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {healthSummary.ready && healthSummary.probeSucceeded ? "Sağlıklı" : "Kontrol gerekli"}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <span>Dil: {healthSummary.locale.toUpperCase()}</span>
                      <span>API: {healthSummary.hasApiKey ? "var" : "yok"}</span>
                      <span>Ürün: {healthSummary.productsAvailable}</span>
                      <span>Kategori: {healthSummary.categoriesAvailable}</span>
                    </div>
                    {healthSummary.reasons.length > 0 ? (
                      <ul className="mt-3 space-y-1 text-xs">
                        {healthSummary.reasons.map((reason) => (
                          <li key={reason}>- {reason}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      )}
    </AdminPageShell>
  );
}
