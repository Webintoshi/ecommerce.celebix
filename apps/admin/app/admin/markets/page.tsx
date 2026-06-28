"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType, ElementType, ReactNode } from "react";
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
import { AdminEmptyState, AdminPageHeader, AdminPageShell } from "@/components/admin/AdminPageShell";
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
  "w-full rounded-[8px] border border-[#DCE3EC] bg-[#F9F9F9] px-3.5 py-3 text-sm font-medium text-[#111827] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#FFD1B5] focus:bg-white focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]";

function ConnectionBadge({ isConnected, hasError }: { isConnected: boolean; hasError: boolean }) {
  if (isConnected) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        Bağlı
      </span>
    );
  }

  if (hasError) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700">
        <AlertCircle className="h-3 w-3" />
        Hata
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B7280]">
      <Unplug className="h-3 w-3" />
      Bağlı değil
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

    const integration = integrations.find((item) => item.provider.id === providerId);
    if (integration?.connection) {
      void Promise.all([loadListings(providerId), loadLogs(providerId)]);
    }
  };

  const headerActions = (
    <button
      type="button"
      onClick={fetchIntegrations}
      disabled={loading}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)] disabled:opacity-60"
    >
      <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
      Yenile
    </button>
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
        <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
          <AdminPageShell>
            <AdminPageHeader
              sectionLabel="Entegrasyonlar"
              title="Entegrasyonlar"
              description="Satış kanalı bağlantılarını yönetin."
              actions={headerActions}
            />
            <div className="flex min-h-[320px] items-center justify-center border-y border-[#E1E7EF] bg-[#F9F9F9] text-sm font-semibold text-[#6B7280]">
              <Loader2 className="mr-3 h-5 w-5 animate-spin text-[#FF6A00]" />
              Kanallar hazırlanıyor
            </div>
          </AdminPageShell>
        </div>
      </main>
    );
  }

  if (view === "list") {
    return (
      <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
        <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
          <AdminPageShell>
            <AdminPageHeader
              sectionLabel="Entegrasyonlar"
              title="Entegrasyonlar"
              description="Pazaryeri bağlantıları ve senkron durumları."
              actions={headerActions}
              metrics={
                <>
                  <MetricCell label="Bağlantı" value={totals.totalConnections} detail="aktif kayıt" icon={Store} />
                  <MetricCell label="Aktif" value={totals.activeConnections} detail="çalışan kanal" icon={CheckCircle2} />
                  <MetricCell label="Bekleyen" value={totals.totalQueue} detail="kuyruk" icon={RefreshCw} />
                  <MetricCell label="Listing" value={totals.totalListings} detail="eşleşme" icon={ShoppingBag} />
                </>
              }
            />

            {error ? (
              <div className="flex items-center gap-2 border-y border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            ) : null}

            <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 xl:px-5">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">Satış kanalları</h2>
                  <p className="mt-1 text-xs font-medium text-[#6B7280]">Bağlantı, kuyruk ve listing durumu aynı satırda.</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280]">
                  {sortedIntegrations.length} kanal
                </span>
              </div>

              {sortedIntegrations.length === 0 ? (
                <div className="p-5">
                  <AdminEmptyState
                    icon={<Store className="h-7 w-7" />}
                    title="Pazaryeri bulunmuyor"
                    description="Entegrasyon sağlayıcıları eklendiğinde bu alanda görünecek."
                    className="border-[#DCE3EC] bg-[#F9F9F9]"
                  />
                </div>
              ) : (
                <div className="divide-y divide-[#E1E7EF]">
                  {sortedIntegrations.map((integration) => (
                    <ProviderSummaryRow
                      key={integration.provider.id}
                      integration={integration}
                      onOpen={() => openDetail(integration.provider.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          </AdminPageShell>
        </div>
      </main>
    );
  }

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
      <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
        <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
          <AdminPageShell>
            <AdminPageHeader
              sectionLabel="Entegrasyonlar"
              title={integration.provider.name}
              description="Kanal bağlantısı, alan eşleme ve senkron durumu."
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setView("list")}
                    className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"
                  >
                    Tüm kanallar
                  </button>
                  <a
                    href={integration.provider.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"
                  >
                    Panel
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  {integration.provider.docsUrl ? (
                    <a
                      href={integration.provider.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"
                    >
                      API
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                </div>
              }
              metrics={
                <>
                  <MetricCell label="Durum" value={isConnected ? "Bağlı" : hasError ? "Hata" : "Kapalı"} detail="kanal" icon={Store} />
                  <MetricCell label="Bekleyen" value={integration.queueStats.queued} detail="kuyruk" icon={RefreshCw} />
                  <MetricCell label="Listing" value={integration.listingStats.total} detail="eşleşme" icon={ShoppingBag} />
                  <MetricCell label="Son senkron" value={formatShortDate(integration.connection?.lastSyncAt)} detail="kontrol" icon={ShieldCheck} />
                </>
              }
            />

            <section className="grid gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 space-y-4">
                <div className="grid gap-4 border-y border-[#E1E7EF] bg-[#F9F9F9] py-4 min-[860px]:grid-cols-[64px_minmax(0,1fr)_auto] min-[860px]:items-center">
                  <ProviderLogo
                    provider={integration.provider}
                    size={48}
                    colorStyle={colorStyle}
                    className="h-14 w-14 border border-[#DCE3EC]"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="truncate text-xl font-semibold tracking-[-0.03em] text-[#111827]">{integration.provider.name}</h2>
                      <ConnectionBadge isConnected={isConnected} hasError={hasError} />
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm font-medium text-[#6B7280]">{integration.provider.description}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-sm min-[860px]:w-[360px]">
                    <FieldValue label="Webhook" value={integration.provider.supportsWebhook ? "Destekli" : "Polling"} />
                    <FieldValue label="Hatalı" value={integration.queueStats.failed} danger={integration.queueStats.failed > 0} />
                    <FieldValue label="Aktif" value={integration.listingStats.active} />
                  </div>
                </div>

                {providerId === "google_merchant" ? (
                  <section className="rounded-[12px] border border-[#DCE3EC] bg-white">
                    <div className="grid gap-3 border-b border-[#E1E7EF] bg-[#F9F9F9] px-4 py-3 min-[860px]:grid-cols-[minmax(0,1fr)_auto] min-[860px]:items-center">
                      <h2 className="text-base font-semibold tracking-[-0.02em] text-[#111827]">Merchant Feed URL</h2>
                      <div className="flex flex-wrap gap-2 text-xs font-semibold text-[#6B7280]">
                        {googleFeedItemCount !== null ? <span>{googleFeedItemCount} hazır ürün</span> : null}
                        {googleFeedIssueCount !== null ? <span className="text-[#E85D04]">{googleFeedIssueCount} issue</span> : null}
                      </div>
                    </div>
                    <div className="grid gap-3 p-4 min-[860px]:grid-cols-[minmax(0,1fr)_auto] min-[860px]:items-center">
                      <input
                        readOnly
                        value={googleFeedUrl || "Bağlantı kaydedildiğinde feed URL burada görünecek."}
                        className="h-10 min-w-0 rounded-[8px] border border-[#DCE3EC] bg-[#F9F9F9] px-3 text-sm font-medium text-[#6B7280] outline-none"
                      />
                      {googleFeedUrl ? (
                        <a
                          href={googleFeedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
                        >
                          Aç
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                <FormBlock icon={Settings} title="API Bilgileri">
                  <div className="grid gap-4 md:grid-cols-2">
                    {integration.provider.credentialFields.map((field) => {
                      const isTextarea = (field.type as string | undefined) === "textarea";

                      return (
                        <div key={field.key} className={isTextarea ? "md:col-span-2" : ""}>
                          <label className="mb-2 block text-sm font-semibold text-[#4B5563]">
                            {field.label}
                            {field.required ? <span className="ml-1 text-[#FF6A00]">*</span> : null}
                          </label>
                          {isTextarea ? (
                            <textarea
                              value={form.credentials[field.key] || ""}
                              onChange={(event) => updateCredential(providerId, field.key, event.target.value)}
                              placeholder={field.placeholder || field.label}
                              rows={3}
                              className={WARM_INPUT}
                            />
                          ) : (
                            <input
                              type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
                              value={form.credentials[field.key] || ""}
                              onChange={(event) => updateCredential(providerId, field.key, event.target.value)}
                              placeholder={field.placeholder || field.label}
                              className={WARM_INPUT}
                            />
                          )}
                          {field.description ? <p className="mt-1 text-xs font-medium text-[#6B7280]">{field.description}</p> : null}
                        </div>
                      );
                    })}
                  </div>
                </FormBlock>

                {integration.provider.mappingFields.length > 0 ? (
                  <FormBlock icon={Package} title="Alan eşleme">
                    <div className="grid gap-4 md:grid-cols-2">
                      {integration.provider.mappingFields.map((field) => (
                        <div key={field.key}>
                          <label className="mb-2 block text-sm font-semibold text-[#4B5563]">{field.label}</label>
                          <input
                            value={form.fieldMappings[field.key] || ""}
                            onChange={(event) => updateMapping(providerId, field.key, event.target.value)}
                            placeholder={field.placeholder || "Opsiyonel"}
                            className={WARM_INPUT}
                          />
                        </div>
                      ))}
                    </div>
                  </FormBlock>
                ) : null}

                <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                  <div className="grid gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 min-[760px]:grid-cols-[minmax(0,1fr)_auto] min-[760px]:items-center">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="h-4 w-4 text-[#FF6A00]" />
                      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">Listing eşleşmeleri</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => loadListings(selectedProvider)}
                      disabled={busyKey === `${selectedProvider}:listings`}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-xs font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] disabled:opacity-60"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", busyKey === `${selectedProvider}:listings` && "animate-spin")} />
                      Yenile
                    </button>
                  </div>
                  {listings.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-left text-sm">
                        <thead className="bg-[#F9F9F9] text-[#4B5563]">
                          <tr>
                            <th className="px-4 py-3 font-semibold">Ürün</th>
                            <th className="px-4 py-3 font-semibold">SKU</th>
                            <th className="px-4 py-3 font-semibold">Fiyat / Stok</th>
                            <th className="px-4 py-3 font-semibold">Durum</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E1E7EF]">
                          {listings.slice(0, 10).map((listing) => (
                            <tr key={listing.variantId} className="transition hover:bg-[#FFF8F3]">
                              <td className="px-4 py-3">
                                <div className="max-w-[360px] truncate font-semibold text-[#111827]">{listing.productName}</div>
                                <div className="mt-1 text-xs font-medium text-[#6B7280]">{listing.variantName}</div>
                              </td>
                              <td className="px-4 py-3 font-mono text-xs font-semibold text-[#4B5563]">{listing.sku || "-"}</td>
                              <td className="px-4 py-3 font-semibold text-[#111827]">
                                {listing.price.toLocaleString("tr-TR")} ₺ / {listing.stock}
                              </td>
                              <td className={cn("px-4 py-3 font-semibold", listingStatusClass(listing.status))}>
                                {listingStatusLabel(listing.status)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-5">
                      <AdminEmptyState
                        icon={<ShoppingBag className="h-7 w-7" />}
                        title="Listing eşleşmesi yok"
                        description="Kanal senkronize edildiğinde ürün eşleşmeleri burada listelenir."
                        className="border-[#DCE3EC] bg-[#F9F9F9]"
                      />
                    </div>
                  )}
                </section>
              </div>

              <aside className="space-y-4">
                <section className="rounded-[12px] border border-[#DCE3EC] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">İşlemler</h2>
                  <div className="mt-4 space-y-2">
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
                </section>

                <section className="rounded-[12px] border border-[#DCE3EC] bg-white">
                  <div className="border-b border-[#E1E7EF] bg-[#F9F9F9] px-4 py-3">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">Kuyruk</h2>
                  </div>
                  <div className="divide-y divide-[#E1E7EF]">
                    <QueueRow label="Bekleyen" value={integration.queueStats.queued} />
                    <QueueRow label="Hatalı" value={integration.queueStats.failed} danger={integration.queueStats.failed > 0} />
                    <QueueRow label="Listing" value={integration.listingStats.total} />
                    <QueueRow label="Webhook" value={integration.provider.supportsWebhook ? "Destekli" : "Polling"} />
                  </div>
                </section>

                <section className="rounded-[12px] border border-[#DCE3EC] bg-white">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#E1E7EF] bg-[#F9F9F9] px-4 py-3">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">Son loglar</h2>
                    <button
                      type="button"
                      onClick={() => loadLogs(selectedProvider)}
                      disabled={busyKey === `${selectedProvider}:logs`}
                      className="text-xs font-semibold text-[#E85D04] disabled:opacity-60"
                    >
                      Yenile
                    </button>
                  </div>
                  {logs.length > 0 ? (
                    <div className="max-h-72 divide-y divide-[#E1E7EF] overflow-auto">
                      {logs.slice(0, 6).map((log) => (
                        <div key={log.id} className="px-4 py-3 text-xs">
                          <div className="flex items-center justify-between gap-3">
                            <span className={cn("font-semibold", log.status === "success" ? "text-emerald-700" : log.status === "error" ? "text-rose-700" : "text-[#4B5563]")}>
                              {log.status}
                            </span>
                            <span className="font-medium text-[#9CA3AF]">{formatShortDate(log.createdAt)}</span>
                          </div>
                          <p className="mt-1 font-medium text-[#6B7280]">
                            {log.direction} / {log.entityType}
                          </p>
                          {log.errorMessage ? <p className="mt-1 font-semibold text-rose-600">{log.errorMessage}</p> : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-8 text-center text-sm font-medium text-[#6B7280]">Henüz log yok</div>
                  )}
                </section>
              </aside>
            </section>
          </AdminPageShell>
        </div>
      </main>
    );
  }

  return null;
}

function MetricCell({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ElementType;
}) {
  return (
    <div className="min-h-[92px] bg-white px-4 py-3.5 xl:px-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280]">{label}</p>
        <Icon className="h-4 w-4 text-[#9CA3AF]" />
      </div>
      <div className="mt-3 flex items-end gap-2">
        <p className="truncate text-3xl font-semibold tracking-[-0.04em] text-[#111827]">{value}</p>
        <span className="pb-1 text-sm font-medium text-[#6B7280]">{detail}</span>
      </div>
    </div>
  );
}

function ProviderSummaryRow({
  integration,
  onOpen,
}: {
  integration: MarketplaceIntegrationView;
  onOpen: () => void;
}) {
  const providerId = integration.provider.id;
  const isConnected = integration.connection?.status === "active";
  const hasError = integration.connection?.status === "error";
  const colorStyle = PROVIDER_COLORS[providerId] || { bg: "bg-gray-100", text: "text-gray-700" };

  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-[#FFF8F3] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)] min-[920px]:grid-cols-[52px_minmax(220px,1.3fr)_110px_110px_110px_auto] min-[920px]:items-center xl:px-5"
    >
      <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-3 min-[920px]:contents">
        <ProviderLogo
          provider={integration.provider}
          size={42}
          colorStyle={colorStyle}
          className="h-12 w-12 border border-[#DCE3EC]"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold tracking-[-0.02em] text-[#111827]">
              {integration.provider.name}
            </h3>
            <ConnectionBadge isConnected={isConnected} hasError={hasError} />
          </div>
          <p className="mt-1 line-clamp-1 text-sm font-medium text-[#6B7280]">{integration.provider.description}</p>
        </div>
      </div>
      <FieldValue label="Bekleyen" value={integration.queueStats.queued} />
      <FieldValue label="Listing" value={integration.listingStats.total} />
      <FieldValue label="Hatalı" value={integration.queueStats.failed} danger={integration.queueStats.failed > 0} />
      <span className="inline-flex h-9 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563]">
        Ayarlar
      </span>
    </button>
  );
}

function FieldValue({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string | number;
  danger?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">{label}</p>
      <p className={cn("mt-1 truncate text-sm font-semibold text-[#111827]", danger && "text-rose-600")}>{value}</p>
    </div>
  );
}

function FormBlock({
  icon: Icon,
  title,
  children,
}: {
  icon: ElementType;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-3 border-b border-[#E1E7EF] bg-[#F9F9F9] px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#FFD1B5] bg-[#FFF1E8] text-[#FF6A00]">
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">{title}</h2>
      </div>
      <div className="p-4 xl:p-5">{children}</div>
    </section>
  );
}

function QueueRow({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string | number;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <span className="font-medium text-[#6B7280]">{label}</span>
      <span className={cn("font-semibold text-[#111827]", danger && "text-rose-600")}>{value}</span>
    </div>
  );
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
  });
}

function listingStatusLabel(status: MarketplaceListingView["status"]) {
  const labels: Record<MarketplaceListingView["status"], string> = {
    active: "Aktif",
    error: "Hata",
    inactive: "Kapalı",
    pending: "Bekliyor",
  };

  return labels[status] || status;
}

function listingStatusClass(status: MarketplaceListingView["status"]) {
  if (status === "active") return "text-emerald-700";
  if (status === "error") return "text-rose-700";
  if (status === "pending") return "text-[#E85D04]";
  return "text-[#6B7280]";
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
