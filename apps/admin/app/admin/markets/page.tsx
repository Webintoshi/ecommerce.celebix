"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType, ElementType } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ExternalLink,
  Loader2,
  Package,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Unplug,
  AlertCircle,
} from "lucide-react";
import {
  AmazonTrLogo,
  HepsiburadaLogo,
  N11Logo,
  TrendyolLogo,
} from "@/components/marketplace/marketplace-logos";
import { cn } from "@/lib/utils";
import type {
  MarketplaceIntegrationView,
  MarketplaceListingView,
  MarketplaceProvider,
  MarketplaceSyncLogView,
} from "@/types/marketplace";

type ProviderFormState = {
  credentials: Record<string, string>;
  fieldMappings: Record<string, string>;
  settings: Record<string, unknown>;
};

function createFormState(item: MarketplaceIntegrationView): ProviderFormState {
  const credentials: Record<string, string> = {};
  item.provider.credentialFields.forEach((field) => {
    credentials[field.key] = "";
  });

  const fieldMappings: Record<string, string> = {};
  item.provider.mappingFields.forEach((field) => {
    fieldMappings[field.key] = item.connection?.fieldMappings?.[field.key] || "";
  });

  return {
    credentials,
    fieldMappings,
    settings: item.connection?.settings || {},
  };
}

// Sağlayıcı renkleri
type ProviderColorStyle = {
  bg: string;
  text: string;
};

const PROVIDER_COLORS: Record<string, ProviderColorStyle> = {
  trendyol: { bg: "bg-orange-100", text: "text-orange-700" },
  hepsiburada: { bg: "bg-red-100", text: "text-red-700" },
  n11: { bg: "bg-blue-100", text: "text-blue-700" },
  amazon_tr: { bg: "bg-slate-100", text: "text-slate-700" },
  ciceksepeti: { bg: "bg-pink-100", text: "text-pink-700" },
};

const PROVIDER_LOGOS: Partial<Record<MarketplaceProvider, ComponentType<{ size?: number }>>> = {
  trendyol: TrendyolLogo,
  hepsiburada: HepsiburadaLogo,
  n11: N11Logo,
  amazon_tr: AmazonTrLogo,
};

function ProviderLogo({
  provider,
  size,
  colorStyle,
  className,
}: {
  provider: MarketplaceIntegrationView["provider"];
  size: number;
  colorStyle: ProviderColorStyle;
  className?: string;
}) {
  const LogoComponent = PROVIDER_LOGOS[provider.id];

  return (
    <div
      className={cn(
        "flex items-center justify-center shrink-0 overflow-hidden rounded-2xl",
        LogoComponent ? "bg-white" : `${colorStyle.bg} ${colorStyle.text}`,
        className
      )}
    >
      {LogoComponent ? (
        <LogoComponent size={size} />
      ) : (
        <span className={cn("font-bold leading-none", size >= 64 ? "text-2xl" : "text-xl")}>{provider.logo}</span>
      )}
    </div>
  );
}

export default function MarketsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<MarketplaceIntegrationView[]>([]);
  const [forms, setForms] = useState<Record<string, ProviderFormState>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<MarketplaceProvider | null>(null);
  const [logsByProvider, setLogsByProvider] = useState<Record<string, MarketplaceSyncLogView[]>>({});
  const [listingsByProvider, setListingsByProvider] = useState<Record<string, MarketplaceListingView[]>>({});
  const [view, setView] = useState<"list" | "detail">("list");

  const fetchIntegrations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/marketplace-integrations", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Pazaryeri entegrasyonları alınamadı.");
      }

      const list = (result.integrations || []) as MarketplaceIntegrationView[];
      setIntegrations(list);
      setForms((current) => {
        const next = { ...current };
        for (const integration of list) {
          next[integration.provider.id] = next[integration.provider.id] || createFormState(integration);
        }
        return next;
      });
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Entegrasyonlar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchIntegrations();
  }, [fetchIntegrations]);

  const sortedIntegrations = useMemo(
    () =>
      [...integrations].sort((a, b) => {
        const aActive = a.connection?.status === "active" ? 0 : a.connection?.status === "error" ? 1 : 2;
        const bActive = b.connection?.status === "active" ? 0 : b.connection?.status === "error" ? 1 : 2;
        return aActive - bActive;
      }),
    [integrations]
  );

  const totals = useMemo(
    () =>
      integrations.reduce(
        (acc, integration) => {
          acc.totalConnections += integration.connection ? 1 : 0;
          acc.activeConnections += integration.connection?.status === "active" ? 1 : 0;
          acc.totalQueue += integration.queueStats.queued;
          acc.totalListings += integration.listingStats.total;
          return acc;
        },
        { totalConnections: 0, activeConnections: 0, totalQueue: 0, totalListings: 0 }
      ),
    [integrations]
  );

  const updateCredential = (providerId: string, key: string, value: string) => {
    setForms((current) => ({
      ...current,
      [providerId]: {
        ...(current[providerId] || { credentials: {}, fieldMappings: {}, settings: {} }),
        credentials: { ...(current[providerId]?.credentials || {}), [key]: value },
      },
    }));
  };

  const updateMapping = (providerId: string, key: string, value: string) => {
    setForms((current) => ({
      ...current,
      [providerId]: {
        ...(current[providerId] || { credentials: {}, fieldMappings: {}, settings: {} }),
        fieldMappings: { ...(current[providerId]?.fieldMappings || {}), [key]: value },
      },
    }));
  };

  const loadLogs = useCallback(async (providerId: MarketplaceProvider) => {
    setBusyKey(`${providerId}:logs`);
    try {
      const response = await fetch(`/api/admin/marketplace-integrations/${providerId}/logs?limit=20`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result?.error || "Loglar alınamadı.");
      setLogsByProvider((current) => ({ ...current, [providerId]: (result.logs || []) as MarketplaceSyncLogView[] }));
    } catch (logError) {
      alert(logError instanceof Error ? logError.message : "Log yükleme hatası.");
    } finally {
      setBusyKey(null);
    }
  }, []);

  const loadListings = useCallback(async (providerId: MarketplaceProvider) => {
    setBusyKey(`${providerId}:listings`);
    try {
      const response = await fetch(`/api/admin/marketplace-integrations/${providerId}/listings?limit=60`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result?.error || "Listingler alınamadı.");
      setListingsByProvider((current) => ({ ...current, [providerId]: (result.listings || []) as MarketplaceListingView[] }));
    } catch (listingError) {
      alert(listingError instanceof Error ? listingError.message : "Listing yükleme hatası.");
    } finally {
      setBusyKey(null);
    }
  }, []);

  const connectProvider = async (providerId: MarketplaceProvider) => {
    const form = forms[providerId];
    if (!form) return;

    setBusyKey(`${providerId}:connect`);
    try {
      const response = await fetch(`/api/admin/marketplace-integrations/${providerId}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials: form.credentials, fieldMappings: form.fieldMappings, settings: form.settings }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result?.error || "Bağlantı kaydedilemedi.");

      await fetchIntegrations();
      await Promise.all([loadListings(providerId), loadLogs(providerId)]);
      alert(result.testResult?.message || "Bağlantı kaydedildi.");
    } catch (connectError) {
      alert(connectError instanceof Error ? connectError.message : "Bağlantı hatası.");
    } finally {
      setBusyKey(null);
    }
  };

  const testProvider = async (providerId: MarketplaceProvider) => {
    setBusyKey(`${providerId}:test`);
    try {
      const response = await fetch(`/api/admin/marketplace-integrations/${providerId}/test`, { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result?.error || "Bağlantı testi başarısız.");
      alert(result.result?.message || "Bağlantı testi başarılı.");
      await fetchIntegrations();
      await loadLogs(providerId);
    } catch (testError) {
      alert(testError instanceof Error ? testError.message : "Test hatası.");
    } finally {
      setBusyKey(null);
    }
  };

  const syncProvider = async (providerId: MarketplaceProvider) => {
    setBusyKey(`${providerId}:sync`);
    try {
      const response = await fetch(`/api/admin/marketplace-integrations/${providerId}/sync`, { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result?.error || "Senkronizasyon başarısız.");

      await fetchIntegrations();
      await Promise.all([loadListings(providerId), loadLogs(providerId)]);
      alert("Senkronizasyon tamamlandı.");
    } catch (syncError) {
      alert(syncError instanceof Error ? syncError.message : "Senkronizasyon hatası.");
    } finally {
      setBusyKey(null);
    }
  };

  const openDetail = (providerId: MarketplaceProvider) => {
    setSelectedProvider(providerId);
    setView("detail");
    void Promise.all([loadListings(providerId), loadLogs(providerId)]);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // LIST VIEW
  if (view === "list") {
    return (
      <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pazaryeri Entegrasyonları</h1>
            <p className="text-sm text-gray-500 mt-1">Trendyol, Hepsiburada, N11 ve diğer pazaryerlerini yönetin.</p>
          </div>
          <button
            onClick={fetchIntegrations}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Yenile
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Bağlantı" value={totals.totalConnections} icon={Store} color="blue" />
          <StatCard title="Aktif" value={totals.activeConnections} icon={CheckCircle2} color="green" />
          <StatCard title="Bekleyen" value={totals.totalQueue} icon={RefreshCw} color="amber" />
          <StatCard title="Listing" value={totals.totalListings} icon={ShoppingBag} color="purple" />
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Provider Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedIntegrations.map((integration) => {
            const providerId = integration.provider.id;
            const isConnected = integration.connection?.status === "active";
            const hasError = integration.connection?.status === "error";
            const colorStyle = PROVIDER_COLORS[providerId] || { bg: "bg-gray-100", text: "text-gray-700" };

            return (
              <button
                key={providerId}
                onClick={() => openDetail(providerId)}
                className={cn(
                  "text-left bg-white rounded-2xl border p-5 transition-all hover:shadow-md",
                  isConnected ? "border-green-200" : hasError ? "border-red-200" : "border-gray-200"
                )}
              >
                <div className="flex items-start gap-4">
                  <ProviderLogo
                    provider={integration.provider}
                    size={56}
                    colorStyle={colorStyle}
                    className="h-14 w-14"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{integration.provider.name}</h3>
                      {isConnected && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-2">{integration.provider.description}</p>

                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      {isConnected ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <CheckCircle2 className="w-3 h-3" />
                          Bağlı
                        </span>
                      ) : hasError ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          <AlertCircle className="w-3 h-3" />
                          Hata
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          <Unplug className="w-3 h-3" />
                          Bağlı Değil
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-gray-400">Bekleyen</p>
                      <p className="font-semibold text-gray-900">{integration.queueStats.queued}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Listing</p>
                      <p className="font-semibold text-gray-900">{integration.listingStats.total}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Hatalı</p>
                      <p className={cn("font-semibold", integration.queueStats.failed > 0 ? "text-red-600" : "text-gray-900")}>
                        {integration.queueStats.failed}
                      </p>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // DETAIL VIEW
  if (view === "detail" && selectedProvider) {
    const integration = integrations.find((i) => i.provider.id === selectedProvider);
    if (!integration) return null;

    const providerId = integration.provider.id;
    const form = forms[providerId] || createFormState(integration);
    const isConnected = integration.connection?.status === "active";
    const hasError = integration.connection?.status === "error";
    const colorStyle = PROVIDER_COLORS[providerId] || { bg: "bg-gray-100", text: "text-gray-700" };
    const listings = listingsByProvider[selectedProvider] || [];
    const logs = logsByProvider[selectedProvider] || [];

    return (
      <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Back Button */}
          <button
            onClick={() => setView("list")}
            className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Tüm Pazaryerlerine Dön
          </button>

          {/* Header Card */}
          <div className={cn("bg-white rounded-2xl border p-6", isConnected ? "border-green-200" : hasError ? "border-red-200" : "border-gray-200")}>
            <div className="flex items-center gap-4">
              <ProviderLogo
                provider={integration.provider}
                size={64}
                colorStyle={colorStyle}
                className="h-16 w-16"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-gray-900">{integration.provider.name}</h1>
                  {isConnected ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      <CheckCircle2 className="w-3 h-3" />
                      Bağlı
                    </span>
                  ) : hasError ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                      <AlertCircle className="w-3 h-3" />
                      Hata
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      <Unplug className="w-3 h-3" />
                      Bağlı Değil
                    </span>
                  )}
                </div>
                <p className="text-gray-500 mt-1">{integration.provider.description}</p>
                <div className="flex items-center gap-4 mt-2">
                  <a href={integration.provider.websiteUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                    Panel <ExternalLink className="w-3 h-3" />
                  </a>
                  {integration.provider.docsUrl && (
                    <a href={integration.provider.docsUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                      API Dökümanı <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* API Credentials */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Settings className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-900">API Bilgileri</h2>
                    <p className="text-sm text-gray-500">Pazaryeri panelinden alınan kimlik bilgileri</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {integration.provider.credentialFields.map((field) => (
                    <div key={field.key} className={field.type === "textarea" ? "md:col-span-2" : ""}>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      {field.type === "textarea" ? (
                        <textarea
                          value={form.credentials[field.key] || ""}
                          onChange={(e) => updateCredential(providerId, field.key, e.target.value)}
                          placeholder={field.placeholder || field.label}
                          rows={3}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                      ) : (
                        <input
                          type={field.type === "password" ? "password" : "text"}
                          value={form.credentials[field.key] || ""}
                          onChange={(e) => updateCredential(providerId, field.key, e.target.value)}
                          placeholder={field.placeholder || field.label}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                      )}
                      <p className="text-xs text-gray-400 mt-1">{field.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Field Mappings */}
              {integration.provider.mappingFields.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                      <Package className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-900">Alan Eşleme</h2>
                      <p className="text-sm text-gray-500">Ürün alanlarını pazaryeri alanlarıyla eşleştirin</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {integration.provider.mappingFields.map((field) => (
                      <div key={field.key}>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}</label>
                        <input
                          value={form.fieldMappings[field.key] || ""}
                          onChange={(e) => updateMapping(providerId, field.key, e.target.value)}
                          placeholder={field.placeholder || "Opsiyonel"}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Listings Table */}
              {listings.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ShoppingBag className="w-5 h-5 text-gray-400" />
                      <h3 className="font-semibold text-gray-900">Listing Eşleşmeleri</h3>
                    </div>
                    <button
                      onClick={() => loadListings(selectedProvider)}
                      disabled={busyKey === `${selectedProvider}:listings`}
                      className="text-sm text-primary hover:underline disabled:opacity-50"
                    >
                      {busyKey === `${selectedProvider}:listings` ? "Yükleniyor..." : "Yenile"}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Ürün</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">SKU</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Fiyat / Stok</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Durum</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {listings.slice(0, 10).map((listing) => (
                          <tr key={listing.variantId} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">{listing.productName}</div>
                              <div className="text-xs text-gray-500">{listing.variantName}</div>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs">{listing.sku || "-"}</td>
                            <td className="px-4 py-3">
                              {listing.price.toLocaleString("tr-TR")} ₺ / {listing.stock}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  "inline-flex px-2 py-1 rounded-full text-xs font-medium",
                                  listing.status === "active" && "bg-green-100 text-green-700",
                                  listing.status === "error" && "bg-red-100 text-red-700",
                                  listing.status === "pending" && "bg-amber-100 text-amber-700"
                                )}
                              >
                                {listing.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Actions & Logs */}
            <div className="space-y-6">
              {/* Quick Actions */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4">İşlemler</h3>
                <div className="space-y-3">
                  <ActionButton
                    icon={Save}
                    label="Bağlan / Kaydet"
                    loading={busyKey === `${providerId}:connect`}
                    onClick={() => connectProvider(providerId)}
                    variant="primary"
                  />
                  <ActionButton
                    icon={ShieldCheck}
                    label="Bağlantıyı Test Et"
                    loading={busyKey === `${providerId}:test`}
                    onClick={() => testProvider(providerId)}
                    variant="secondary"
                  />
                  <ActionButton
                    icon={RefreshCw}
                    label="Senkronize Et"
                    loading={busyKey === `${providerId}:sync`}
                    onClick={() => syncProvider(providerId)}
                    variant="secondary"
                  />
                </div>

                <div className="mt-6 pt-6 border-t border-gray-100 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Webhook</span>
                    <span className="font-medium">{integration.provider.supportsWebhook ? "Destekli" : "Polling"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Son Senkron</span>
                    <span className="font-medium">
                      {integration.connection?.lastSyncAt
                        ? new Date(integration.connection.lastSyncAt).toLocaleDateString("tr-TR")
                        : "-"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Kuyruk Durumu</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <span className="text-sm text-gray-600">Bekleyen</span>
                    <span className="font-semibold text-gray-900">{integration.queueStats.queued}</span>
                  </div>
                  <div className={cn("flex items-center justify-between p-3 rounded-xl", integration.queueStats.failed > 0 ? "bg-red-50" : "bg-gray-50")}>
                    <span className={cn("text-sm", integration.queueStats.failed > 0 ? "text-red-600" : "text-gray-600")}>Hatalı</span>
                    <span className={cn("font-semibold", integration.queueStats.failed > 0 ? "text-red-700" : "text-gray-900")}>
                      {integration.queueStats.failed}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <span className="text-sm text-gray-600">Listing</span>
                    <span className="font-semibold text-gray-900">{integration.listingStats.total}</span>
                  </div>
                </div>
              </div>

              {/* Logs */}
              {logs.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900">Son Loglar</h3>
                    <button
                      onClick={() => loadLogs(selectedProvider)}
                      disabled={busyKey === `${selectedProvider}:logs`}
                      className="text-xs text-primary hover:underline disabled:opacity-50"
                    >
                      Yenile
                    </button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-auto">
                    {logs.slice(0, 5).map((log) => (
                      <div key={log.id} className="p-3 bg-gray-50 rounded-xl text-xs">
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              "font-medium",
                              log.status === "success" ? "text-green-700" : log.status === "error" ? "text-red-700" : "text-gray-700"
                            )}
                          >
                            {log.status}
                          </span>
                          <span className="text-gray-400">{new Date(log.createdAt).toLocaleDateString("tr-TR")}</span>
                        </div>
                        <p className="text-gray-500 mt-1">
                          {log.direction} / {log.entityType}
                        </p>
                        {log.errorMessage && <p className="text-red-600 mt-1">{log.errorMessage}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function StatCard({ title, value, icon: Icon, color }: { title: string; value: number; icon: ElementType; color: "blue" | "green" | "amber" | "purple" }) {
  const colors = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    amber: "bg-amber-100 text-amber-600",
    purple: "bg-purple-100 text-purple-600",
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
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
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        "w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50",
        variant === "primary"
          ? "bg-primary text-white hover:bg-primary/90"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      )}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      {label}
    </button>
  );
}
