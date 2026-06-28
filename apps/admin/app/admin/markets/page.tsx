"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType, ElementType } from "react";
import {
  CheckCircle2,
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
  GoogleMerchantLogo,
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
  google_merchant: { bg: "bg-blue-100", text: "text-blue-700" },
  ciceksepeti: { bg: "bg-pink-100", text: "text-pink-700" },
};

const PROVIDER_LOGOS: Partial<Record<MarketplaceProvider, ComponentType<{ size?: number }>>> = {
  trendyol: TrendyolLogo,
  hepsiburada: HepsiburadaLogo,
  n11: N11Logo,
  amazon_tr: AmazonTrLogo,
  google_merchant: GoogleMerchantLogo,
};

const WARM_INPUT =
  "w-full rounded-[8px] border border-[var(--admin-border)] bg-white px-4 py-3 text-sm text-[var(--admin-heading)] shadow-sm outline-none transition placeholder:text-[var(--admin-text-muted)] focus:border-[var(--admin-accent-border)] focus:ring-4 focus:ring-[var(--admin-accent)]/15";

function ConnectionBadge({ isConnected, hasError }: { isConnected: boolean; hasError: boolean }) {
  if (isConnected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        Bagli
      </span>
    );
  }

  if (hasError) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
        <AlertCircle className="h-3 w-3" />
        Hata
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e6dbd1] bg-[#F9FAFB] px-3 py-1.5 text-xs font-semibold text-[var(--admin-text-secondary)]">
      <Unplug className="h-3 w-3" />
      Bagli Degil
    </span>
  );
}

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
        "flex items-center justify-center shrink-0 overflow-hidden rounded-[8px]",
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
      <div className="admin-page-root flex items-center justify-center p-6 md:p-8">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--admin-accent)]" />
      </div>
    );
  }

  // LIST VIEW
  if (view === "list") {
    return (
      <div className="admin-page-root px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-none space-y-6">
        <section className="relative overflow-hidden rounded-[12px] border border-[var(--admin-border)] bg-white p-6 shadow-[var(--shadow-xs)] md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="inline-flex w-fit items-center rounded-full border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--admin-accent-hover)]">
              Pazaryeri Entegrasyonlari
            </div>
          <button
            onClick={fetchIntegrations}
            className="inline-flex items-center gap-2 rounded-[8px] border border-[var(--admin-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--admin-text-secondary)] shadow-sm transition-all hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] hover:text-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"
          >
            <RefreshCw className="w-4 h-4" />
            Yenile
          </button>
          </div>
          <div className="hidden" />
        </section>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Bağlantı" value={totals.totalConnections} icon={Store} color="blue" />
          <StatCard title="Aktif" value={totals.activeConnections} icon={CheckCircle2} color="green" />
          <StatCard title="Bekleyen" value={totals.totalQueue} icon={RefreshCw} color="amber" />
          <StatCard title="Listing" value={totals.totalListings} icon={ShoppingBag} color="purple" />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

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
                  "rounded-[12px] border bg-white p-5 text-left shadow-[var(--shadow-xs)] transition-all hover:-translate-y-1 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]",
                  isConnected
                    ? "border-emerald-200 hover:shadow-[0_24px_55px_rgba(16,185,129,0.14)]"
                    : hasError
                      ? "border-rose-200 hover:shadow-[0_24px_55px_rgba(244,63,94,0.12)]"
                      : "border-[var(--admin-border)] hover:border-[var(--admin-accent-border)] hover:shadow-[var(--shadow-xs)]"
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
                      <h3 className="font-semibold tracking-[-0.02em] text-[var(--admin-heading)]">{integration.provider.name}</h3>
                      {isConnected && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    </div>
                    <p className="line-clamp-2 text-sm leading-6 text-[#7d6959]">{integration.provider.description}</p>

                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <ConnectionBadge isConnected={isConnected} hasError={hasError} />
                    </div>
                  </div>
                </div>

                <div className="mt-4 border-t border-[var(--admin-border)] pt-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-[20px] border border-[var(--admin-border)] bg-[#FCFDFE] px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Bekleyen</p>
                      <p className="mt-1 font-semibold text-[var(--admin-heading)]">{integration.queueStats.queued}</p>
                    </div>
                    <div className="rounded-[20px] border border-[var(--admin-border)] bg-[#FCFDFE] px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Listing</p>
                      <p className="mt-1 font-semibold text-[var(--admin-heading)]">{integration.listingStats.total}</p>
                    </div>
                    <div className="rounded-[20px] border border-[var(--admin-border)] bg-[#FCFDFE] px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Hatali</p>
                      <p className={cn("mt-1 font-semibold", integration.queueStats.failed > 0 ? "text-rose-600" : "text-[var(--admin-heading)]")}>
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
    const googleFeedUrl =
      providerId === "google_merchant" && typeof integration.connection?.settings?.feedUrl === "string"
        ? integration.connection.settings.feedUrl
        : "";
    const googleFeedItemCount =
      providerId === "google_merchant" && typeof integration.connection?.settings?.feedItemCount === "number"
        ? integration.connection.settings.feedItemCount
        : null;
    const googleFeedIssueCount =
      providerId === "google_merchant" && typeof integration.connection?.settings?.feedIssueCount === "number"
        ? integration.connection.settings.feedIssueCount
        : null;

    return (
      <div className="admin-page-root px-4 py-6 md:px-8 md:py-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className={cn("overflow-hidden rounded-[12px] border bg-white p-6 shadow-[var(--shadow-xs)]", isConnected ? "border-emerald-200" : hasError ? "border-rose-200" : "border-[var(--admin-border)]")}>
            <div className="flex items-center gap-4">
              <ProviderLogo
                provider={integration.provider}
                size={64}
                colorStyle={colorStyle}
                className="h-16 w-16"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold tracking-[-0.03em] text-[var(--admin-heading)]">{integration.provider.name}</h1>
                  <ConnectionBadge isConnected={isConnected} hasError={hasError} />
                </div>
                <p className="mt-2 text-sm leading-6 text-[#7d6959]">{integration.provider.description}</p>
                <div className="flex items-center gap-4 mt-2">
                  <a href={integration.provider.websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-[var(--admin-accent-hover)] hover:text-[#a94500]">
                    Panel <ExternalLink className="w-3 h-3" />
                  </a>
                  {integration.provider.docsUrl && (
                    <a href={integration.provider.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-[var(--admin-accent-hover)] hover:text-[#a94500]">
                      API Dokumani <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {providerId === "google_merchant" && (
            <div className="rounded-[12px] border border-[var(--admin-border)] bg-white p-6 shadow-[var(--shadow-xs)]">
              <div className="flex items-start justify-between gap-4 flex-col md:flex-row">
                <div className="space-y-2">
                  <h2 className="font-semibold text-[var(--admin-heading)]">Merchant Feed URL</h2>
                  <p className="text-sm leading-6 text-[#7d6959]">
                    Google Merchant Center icinde Scheduled Fetch kaynagi olarak bu adresi kullan.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {googleFeedItemCount !== null && (
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                        {googleFeedItemCount} hazir urun
                      </span>
                    )}
                  {googleFeedIssueCount !== null && (
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
                      {googleFeedIssueCount} issue
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-[12px] border border-[var(--admin-border)] bg-[#FCFDFE] px-4 py-3">
                <div className="flex items-center gap-3">
                  <input
                    readOnly
                    value={googleFeedUrl || "Baglanti kaydedildiginde feed URL burada gorunecek."}
                    className="w-full bg-transparent text-sm text-[var(--admin-text-secondary)] outline-none"
                  />
                  {googleFeedUrl ? (
                    <a
                      href={googleFeedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 rounded-[8px] border border-[var(--admin-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--admin-text-secondary)] shadow-sm transition hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] hover:text-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"
                    >
                      Ac
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm text-[var(--admin-text-secondary)] md:grid-cols-3">
                <div className="rounded-[20px] border border-[var(--admin-border)] bg-[#FCFDFE] px-4 py-3">
                  1. Merchant Center &gt; Products &gt; Data sources
                </div>
                <div className="rounded-[20px] border border-[var(--admin-border)] bg-[#FCFDFE] px-4 py-3">
                  2. Scheduled Fetch sec ve URL olarak bu feed adresini gir
                </div>
                <div className="rounded-[20px] border border-[var(--admin-border)] bg-[#FCFDFE] px-4 py-3">
                  3. Sonra bu ekrandan Senkronize Et ile issue durumlarini kontrol et
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Form */}
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-[12px] border border-[var(--admin-border)] bg-white p-6 shadow-[var(--shadow-xs)]">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-[var(--admin-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent)]">
                    <Settings className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-[var(--admin-heading)]">API Bilgileri</h2>
                    <p className="text-sm text-[#7d6959]">Pazaryeri panelinden alinan kimlik bilgileri</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {integration.provider.credentialFields.map((field) => {
                    const isTextarea = (field.type as string | undefined) === "textarea";

                    return (
                      <div key={field.key} className={isTextarea ? "md:col-span-2" : ""}>
                        <label className="mb-2 block text-sm font-medium text-[var(--admin-text-secondary)]">
                          {field.label}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        {isTextarea ? (
                          <textarea
                            value={form.credentials[field.key] || ""}
                            onChange={(e) => updateCredential(providerId, field.key, e.target.value)}
                            placeholder={field.placeholder || field.label}
                            rows={3}
                            className={WARM_INPUT}
                          />
                        ) : (
                          <input
                            type={field.type === "password" ? "password" : "text"}
                            value={form.credentials[field.key] || ""}
                            onChange={(e) => updateCredential(providerId, field.key, e.target.value)}
                            placeholder={field.placeholder || field.label}
                            className={WARM_INPUT}
                          />
                        )}
                        <p className="mt-1 text-xs text-[#9a8474]">{field.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {integration.provider.mappingFields.length > 0 && (
                <div className="rounded-[12px] border border-[var(--admin-border)] bg-white p-6 shadow-[var(--shadow-xs)]">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-[var(--admin-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)]">
                      <Package className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-[var(--admin-heading)]">Alan Esleme</h2>
                      <p className="text-sm text-[#7d6959]">Ürün alanlarını pazaryeri alanlarıyla eşleştirin</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {integration.provider.mappingFields.map((field) => (
                      <div key={field.key}>
                        <label className="mb-2 block text-sm font-medium text-[var(--admin-text-secondary)]">{field.label}</label>
                        <input
                          value={form.fieldMappings[field.key] || ""}
                          onChange={(e) => updateMapping(providerId, field.key, e.target.value)}
                          placeholder={field.placeholder || "Opsiyonel"}
                          className={WARM_INPUT}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {listings.length > 0 && (
                <div className="overflow-hidden rounded-[12px] border border-[var(--admin-border)] bg-white shadow-[var(--shadow-xs)]">
                  <div className="flex items-center justify-between border-b border-[var(--admin-border)] px-6 py-4">
                    <div className="flex items-center gap-3">
                      <ShoppingBag className="w-5 h-5 text-[var(--admin-accent-hover)]" />
                      <h3 className="font-semibold text-[var(--admin-heading)]">Listing Eslesmeleri</h3>
                    </div>
                    <button
                      onClick={() => loadListings(selectedProvider)}
                      disabled={busyKey === `${selectedProvider}:listings`}
                      className="text-sm font-medium text-[var(--admin-accent-hover)] transition hover:text-[#a94500] disabled:opacity-50"
                    >
                      {busyKey === `${selectedProvider}:listings` ? "Yükleniyor..." : "Yenile"}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--admin-accent-soft)]/85">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-[#9a7c67]">Ürün</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">SKU</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-[#9a7c67]">Fiyat / Stok</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-[#9a7c67]">Durum</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f2e7dc]">
                        {listings.slice(0, 10).map((listing) => (
                          <tr key={listing.variantId} className="transition-colors hover:bg-[#FCFDFE]">
                            <td className="px-4 py-3">
                              <div className="font-medium text-[var(--admin-heading)]">{listing.productName}</div>
                              <div className="text-xs text-[#8c7564]">{listing.variantName}</div>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs">{listing.sku || "-"}</td>
                            <td className="px-4 py-3 text-[var(--admin-text-secondary)]">
                              {listing.price.toLocaleString("tr-TR")} ₺ / {listing.stock}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  "inline-flex rounded-full px-3 py-1.5 text-xs font-semibold",
                                  listing.status === "active" && "border border-emerald-200 bg-emerald-50 text-emerald-700",
                                  listing.status === "error" && "border border-rose-200 bg-rose-50 text-rose-700",
                                  listing.status === "pending" && "border border-amber-200 bg-amber-50 text-amber-700"
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
              <div className="rounded-[12px] border border-[var(--admin-border)] bg-white p-6 shadow-[var(--shadow-xs)]">
                <h3 className="mb-4 font-semibold text-[var(--admin-heading)]">Islemler</h3>
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

                <div className="mt-6 space-y-3 border-t border-[var(--admin-border)] pt-6">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#8c7564]">Webhook</span>
                    <span className="font-medium text-[var(--admin-heading)]">{integration.provider.supportsWebhook ? "Destekli" : "Polling"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#8c7564]">Son Senkron</span>
                    <span className="font-medium text-[var(--admin-heading)]">
                      {integration.connection?.lastSyncAt
                        ? new Date(integration.connection.lastSyncAt).toLocaleDateString("tr-TR")
                        : "-"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-[12px] border border-[var(--admin-border)] bg-white p-6 shadow-[var(--shadow-xs)]">
                <h3 className="mb-4 font-semibold text-[var(--admin-heading)]">Kuyruk Durumu</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-[20px] bg-[#FCFDFE] p-3">
                    <span className="text-sm text-[var(--admin-text-secondary)]">Bekleyen</span>
                    <span className="font-semibold text-[var(--admin-heading)]">{integration.queueStats.queued}</span>
                  </div>
                  <div className={cn("flex items-center justify-between rounded-[20px] p-3", integration.queueStats.failed > 0 ? "bg-rose-50" : "bg-[#FCFDFE]")}>
                    <span className={cn("text-sm", integration.queueStats.failed > 0 ? "text-rose-600" : "text-[var(--admin-text-secondary)]")}>Hatali</span>
                    <span className={cn("font-semibold", integration.queueStats.failed > 0 ? "text-rose-700" : "text-[var(--admin-heading)]")}>
                      {integration.queueStats.failed}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-[20px] bg-[#FCFDFE] p-3">
                    <span className="text-sm text-[var(--admin-text-secondary)]">Listing</span>
                    <span className="font-semibold text-[var(--admin-heading)]">{integration.listingStats.total}</span>
                  </div>
                </div>
              </div>

              {logs.length > 0 && (
                <div className="rounded-[12px] border border-[var(--admin-border)] bg-white p-6 shadow-[var(--shadow-xs)]">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-[var(--admin-heading)]">Son Loglar</h3>
                    <button
                      onClick={() => loadLogs(selectedProvider)}
                      disabled={busyKey === `${selectedProvider}:logs`}
                      className="text-xs font-medium text-[var(--admin-accent-hover)] transition hover:text-[#a94500] disabled:opacity-50"
                    >
                      Yenile
                    </button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-auto">
                    {logs.slice(0, 5).map((log) => (
                      <div key={log.id} className="rounded-[20px] bg-[#FCFDFE] p-3 text-xs">
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              "font-medium",
                              log.status === "success" ? "text-emerald-700" : log.status === "error" ? "text-rose-700" : "text-[var(--admin-text-secondary)]"
                            )}
                          >
                            {log.status}
                          </span>
                          <span className="text-[var(--admin-text-muted)]">{new Date(log.createdAt).toLocaleDateString("tr-TR")}</span>
                        </div>
                        <p className="mt-1 text-[#8c7564]">
                          {log.direction} / {log.entityType}
                        </p>
                        {log.errorMessage && <p className="mt-1 text-rose-600">{log.errorMessage}</p>}
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
    blue: "border-[var(--admin-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent)]",
    green: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-emerald-600",
    amber: "border-amber-200 bg-gradient-to-br from-amber-50 to-white text-amber-600",
    purple: "border-[#efcfb1] bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)]",
  };

  return (
    <div className="rounded-[12px] border border-[var(--admin-border)] bg-white p-5 shadow-[var(--shadow-xs)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9a7c67]">{title}</p>
          <p className="text-2xl font-bold tracking-[-0.03em] text-[var(--admin-heading)]">{value}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-[18px] border shadow-sm ${colors[color]}`}>
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
        "inline-flex w-full items-center justify-center gap-2 rounded-[8px] px-4 py-3 text-sm font-semibold transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4",
        variant === "primary"
          ? "bg-[var(--admin-accent)] text-white shadow-[0_12px_28px_rgba(255,106,0,0.18)] hover:translate-y-[-1px] hover:bg-[var(--admin-accent-hover)] focus-visible:ring-[rgba(255,106,0,0.18)]"
          : "border border-[var(--admin-border)] bg-white text-[var(--admin-text-secondary)] shadow-sm hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] hover:text-[var(--admin-accent-hover)] focus-visible:ring-[rgba(255,106,0,0.16)]"
      )}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      {label}
    </button>
  );
}
