"use client";

import { useEffect, useMemo, useState } from "react";
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
  description: string;
}> = [
  { locale: "en", label: "English", description: "/en" },
  { locale: "de", label: "Deutsch", description: "/de" },
  { locale: "ru", label: "Russkiy", description: "/ru" },
  { locale: "ar", label: "Arabic", description: "/ar" },
  { locale: "ka", label: "Kartuli", description: "/ka" },
];

function ToggleCard({
  title,
  description: _description,
  enabled,
  onToggle,
  icon: Icon,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  icon: React.ElementType;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${
        enabled
          ? "border-[var(--admin-accent-border)] bg-[var(--admin-accent)] text-white shadow-[var(--shadow-md)]"
          : "border-[var(--admin-border)] bg-white text-[var(--admin-heading)] hover:border-[var(--admin-accent-border)]"
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          enabled ? "bg-white/15 text-white" : "bg-[var(--admin-bg)] text-[var(--admin-text-secondary)]"
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{title}</p>
          <span
            className={`inline-flex h-6 w-11 items-center rounded-full px-1 transition ${
              enabled ? "bg-white/20" : "bg-[var(--admin-border)]"
            }`}
          >
            <span
              className={`h-4 w-4 rounded-full bg-white shadow transition ${
                enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </span>
        </div>
      </div>
    </button>
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
        throw new Error(payload.error || "Ceviri ayarlari alinamadi");
      }

      const normalizedSettings = normalizeStoreTranslationSettings(
        payload.translationSettings,
        DEFAULT_STORE_TRANSLATION_SETTINGS,
      );

      setSettings(normalizedSettings);
      setWarmupLocale((current) =>
        normalizedSettings.enabledLocales.includes(current)
          ? current
          : (normalizedSettings.enabledLocales[0] || "en"),
      );
      setHasEnvKey(Boolean(payload.hasEnvKey));
    } catch (error) {
      console.error("Failed to fetch translation settings:", error);
      toast.error("Ceviri ayarlari yuklenemedi");
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
        throw new Error(payload.error || "Ceviri ayarlari kaydedilemedi");
      }

      toast.success("Ceviri ayarlari guncellendi");
    } catch (error) {
      console.error("Failed to save translation settings:", error);
      toast.error(error instanceof Error ? error.message : "Ceviri ayarlari kaydedilemedi");
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
        throw new Error(payload.error || "Katalog warm-up basarisiz.");
      }

      setWarmupSummary(payload.summary);
      toast.success("Katalog cevirisi hazirlandi");
    } catch (error) {
      console.error("Catalog translation warm-up failed:", error);
      toast.error(error instanceof Error ? error.message : "Katalog warm-up basarisiz.");
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
        throw new Error(payload.error || "Katalog saglik kontrolu basarisiz.");
      }

      setHealthSummary(payload.summary);
      toast.success("Katalog ceviri sagligi kontrol edildi");
    } catch (error) {
      console.error("Catalog translation health check failed:", error);
      toast.error(error instanceof Error ? error.message : "Katalog saglik kontrolu basarisiz.");
    } finally {
      setCheckingHealth(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--admin-border)] bg-white shadow-[0_12px_28px_rgba(17,24,39,0.05)]">
      <div className="flex items-center gap-3 border-b border-[var(--admin-border)] px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--admin-accent)] text-white">
          <Languages className="h-5 w-5" />
        </div>
        <h2 className="text-base font-semibold text-[var(--admin-heading)]">Canli Ceviri</h2>
      </div>

      <div className="space-y-6 p-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--admin-text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--admin-accent)]" />
            Ceviri ayarlari yukleniyor...
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--admin-text)]">DeepL API Anahtari</label>
                <input
                  type="password"
                  value={settings.apiKey || ""}
                  onChange={(event) =>
                    updateSettings((current) => ({
                      ...current,
                      apiKey: event.target.value,
                    }))
                  }
                  placeholder="DeepL API anahtari"
                  className="w-full rounded-xl border border-[var(--admin-border)] px-3 py-2.5 text-sm text-[var(--admin-text)] transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[color:rgba(255,106,0,0.16)]"
                />
                {hasEnvKey ? (
                  <p className="text-xs text-[var(--admin-text-secondary)]">Sunucuda ayri bir `DEEPL_API_KEY` env anahtari da tanimli.</p>
                ) : null}
              </div>

              <div className="rounded-2xl border border-dashed border-[var(--admin-border)] bg-[var(--admin-bg)] p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--admin-heading)]">
                  <Globe2 className="h-4 w-4 text-[var(--admin-accent)]" />
                  Yayin Ozeti
                </div>
                <div className="mt-3 space-y-2 text-sm text-[var(--admin-text-secondary)]">
                  <p>
                    Kaynak dil: <span className="font-medium text-[var(--admin-heading)]">Turkce</span>
                  </p>
                  <p>
                    Hedef diller:{" "}
                    <span className="font-medium text-[var(--admin-heading)]">
                      {activeLocaleSummary || "Henuz secilmedi"}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(event) =>
                    updateSettings((current) => ({
                      ...current,
                      enabled: event.target.checked,
                    }))
                  }
                  className="peer sr-only"
                />
                <div className="h-6 w-11 rounded-full bg-[var(--admin-border)] transition peer-checked:bg-[var(--admin-accent)] peer-checked:after:translate-x-full after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-white after:bg-white after:transition after:content-['']" />
              </label>
              <div>
                <p className="text-sm font-medium text-[var(--admin-heading)]">Canli ceviriyi etkinlestir</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-[var(--admin-heading)]">Hedef Diller</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {TARGET_LOCALE_OPTIONS.map((option) => {
                  const enabled = settings.enabledLocales.includes(option.locale);
                  return (
                    <button
                      key={option.locale}
                      type="button"
                      onClick={() => toggleLocale(option.locale)}
                      className={`rounded-2xl border px-4 py-3 text-left transition ${
                        enabled
                          ? "border-[var(--admin-accent-border)] bg-[var(--admin-accent)] text-white shadow-[var(--shadow-md)]"
                          : "border-[var(--admin-border)] bg-white text-[var(--admin-heading)] hover:border-[var(--admin-accent-border)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{option.label}</span>
                        {enabled ? <Check className="h-4 w-4" /> : null}
                      </div>
                      <p className={`mt-1 text-xs ${enabled ? "text-white/70" : "text-[var(--admin-text-secondary)]"}`}>
                        {option.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <ToggleCard
                title="Katalog Cevirisi"
                description="Ürünler, kategoriler, kategori sayfalari, PDP ve listing katalog alanlarini cevirir."
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
                title="SEO Cevirisi"
                description="Meta title, description ve benzeri SEO metinlerini locale bazli uretir."
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
                title="Arayuz Cevirisi"
                description="Homepage shell, ortak section basliklari ve genel UI metinlerini cevirir."
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

            <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-bg)] p-4 md:p-5">
              <div>
                <p className="text-sm font-semibold text-[var(--admin-heading)]">Katalog Cevirisini Hazirla</p>
                <p className="mt-1 text-xs leading-5 text-[var(--admin-text-secondary)]">
                  Müşteriye gostermeden once secili dil icin ürün ve kategori ceviri cache'ini topluca doldurur.
                </p>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
                    Hedef Dil
                  </label>
                  <select
                    value={warmupLocale}
                    onChange={(event) =>
                      setWarmupLocale(event.target.value as Exclude<StoreTranslationLocale, "tr">)
                    }
                    className="w-full rounded-xl border border-[var(--admin-border)] bg-white px-3 py-2.5 text-sm text-[var(--admin-text)] outline-none transition focus:border-transparent focus:ring-2 focus:ring-[color:rgba(255,106,0,0.16)]"
                  >
                    {TARGET_LOCALE_OPTIONS.map((option) => (
                      <option key={option.locale} value={option.locale}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
                    Kapsam
                  </label>
                  <select
                    value={warmupScope}
                    onChange={(event) => setWarmupScope(event.target.value as TranslationWarmupScope)}
                    className="w-full rounded-xl border border-[var(--admin-border)] bg-white px-3 py-2.5 text-sm text-[var(--admin-text)] outline-none transition focus:border-transparent focus:ring-2 focus:ring-[color:rgba(255,106,0,0.16)]"
                  >
                    <option value="all">Ürün + kategori</option>
                    <option value="products">Sadece ürünler</option>
                    <option value="categories">Sadece kategoriler</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => void handleWarmup()}
                  disabled={warmingUp}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-[var(--admin-heading)] shadow-sm ring-1 ring-[var(--admin-border)] transition hover:bg-[var(--admin-bg)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {warmingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />}
                  Katalog cevirisini hazirla
                </button>
              </div>

              {warmupSummary ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  <p className="font-medium">
                    {warmupSummary.locale.toUpperCase()} dili icin warm-up tamamlandi.
                  </p>
                  <p className="mt-1 text-emerald-800">
                    {warmupSummary.productsProcessed} urun, {warmupSummary.categoriesProcessed} kategori tarandi; {warmupSummary.newCacheEntries} yeni cache kaydi olusturuldu.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-[var(--admin-border)] bg-white p-4 md:p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--admin-heading)]">Ceviri Sagligini Kontrol Et</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--admin-text-secondary)]">
                    Secili dil icin ayarlarin dogru olup olmadigini ve ornek urun ile kategori uzerinde gercek DeepL cevabinin donup donmedigini kontrol eder.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleHealthCheck()}
                  disabled={checkingHealth}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-bg)] px-4 py-2.5 text-sm font-medium text-[var(--admin-heading)] transition hover:bg-[#eef1f5] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {checkingHealth ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Sagligi kontrol et
                </button>
              </div>

              {healthSummary ? (
                <div
                  className={`mt-4 rounded-2xl border px-4 py-4 text-sm ${
                    healthSummary.ready && healthSummary.probeSucceeded
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-amber-200 bg-amber-50 text-amber-950"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {healthSummary.ready && healthSummary.probeSucceeded ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <AlertTriangle className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <p className="font-semibold">
                          {healthSummary.ready && healthSummary.probeSucceeded
                            ? "Canli katalog cevirisi bu dil icin hazir gorunuyor."
                            : "Canli katalog cevirisi bu dil icin eksik veya riskli gorunuyor."}
                        </p>
                        <p className="mt-1 text-xs opacity-80">
                          Kaynak dil {healthSummary.sourceLocale.toUpperCase()}, hedef dil {healthSummary.locale.toUpperCase()}.
                        </p>
                      </div>

                      <div className="grid gap-2 text-xs md:grid-cols-2">
                        <p>Canli ceviri: <span className="font-medium">{healthSummary.enabled ? "acik" : "kapali"}</span></p>
                        <p>Katalog cevirisi: <span className="font-medium">{healthSummary.translateCatalog ? "acik" : "kapali"}</span></p>
                        <p>SEO cevirisi: <span className="font-medium">{healthSummary.translateSeo ? "acik" : "kapali"}</span></p>
                        <p>DeepL anahtari: <span className="font-medium">{healthSummary.hasApiKey ? "var" : "yok"}</span></p>
                        <p>Hedef dil aktif: <span className="font-medium">{healthSummary.localeEnabled ? "evet" : "hayir"}</span></p>
                        <p>Desteklenen dil: <span className="font-medium">{healthSummary.supportedLocale ? "evet" : "hayir"}</span></p>
                        <p>Aktif urun: <span className="font-medium">{healthSummary.productsAvailable}</span></p>
                        <p>Aktif kategori: <span className="font-medium">{healthSummary.categoriesAvailable}</span></p>
                      </div>

                      {healthSummary.reasons.length > 0 ? (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">Eksikler</p>
                          <ul className="mt-2 space-y-1 text-sm">
                            {healthSummary.reasons.map((reason) => (
                              <li key={reason}>- {reason}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {healthSummary.sampleProduct || healthSummary.sampleCategory ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          {healthSummary.sampleProduct ? (
                            <div className="rounded-xl bg-white/70 p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--admin-text-secondary)]">Ornek urun</p>
                              <p className="mt-2 text-xs text-[var(--admin-text-secondary)]">Kaynak</p>
                              <p className="text-sm text-[var(--admin-heading)]">{healthSummary.sampleProduct.sourceText}</p>
                              <p className="mt-2 text-xs text-[var(--admin-text-secondary)]">Cevrilen</p>
                              <p className="text-sm text-[var(--admin-heading)]">{healthSummary.sampleProduct.translatedText}</p>
                            </div>
                          ) : null}
                          {healthSummary.sampleCategory ? (
                            <div className="rounded-xl bg-white/70 p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--admin-text-secondary)]">Ornek kategori</p>
                              <p className="mt-2 text-xs text-[var(--admin-text-secondary)]">Kaynak</p>
                              <p className="text-sm text-[var(--admin-heading)]">{healthSummary.sampleCategory.sourceText}</p>
                              <p className="mt-2 text-xs text-[var(--admin-text-secondary)]">Cevrilen</p>
                              <p className="text-sm text-[var(--admin-heading)]">{healthSummary.sampleCategory.translatedText}</p>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end border-t border-[var(--admin-border)] pt-4">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--admin-accent)] px-5 py-2.5 text-sm font-medium text-white shadow-[var(--shadow-md)] transition hover:bg-[var(--admin-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Ceviri ayarlarini kaydet
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
