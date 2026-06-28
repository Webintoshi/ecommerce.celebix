"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { ElementType, ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
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
import { AdminPageHeader, AdminPageShell } from "@/components/admin/AdminPageShell";
import { cn } from "@/lib/utils";

type ProviderStyle = { bg: string; text: string; abbr: string };

const PROVIDER_STYLES: Record<string, ProviderStyle> = {
  parasut: { bg: "bg-[#FFF3EA]", text: "text-[#E85D04]", abbr: "P" },
  bizimhesap: { bg: "bg-[#FFF3EA]", text: "text-[#E85D04]", abbr: "BH" },
  mikro: { bg: "bg-[#FFF3EA]", text: "text-[#E85D04]", abbr: "M" },
  logo_isbasi: { bg: "bg-[#FFF3EA]", text: "text-[#E85D04]", abbr: "L" },
  kolaybi: { bg: "bg-[#FFF3EA]", text: "text-[#E85D04]", abbr: "KB" },
  mukellef: { bg: "bg-[#FFF3EA]", text: "text-[#E85D04]", abbr: "MK" },
};

const ACCOUNTING_LOGO_PATHS: Record<AccountingProvider, string> = {
  parasut: "/accounting-logos/parasut.png",
  bizimhesap: "/accounting-logos/bizimhesap.png",
  mikro: "/accounting-logos/mikro.png",
  logo_isbasi: "/accounting-logos/logo-isbasi.png",
  kolaybi: "/accounting-logos/kolaybi.png",
  mukellef: "/accounting-logos/mukellef.png",
};

const SECONDARY_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-4 text-sm font-semibold text-[#374151] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] disabled:cursor-not-allowed disabled:opacity-55";

const PRIMARY_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.16)] transition hover:bg-[#E85D04] disabled:cursor-not-allowed disabled:opacity-55";

const FIELD_CLASS =
  "h-11 w-full rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm text-[#111827] outline-none transition placeholder:text-[#8B95A5] focus:border-[#FFD1B5] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]";

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
      <div className={`${className} ${providerStyle.bg} ${providerStyle.text} flex items-center justify-center rounded-[8px]`}>
        <span className={`font-bold leading-none ${size >= 64 ? "text-2xl" : "text-xl"}`}>{providerStyle.abbr}</span>
      </div>
    );
  }

  return (
    <div className={`${className} flex items-center justify-center overflow-hidden rounded-[8px] bg-white`}>
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
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#DCE3EC] bg-[#F9F9F9] px-3 py-1 text-xs font-semibold text-[#6B7280]">
      <Unplug className="h-3 w-3" />
      Bağlı değil
    </span>
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
    [integrations],
  );

  const connectedCount = integrations.filter((integration) => integration.connection?.status === "active").length;
  const totalFailed = integrations.reduce((sum, integration) => sum + integration.queueStats.failed, 0);
  const totalQueued = integrations.reduce((sum, integration) => sum + integration.queueStats.queued, 0);

  if (view === "list") {
    return (
      <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
        <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
          <AdminPageShell>
            <AdminPageHeader
              sectionLabel="Muhasebe"
              title="Fatura entegrasyonu"
              actions={
                <button type="button" onClick={fetchIntegrations} disabled={loading} className={SECONDARY_BUTTON}>
                  <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                  Yenile
                </button>
              }
              metrics={
                <>
                  <MetricCell label="Aktif" value={connectedCount.toLocaleString("tr-TR")} detail="bağlantı" icon={Plug} />
                  <MetricCell label="Sağlayıcı" value={integrations.length.toLocaleString("tr-TR")} detail="program" icon={ShieldCheck} />
                  <MetricCell label="Bekleyen" value={totalQueued.toLocaleString("tr-TR")} detail="kuyruk" icon={RefreshCw} tone={totalQueued > 0 ? "warning" : "neutral"} />
                  <MetricCell label="Hatalı" value={totalFailed.toLocaleString("tr-TR")} detail="işlem" icon={AlertTriangle} tone={totalFailed > 0 ? "danger" : "neutral"} />
                </>
              }
            />

            {error && (
              <div className="flex items-center gap-2 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                <XCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <div className="grid gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 min-[820px]:grid-cols-[minmax(0,1fr)_auto] min-[820px]:items-center xl:px-5">
                <h2 className="text-sm font-semibold text-[#111827]">Sağlayıcılar</h2>
                <span className="w-fit rounded-[8px] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280]">
                  {sortedIntegrations.length} kayıt
                </span>
              </div>

              <div className="divide-y divide-[#DCE3EC]">
                {sortedIntegrations.map((integration) => {
                  const isConnected = integration.connection?.status === "active";
                  const hasError = integration.connection?.status === "error";
                  const style = PROVIDER_STYLES[integration.provider.id] || { bg: "bg-[#F9F9F9]", text: "text-[#6B7280]", abbr: "?" };

                  return (
                    <button
                      key={integration.provider.id}
                      type="button"
                      onClick={() => handleSelectProvider(integration)}
                      className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-[#FFF8F3] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.14)] min-[820px]:grid-cols-[minmax(260px,1.2fr)_160px_160px_120px] min-[820px]:items-center xl:px-5"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <AccountingProviderLogo
                          providerId={integration.provider.id}
                          providerName={integration.provider.name}
                          providerStyle={style}
                          size={44}
                          className="h-11 w-11 shrink-0 border border-[#DCE3EC]"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-[#111827]">{integration.provider.name}</span>
                          <span className="mt-0.5 block truncate text-xs font-medium text-[#6B7280]">{integration.provider.description}</span>
                        </span>
                      </span>
                      <StatusBadge connected={isConnected} error={!!hasError} />
                      <span className="text-sm font-medium text-[#6B7280]">
                        {integration.connection?.lastSyncAt
                          ? new Date(integration.connection.lastSyncAt).toLocaleDateString("tr-TR")
                          : "Senkron yok"}
                      </span>
                      <span className="flex items-center justify-between gap-2 min-[820px]:justify-end">
                        <span className="text-xs font-semibold text-[#6B7280]">
                          {integration.queueStats.queued} bekleyen
                        </span>
                        <ArrowDot />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </AdminPageShell>
        </div>
      </main>
    );
  }

  if (view === "detail" && selectedProvider) {
    const style = PROVIDER_STYLES[selectedProvider.provider.id] || { bg: "bg-[#F9F9F9]", text: "text-[#6B7280]", abbr: "?" };
    const isConnected = selectedProvider.connection?.status === "active";
    const hasError = selectedProvider.connection?.status === "error";
    const logs = logsByProvider[selectedProvider.provider.id] || [];

    return (
      <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
        <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
          <AdminPageShell>
            <AdminPageHeader
              sectionLabel="Fatura entegrasyonu"
              title={selectedProvider.provider.name}
              statusSlot={<StatusBadge connected={isConnected} error={!!hasError} />}
              actions={
                <>
                  <button type="button" onClick={() => setView("list")} className={SECONDARY_BUTTON}>
                    Liste
                  </button>
                  <a
                    href={selectedProvider.provider.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={SECONDARY_BUTTON}
                  >
                    Resmi site
                  </a>
                  <button type="button" onClick={testProvider} disabled={busyKey === "test"} className={SECONDARY_BUTTON}>
                    {busyKey === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    Test
                  </button>
                  <button type="button" onClick={syncProvider} disabled={busyKey === "sync"} className={SECONDARY_BUTTON}>
                    {busyKey === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Senkron
                  </button>
                  <button type="button" onClick={connectProvider} disabled={busyKey === "connect"} className={PRIMARY_BUTTON}>
                    {busyKey === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Kaydet
                  </button>
                </>
              }
              metrics={
                <>
                  <MetricCell label="Durum" value={isConnected ? "Aktif" : hasError ? "Hatalı" : "Bekliyor"} detail="bağlantı" icon={Plug} tone={hasError ? "danger" : "neutral"} />
                  <MetricCell label="Bekleyen" value={selectedProvider.queueStats.queued.toLocaleString("tr-TR")} detail="kuyruk" icon={RefreshCw} tone={selectedProvider.queueStats.queued > 0 ? "warning" : "neutral"} />
                  <MetricCell label="Hatalı" value={selectedProvider.queueStats.failed.toLocaleString("tr-TR")} detail="işlem" icon={AlertTriangle} tone={selectedProvider.queueStats.failed > 0 ? "danger" : "neutral"} />
                  <MetricCell label="Manuel" value={selectedProvider.queueStats.manualActionRequired.toLocaleString("tr-TR")} detail="aksiyon" icon={Terminal} />
                </>
              }
            />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4">
                <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                  <PanelHeader title="API bilgileri" />
                  <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:p-5">
                    {selectedProvider.provider.credentialFields.map((field) => (
                      <FieldBlock key={field.key} wide={String(field.type) === "textarea"}>
                        <label className="mb-2 block text-sm font-semibold text-[#374151]">
                          {field.label}
                          {field.required && <span className="ml-1 text-[#FF6A00]">*</span>}
                        </label>
                        {String(field.type) === "textarea" ? (
                          <textarea
                            value={formState.credentials[field.key] || ""}
                            onChange={(event) => updateCredential(field.key, event.target.value)}
                            placeholder={field.placeholder || field.label}
                            rows={4}
                            className="w-full resize-none rounded-[8px] border border-[#DCE3EC] bg-white px-3 py-3 text-sm text-[#111827] outline-none transition placeholder:text-[#8B95A5] focus:border-[#FFD1B5] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]"
                          />
                        ) : (
                          <input
                            type={field.type === "password" ? "password" : "text"}
                            value={formState.credentials[field.key] || ""}
                            onChange={(event) => updateCredential(field.key, event.target.value)}
                            placeholder={field.placeholder || field.label}
                            className={FIELD_CLASS}
                          />
                        )}
                      </FieldBlock>
                    ))}
                  </div>
                </section>

                {selectedProvider.provider.mappingFields.length > 0 && (
                  <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                    <PanelHeader title="Alan eşleme" />
                    <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:p-5">
                      {selectedProvider.provider.mappingFields.map((field) => (
                        <FieldBlock key={field.key}>
                          <label className="mb-2 block text-sm font-semibold text-[#374151]">{field.label}</label>
                          <input
                            type="text"
                            value={formState.fieldMappings[field.key] || ""}
                            onChange={(event) => updateMapping(field.key, event.target.value)}
                            placeholder={field.placeholder || "Opsiyonel"}
                            className={FIELD_CLASS}
                          />
                        </FieldBlock>
                      ))}
                    </div>
                  </section>
                )}

                <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                  <PanelHeader title="Senkron modu" />
                  <div className="grid gap-3 p-4 min-[820px]:grid-cols-[minmax(0,1fr)_auto] min-[820px]:items-center xl:p-5">
                    <div>
                      <p className="text-sm font-semibold text-[#111827]">Güvenli hibrit</p>
                      <p className="mt-1 text-xs font-medium text-[#6B7280]">Kuyruk + worker akışı korunur.</p>
                    </div>
                    <span className="w-fit rounded-[8px] border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                      Önerilen
                    </span>
                  </div>
                </section>

                <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                  <div className="grid gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 min-[820px]:grid-cols-[minmax(0,1fr)_auto] min-[820px]:items-center xl:px-5">
                    <h2 className="text-sm font-semibold text-[#111827]">İşlem günlüğü</h2>
                    <div className="flex flex-wrap gap-2">
                      {logs.length > 0 && (
                        <button type="button" onClick={clearLogs} className={SECONDARY_BUTTON}>
                          <X className="h-4 w-4" />
                          Temizle
                        </button>
                      )}
                      <button type="button" onClick={loadLogs} disabled={busyKey === "logs"} className={SECONDARY_BUTTON}>
                        {busyKey === "logs" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Logları yükle
                      </button>
                    </div>
                  </div>

                  {logs.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-sm">
                        <thead className="bg-[#EEF3F7]">
                          <tr>
                            <TableHead>Durum</TableHead>
                            <TableHead>Tarih</TableHead>
                            <TableHead>Açıklama</TableHead>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#DCE3EC]">
                          {logs.map((log, index) => (
                            <tr key={`log-${index}`} className="hover:bg-[#FFF8F3]">
                              <td className="px-4 py-3 xl:px-5">
                                <LogStatus value={String(log.status || "unknown")} />
                              </td>
                              <td className="px-4 py-3 text-[#6B7280] xl:px-5">{String(log.created_at || "")}</td>
                              <td className="px-4 py-3 text-[#374151] xl:px-5">{String(log.error_message || log.entity_type || "Detay yok")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyBlock icon={Terminal} title="Log yok" description="Son işlemler yüklendiğinde burada görünür." />
                  )}
                </section>
              </div>

              <aside className="space-y-4">
                <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 xl:px-5">
                    <AccountingProviderLogo
                      providerId={selectedProvider.provider.id}
                      providerName={selectedProvider.provider.name}
                      providerStyle={style}
                      size={40}
                      className="h-10 w-10 shrink-0 border border-[#DCE3EC]"
                    />
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-[#111827]">{selectedProvider.provider.name}</h2>
                      <p className="mt-0.5 truncate text-xs font-medium text-[#6B7280]">
                        {selectedProvider.connection?.lastSyncAt
                          ? new Date(selectedProvider.connection.lastSyncAt).toLocaleString("tr-TR")
                          : "Senkron yok"}
                      </p>
                    </div>
                  </div>
                  <div className="divide-y divide-[#DCE3EC]">
                    <StatusRow label="Bekleyen" value={selectedProvider.queueStats.queued} />
                    <StatusRow label="Hatalı" value={selectedProvider.queueStats.failed} tone={selectedProvider.queueStats.failed > 0 ? "danger" : "neutral"} />
                    <StatusRow label="Manuel işlem" value={selectedProvider.queueStats.manualActionRequired} />
                  </div>
                </section>

                <section
                  className={cn(
                    "rounded-[12px] border p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]",
                    isConnected && "border-emerald-200 bg-emerald-50",
                    hasError && "border-red-200 bg-red-50",
                    !isConnected && !hasError && "border-[#DCE3EC] bg-white",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-white text-[#FF6A00]">
                      {isConnected ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : hasError ? <AlertTriangle className="h-5 w-5 text-red-600" /> : <Unplug className="h-5 w-5" />}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[#111827]">
                        {isConnected ? "Bağlantı aktif" : hasError ? "Bağlantı hatası" : "Bağlantı bekliyor"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[#6B7280]">
                        {isConnected ? "Fatura senkronizasyonu çalışıyor." : hasError ? "Bilgileri kontrol edin." : "Alanları doldurup kaydedin."}
                      </p>
                    </div>
                  </div>
                </section>
              </aside>
            </div>
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
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  icon: ElementType;
  tone?: "neutral" | "warning" | "danger";
}) {
  return (
    <div className="min-h-[92px] bg-white px-4 py-3.5 xl:px-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280]">{label}</p>
        <Icon className={cn("h-4 w-4", tone === "danger" ? "text-red-500" : tone === "warning" ? "text-amber-500" : "text-[#FF6A00]")} />
      </div>
      <p className="mt-3 truncate text-2xl font-semibold tracking-[-0.04em] text-[#111827]">{value}</p>
      <p className="mt-1 truncate text-xs font-medium text-[#6B7280]">{detail}</p>
    </div>
  );
}

function PanelHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 xl:px-5">
      <h2 className="text-sm font-semibold text-[#111827]">{title}</h2>
    </div>
  );
}

function FieldBlock({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={wide ? "md:col-span-2" : undefined}>{children}</div>;
}

function TableHead({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={cn("px-4 py-3 text-left text-xs font-semibold text-[#4B5563] xl:px-5", className)}>{children}</th>;
}

function StatusRow({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "danger" }) {
  return (
    <div className={cn("flex items-center justify-between px-4 py-3 xl:px-5", tone === "danger" && "bg-red-50")}>
      <span className={cn("text-sm font-medium", tone === "danger" ? "text-red-700" : "text-[#6B7280]")}>{label}</span>
      <span className={cn("font-semibold", tone === "danger" ? "text-red-800" : "text-[#111827]")}>{value}</span>
    </div>
  );
}

function EmptyBlock({
  icon: Icon,
  title,
  description,
}: {
  icon: ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="px-6 py-12 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-[14px] border border-[#FFD1B5] bg-[#FFF3EA] text-[#FF6A00]">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-[#111827]">{title}</h3>
      <p className="mt-1 text-sm text-[#6B7280]">{description}</p>
    </div>
  );
}

function LogStatus({ value }: { value: string }) {
  if (value === "success") {
    return <span className="font-semibold text-emerald-700">Başarılı</span>;
  }

  if (value === "error") {
    return <span className="font-semibold text-red-700">Hatalı</span>;
  }

  return <span className="font-semibold text-amber-700">{value}</span>;
}

function ArrowDot() {
  return <span className="h-2 w-2 rounded-full bg-[#FF6A00]" />;
}
