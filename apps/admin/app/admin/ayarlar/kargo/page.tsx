"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ExternalLink, Loader2, MapPin, Plus, Save, Settings, ShieldCheck, Trash2, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SHIPPING_PROVIDER_REGISTRY, createDefaultShippingIntegrationSettings, getShippingProviderDefinition, hasRequiredProviderCredentials, mergeLegacyBasitKargoSettings, normalizeShippingIntegrationSettings } from "@/lib/shipping-integrations";
import { createDefaultShippingZones, normalizeShippingZones, type ShippingRate, type ShippingZone } from "@celebix/platform-config/src/shipping";
import type { ShippingIntegrationProvider, ShippingIntegrationRecord, ShippingIntegrationSettings } from "@/types/shipping-integration";

const LEGACY_BASIT_KARGO_STORAGE_KEY = "celebix_basit_kargo_settings";

function readLegacyBasitKargoSettings() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_BASIT_KARGO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    return {
      apiToken: typeof parsed.apiToken === "string" ? parsed.apiToken : undefined,
      senderProfile: typeof parsed.senderProfile === "string" ? parsed.senderProfile : undefined,
      addressPreference: typeof parsed.addressPreference === "string" ? parsed.addressPreference : undefined,
    };
  } catch {
    return null;
  }
}

function buildPayloadForSave(settings: ShippingIntegrationSettings): ShippingIntegrationSettings {
  const now = new Date().toISOString();
  return {
    ...settings,
    integrations: settings.integrations.map((integration) => ({
      ...integration,
      updatedAt: now,
      health: integration.enabled && !hasRequiredProviderCredentials(integration)
        ? { ...integration.health, status: "error", lastError: "Zorunlu kimlik bilgileri eksik." }
        : integration.health,
    })),
  };
}

function getIntegrationStatus(integration: ShippingIntegrationRecord) {
  if (integration.enabled && hasRequiredProviderCredentials(integration)) {
    return { label: integration.health.status === "error" ? "Hata" : "Aktif", variant: integration.health.status === "error" ? "error" : "success" as const };
  }
  if (integration.enabled) return { label: "Eksik", variant: "warning" as const };
  return { label: "Pasif", variant: "inactive" as const };
}

function createEmptyShippingRate(): ShippingRate {
  return { id: crypto.randomUUID(), name: "Standart Kargo", price: 0, estimatedDays: "1-3 iş günü", enabled: true };
}

function createEmptyShippingZone(): ShippingZone {
  return { id: crypto.randomUUID(), name: "Yeni Bölge", countries: ["Türkiye"], rates: [createEmptyShippingRate()] };
}

export default function ShippingSettingsPage() {
  const [settings, setSettings] = useState<ShippingIntegrationSettings | null>(null);
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"integrations" | "zones" | "settings">("integrations");
  const [expandedProvider, setExpandedProvider] = useState<ShippingIntegrationProvider | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const [integrationsResponse, zonesResponse] = await Promise.all([
          fetch("/api/settings?type=shipping-integrations", { cache: "no-store" }),
          fetch("/api/settings?type=shipping", { cache: "no-store" }),
        ]);
        const integrationsPayload = await integrationsResponse.json().catch(() => ({}));
        const zonesPayload = await zonesResponse.json().catch(() => ({}));
        if (!mounted) return;
        const baseSettings = integrationsPayload.success
          ? normalizeShippingIntegrationSettings(integrationsPayload.shippingIntegrations)
          : createDefaultShippingIntegrationSettings();
        setSettings(mergeLegacyBasitKargoSettings(baseSettings, readLegacyBasitKargoSettings()));
        setZones(normalizeShippingZones(zonesPayload.shippingOptions));
      } catch {
        if (!mounted) return;
        setSettings(mergeLegacyBasitKargoSettings(createDefaultShippingIntegrationSettings(), readLegacyBasitKargoSettings()));
        setZones(createDefaultShippingZones());
        toast.error("Kargo ayarları yüklenemedi");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const stats = useMemo(() => {
    if (!settings) return { total: 0, enabled: 0, ready: 0 };
    const enabled = settings.integrations.filter((item) => item.enabled).length;
    const ready = settings.integrations.filter((item) => item.enabled && hasRequiredProviderCredentials(item)).length;
    return { total: settings.integrations.length, enabled, ready };
  }, [settings]);

  function updateIntegration(provider: ShippingIntegrationProvider, updater: (record: ShippingIntegrationRecord) => ShippingIntegrationRecord) {
    setSettings((current) => current ? { ...current, integrations: current.integrations.map((record) => record.provider === provider ? updater(record) : record) } : current);
  }

  function handleFieldChange(provider: ShippingIntegrationProvider, section: "credentials" | "configuration", key: string, value: string) {
    updateIntegration(provider, (record) => ({
      ...record,
      [section]: { ...record[section], [key]: value },
      health: record.health.lastError === "Zorunlu kimlik bilgileri eksik." ? { ...record.health, status: "unknown", lastError: null } : record.health,
    }));
  }

  function handleToggleProvider(provider: ShippingIntegrationProvider) {
    setSettings((current) => {
      if (!current) return current;
      return {
        ...current,
        defaultProvider: current.defaultProvider === provider && current.integrations.find((item) => item.provider === provider)?.enabled ? null : current.defaultProvider,
        integrations: current.integrations.map((item) => item.provider === provider ? { ...item, enabled: !item.enabled } : item),
      };
    });
  }

  function updateZone(zoneId: string, updater: (zone: ShippingZone) => ShippingZone) {
    setZones((current) => current.map((zone) => zone.id === zoneId ? updater(zone) : zone));
  }

  async function handleSave() {
    if (!settings) return;
    const missing = settings.integrations.filter((item) => item.enabled && !hasRequiredProviderCredentials(item));
    if (missing.length > 0) {
      toast.error("Eksik bilgi", { description: `${missing.map((item) => item.displayName).join(", ")} için zorunlu alanları doldurun.` });
      return;
    }
    setSaving(true);
    try {
      const normalizedZones = normalizeShippingZones(zones.filter((zone) => zone.name.trim() && zone.rates.length > 0));
      const [integrationsResponse, zonesResponse] = await Promise.all([
        fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "shipping-integrations", shippingIntegrations: buildPayloadForSave(settings) }) }),
        fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "shipping", shippingOptions: normalizedZones }) }),
      ]);
      const integrationsResult = await integrationsResponse.json().catch(() => ({}));
      const zonesResult = await zonesResponse.json().catch(() => ({}));
      if (!integrationsResponse.ok || !integrationsResult.success) throw new Error(integrationsResult.error || "Kargo entegrasyonları kaydedilemedi.");
      if (!zonesResponse.ok || !zonesResult.success) throw new Error(zonesResult.error || "Teslimat bölgeleri kaydedilemedi.");
      setSettings(normalizeShippingIntegrationSettings(integrationsResult.shippingIntegrations));
      setZones(normalizeShippingZones(zonesResult.shippingOptions ?? normalizedZones));
      toast.success("Kargo ayarları kaydedildi.");
    } catch (error) {
      toast.error("Kayıt başarısız", { description: error instanceof Error ? error.message : "Bilinmeyen hata" });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) return <div className="flex min-h-screen items-center justify-center bg-gray-50/60"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Kargo Entegrasyonu</h1>
            <p className="mt-1 text-sm text-gray-500">Kargo firmalarını bağlayın ve checkout ekranındaki teslimat bölgelerini yönetin</p>
          </div>
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-semibold text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <StatCard title="Toplam" value={stats.total} icon={Truck} color="gray" />
          <StatCard title="Aktif" value={stats.enabled} icon={CheckCircle2} color="green" />
          <StatCard title="Hazır" value={stats.ready} icon={ShieldCheck} color="blue" />
        </div>

        <div className="flex gap-1 rounded-2xl border border-gray-200 bg-white p-1">
          {[
            { id: "integrations", label: "Entegrasyonlar", icon: Truck },
            { id: "zones", label: "Teslimat Bölgeleri", icon: MapPin },
            { id: "settings", label: "Varsayılan Ayarlar", icon: Settings },
          ].map((item) => (
            <button key={item.id} onClick={() => setTab(item.id as typeof tab)} className={cn("flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all", tab === item.id ? "bg-primary text-white shadow-md" : "text-gray-600 hover:bg-gray-50")}>
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </div>

        {tab === "integrations" && (
          <div className="space-y-4">
            {settings.integrations.map((integration) => {
              const definition = getShippingProviderDefinition(integration.provider);
              const status = getIntegrationStatus(integration);
              const isExpanded = expandedProvider === integration.provider;
              return (
                <div key={integration.provider} className={cn("overflow-hidden rounded-2xl border transition-all", isExpanded ? "border-primary shadow-lg ring-2 ring-primary/20" : "border-gray-200 hover:border-gray-300")}>
                  <div className="p-5">
                    <div className="flex items-start gap-4">
                      <div className={cn("flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold text-white", definition.accentClassName)}>{definition.shortName}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-gray-900">{integration.displayName}</h3>
                          <StatusBadge status={status} />
                          {settings.defaultProvider === integration.provider && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Varsayılan</span>}
                        </div>
                        <p className="mt-1 text-sm text-gray-500">{definition.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleToggleProvider(integration.provider)} className={cn("rounded-xl px-4 py-2 text-sm font-medium transition-colors", integration.enabled ? "bg-gray-900 text-white" : "bg-green-50 text-green-700 hover:bg-green-100")}>{integration.enabled ? "Kapat" : "Aktif Et"}</button>
                        <button onClick={() => setExpandedProvider(isExpanded ? null : integration.provider)} className="rounded-xl p-2 transition-colors hover:bg-gray-100"><ChevronDown className={cn("h-5 w-5 text-gray-400 transition-transform", isExpanded && "rotate-180")} /></button>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="grid gap-6 border-t border-gray-100 px-5 py-5 lg:grid-cols-2">
                      <Section title="API Bilgileri" description="Sağlayıcı panelinden alınan kimlik bilgilerini girin.">
                        {definition.credentialFields.map((field) => (
                          <div key={field.key}>
                            <label className="mb-1.5 block text-sm font-medium text-gray-700">{field.label} {field.required && <span className="text-red-500">*</span>}</label>
                            <input type={field.secret ? "password" : "text"} value={integration.credentials[field.key] ?? ""} onChange={(event) => handleFieldChange(integration.provider, "credentials", field.key, event.target.value)} placeholder={field.placeholder} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20" />
                            <p className="mt-1 text-xs text-gray-400">{field.description}</p>
                          </div>
                        ))}
                      </Section>

                      <Section title="Yapılandırma" description="Görünen ad, ortam ve sağlayıcı ayarları.">
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Görünen Ad</label>
                          <input type="text" value={integration.displayName} onChange={(event) => updateIntegration(integration.provider, (record) => ({ ...record, displayName: event.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20" />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-sm font-medium text-gray-700">Ortam</label>
                            <select value={integration.environment} onChange={(event) => updateIntegration(integration.provider, (record) => ({ ...record, environment: event.target.value as "production" | "sandbox" }))} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"><option value="production">Canlı</option><option value="sandbox">Test</option></select>
                          </div>
                          <div>
                            <label className="mb-1.5 block text-sm font-medium text-gray-700">Tetikleyici</label>
                            <select value={integration.automation.orderTrigger} onChange={(event) => updateIntegration(integration.provider, (record) => ({ ...record, automation: { ...record.automation, orderTrigger: event.target.value as "manual" | "confirmed" | "preparing" } }))} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"><option value="manual">Manuel</option><option value="confirmed">Onaylandı</option><option value="preparing">Hazırlanıyor</option></select>
                          </div>
                        </div>
                        {definition.configurationFields.map((field) => (
                          <div key={field.key}>
                            <label className="mb-1.5 block text-sm font-medium text-gray-700">{field.label}</label>
                            {field.type === "select" ? (
                              <select value={integration.configuration[field.key] ?? ""} onChange={(event) => handleFieldChange(integration.provider, "configuration", field.key, event.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20">
                                {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                              </select>
                            ) : (
                              <input type="text" value={integration.configuration[field.key] ?? ""} onChange={(event) => handleFieldChange(integration.provider, "configuration", field.key, event.target.value)} placeholder={field.placeholder} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20" />
                            )}
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <a href={definition.docsUrl} target="_blank" rel="noreferrer" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"><ExternalLink className="h-3.5 w-3.5" />API</a>
                          <a href={definition.dashboardUrl} target="_blank" rel="noreferrer" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"><ExternalLink className="h-3.5 w-3.5" />Panel</a>
                        </div>
                      </Section>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "zones" && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Teslimat Bölgeleri</h2>
                <p className="text-sm text-gray-500">Checkout ekranında gösterilecek teslimat seçenekleri.</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">{zones.length} bölge</span>
                <button onClick={() => setZones((current) => [...current, createEmptyShippingZone()])} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"><Plus className="h-4 w-4" />Yeni Bölge</button>
              </div>
            </div>

            <div className="space-y-4">
              {zones.map((zone) => (
                <div key={zone.id} className="overflow-hidden rounded-2xl border border-gray-200">
                  <div className="grid gap-3 border-b border-gray-100 bg-gray-50 p-4 md:grid-cols-[1fr_1fr_auto] md:items-start">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Bölge Adı</label>
                      <input type="text" value={zone.name} onChange={(event) => updateZone(zone.id, (current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm" placeholder="Örn: Türkiye / İstanbul" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Ülke / Şehir Eşleşmeleri</label>
                      <input type="text" value={zone.countries.join(", ")} onChange={(event) => updateZone(zone.id, (current) => ({ ...current, countries: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) }))} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm" placeholder="Virgülle ayırın. Örn: Türkiye, İstanbul" />
                      <p className="mt-2 text-xs text-gray-400">Checkout önce şehir, sonra ülke ile eşleştirir.</p>
                    </div>
                    <button onClick={() => setZones((current) => current.filter((item) => item.id !== zone.id))} className="inline-flex h-11 items-center justify-center rounded-xl border border-red-200 px-3 text-red-600 transition-colors hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="space-y-3 p-4">
                    {zone.rates.map((rate) => (
                      <div key={rate.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <div className="grid items-end gap-3 md:grid-cols-[1.1fr_120px_180px_140px_auto]">
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Tarife Adı</label>
                            <input type="text" value={rate.name} onChange={(event) => updateZone(zone.id, (current) => ({ ...current, rates: current.rates.map((item) => item.id === rate.id ? { ...item, name: event.target.value } : item) }))} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm" />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Tutar</label>
                            <input type="number" min="0" step="0.01" value={rate.price} onChange={(event) => updateZone(zone.id, (current) => ({ ...current, rates: current.rates.map((item) => item.id === rate.id ? { ...item, price: Number(event.target.value || 0) } : item) }))} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm" />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Teslimat Süresi</label>
                            <input type="text" value={rate.estimatedDays || ""} onChange={(event) => updateZone(zone.id, (current) => ({ ...current, rates: current.rates.map((item) => item.id === rate.id ? { ...item, estimatedDays: event.target.value, condition: event.target.value } : item) }))} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm" placeholder="1-3 iş günü" />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Ücretsiz Eşik</label>
                            <input type="number" min="0" step="1" value={rate.minOrder ?? ""} onChange={(event) => updateZone(zone.id, (current) => ({ ...current, rates: current.rates.map((item) => item.id === rate.id ? { ...item, minOrder: event.target.value ? Number(event.target.value) : undefined } : item) }))} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm" placeholder="500" />
                          </div>
                          <button onClick={() => updateZone(zone.id, (current) => ({ ...current, rates: current.rates.filter((item) => item.id !== rate.id) }))} className="inline-flex h-11 items-center justify-center rounded-xl border border-red-200 px-3 text-red-600 transition-colors hover:bg-red-50"><X className="h-4 w-4" /></button>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => updateZone(zone.id, (current) => ({ ...current, rates: [...current.rates, createEmptyShippingRate()] }))} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"><Plus className="h-4 w-4" />Tarife Ekle</button>
                  </div>
                </div>
              ))}
              {zones.length === 0 && <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 py-12 text-center text-gray-500">Henüz teslimat bölgesi tanımlanmadı.</div>}
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10"><Settings className="h-6 w-6 text-primary" /></div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Varsayılan Ayarlar</h2>
                <p className="text-sm text-gray-500">Otomatik gönderi oluşturma için varsayılan sağlayıcı.</p>
              </div>
            </div>
            <div className="max-w-md">
              <label className="mb-2 block text-sm font-medium text-gray-700">Varsayılan Kargo Firması</label>
              <select value={settings.defaultProvider ?? ""} onChange={(event) => setSettings({ ...settings, defaultProvider: (event.target.value || null) as ShippingIntegrationProvider | null })} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 transition-all focus:border-primary focus:ring-2 focus:ring-primary/20">
                <option value="">Seçiniz...</option>
                {settings.integrations.filter((item) => item.enabled).map((item) => <option key={item.provider} value={item.provider}>{item.displayName}</option>)}
              </select>
            </div>
            <div className="mt-8 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-medium text-blue-900">Bilgi</p>
                  <p className="mt-1 text-sm text-blue-700">Varsayılan sağlayıcı seçildiğinde otomatik gönderi işlemleri bu firma üzerinden hazırlanır.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }: { title: string; value: number; icon: typeof Truck; color: "gray" | "green" | "blue" }) {
  const colors = { gray: "bg-gray-100 text-gray-600", green: "bg-green-100 text-green-600", blue: "bg-blue-100 text-blue-600" };
  return <div className="rounded-2xl border border-gray-200 bg-white p-5"><div className="flex items-center gap-3"><div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", colors[color])}><Icon className="h-5 w-5" /></div><div><p className="text-xs font-medium uppercase text-gray-500">{title}</p><p className="text-xl font-bold text-gray-900">{value}</p></div></div></div>;
}

function StatusBadge({ status }: { status: { label: string; variant: "success" | "error" | "warning" | "inactive" } }) {
  const styles = { success: "border-green-200 bg-green-100 text-green-700", error: "border-red-200 bg-red-100 text-red-700", warning: "border-amber-200 bg-amber-100 text-amber-700", inactive: "border-gray-200 bg-gray-100 text-gray-600" };
  return <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", styles[status.variant])}>{status.label}</span>;
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="rounded-2xl bg-gray-50 p-5"><h4 className="font-semibold text-gray-900">{title}</h4><p className="mb-4 text-xs text-gray-500">{description}</p><div className="space-y-4">{children}</div></div>;
}
