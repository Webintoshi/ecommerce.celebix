"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  MapPin,
  Package,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  Truck,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { deleteShippingZone, getShippingZones } from "@/lib/shipping";
import {
  SHIPPING_PROVIDER_REGISTRY,
  createDefaultShippingIntegrationSettings,
  getShippingProviderDefinition,
  hasRequiredProviderCredentials,
  mergeLegacyBasitKargoSettings,
  normalizeShippingIntegrationSettings,
} from "@/lib/shipping-integrations";
import { ShippingZone } from "@/lib/shipping-storage";
import {
  ShippingIntegrationProvider,
  ShippingIntegrationRecord,
  ShippingIntegrationSettings,
} from "@/types/shipping-integration";

const LEGACY_BASIT_KARGO_STORAGE_KEY = "celebix_basit_kargo_settings";

interface LegacyBasitKargoSettings {
  apiToken?: string;
  senderProfile?: string;
  addressPreference?: string;
}

function readLegacyBasitKargoSettings(): LegacyBasitKargoSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_BASIT_KARGO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LegacyBasitKargoSettings;
    return {
      apiToken: typeof parsed.apiToken === "string" ? parsed.apiToken : undefined,
      senderProfile: typeof parsed.senderProfile === "string" ? parsed.senderProfile : undefined,
      addressPreference: typeof parsed.addressPreference === "string" ? parsed.addressPreference : undefined,
    };
  } catch {
    return null;
  }
}

function getIntegrationStatus(integration: ShippingIntegrationRecord) {
  const hasCredentials = hasRequiredProviderCredentials(integration);
  if (integration.enabled && hasCredentials) {
    return {
      label: integration.health.status === "error" ? "Hata" : "Aktif",
      variant: integration.health.status === "error" ? "error" : "success" as const,
    };
  }
  if (integration.enabled && !hasCredentials) {
    return { label: "Eksik", variant: "warning" as const };
  }
  return { label: "Pasif", variant: "inactive" as const };
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

export default function ShippingSettingsPage() {
  const [settings, setSettings] = useState<ShippingIntegrationSettings | null>(null);
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"integrations" | "zones" | "settings">("integrations");
  const [expandedProvider, setExpandedProvider] = useState<ShippingIntegrationProvider | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadPage() {
      setIsLoading(true);
      try {
        const response = await fetch("/api/settings?type=shipping-integrations", { cache: "no-store" });
        const payload = await response.json();
        const baseSettings = payload.success
          ? normalizeShippingIntegrationSettings(payload.shippingIntegrations)
          : createDefaultShippingIntegrationSettings();
        const legacySettings = readLegacyBasitKargoSettings();
        const mergedSettings = mergeLegacyBasitKargoSettings(baseSettings, legacySettings);
        if (!isMounted) return;
        setSettings(mergedSettings);
        setZones(getShippingZones());
      } catch {
        if (!isMounted) return;
        setSettings(mergeLegacyBasitKargoSettings(createDefaultShippingIntegrationSettings(), readLegacyBasitKargoSettings()));
        setZones(getShippingZones());
        toast.error("Kargo ayarları yüklenemedi");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadPage();
    return () => { isMounted = false; };
  }, []);

  const stats = useMemo(() => {
    if (!settings) return { total: 0, enabled: 0, ready: 0 };
    const enabled = settings.integrations.filter((i) => i.enabled).length;
    const ready = settings.integrations.filter((i) => i.enabled && hasRequiredProviderCredentials(i)).length;
    return { total: settings.integrations.length, enabled, ready };
  }, [settings]);

  function updateIntegration(provider: ShippingIntegrationProvider, updater: (i: ShippingIntegrationRecord) => ShippingIntegrationRecord) {
    setSettings((current) => {
      if (!current) return current;
      return {
        ...current,
        integrations: current.integrations.map((i) => (i.provider === provider ? updater(i) : i)),
      };
    });
  }

  function handleFieldChange(provider: ShippingIntegrationProvider, section: "credentials" | "configuration", key: string, value: string) {
    updateIntegration(provider, (i) => ({
      ...i,
      [section]: { ...i[section], [key]: value },
      health: i.health.lastError === "Zorunlu kimlik bilgileri eksik." ? { ...i.health, status: "unknown", lastError: null } : i.health,
    }));
  }

  function handleToggleProvider(provider: ShippingIntegrationProvider) {
    setSettings((current) => {
      if (!current) return current;
      const integration = current.integrations.find((i) => i.provider === provider);
      if (!integration) return current;
      const nextEnabled = !integration.enabled;
      return {
        ...current,
        defaultProvider: !nextEnabled && current.defaultProvider === provider ? null : current.defaultProvider,
        integrations: current.integrations.map((i) => (i.provider === provider ? { ...i, enabled: nextEnabled } : i)),
      };
    });
  }

  function handleDeleteZone(id: string) {
    if (!window.confirm("Bu teslimat bölgesini silmek istediğinizden emin misiniz?")) return;
    deleteShippingZone(id);
    setZones(getShippingZones());
    toast.success("Teslimat bölgesi silindi.");
  }

  async function handleSave() {
    if (!settings) return;
    const enabledMissing = settings.integrations.filter((i) => i.enabled && !hasRequiredProviderCredentials(i));
    if (enabledMissing.length > 0) {
      toast.error("Eksik bilgi", { description: `${enabledMissing.map((i) => i.displayName).join(", ")} için zorunlu alanları doldurun.` });
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "shipping-integrations", shippingIntegrations: buildPayloadForSave(settings) }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Kaydedilemedi.");
      setSettings(normalizeShippingIntegrationSettings(result.shippingIntegrations));
      toast.success("Kargo ayarları kaydedildi.");
    } catch (error) {
      toast.error("Kayıt başarısız", { description: error instanceof Error ? error.message : "Bilinmeyen hata" });
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading || !settings) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50/60">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Kargo Entegrasyonu</h1>
            <p className="text-sm text-gray-500 mt-1">Kargo firmalarını bağlayın ve teslimat bölgelerini yönetin</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-lg shadow-primary/20"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard title="Toplam" value={stats.total} icon={Truck} color="gray" />
          <StatCard title="Aktif" value={stats.enabled} icon={CheckCircle2} color="green" />
          <StatCard title="Hazır" value={stats.ready} icon={ShieldCheck} color="blue" />
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl border border-gray-200 p-1 flex gap-1">
          {[
            { id: "integrations", label: "Entegrasyonlar", icon: Truck },
            { id: "zones", label: "Teslimat Bölgeleri", icon: MapPin },
            { id: "settings", label: "Varsayılan Ayarlar", icon: Settings },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                activeTab === tab.id ? "bg-primary text-white shadow-md" : "text-gray-600 hover:bg-gray-50"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "integrations" && (
          <div className="space-y-4">
            {/* Provider List */}
            {settings.integrations.map((integration) => {
              const definition = getShippingProviderDefinition(integration.provider);
              const status = getIntegrationStatus(integration);
              const isExpanded = expandedProvider === integration.provider;
              const isDefault = settings.defaultProvider === integration.provider;

              return (
                <div
                  key={integration.provider}
                  className={cn(
                    "bg-white rounded-2xl border transition-all overflow-hidden",
                    isExpanded ? "border-primary ring-2 ring-primary/20 shadow-lg" : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  {/* Header */}
                  <div className="p-5">
                    <div className="flex items-start gap-4">
                      <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-lg", definition.accentClassName)}>
                        {definition.shortName}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900">{integration.displayName}</h3>
                          <StatusBadge status={status} />
                          {isDefault && (
                            <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full font-medium">Varsayılan</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">{definition.description}</p>
                        <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                          <span>Doğrulama: {definition.authStrategy}</span>
                          <span>•</span>
                          <span>{definition.capabilities.length} özellik</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleProvider(integration.provider)}
                          className={cn(
                            "px-4 py-2 rounded-xl text-sm font-medium transition-colors",
                            integration.enabled ? "bg-gray-900 text-white" : "bg-green-50 text-green-700 hover:bg-green-100"
                          )}
                        >
                          {integration.enabled ? "Kapat" : "Aktif Et"}
                        </button>
                        <button
                          onClick={() => setExpandedProvider(isExpanded ? null : integration.provider)}
                          className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                        >
                          <ChevronDown className={cn("w-5 h-5 text-gray-400 transition-transform", isExpanded && "rotate-180")} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-5 pb-5">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-5">
                        {/* Left: Credentials */}
                        <div className="space-y-5">
                          <Section title="API Bilgileri" description="Sağlayıcı panelinden alınan kimlik bilgileri">
                            {definition.credentialFields.map((field) => (
                              <div key={field.key}>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                  {field.label} {field.required && <span className="text-red-500">*</span>}
                                </label>
                                <input
                                  type={field.secret ? "password" : "text"}
                                  value={integration.credentials[field.key] ?? ""}
                                  onChange={(e) => handleFieldChange(integration.provider, "credentials", field.key, e.target.value)}
                                  placeholder={field.placeholder}
                                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                                />
                                <p className="text-xs text-gray-400 mt-1">{field.description}</p>
                              </div>
                            ))}
                          </Section>

                          <Section title="Operasyon Ayarları" description="Gönderi oluşturma ve takip ayarları">
                            <div className="space-y-3">
                              <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                <div>
                                  <p className="text-sm font-medium text-gray-900">Otomatik gönderi oluştur</p>
                                  <p className="text-xs text-gray-500">Sipariş onaylanınca otomatik gönderi aç</p>
                                </div>
                                <input
                                  type="checkbox"
                                  checked={integration.automation.autoCreateShipment}
                                  onChange={(e) => updateIntegration(integration.provider, (i) => ({ ...i, automation: { ...i.automation, autoCreateShipment: e.target.checked } }))}
                                  className="w-5 h-5 rounded border-gray-300 text-primary"
                                />
                              </label>
                              <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                <div>
                                  <p className="text-sm font-medium text-gray-900">Takip senkronizasyonu</p>
                                  <p className="text-xs text-gray-500">Takip numarası ve durum güncellemesi al</p>
                                </div>
                                <input
                                  type="checkbox"
                                  checked={integration.automation.autoSyncTracking}
                                  onChange={(e) => updateIntegration(integration.provider, (i) => ({ ...i, automation: { ...i.automation, autoSyncTracking: e.target.checked } }))}
                                  className="w-5 h-5 rounded border-gray-300 text-primary"
                                />
                              </label>
                            </div>
                          </Section>
                        </div>

                        {/* Right: Config */}
                        <div className="space-y-5">
                          <Section title="Yapılandırma" description="Temel çalışma ayarları">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1.5">Görünen Ad</label>
                              <input
                                type="text"
                                value={integration.displayName}
                                onChange={(e) => updateIntegration(integration.provider, (i) => ({ ...i, displayName: e.target.value }))}
                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Ortam</label>
                                <select
                                  value={integration.environment}
                                  onChange={(e) => updateIntegration(integration.provider, (i) => ({ ...i, environment: e.target.value as "production" | "sandbox" }))}
                                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                                >
                                  <option value="production">Canlı</option>
                                  <option value="sandbox">Test</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Tetikleyici</label>
                                <select
                                  value={integration.automation.orderTrigger}
                                  onChange={(e) => updateIntegration(integration.provider, (i) => ({ ...i, automation: { ...i.automation, orderTrigger: e.target.value as "manual" | "confirmed" | "preparing" } }))}
                                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                                >
                                  <option value="manual">Manuel</option>
                                  <option value="confirmed">Onaylandı</option>
                                  <option value="preparing">Hazırlanıyor</option>
                                </select>
                              </div>
                            </div>
                          </Section>

                          {definition.configurationFields.length > 0 && (
                            <Section title="Ek Ayarlar" description="Sağlayıcıya özel ek yapılandırmalar">
                              {definition.configurationFields.map((field) => (
                                <div key={field.key}>
                                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{field.label}</label>
                                  {field.type === "select" ? (
                                    <select
                                      value={integration.configuration[field.key] ?? ""}
                                      onChange={(e) => handleFieldChange(integration.provider, "configuration", field.key, e.target.value)}
                                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                                    >
                                      {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                  ) : (
                                    <input
                                      type="text"
                                      value={integration.configuration[field.key] ?? ""}
                                      onChange={(e) => handleFieldChange(integration.provider, "configuration", field.key, e.target.value)}
                                      placeholder={field.placeholder}
                                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                                    />
                                  )}
                                </div>
                              ))}
                            </Section>
                          )}

                          {/* Health & Links */}
                          <div className="p-4 bg-gray-50 rounded-xl">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm font-medium text-gray-700">Bağlantı Durumu</span>
                              <StatusBadge status={status} />
                            </div>
                            <div className="flex gap-2">
                              <a
                                href={definition.docsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                API Dökümanı
                              </a>
                              <a
                                href={definition.dashboardUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Paneli Aç
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "zones" && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-semibold text-gray-900 text-lg">Teslimat Bölgeleri</h2>
                <p className="text-sm text-gray-500">Checkout ekranındaki kargo seçenekleri</p>
              </div>
              <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">{zones.length} bölge</span>
            </div>

            {zones.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Henüz teslimat bölgesi tanımlanmamış</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {zones.map((zone) => (
                  <div key={zone.id} className="border border-gray-200 rounded-2xl overflow-hidden">
                    <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">{zone.name}</h3>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {zone.countries.map((c) => (
                            <span key={c} className="px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-600">{c}</span>
                          ))}
                        </div>
                      </div>
                      <button onClick={() => handleDeleteZone(zone.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-4 space-y-2">
                      {zone.rates.map((rate) => (
                        <div key={rate.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{rate.name}</p>
                            <p className="text-xs text-gray-500">{rate.condition || "Koşul yok"}</p>
                          </div>
                          <span className="px-3 py-1 bg-white border border-gray-200 rounded-full text-sm font-semibold">
                            {rate.price === 0 ? "Ücretsiz" : `${rate.price} ₺`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Settings className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 text-lg">Varsayılan Ayarlar</h2>
                <p className="text-sm text-gray-500">Otomatik gönderi oluşturma için varsayılan sağlayıcı</p>
              </div>
            </div>

            <div className="max-w-md">
              <label className="block text-sm font-medium text-gray-700 mb-2">Varsayılan Kargo Firması</label>
              <select
                value={settings.defaultProvider ?? ""}
                onChange={(e) => setSettings({ ...settings, defaultProvider: (e.target.value || null) as ShippingIntegrationProvider | null })}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              >
                <option value="">Seçiniz...</option>
                {settings.integrations.filter((i) => i.enabled).map((i) => (
                  <option key={i.provider} value={i.provider}>{i.displayName}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-2">Sadece aktif entegrasyonlar arasından seçilebilir</p>
            </div>

            <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900">Bilgi</p>
                  <p className="text-sm text-blue-700 mt-1">Varsayılan sağlayıcı seçildiğinde, siparişler otomatik olarak bu firmaya gönderi oluşturur.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Components
function StatCard({ title, value, icon: Icon, color }: { title: string; value: number; icon: typeof Truck; color: "gray" | "green" | "blue" }) {
  const colors = { gray: "bg-gray-100 text-gray-600", green: "bg-green-100 text-green-600", blue: "bg-blue-100 text-blue-600" };
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase">{title}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: { label: string; variant: "success" | "error" | "warning" | "inactive" } }) {
  const styles = {
    success: "bg-green-100 text-green-700 border-green-200",
    error: "bg-red-100 text-red-700 border-red-200",
    warning: "bg-amber-100 text-amber-700 border-amber-200",
    inactive: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status.variant]}`}>{status.label}</span>;
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="p-5 bg-gray-50 rounded-2xl">
      <h4 className="font-semibold text-gray-900">{title}</h4>
      <p className="text-xs text-gray-500 mb-4">{description}</p>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
