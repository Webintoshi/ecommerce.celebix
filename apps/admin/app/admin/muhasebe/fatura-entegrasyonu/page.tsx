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

// Entegrasyon sağlayıcı stilleri
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
      <div className={`${className} rounded-2xl ${providerStyle.bg} ${providerStyle.text} flex items-center justify-center`}>
        <span className={`font-bold leading-none ${size >= 64 ? "text-2xl" : "text-xl"}`}>{providerStyle.abbr}</span>
      </div>
    );
  }

  return (
    <div className={`${className} rounded-2xl bg-white flex items-center justify-center overflow-hidden`}>
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

type View = "list" | "detail";

export default function AccountingIntegrationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<AccountingIntegrationView[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<AccountingIntegrationView | null>(null);
  const [view, setView] = useState<View>("list");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [logsByProvider, setLogsByProvider] = useState<Record<string, Array<Record<string, unknown>>>>({});
  
  // Form state - dinamik olarak sağlayıcıdan gelen alanlara göre
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

  // Entegrasyon seçildiğinde form state'i başlat
  const handleSelectProvider = (integration: AccountingIntegrationView) => {
    setSelectedProvider(integration);
    
    // Form state'i sağlayıcının alanlarına göre başlat
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

  // İstatistikler
  const connectedCount = integrations.filter((i) => i.connection?.status === "active").length;
  const totalFailed = integrations.reduce((sum, i) => sum + i.queueStats.failed, 0);

  // LIST VIEW
  if (view === "list") {
    return (
      <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Fatura Entegrasyonu</h1>
            <p className="text-sm text-gray-500 mt-1">Paraşüt, BizimHesap, Mikro, Logo İşbaşı, KolayBi ve Mükellef bağlantılarını yönetin.</p>
          </div>
          <button
            onClick={fetchIntegrations}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Yenile
          </button>
        </div>

        {/* Özet Kartlar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                <Plug className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{connectedCount}</p>
                <p className="text-sm text-gray-500">Aktif Bağlantı</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{integrations.length}</p>
                <p className="text-sm text-gray-500">Toplam Sağlayıcı</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${totalFailed > 0 ? "bg-red-100" : "bg-gray-100"}`}>
                <AlertTriangle className={`w-5 h-5 ${totalFailed > 0 ? "text-red-600" : "text-gray-600"}`} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${totalFailed > 0 ? "text-red-600" : "text-gray-900"}`}>{totalFailed}</p>
                <p className="text-sm text-gray-500">Hatalı İşlem</p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <XCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Sağlayıcı Listesi */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Muhasebe Programları</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sortedIntegrations.map((integration) => {
              const isConnected = integration.connection?.status === "active";
              const hasError = integration.connection?.status === "error";
              const style = PROVIDER_STYLES[integration.provider.id] || { bg: "bg-gray-100", text: "text-gray-700", abbr: "?", color: "gray" };

              return (
                <button
                  key={integration.provider.id}
                  onClick={() => handleSelectProvider(integration)}
                  className={`text-left bg-white rounded-2xl border p-5 transition-all hover:shadow-md ${
                    isConnected
                      ? "border-green-200 hover:border-green-300"
                      : hasError
                        ? "border-red-200 hover:border-red-300"
                        : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Logo */}
                    <AccountingProviderLogo
                      providerId={integration.provider.id}
                      providerName={integration.provider.name}
                      providerStyle={style}
                      size={56}
                      className="w-14 h-14 shrink-0"
                    />

                    {/* Bilgiler */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">{integration.provider.name}</h3>
                        {isConnected && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                      </div>
                      <p className="text-sm text-gray-500 line-clamp-2">{integration.provider.description}</p>

                      {/* Durum Badge */}
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        {isConnected ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            <Plug className="w-3 h-3" />
                            Bağlı
                          </span>
                        ) : hasError ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            <AlertTriangle className="w-3 h-3" />
                            Hata
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            <Unplug className="w-3 h-3" />
                            Bağlı Değil
                          </span>
                        )}

                        {/* Mini istatistikler */}
                        {isConnected && (
                          <>
                            {integration.queueStats.queued > 0 && (
                              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                                {integration.queueStats.queued} bekleyen
                              </span>
                            )}
                            {integration.queueStats.failed > 0 && (
                              <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                                {integration.queueStats.failed} hata
                              </span>
                            )}
                          </>
                        )}
                      </div>

                      {/* Son senkron */}
                      {integration.connection?.lastSyncAt && (
                        <p className="text-xs text-gray-400 mt-2">
                          Son senkron: {new Date(integration.connection.lastSyncAt).toLocaleString("tr-TR")}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Yardım Kutusu */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">Nasıl Çalışır?</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• 1. Yukarıdan kullandığınız muhasebe programını seçin</li>
                <li>• 2. API bilgilerinizi girin ve alan eşlemelerini yapın</li>
                <li>• 3. Bağlantıyı test edin ve senkronize edin</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // DETAIL VIEW
  if (view === "detail" && selectedProvider) {
    const style = PROVIDER_STYLES[selectedProvider.provider.id] || { bg: "bg-gray-100", text: "text-gray-700", abbr: "?", color: "gray" };
    const isConnected = selectedProvider.connection?.status === "active";
    const hasError = selectedProvider.connection?.status === "error";
    const logs = logsByProvider[selectedProvider.provider.id] || [];

    return (
      <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
        <div className="max-w-5xl mx-auto">
          {/* Geri Butonu */}
          <button
            onClick={() => setView("list")}
            className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Tüm Entegrasyonlara Dön
          </button>

          {/* Başlık Kartı */}
          <div className={`bg-white rounded-2xl border p-6 mb-6 ${isConnected ? "border-green-200" : hasError ? "border-red-200" : "border-gray-200"}`}>
            <div className="flex items-center gap-4">
              <AccountingProviderLogo
                providerId={selectedProvider.provider.id}
                providerName={selectedProvider.provider.name}
                providerStyle={style}
                size={64}
                className="w-16 h-16"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-gray-900">{selectedProvider.provider.name}</h1>
                  {isConnected ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      <CheckCircle2 className="w-3 h-3" />
                      Bağlı
                    </span>
                  ) : hasError ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                      <AlertTriangle className="w-3 h-3" />
                      Hatalı
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      <Unplug className="w-3 h-3" />
                      Bağlı Değil
                    </span>
                  )}
                </div>
                <p className="text-gray-500">{selectedProvider.provider.description}</p>
              </div>
              <a
                href={selectedProvider.provider.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors text-sm"
              >
                Resmi Site
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sol Kolon - Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* API Bağlantı Bilgileri */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-900">API Bağlantı Bilgileri</h2>
                    <p className="text-sm text-gray-500">{selectedProvider.provider.name} hesabınızın API bilgilerini girin</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedProvider.provider.credentialFields.map((field) => (
                    <div key={field.key} className={field.type === "textarea" ? "md:col-span-2" : ""}>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      {field.type === "textarea" ? (
                        <textarea
                          value={formState.credentials[field.key] || ""}
                          onChange={(e) => updateCredential(field.key, e.target.value)}
                          placeholder={field.placeholder || field.label}
                          rows={3}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                        />
                      ) : (
                        <input
                          type={field.type === "password" ? "password" : "text"}
                          value={formState.credentials[field.key] || ""}
                          onChange={(e) => updateCredential(field.key, e.target.value)}
                          placeholder={field.placeholder || field.label}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Alan Eşleme */}
              {selectedProvider.provider.mappingFields.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                      <MoreHorizontal className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-900">Alan Eşleme</h2>
                      <p className="text-sm text-gray-500">Sistem alanlarını sağlayıcı alanlarıyla eşleştirin</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedProvider.provider.mappingFields.map((field) => (
                      <div key={field.key}>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}</label>
                        <input
                          type="text"
                          value={formState.fieldMappings[field.key] || ""}
                          onChange={(e) => updateMapping(field.key, e.target.value)}
                          placeholder={field.placeholder || "Opsiyonel"}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Senkron Ayarları */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-900">Senkron Ayarı</h2>
                    <p className="text-sm text-gray-500">Veri senkronizasyon modunu seçin</p>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">Güvenli Hibrit</span>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Önerilen</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    Outbound: anlık kuyruk + 5 dakika worker. Inbound: webhook varsa anlık, yoksa 15 dakika poll.
                  </p>
                </div>

                {selectedProvider.connection?.lastSyncAt && (
                  <p className="text-sm text-gray-500 mt-3">
                    Son senkron: <span className="font-medium text-gray-900">{new Date(selectedProvider.connection.lastSyncAt).toLocaleString("tr-TR")}</span>
                  </p>
                )}
              </div>

              {/* Loglar */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                      <Terminal className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-900">Hata Günlüğü</h2>
                      <p className="text-sm text-gray-500">Son işlem logları</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {logs.length > 0 && (
                      <button
                        onClick={clearLogs}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Logları Temizle"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={loadLogs}
                      disabled={busyKey === "logs"}
                      className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
                    >
                      {busyKey === "logs" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Logları Yükle
                    </button>
                  </div>
                </div>

                {logs.length > 0 ? (
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="max-h-64 overflow-auto">
                      {logs.map((log, index) => (
                        <div key={`log-${index}`} className="px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-xs font-medium px-2 py-1 rounded-full ${
                                log.status === "success"
                                  ? "bg-green-100 text-green-700"
                                  : log.status === "error"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {String(log.status || "unknown")}
                            </span>
                            <span className="text-xs text-gray-400">{String(log.created_at || "")}</span>
                          </div>
                          <p className="text-sm text-gray-600 mt-2">{String(log.error_message || log.entity_type || "Detay yok")}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-50 rounded-xl">
                    <Terminal className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Henüz log yok</p>
                    <p className="text-xs text-gray-400">Logları görmek için yukarıdaki butona tıklayın</p>
                  </div>
                )}
              </div>
            </div>

            {/* Sağ Kolon - İstatistikler ve İşlemler */}
            <div className="space-y-6">
              {/* İstatistikler */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Kuyruk Durumu</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <span className="text-sm text-gray-600">Bekleyen</span>
                    <span className="font-semibold text-gray-900">{selectedProvider.queueStats.queued}</span>
                  </div>
                  <div className={`flex items-center justify-between p-3 rounded-xl ${selectedProvider.queueStats.failed > 0 ? "bg-red-50" : "bg-gray-50"}`}>
                    <span className={`text-sm ${selectedProvider.queueStats.failed > 0 ? "text-red-600" : "text-gray-600"}`}>Hatalı</span>
                    <span className={`font-semibold ${selectedProvider.queueStats.failed > 0 ? "text-red-700" : "text-gray-900"}`}>{selectedProvider.queueStats.failed}</span>
                  </div>
                  <div className={`flex items-center justify-between p-3 rounded-xl ${selectedProvider.queueStats.manualActionRequired > 0 ? "bg-amber-50" : "bg-gray-50"}`}>
                    <span className={`text-sm ${selectedProvider.queueStats.manualActionRequired > 0 ? "text-amber-600" : "text-gray-600"}`}>Manuel İşlem</span>
                    <span className={`font-semibold ${selectedProvider.queueStats.manualActionRequired > 0 ? "text-amber-700" : "text-gray-900"}`}>
                      {selectedProvider.queueStats.manualActionRequired}
                    </span>
                  </div>
                </div>
              </div>

              {/* Hızlı İşlemler */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4">İşlemler</h3>
                <div className="space-y-3">
                  <ActionButton
                    icon={Save}
                    label="Bağlan / Kaydet"
                    loading={busyKey === "connect"}
                    onClick={connectProvider}
                    variant="primary"
                  />
                  <ActionButton
                    icon={ShieldCheck}
                    label="Bağlantıyı Test Et"
                    loading={busyKey === "test"}
                    onClick={testProvider}
                    variant="secondary"
                  />
                  <ActionButton
                    icon={RefreshCw}
                    label="Senkronize Et"
                    loading={busyKey === "sync"}
                    onClick={syncProvider}
                    variant="secondary"
                  />
                  {hasError && (
                    <ActionButton
                      icon={RefreshCw}
                      label="Yeniden Dene"
                      loading={busyKey === "retry"}
                      onClick={syncProvider}
                      variant="warning"
                    />
                  )}
                </div>

                {selectedProvider.provider.supportsWebhook && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-xl">
                    <p className="text-xs text-blue-700 flex items-center gap-2">
                      <Plug className="w-3 h-3" />
                      Webhook destekli - anlık senkronizasyon
                    </p>
                  </div>
                )}
              </div>

              {/* Bağlantı Durumu */}
              <div className={`rounded-2xl border p-6 ${isConnected ? "bg-green-50 border-green-200" : hasError ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
                <div className="flex items-center gap-3">
                  {isConnected ? (
                    <>
                      <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-green-900">Bağlantı Aktif</p>
                        <p className="text-sm text-green-700">Fatura senkronizasyonu çalışıyor</p>
                      </div>
                    </>
                  ) : hasError ? (
                    <>
                      <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                        <AlertTriangle className="w-6 h-6 text-red-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-red-900">Bağlantı Hatası</p>
                        <p className="text-sm text-red-700">Lütfen bilgileri kontrol edin</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-xl bg-gray-200 flex items-center justify-center">
                        <Unplug className="w-6 h-6 text-gray-500" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-700">Bağlantı Yok</p>
                        <p className="text-sm text-gray-500">Bağlanmak için formu doldurun</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// Action Button Component
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
      ? "w-full bg-primary text-white hover:bg-primary/90"
      : variant === "warning"
        ? "w-full bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-200"
        : "w-full bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200";

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-60 ${className}`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      {label}
    </button>
  );
}
