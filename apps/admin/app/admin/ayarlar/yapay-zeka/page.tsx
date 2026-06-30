"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  PlugZap,
  Save,
  ShieldCheck,
  Sparkles,
  XCircle,
  Zap,
} from "lucide-react";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/AdminPageShell";
import { cn } from "@/lib/utils";

type AIProvider = "gemini" | "claude" | "deepseek";

interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
}

type ProviderTone = {
  border: string;
  tint: string;
  text: string;
};

const PROVIDER_TONES: Record<AIProvider, ProviderTone> = {
  gemini: {
    border: "border-[#FFD1B5]",
    tint: "bg-[#FFF8F3]",
    text: "text-[#E85D04]",
  },
  claude: {
    border: "border-[#E1E7EF]",
    tint: "bg-white",
    text: "text-[#111827]",
  },
  deepseek: {
    border: "border-[#E1E7EF]",
    tint: "bg-white",
    text: "text-[#111827]",
  },
};

const PROVIDERS = [
  {
    id: "gemini" as const,
    name: "Google Gemini",
    label: "Önerilen",
    description: "Toshi ve SEO akışları için ana sağlayıcı.",
    models: [
      "gemini-3.1-pro-preview",
      "gemini-3-pro-preview",
      "gemini-3-flash-preview",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.5-flash-lite-preview-06-17",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-pro",
    ],
    feature: "Araç çağırma",
  },
  {
    id: "claude" as const,
    name: "Anthropic Claude",
    label: "Analiz",
    description: "Uzun metin ve detaylı yorumlama için.",
    models: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"],
    feature: "Uzun bağlam",
  },
  {
    id: "deepseek" as const,
    name: "DeepSeek",
    label: "Ekonomik",
    description: "Hızlı ve düşük maliyetli alternatif.",
    models: ["deepseek-chat", "deepseek-reasoner"],
    feature: "Hızlı yanıt",
  },
];

const FIELD_CLASS =
  "h-11 w-full rounded-[8px] border border-[#DCE3EC] bg-white px-3.5 text-sm font-medium text-[#111827] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#FFD1B5] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]";

const SECONDARY_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-4 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] disabled:cursor-not-allowed disabled:opacity-50";

const PRIMARY_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.16)] transition hover:bg-[#E85D04] disabled:cursor-not-allowed disabled:opacity-50";

export default function AISettingsPage() {
  const [config, setConfig] = useState<AIConfig>({
    provider: "gemini",
    apiKey: "",
    model: "gemini-2.5-flash",
  });
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasEnvKey, setHasEnvKey] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/settings?type=ai");
        const data = await response.json();

        if (data.success && data.aiSettings) {
          setConfig({
            provider: data.aiSettings.provider || "gemini",
            apiKey: data.aiSettings.apiKey || "",
            model: data.aiSettings.model || "gemini-2.5-flash",
          });
        }

        if (data.hasEnvKey) {
          setHasEnvKey(true);
        }
      } catch {
        // Sayfa acik kalmali; ayar yuklenemezse mevcut varsayilan gosterilir.
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const selectedProvider = useMemo(
    () => PROVIDERS.find((provider) => provider.id === config.provider) ?? PROVIDERS[0],
    [config.provider],
  );

  function selectProvider(providerId: AIProvider) {
    const providerData = PROVIDERS.find((provider) => provider.id === providerId);

    setConfig((current) => ({
      ...current,
      provider: providerId,
      model: providerData?.models[0] || "",
    }));
    setTestResult(null);
    setSaveResult(null);
  }

  async function testConnection() {
    if (!config.apiKey) {
      setTestResult({ success: false, message: "Anahtar girilmedi." });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ai-test",
          aiSettings: config,
        }),
      });
      const data = await response.json();
      setTestResult(data.testResult || { success: false, message: "Test başarısız." });
    } catch {
      setTestResult({ success: false, message: "Bağlantı hatası." });
    } finally {
      setTesting(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    setSaveResult(null);

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ai",
          aiSettings: config,
        }),
      });
      const data = await response.json();

      if (data.success) {
        setSaveResult("Ayarlar kaydedildi.");
      } else {
        setSaveResult(`Kaydetme hatası: ${data.error || "Bilinmeyen"}`);
      }
    } catch {
      setSaveResult("Bağlantı hatası.");
    } finally {
      setSaving(false);
    }
  }

  const keyStatus = config.apiKey ? "Tanımlı" : hasEnvKey ? "Ortam hazır" : "Eksik";

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F9F9F9] text-[#6B7280]">
        <Loader2 className="h-7 w-7 animate-spin text-[#FF6A00]" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
      <div className="mx-auto w-full max-w-none px-4 sm:px-5 xl:px-6">
        <AdminPageShell>
          <AdminPageHeader
            sectionLabel="Ayarlar"
            title="Yapay Zeka"
            description="Toshi ve SEO model ayarları."
            actions={
              <>
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={testing || !config.apiKey}
                  className={SECONDARY_BUTTON}
                >
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                  Test et
                </button>
                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={saving || !config.apiKey}
                  className={PRIMARY_BUTTON}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Kaydet
                </button>
              </>
            }
            metrics={
              <>
                <MetricCell icon={Brain} label="Sağlayıcı" value={selectedProvider.name} />
                <MetricCell icon={Zap} label="Model" value={config.model} />
                <MetricCell icon={KeyRound} label="Anahtar" value={keyStatus} />
                <MetricCell icon={ShieldCheck} label="Kapsam" value="Toshi + SEO" />
              </>
            }
          />

          {hasEnvKey && !config.apiKey ? (
            <section className="border-b border-[#FFD1B5] bg-[#FFF8F3] px-4 py-3 text-sm font-semibold text-[#9A4B00] xl:px-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#FF6A00]" />
                Ortam değişkeninden kullanılabilir anahtar algılandı.
              </div>
            </section>
          ) : null}

          <section className="grid gap-4 bg-[#F9F9F9] py-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.6fr)]">
            <div className="space-y-4">
              <div className="border-b border-[#E1E7EF] pb-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">Sağlayıcı</h2>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {PROVIDERS.map((provider) => {
                  const isSelected = config.provider === provider.id;
                  const tone = PROVIDER_TONES[provider.id];

                  return (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => selectProvider(provider.id)}
                      className={cn(
                        "group min-h-[146px] rounded-[12px] border bg-white p-4 text-left transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3]",
                        isSelected ? `${tone.border} ${tone.tint} shadow-[0_12px_30px_rgba(255,106,0,0.08)]` : "border-[#DCE3EC]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span
                          className={cn(
                            "inline-flex h-9 w-9 items-center justify-center rounded-[8px] border",
                            isSelected
                              ? "border-[#FFD1B5] bg-white text-[#FF6A00]"
                              : "border-[#E1E7EF] bg-[#F9F9F9] text-[#6B7280]",
                          )}
                        >
                          <Brain className="h-4 w-4" />
                        </span>
                        <span
                          className={cn(
                            "rounded-[8px] px-2 py-1 text-xs font-semibold",
                            isSelected ? "bg-white text-[#E85D04]" : "bg-[#F9F9F9] text-[#6B7280]",
                          )}
                        >
                          {provider.label}
                        </span>
                      </div>
                      <h3 className="mt-4 text-base font-semibold tracking-[-0.02em] text-[#111827]">
                        {provider.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-sm font-medium text-[#6B7280]">{provider.description}</p>
                      <div className={cn("mt-3 text-xs font-semibold", isSelected ? tone.text : "text-[#6B7280]")}>
                        {provider.feature}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <section className="rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <div className="border-b border-[#E1E7EF] px-4 py-4 xl:px-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#FF6A00]">Ayar</p>
                <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[#111827]">
                  {selectedProvider.name}
                </h2>
              </div>

              <div className="space-y-4 p-4 xl:p-5">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-[#4B5563]">Model</span>
                  <select
                    value={config.model}
                    onChange={(event) => setConfig((current) => ({ ...current, model: event.target.value }))}
                    className={FIELD_CLASS}
                  >
                    {selectedProvider.models.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-[#4B5563]">API anahtarı</span>
                  <span className="relative block">
                    <input
                      type={showKey ? "text" : "password"}
                      value={config.apiKey}
                      onChange={(event) => setConfig((current) => ({ ...current, apiKey: event.target.value }))}
                      placeholder="Anahtar girin"
                      className={`${FIELD_CLASS} pr-12 font-mono`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((current) => !current)}
                      className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[8px] text-[#6B7280] transition hover:bg-[#FFF8F3] hover:text-[#E85D04]"
                      aria-label={showKey ? "Anahtarı gizle" : "Anahtarı göster"}
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </span>
                </label>

                <ResultMessage testResult={testResult} saveResult={saveResult} />

                <div className="grid gap-2 border-t border-[#E1E7EF] pt-4 text-sm font-medium text-[#6B7280] sm:grid-cols-2">
                  <StatusLine label="Durum" value={keyStatus} />
                  <StatusLine label="Kullanım" value={selectedProvider.feature} />
                </div>
              </div>
            </section>
          </section>
        </AdminPageShell>
      </div>
    </main>
  );
}

function MetricCell({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Brain;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 border-r border-[#E1E7EF] px-4 py-4 last:border-r-0 xl:px-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#6B7280]">
        <Icon className="h-3.5 w-3.5 text-[#FF6A00]" />
        {label}
      </div>
      <p className="mt-2 truncate text-base font-semibold text-[#111827]" title={value}>
        {value}
      </p>
    </div>
  );
}

function ResultMessage({
  testResult,
  saveResult,
}: {
  testResult: { success: boolean; message: string } | null;
  saveResult: string | null;
}) {
  if (!testResult && !saveResult) {
    return null;
  }

  if (testResult) {
    return (
      <div
        className={cn(
          "flex items-start gap-2 rounded-[8px] border px-3 py-2.5 text-sm font-semibold",
          testResult.success
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-rose-200 bg-rose-50 text-rose-700",
        )}
      >
        {testResult.success ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <span>{testResult.message}</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-[8px] border border-[#FFD1B5] bg-[#FFF8F3] px-3 py-2.5 text-sm font-semibold text-[#9A4B00]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6A00]" />
      <span>{saveResult}</span>
    </div>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[8px] bg-[#F9F9F9] px-3 py-2">
      <span>{label}</span>
      <span className="truncate font-semibold text-[#111827]">{value}</span>
    </div>
  );
}
