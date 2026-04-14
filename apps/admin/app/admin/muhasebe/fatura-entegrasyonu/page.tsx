"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  MoreHorizontal,
  Plug,
  RefreshCw,
  Save,
  ShieldCheck,
  Terminal,
  Unplug,
  X,
  XCircle,
} from "lucide-react";
import type { AccountingIntegrationView, AccountingProvider } from "@/types/accounting";

type ProviderStyle = { bg: string; text: string; abbr: string; color: string };
const PROVIDER_STYLES: Record<string, ProviderStyle> = {
  parasut: { bg: "bg-purple-100", text: "text-purple-700", abbr: "P", color: "purple" },
  bizimhesap: { bg: "bg-blue-100", text: "text-blue-700", abbr: "BH", color: "blue" },
  mikro: { bg: "bg-orange-100", text: "text-orange-700", abbr: "M", color: "orange" },
  logo_isbasi: { bg: "bg-red-100", text: "text-red-700", abbr: "L", color: "red" },
  kolaybi: { bg: "bg-green-100", text: "text-green-700", abbr: "KB", color: "green" },
  mukellef: { bg: "bg-indigo-100", text: "text-indigo-700", abbr: "MK", color: "indigo" },
};

const ACCOUNTING_LOGO_PATHS: Record<AccountingProvider, string> = {
  parasut: "/accounting-logos/parasut.png",
  bizimhesap: "/accounting-logos/bizimhesap.png",
  mikro: "/accounting-logos/mikro.png",
  logo_isbasi: "/accounting-logos/logo-isbasi.png",
  kolaybi: "/accounting-logos/kolaybi.png",
  mukellef: "/accounting-logos/mukellef.png",
};

function AccountingProviderLogo({
  providerId,
  providerName,
  providerStyle,
  size,
  className,
}: {
  providerId: AccountingProvider;
  providerName: string;
  providerStyle: ProviderStyle;
  size: number;
  className: string;
}) {
  const [hasError, setHasError] = useState(false);
  const src = ACCOUNTING_LOGO_PATHS[providerId];

  if (!src || hasError) {
    return (
      <div className={`${className} ${providerStyle.bg} ${providerStyle.text} flex items-center justify-center rounded-2xl`}>
        <span className={`font-bold leading-none ${size >= 64 ? "text-2xl" : "text-xl"}`}>{providerStyle.abbr}</span>
      </div>
    );
  }

  return (
    <div className={`${className} flex items-center justify-center overflow-hidden rounded-2xl bg-white`}>
      <Image
        src={src}
        alt={providerName}
        width={size}
        height={size}
        className="h-full w-full object-contain"
        onError={() => setHasError(true)}
      />
    </div>
  );
}

function SectionPill({ children }: { children: string }) {
  return (
    <div className="inline-flex items-center rounded-full border border-[#eadccd] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">
      {children}
    </div>
  );
}

function StatusBadge({ connected, error }: { connected: boolean; error: boolean }) {
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
        <Plug className="h-3 w-3" />
        Bağlı
      </span>
    );
  }

  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
        <AlertTriangle className="h-3 w-3" />
        Hatalı
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#eadccd] bg-[#fffaf5] px-3 py-1 text-xs font-semibold text-[#7b6656]">
      <Unplug className="h-3 w-3" />
      Bağlı değil
    </span>
  );
}

function SummaryCard({ icon: Icon, title, value, note, tone }: { icon: ElementType; title: string; value: string; note: string; tone: string }) {
  return (
    <div className="rounded-[28px] border border-[#eadccd] bg-white/95 p-5 shadow-[0_16px_40px_rgba(105,78,54,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#8f7765]">{title}</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#2f241d]">{value}</p>
          <p className="mt-2 text-sm text-[#9b816d]">{note}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-[18px] border ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

type View = "list" | "detail";

export default function AccountingIntegrationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<AccountingIntegrationView[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<AccountingIntegrationView | null>(null);
  const [view, setView] = useState<View>("list");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [logsByProvider, setLogsByProvider] = useState<Record<string, Array<Record<string, unknown>>>>({});

  const [formState, setFormState] = useState<{
    credentials: Record<string, string>;
    fieldMappings: Record<string, string>;
    syncMode: "safe_hybrid";
  }>({
    credentials: {},
    fieldMappings: {},
    syncMode: "safe_hybrid",
  });

  const fetchIntegrations = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/accounting/integrations", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Entegrasyon listesi alınamadı.");
      }
      const list = (result.integrations || []) as AccountingIntegrationView[];
      setIntegrations(list);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Entegrasyonlar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const handleSelectProvider = (integration: AccountingIntegrationView) => {
    setSelectedProvider(integration);

    const credentials: Record<string, string> = {};
    integration.provider.credentialFields.forEach((field) => {
      credentials[field.key] = "";
    });

    const fieldMappings: Record<string, string> = {};
    integration.provider.mappingFields.forEach((field) => {
      fieldMappings[field.key] = integration.connection?.fieldMappings?.[field.key] || "";
    });

    setFormState({
      credentials,
      fieldMappings,
      syncMode: "safe_hybrid",
    });

    setView("detail");
  };

  const updateCredential = (key: string, value: string) => {
    setFormState((current) => ({
      ...current,
      credentials: { ...current.credentials, [key]: value },
    }));
  };

  const updateMapping = (key: string, value: string) => {
    setFormState((current) => ({
      ...current,
      fieldMappings: { ...current.fieldMappings, [key]: value },
    }));
  };

  const connectProvider = async () => {
    if (!selectedProvider) return;

    setBusyKey("connect");
    try {
      const response = await fetch(`/api/admin/accounting/integrations/${selectedProvider.provider.id}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentials: formState.credentials,
          fieldMappings: formState.fieldMappings,
          syncMode: formState.syncMode,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Bağlantı kaydedilemedi.");
      }
      await fetchIntegrations();
      alert(result.testResult?.message || "Bağlantı kaydedildi.");
    } catch (connectError) {
      alert(connectError instanceof Error ? connectError.message : "Bağlantı hatası.");
    } finally {
      setBusyKey(null);
    }
  };

  const testProvider = async () => {
    if (!selectedProvider) return;
    setBusyKey("test");
    try {
      const response = await fetch(`/api/admin/accounting/integrations/${selectedProvider.provider.id}/test`, { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Bağlantı testi başarısız.");
      }
      alert(result.result?.message || "Bağlantı testi başarılı.");
      await fetchIntegrations();
    } catch (testError) {
      alert(testError instanceof Error ? testError.message : "Test hatası.");
    } finally {
      setBusyKey(null);
    }
  };

  const syncProvider = async () => {
    if (!selectedProvider) return;
    setBusyKey("sync");
    try {
      const response = await fetch(`/api/admin/accounting/integrations/${selectedProvider.provider.id}/sync`, { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Senkronizasyon başarısız.");
      }
      await fetchIntegrations();
      alert("Senkronizasyon tamamlandı.");
    } catch (syncError) {
      alert(syncError instanceof Error ? syncError.message : "Senkronizasyon hatası.");
    } finally {
      setBusyKey(null);
    }
  };

  const loadLogs = async () => {
    if (!selectedProvider) return;
    setBusyKey("logs");
    try {
      const response = await fetch(`/api/admin/accounting/integrations/${selectedProvider.provider.id}/logs?limit=20`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Loglar alınamadı.");
      }
      setLogsByProvider((current) => ({ ...current, [selectedProvider.provider.id]: result.logs || [] }));
    } catch (logError) {
      alert(logError instanceof Error ? logError.message : "Log yükleme hatası.");
    } finally {
      setBusyKey(null);
    }
  };

  const clearLogs = () => {
    if (!selectedProvider) return;
    setLogsByProvider((current) => ({ ...current, [selectedProvider.provider.id]: [] }));
  };

  const sortedIntegrations = useMemo(
    () =>
      [...integrations].sort((a, b) => {
        const aActive = a.connection?.status === "active" ? 0 : 1;
        const bActive = b.connection?.status === "active" ? 0 : 1;
        return aActive - bActive;
      }),
    [integrations]
  );

  const connectedCount = integrations.filter((i) => i.connection?.status === "active").length;
  const totalFailed = integrations.reduce((sum, i) => sum + i.queueStats.failed, 0);

  if (view === "list") {
    return (
      <div className="min-h-screen bg-[#f6efe8] text-[#2f241d]">
        <div className="mx-auto max-w-7xl space-y-8 px-6 py-8 md:px-8 md:py-10">
          <section className="relative overflow-hidden rounded-[36px] border border-[#eadccd] bg-gradient-to-br from-[#fff8f2] via-white to-[#f8eee5] p-8 shadow-[0_24px_80px_rgba(99,67,37,0.10)] md:p-10">
            <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <SectionPill>Fatura entegrasyonu</SectionPill>
                <div className="mt-5 flex items-start gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] border border-[#ffd7b8] bg-gradient-to-br from-[#FE6100] to-[#d97706] text-white shadow-[0_22px_50px_rgba(254,97,0,0.22)]">
                    <ShieldCheck className="h-8 w-8" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">Muhasebe bağlantıları</h1>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={fetchIntegrations}
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#eadccd] bg-white px-4 py-3 text-sm font-medium text-[#7b6656] shadow-sm transition-all hover:border-[#FE6100]/25 hover:bg-[#fff8f1] hover:text-[#C54E00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  Yenile
                </button>
              </div>
            </div>
            <div className="pointer-events-none absolute -right-14 -top-20 h-52 w-52 rounded-full bg-[#FE6100]/12 blur-3xl" />
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SummaryCard icon={Plug} title="Aktif bağlantı" value={`${connectedCount}`} note="Çalışan sağlayıcı adedi" tone="border-emerald-200 bg-emerald-50 text-emerald-600" />
            <SummaryCard icon={ShieldCheck} title="Toplam sağlayıcı" value={`${integrations.length}`} note="Yönetilebilir muhasebe servisi" tone="border-[#f5d2bc] bg-[#fff4ea] text-[#C54E00]" />
            <SummaryCard icon={AlertTriangle} title="Hatalı işlem" value={`${totalFailed}`} note={totalFailed > 0 ? "Müdahale bekleyen senkron kayıtları var" : "Kuyrukta kritik hata görünmüyor"} tone={totalFailed > 0 ? "border-red-200 bg-red-50 text-red-600" : "border-[#eadccd] bg-[#fffaf5] text-[#7b6656]"} />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-[24px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <XCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <section className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <SectionPill>Sağlayıcı listesi</SectionPill>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Muhasebe programları</h2>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {sortedIntegrations.map((integration) => {
                const isConnected = integration.connection?.status === "active";
                const hasError = integration.connection?.status === "error";
                const style = PROVIDER_STYLES[integration.provider.id] || { bg: "bg-gray-100", text: "text-gray-700", abbr: "?", color: "gray" };

                return (
                  <button
                    key={integration.provider.id}
                    onClick={() => handleSelectProvider(integration)}
                    className="group text-left rounded-[30px] border border-[#eadccd] bg-white/95 p-6 shadow-[0_18px_45px_rgba(105,78,54,0.08)] transition-all hover:-translate-y-1 hover:border-[#FE6100]/20 hover:shadow-[0_24px_60px_rgba(254,97,0,0.12)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
                  >
                    <div className="flex items-start gap-4">
                      <AccountingProviderLogo
                        providerId={integration.provider.id}
                        providerName={integration.provider.name}
                        providerStyle={style}
                        size={56}
                        className="h-14 w-14 shrink-0 border border-[#f0e3d7] shadow-sm"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#2f241d]">{integration.provider.name}</h3>
                            <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#8f7765]">{integration.provider.description}</p>
                          </div>
                          {isConnected && <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-500" />}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <StatusBadge connected={isConnected} error={!!hasError} />
                          {isConnected && integration.queueStats.queued > 0 && (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                              {integration.queueStats.queued} bekliyor
                            </span>
                          )}
                          {isConnected && integration.queueStats.failed > 0 && (
                            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                              {integration.queueStats.failed} hata
                            </span>
                          )}
                        </div>

                        <div className="mt-5 rounded-[22px] border border-[#f1e5d9] bg-[#fdf8f3] px-4 py-3 text-sm text-[#7f6858]">
                          {integration.connection?.lastSyncAt ? (
                            <span>Son senkron: {new Date(integration.connection.lastSyncAt).toLocaleString("tr-TR")}</span>
                          ) : (
                            <span>Henüz senkron geçmişi oluşmadı.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[30px] border border-[#eadccd] bg-white/95 p-6 shadow-[0_18px_45px_rgba(105,78,54,0.08)] md:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-blue-100 bg-blue-50 text-blue-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <SectionPill>Kurulum akışı</SectionPill>
                <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[#2f241d]">Nasıl çalışır?</h3>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  {["Kullandığınız muhasebe programını seçin.", "API bilgilerini ve alan eşlemelerini tamamlayın.", "Bağlantıyı test edip senkronizasyonu başlatın."].map((item, index) => (
                    <div key={item} className="rounded-[22px] border border-[#f0e3d7] bg-[#fcf8f3] p-4 text-sm leading-6 text-[#6f594c]">
                      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#fff1e4] text-sm font-semibold text-[#C54E00]">
                        {index + 1}
                      </div>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (view === "detail" && selectedProvider) {
    const style = PROVIDER_STYLES[selectedProvider.provider.id] || { bg: "bg-gray-100", text: "text-gray-700", abbr: "?", color: "gray" };
    const isConnected = selectedProvider.connection?.status === "active";
    const hasError = selectedProvider.connection?.status === "error";
    const logs = logsByProvider[selectedProvider.provider.id] || [];

    return (
      <div className="min-h-screen bg-[#f6efe8] text-[#2f241d]">
        <div className="mx-auto max-w-7xl px-6 py-8 md:px-8 md:py-10">
          <button
            onClick={() => setView("list")}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#eadccd] bg-white px-4 py-2.5 text-sm font-medium text-[#7b6656] transition-all hover:border-[#FE6100]/20 hover:bg-[#fff8f1] hover:text-[#C54E00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
          >
            <ChevronLeft className="h-4 w-4" />
            Tüm entegrasyonlara dön
          </button>

          <section className="relative overflow-hidden rounded-[34px] border border-[#eadccd] bg-gradient-to-br from-[#fff8f2] via-white to-[#f8eee5] p-8 shadow-[0_22px_70px_rgba(99,67,37,0.10)] md:p-10">
            <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <AccountingProviderLogo
                  providerId={selectedProvider.provider.id}
                  providerName={selectedProvider.provider.name}
                  providerStyle={style}
                  size={64}
                  className="h-16 w-16 shrink-0 border border-[#f0e3d7] shadow-sm"
                />
                <div>
                  <SectionPill>Sağlayıcı detayı</SectionPill>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <h1 className="text-3xl font-semibold tracking-[-0.04em]">{selectedProvider.provider.name}</h1>
                    <StatusBadge connected={isConnected} error={!!hasError} />
                  </div>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-[#7f6858] md:text-base">{selectedProvider.provider.description}</p>
                </div>
              </div>

              <a
                href={selectedProvider.provider.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#eadccd] bg-white px-4 py-3 text-sm font-medium text-[#7b6656] shadow-sm transition-all hover:border-[#FE6100]/25 hover:bg-[#fff8f1] hover:text-[#C54E00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
              >
                Resmî site
              </a>
            </div>
            <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[#FE6100]/12 blur-3xl" />
          </section>

          <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.8fr]">
            <div className="space-y-6">
              <section className="rounded-[30px] border border-[#eadccd] bg-white/95 p-6 shadow-[0_18px_45px_rgba(105,78,54,0.08)] md:p-8">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-[#f5d2bc] bg-[#fff4ea] text-[#C54E00]">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <SectionPill>Bağlantı kimlik bilgileri</SectionPill>
                    <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">API bağlantı bilgileri</h2>
                    <p className="mt-1 text-sm text-[#8f7765]">{selectedProvider.provider.name} hesabınızın gerekli alanlarını güvenle tamamlayın.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {selectedProvider.provider.credentialFields.map((field) => (
                    <div key={field.key} className={String(field.type) === "textarea" ? "md:col-span-2" : ""}>
                      <label className="mb-2 block text-sm font-medium text-[#5c4a3e]">
                        {field.label}
                        {field.required && <span className="ml-1 text-red-500">*</span>}
                      </label>
                      {String(field.type) === "textarea" ? (
                        <textarea
                          value={formState.credentials[field.key] || ""}
                          onChange={(e) => updateCredential(field.key, e.target.value)}
                          placeholder={field.placeholder || field.label}
                          rows={4}
                          className="w-full resize-none rounded-2xl border border-[#e8d9cb] bg-[#fffdfb] px-4 py-3 text-sm text-[#2f241d] outline-none transition-all placeholder:text-[#b49b89] focus:border-[#FE6100]/40 focus:ring-4 focus:ring-[#FE6100]/12"
                        />
                      ) : (
                        <input
                          type={field.type === "password" ? "password" : "text"}
                          value={formState.credentials[field.key] || ""}
                          onChange={(e) => updateCredential(field.key, e.target.value)}
                          placeholder={field.placeholder || field.label}
                          className="w-full rounded-2xl border border-[#e8d9cb] bg-[#fffdfb] px-4 py-3 text-sm text-[#2f241d] outline-none transition-all placeholder:text-[#b49b89] focus:border-[#FE6100]/40 focus:ring-4 focus:ring-[#FE6100]/12"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {selectedProvider.provider.mappingFields.length > 0 && (
                <section className="rounded-[30px] border border-[#eadccd] bg-white/95 p-6 shadow-[0_18px_45px_rgba(105,78,54,0.08)] md:p-8">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-blue-100 bg-blue-50 text-blue-600">
                      <MoreHorizontal className="h-5 w-5" />
                    </div>
                    <div>
                      <SectionPill>Alan eşleme</SectionPill>
                      <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">Sistem alanlarını hizalayın</h2>
                      <p className="mt-1 text-sm text-[#8f7765]">Veri akışında kullanılan alan isimlerini sağlayıcı alanlarıyla eşleyin.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {selectedProvider.provider.mappingFields.map((field) => (
                      <div key={field.key}>
                        <label className="mb-2 block text-sm font-medium text-[#5c4a3e]">{field.label}</label>
                        <input
                          type="text"
                          value={formState.fieldMappings[field.key] || ""}
                          onChange={(e) => updateMapping(field.key, e.target.value)}
                          placeholder={field.placeholder || "Opsiyonel"}
                          className="w-full rounded-2xl border border-[#e8d9cb] bg-[#fffdfb] px-4 py-3 text-sm text-[#2f241d] outline-none transition-all placeholder:text-[#b49b89] focus:border-[#FE6100]/40 focus:ring-4 focus:ring-[#FE6100]/12"
                        />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="rounded-[30px] border border-[#eadccd] bg-white/95 p-6 shadow-[0_18px_45px_rgba(105,78,54,0.08)] md:p-8">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-amber-200 bg-amber-50 text-amber-600">
                    <RefreshCw className="h-5 w-5" />
                  </div>
                  <div>
                    <SectionPill>Senkron modu</SectionPill>
                    <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">Güvenli hibrit akış</h2>
                    <p className="mt-1 text-sm text-[#8f7765]">Veri eşitleme yapılandırması sabit tutulur, yalnızca görünüm güncellenmiştir.</p>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#f0debf] bg-[#fffbf3] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-base font-semibold text-[#2f241d]">Güvenli Hibrit</span>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Önerilen</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[#7f6858]">Outbound: anlık kuyruk + 5 dakika worker. Inbound: webhook varsa anlık, yoksa 15 dakika poll.</p>
                </div>

                {selectedProvider.connection?.lastSyncAt && (
                  <p className="mt-4 text-sm text-[#7f6858]">
                    Son senkron: <span className="font-semibold text-[#2f241d]">{new Date(selectedProvider.connection.lastSyncAt).toLocaleString("tr-TR")}</span>
                  </p>
                )}
              </section>

              <section className="rounded-[30px] border border-[#eadccd] bg-white/95 p-6 shadow-[0_18px_45px_rgba(105,78,54,0.08)] md:p-8">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-[#eadccd] bg-[#fffaf5] text-[#7b6656]">
                      <Terminal className="h-5 w-5" />
                    </div>
                    <div>
                      <SectionPill>İşlem günlüğü</SectionPill>
                      <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">Hata ve durum logları</h2>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {logs.length > 0 && (
                      <button
                        onClick={clearLogs}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#eadccd] bg-white text-[#8a6f5d] transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/12"
                        title="Logları temizle"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={loadLogs}
                      disabled={busyKey === "logs"}
                      className="inline-flex items-center gap-2 rounded-2xl border border-[#eadccd] bg-white px-4 py-3 text-sm font-medium text-[#7b6656] transition-all hover:border-[#FE6100]/20 hover:bg-[#fff8f1] hover:text-[#C54E00] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
                    >
                      {busyKey === "logs" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Logları yükle
                    </button>
                  </div>
                </div>

                {logs.length > 0 ? (
                  <div className="overflow-hidden rounded-[24px] border border-[#f0e3d7]">
                    <div className="grid grid-cols-[140px_170px_1fr] gap-4 border-b border-[#f1e5d9] bg-[#fcf8f3] px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#9d836f]">
                      <span>Durum</span>
                      <span>Tarih</span>
                      <span>Açıklama</span>
                    </div>
                    <div className="max-h-72 overflow-auto divide-y divide-[#f1e5d9] bg-white">
                      {logs.map((log, index) => (
                        <div key={`log-${index}`} className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[140px_170px_1fr] md:items-start">
                          <span
                            className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${
                              log.status === "success"
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                : log.status === "error"
                                  ? "border border-red-200 bg-red-50 text-red-700"
                                  : "border border-amber-200 bg-amber-50 text-amber-700"
                            }`}
                          >
                            {String(log.status || "unknown")}
                          </span>
                          <span className="text-sm text-[#8f7765]">{String(log.created_at || "")}</span>
                          <p className="text-sm leading-6 text-[#5f4d41]">{String(log.error_message || log.entity_type || "Detay yok")}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-dashed border-[#e7d9cc] bg-[#fcf8f3] px-6 py-10 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#eadccd] bg-white text-[#C54E00]">
                      <Terminal className="h-6 w-6" />
                    </div>
                    <p className="mt-4 text-lg font-semibold tracking-[-0.02em] text-[#2f241d]">Henüz log yok</p>
                    <p className="mt-2 text-sm text-[#8f7765]">Son işlemleri görmek için yukarıdaki butondan logları yükleyin.</p>
                  </div>
                )}
              </section>
            </div>

            <div className="space-y-6">
              <section className="rounded-[30px] border border-[#eadccd] bg-white/95 p-6 shadow-[0_18px_45px_rgba(105,78,54,0.08)]">
                <SectionPill>Kuyruk durumu</SectionPill>
                <div className="mt-5 space-y-3">
                  {[
                    { label: "Bekleyen", value: selectedProvider.queueStats.queued, tone: "border-[#eadccd] bg-[#fffaf5] text-[#7b6656]" },
                    { label: "Hatalı", value: selectedProvider.queueStats.failed, tone: selectedProvider.queueStats.failed > 0 ? "border-red-200 bg-red-50 text-red-700" : "border-[#eadccd] bg-[#fffaf5] text-[#7b6656]" },
                    { label: "Manuel işlem", value: selectedProvider.queueStats.manualActionRequired, tone: selectedProvider.queueStats.manualActionRequired > 0 ? "border-amber-200 bg-amber-50 text-amber-700" : "border-[#eadccd] bg-[#fffaf5] text-[#7b6656]" },
                  ].map((item) => (
                    <div key={item.label} className={`flex items-center justify-between rounded-[22px] border px-4 py-3 ${item.tone}`}>
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className="text-lg font-semibold">{item.value}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[30px] border border-[#eadccd] bg-white/95 p-6 shadow-[0_18px_45px_rgba(105,78,54,0.08)]">
                <SectionPill>Hızlı işlemler</SectionPill>
                <div className="mt-5 space-y-3">
                  <ActionButton icon={Save} label="Bağlan / kaydet" loading={busyKey === "connect"} onClick={connectProvider} variant="primary" />
                  <ActionButton icon={ShieldCheck} label="Bağlantıyı test et" loading={busyKey === "test"} onClick={testProvider} variant="secondary" />
                  <ActionButton icon={RefreshCw} label="Senkronize et" loading={busyKey === "sync"} onClick={syncProvider} variant="secondary" />
                  {hasError && <ActionButton icon={RefreshCw} label="Yeniden dene" loading={busyKey === "retry"} onClick={syncProvider} variant="warning" />}
                </div>

                {selectedProvider.provider.supportsWebhook && (
                  <div className="mt-5 rounded-[22px] border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                    <div className="flex items-center gap-2 font-semibold">
                      <Plug className="h-4 w-4" />
                      Webhook desteği aktif
                    </div>
                    <p className="mt-2 leading-6 text-blue-700">Anlık senkronizasyon için webhook tabanlı akış kullanılabilir.</p>
                  </div>
                )}
              </section>

              <section className={`rounded-[30px] border p-6 shadow-[0_18px_45px_rgba(105,78,54,0.08)] ${isConnected ? "border-emerald-200 bg-emerald-50" : hasError ? "border-red-200 bg-red-50" : "border-[#eadccd] bg-white/95"}`}>
                <div className="flex items-start gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] ${isConnected ? "bg-white text-emerald-600" : hasError ? "bg-white text-red-600" : "bg-[#fcf8f3] text-[#7b6656]"}`}>
                    {isConnected ? <CheckCircle2 className="h-6 w-6" /> : hasError ? <AlertTriangle className="h-6 w-6" /> : <Unplug className="h-6 w-6" />}
                  </div>
                  <div>
                    <SectionPill>Bağlantı durumu</SectionPill>
                    <p className={`mt-3 text-lg font-semibold tracking-[-0.02em] ${isConnected ? "text-emerald-900" : hasError ? "text-red-900" : "text-[#2f241d]"}`}>
                      {isConnected ? "Bağlantı aktif" : hasError ? "Bağlantı hatası" : "Bağlantı bekleniyor"}
                    </p>
                    <p className={`mt-2 text-sm leading-6 ${isConnected ? "text-emerald-800" : hasError ? "text-red-800" : "text-[#7f6858]"}`}>
                      {isConnected ? "Fatura senkronizasyonu çalışıyor." : hasError ? "Lütfen kimlik bilgilerini ve alan eşlemelerini kontrol edin." : "Bağlantı kurmak için form alanlarını doldurun."}
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  loading,
  variant = "primary",
}: {
  icon: ElementType;
  label: string;
  onClick: () => void;
  loading?: boolean;
  variant?: "primary" | "secondary" | "warning";
}) {
  const className =
    variant === "primary"
      ? "border border-[#f8b98d] bg-gradient-to-r from-[#FE6100] to-[#d97706] text-white shadow-[0_18px_40px_rgba(254,97,0,0.20)] hover:brightness-105"
      : variant === "warning"
        ? "border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
        : "border border-[#eadccd] bg-white text-[#7b6656] hover:border-[#FE6100]/20 hover:bg-[#fff8f1] hover:text-[#C54E00]";

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16 ${className}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}
