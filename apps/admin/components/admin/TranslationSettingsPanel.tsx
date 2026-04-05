"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Globe2, Languages, Loader2, Save, Search, ShoppingBag, Type } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_STORE_TRANSLATION_SETTINGS,
  STORE_TRANSLATION_LOCALES,
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
  description,
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
          ? "border-neutral-900 bg-neutral-900 text-white shadow-lg shadow-neutral-900/10"
          : "border-gray-200 bg-white text-gray-900 hover:border-gray-300"
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          enabled ? "bg-white/15 text-white" : "bg-neutral-100 text-neutral-700"
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{title}</p>
          <span
            className={`inline-flex h-6 w-11 items-center rounded-full px-1 transition ${
              enabled ? "bg-white/20" : "bg-gray-200"
            }`}
          >
            <span
              className={`h-4 w-4 rounded-full bg-white shadow transition ${
                enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </span>
        </div>
        <p className={`mt-1 text-sm ${enabled ? "text-white/80" : "text-gray-500"}`}>{description}</p>
      </div>
    </button>
  );
}

export function TranslationSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasEnvKey, setHasEnvKey] = useState(false);
  const [settings, setSettings] = useState<StoreTranslationSettings>(DEFAULT_STORE_TRANSLATION_SETTINGS);

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

      setSettings(
        normalizeStoreTranslationSettings(payload.translationSettings, DEFAULT_STORE_TRANSLATION_SETTINGS),
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

  return (
    <section className="rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-50 px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-900 text-white">
          <Languages className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">Canlı Çeviri</h2>
          <p className="text-sm text-gray-500">
            Footer dil değiştirici ile DeepL tabanlı içerik çevirisini mağaza bazlı yönetin.
          </p>
        </div>
      </div>

      <div className="space-y-6 p-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Çeviri ayarları yükleniyor...
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">DeepL API Anahtarı</label>
                <input
                  type="password"
                  value={settings.apiKey || ""}
                  onChange={(event) =>
                    updateSettings((current) => ({
                      ...current,
                      apiKey: event.target.value,
                    }))
                  }
                  placeholder="DeepL API anahtarı"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
                <div className="space-y-1 text-xs text-gray-500">
                  <p>Sağlanan anahtar settings içinde saklanır. İsterseniz deploy env olarak da kullanabilirsiniz.</p>
                  {hasEnvKey ? <p>Sunucuda ayrıca bir `DEEPL_API_KEY` env anahtarı da tanımlı.</p> : null}
                </div>
              </div>

              <div className="rounded-2xl border border-dashed border-gray-200 bg-[#F8F8F8] p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  <Globe2 className="h-4 w-4" />
                  Yayın Özeti
                </div>
                <div className="mt-3 space-y-2 text-sm text-gray-600">
                  <p>
                    Kaynak dil: <span className="font-medium text-gray-900">Türkçe</span>
                  </p>
                  <p>
                    Hedef diller:{" "}
                    <span className="font-medium text-gray-900">
                      {activeLocaleSummary || "Henüz seçilmedi"}
                    </span>
                  </p>
                  <p>
                    Sağlanan yapı, HTML içeriğini server-side çevrir ve çeviri sonucunu veritabanı cache'inde tutar.
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
                <div className="h-6 w-11 rounded-full bg-gray-200 transition peer-checked:bg-neutral-900 peer-checked:after:translate-x-full after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition after:content-['']" />
              </label>
              <div>
                <p className="text-sm font-medium text-gray-900">Canlı çeviriyi etkinleştir</p>
                <p className="text-xs text-gray-500">
                  Kapanırsa mağaza tüm locale URL'lerinde kaynak Türkçe içerikle çalışır.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Hedef Diller</p>
                <p className="text-xs text-gray-500">
                  `/tr` kaynak dil olarak kalır. Seçili diller için çeviri cache'i DeepL ile doldurulur.
                </p>
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
                          ? "border-neutral-900 bg-neutral-900 text-white shadow-lg shadow-neutral-900/10"
                          : "border-gray-200 bg-white text-gray-900 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{option.label}</span>
                        {enabled ? <Check className="h-4 w-4" /> : null}
                      </div>
                      <p className={`mt-1 text-xs ${enabled ? "text-white/70" : "text-gray-500"}`}>
                        {option.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <ToggleCard
                title="Katalog Çevirisi"
                description="Ürün, kategori ve ana sayfa katalog alanlarını çevirir."
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
                title="SEO Çevirisi"
                description="Meta title, description ve OG metinlerini locale bazlı üretir."
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
                title="Arayüz Çevirisi"
                description="Ana sayfa section başlıkları ve ortak shell metinlerini çevirir."
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

            <div className="flex justify-end border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-neutral-900/20 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Çeviri Ayarlarını Kaydet
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
