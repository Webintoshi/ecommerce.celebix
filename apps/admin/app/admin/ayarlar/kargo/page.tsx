"use client";

import {
  type ElementType,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  MapPin,
  Plus,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AdminEmptyState, AdminPageHeader, AdminPageShell } from "@/components/admin/AdminPageShell";
import { cn } from "@/lib/utils";
import {
  createDefaultShippingIntegrationSettings,
  getShippingProviderDefinition,
  hasRequiredProviderCredentials,
  mergeLegacyBasitKargoSettings,
  normalizeShippingIntegrationSettings,
} from "@/lib/shipping-integrations";
import {
  createDefaultShippingZones,
  normalizeShippingZones,
  type ShippingRate,
  type ShippingZone,
} from "@celebix/platform-config/src/shipping";
import type {
  ShippingIntegrationProvider,
  ShippingIntegrationRecord,
  ShippingIntegrationSettings,
} from "@/types/shipping-integration";

const LEGACY_BASIT_KARGO_STORAGE_KEY = "celebix_basit_kargo_settings";

type IntegrationStatus = {
  label: string;
  variant: "success" | "error" | "warning" | "inactive";
};

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
      health:
        integration.enabled && !hasRequiredProviderCredentials(integration)
          ? { ...integration.health, status: "error", lastError: "Zorunlu kimlik bilgileri eksik." }
          : integration.health,
    })),
  };
}

function getIntegrationStatus(integration: ShippingIntegrationRecord): IntegrationStatus {
  if (integration.enabled && hasRequiredProviderCredentials(integration)) {
    return {
      label: integration.health.status === "error" ? "Hata" : "Aktif",
      variant: integration.health.status === "error" ? "error" : "success",
    };
  }

  if (integration.enabled) return { label: "Eksik", variant: "warning" };

  return { label: "Pasif", variant: "inactive" };
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

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    if (!settings) return { total: 0, enabled: 0, ready: 0 };
    const enabled = settings.integrations.filter((item) => item.enabled).length;
    const ready = settings.integrations.filter((item) => item.enabled && hasRequiredProviderCredentials(item)).length;
    return { total: settings.integrations.length, enabled, ready };
  }, [settings]);

  function updateIntegration(
    provider: ShippingIntegrationProvider,
    updater: (record: ShippingIntegrationRecord) => ShippingIntegrationRecord,
  ) {
    setSettings((current) =>
      current
        ? {
            ...current,
            integrations: current.integrations.map((record) =>
              record.provider === provider ? updater(record) : record,
            ),
          }
        : current,
    );
  }

  function handleFieldChange(
    provider: ShippingIntegrationProvider,
    section: "credentials" | "configuration",
    key: string,
    value: string,
  ) {
    updateIntegration(provider, (record) => ({
      ...record,
      [section]: { ...record[section], [key]: value },
      health:
        record.health.lastError === "Zorunlu kimlik bilgileri eksik."
          ? { ...record.health, status: "unknown", lastError: null }
          : record.health,
    }));
  }

  function handleToggleProvider(provider: ShippingIntegrationProvider) {
    setSettings((current) => {
      if (!current) return current;
      return {
        ...current,
        defaultProvider:
          current.defaultProvider === provider && current.integrations.find((item) => item.provider === provider)?.enabled
            ? null
            : current.defaultProvider,
        integrations: current.integrations.map((item) =>
          item.provider === provider ? { ...item, enabled: !item.enabled } : item,
        ),
      };
    });
  }

  function updateZone(zoneId: string, updater: (zone: ShippingZone) => ShippingZone) {
    setZones((current) => current.map((zone) => (zone.id === zoneId ? updater(zone) : zone)));
  }

  async function handleSave() {
    if (!settings) return;
    const missing = settings.integrations.filter((item) => item.enabled && !hasRequiredProviderCredentials(item));
    if (missing.length > 0) {
      toast.error("Eksik bilgi", {
        description: `${missing.map((item) => item.displayName).join(", ")} için zorunlu alanları doldurun.`,
      });
      return;
    }
    setSaving(true);
    try {
      const normalizedZones = normalizeShippingZones(zones.filter((zone) => zone.name.trim() && zone.rates.length > 0));
      const [integrationsResponse, zonesResponse] = await Promise.all([
        fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "shipping-integrations", shippingIntegrations: buildPayloadForSave(settings) }),
        }),
        fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "shipping", shippingOptions: normalizedZones }),
        }),
      ]);
      const integrationsResult = await integrationsResponse.json().catch(() => ({}));
      const zonesResult = await zonesResponse.json().catch(() => ({}));
      if (!integrationsResponse.ok || !integrationsResult.success) {
        throw new Error(integrationsResult.error || "Kargo entegrasyonları kaydedilemedi.");
      }
      if (!zonesResponse.ok || !zonesResult.success) {
        throw new Error(zonesResult.error || "Teslimat bölgeleri kaydedilemedi.");
      }
      setSettings(normalizeShippingIntegrationSettings(integrationsResult.shippingIntegrations));
      setZones(normalizeShippingZones(zonesResult.shippingOptions ?? normalizedZones));
      toast.success("Kargo ayarları kaydedildi.");
    } catch (error) {
      toast.error("Kayıt başarısız", { description: error instanceof Error ? error.message : "Bilinmeyen hata" });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F9F9F9] text-sm font-semibold text-[#6B7280]">
        <Loader2 className="mr-3 h-5 w-5 animate-spin text-[#FF6A00]" />
        Kargo ayarları yükleniyor
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
      <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
        <AdminPageShell>
          <AdminPageHeader
            sectionLabel="Ayarlar"
            title="Kargo"
            description="Kargo entegrasyonları, teslimat bölgeleri ve varsayılan sağlayıcıyı yönetin."
            actions={
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.16)] transition hover:bg-[#E85D04] disabled:cursor-wait disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Kaydediliyor" : "Kaydet"}
              </button>
            }
            metrics={
              <>
                <MetricCell label="Toplam" value={stats.total} detail="firma" icon={Truck} />
                <MetricCell label="Aktif" value={stats.enabled} detail="entegrasyon" icon={CheckCircle2} />
                <MetricCell label="Hazır" value={stats.ready} detail="checkout" icon={ShieldCheck} />
                <MetricCell label="Bölge" value={zones.length} detail="teslimat" icon={MapPin} />
              </>
            }
          />

          <section className="flex flex-wrap gap-1 rounded-[8px] border border-[#DCE3EC] bg-white p-1">
            {[
              { id: "integrations", label: "Entegrasyonlar", icon: Truck },
              { id: "zones", label: "Teslimat Bölgeleri", icon: MapPin },
              { id: "settings", label: "Varsayılan Ayarlar", icon: Settings },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id as typeof tab)}
                className={cn(
                  "inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-[7px] px-3 text-sm font-semibold transition min-[760px]:flex-none",
                  tab === item.id
                    ? "bg-[#FF6A00] text-white"
                    : "text-[#6B7280] hover:bg-[#FFF8F3] hover:text-[#E85D04]",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </section>

          {tab === "integrations" ? (
            <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <SectionHeader title="Kargo firmaları" summary={`${settings.integrations.length} sağlayıcı`} />
              <div className="divide-y divide-[#E1E7EF]">
                {settings.integrations.map((integration) => {
                  const definition = getShippingProviderDefinition(integration.provider);
                  const status = getIntegrationStatus(integration);
                  const isExpanded = expandedProvider === integration.provider;

                  return (
                    <article key={integration.provider} className="bg-white">
                      <div className="grid gap-4 px-4 py-4 min-[980px]:grid-cols-[minmax(260px,1fr)_110px_140px_auto] min-[980px]:items-center xl:px-5">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={cn(
                              "flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] text-sm font-bold text-white",
                              definition.accentClassName,
                            )}
                          >
                            {definition.shortName}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-base font-semibold tracking-[-0.02em] text-[#111827]">
                                {integration.displayName}
                              </h3>
                              {settings.defaultProvider === integration.provider ? (
                                <span className="text-xs font-semibold text-[#E85D04]">Varsayılan</span>
                              ) : null}
                            </div>
                            <p className="mt-1 line-clamp-1 text-sm font-medium text-[#6B7280]">{definition.description}</p>
                          </div>
                        </div>

                        <FieldValue label="Durum" value={status.label} tone={status.variant} />
                        <FieldValue
                          label="Ortam"
                          value={integration.environment === "production" ? "Canlı" : "Test"}
                          tone={integration.environment === "production" ? "warning" : "neutral"}
                        />

                        <div className="flex flex-wrap items-center gap-2 min-[980px]:justify-end">
                          <button
                            type="button"
                            onClick={() => handleToggleProvider(integration.provider)}
                            className={cn(
                              "inline-flex h-9 items-center justify-center rounded-[8px] px-3 text-sm font-semibold transition",
                              integration.enabled
                                ? "border border-[#DCE3EC] bg-white text-[#4B5563] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
                                : "bg-[#FF6A00] text-white hover:bg-[#E85D04]",
                            )}
                          >
                            {integration.enabled ? "Kapat" : "Aktif et"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedProvider(isExpanded ? null : integration.provider)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white text-[#6B7280] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
                            aria-label={`${integration.displayName} detaylarını aç`}
                          >
                            <ChevronDown className={cn("h-4 w-4 transition", isExpanded && "rotate-180")} />
                          </button>
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="grid gap-4 border-t border-[#E1E7EF] bg-[#F9F9F9] px-4 py-4 lg:grid-cols-2 xl:px-5">
                          <FormSection title="API Bilgileri" description="Sağlayıcı panelinden alınan kimlik bilgileri.">
                            {definition.credentialFields.map((field) => (
                              <div key={field.key}>
                                <Label>
                                  {field.label} {field.required ? <span className="text-rose-500">*</span> : null}
                                </Label>
                                <Input
                                  type={field.secret ? "password" : "text"}
                                  value={integration.credentials[field.key] ?? ""}
                                  onChange={(event) =>
                                    handleFieldChange(integration.provider, "credentials", field.key, event.target.value)
                                  }
                                  placeholder={field.placeholder}
                                />
                                <p className="mt-1 text-xs font-medium text-[#8B95A5]">{field.description}</p>
                              </div>
                            ))}
                          </FormSection>

                          <FormSection title="Yapılandırma" description="Görünen ad, ortam ve sağlayıcı ayarları.">
                            <div>
                              <Label>Görünen Ad</Label>
                              <Input
                                type="text"
                                value={integration.displayName}
                                onChange={(event) =>
                                  updateIntegration(integration.provider, (record) => ({
                                    ...record,
                                    displayName: event.target.value,
                                  }))
                                }
                              />
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <Label>Ortam</Label>
                                <Select
                                  value={integration.environment}
                                  onChange={(event) =>
                                    updateIntegration(integration.provider, (record) => ({
                                      ...record,
                                      environment: event.target.value as "production" | "sandbox",
                                    }))
                                  }
                                >
                                  <option value="production">Canlı</option>
                                  <option value="sandbox">Test</option>
                                </Select>
                              </div>
                              <div>
                                <Label>Tetikleyici</Label>
                                <Select
                                  value={integration.automation.orderTrigger}
                                  onChange={(event) =>
                                    updateIntegration(integration.provider, (record) => ({
                                      ...record,
                                      automation: {
                                        ...record.automation,
                                        orderTrigger: event.target.value as "manual" | "confirmed" | "preparing",
                                      },
                                    }))
                                  }
                                >
                                  <option value="manual">Manuel</option>
                                  <option value="confirmed">Onaylandı</option>
                                  <option value="preparing">Hazırlanıyor</option>
                                </Select>
                              </div>
                            </div>
                            {definition.configurationFields.map((field) => (
                              <div key={field.key}>
                                <Label>{field.label}</Label>
                                {field.type === "select" ? (
                                  <Select
                                    value={integration.configuration[field.key] ?? ""}
                                    onChange={(event) =>
                                      handleFieldChange(integration.provider, "configuration", field.key, event.target.value)
                                    }
                                  >
                                    {field.options?.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </Select>
                                ) : (
                                  <Input
                                    type="text"
                                    value={integration.configuration[field.key] ?? ""}
                                    onChange={(event) =>
                                      handleFieldChange(integration.provider, "configuration", field.key, event.target.value)
                                    }
                                    placeholder={field.placeholder}
                                  />
                                )}
                              </div>
                            ))}
                            <div className="flex gap-2">
                              <ExternalLinkButton href={definition.docsUrl}>API</ExternalLinkButton>
                              <ExternalLinkButton href={definition.dashboardUrl}>Panel</ExternalLinkButton>
                            </div>
                          </FormSection>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {tab === "zones" ? (
            <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <SectionHeader
                title="Teslimat bölgeleri"
                summary={`${zones.length} bölge`}
                action={
                  <button
                    type="button"
                    onClick={() => setZones((current) => [...current, createEmptyShippingZone()])}
                    className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-[#FF6A00] px-3 text-sm font-semibold text-white transition hover:bg-[#E85D04]"
                  >
                    <Plus className="h-4 w-4" />
                    Yeni bölge
                  </button>
                }
              />

              {zones.length === 0 ? (
                <div className="p-5">
                  <AdminEmptyState
                    icon={<MapPin className="h-7 w-7" />}
                    title="Teslimat bölgesi yok"
                    description="Checkout için ilk teslimat bölgesini ekleyin."
                    className="border-[#DCE3EC] bg-[#F9F9F9]"
                  />
                </div>
              ) : (
                <div className="divide-y divide-[#E1E7EF]">
                  {zones.map((zone) => (
                    <article key={zone.id} className="px-4 py-4 xl:px-5">
                      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-start">
                        <div>
                          <Label>Bölge adı</Label>
                          <Input
                            type="text"
                            value={zone.name}
                            onChange={(event) =>
                              updateZone(zone.id, (current) => ({ ...current, name: event.target.value }))
                            }
                            placeholder="Örn: Türkiye / İstanbul"
                          />
                        </div>
                        <div>
                          <Label>Ülke / şehir eşleşmeleri</Label>
                          <Input
                            type="text"
                            value={zone.countries.join(", ")}
                            onChange={(event) =>
                              updateZone(zone.id, (current) => ({
                                ...current,
                                countries: event.target.value
                                  .split(",")
                                  .map((item) => item.trim())
                                  .filter(Boolean),
                              }))
                            }
                            placeholder="Virgülle ayırın. Örn: Türkiye, İstanbul"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setZones((current) => current.filter((item) => item.id !== zone.id))}
                          className="inline-flex h-10 items-center justify-center rounded-[8px] border border-rose-200 bg-white px-3 text-rose-600 transition hover:bg-rose-50"
                          aria-label="Bölgeyi sil"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-4 space-y-3">
                        {zone.rates.map((rate) => (
                          <div key={rate.id} className="rounded-[8px] border border-[#E1E7EF] bg-[#F9F9F9] p-3">
                            <div className="grid items-end gap-3 md:grid-cols-[1.1fr_120px_180px_140px_auto]">
                              <div>
                                <Label>Tarife adı</Label>
                                <Input
                                  type="text"
                                  value={rate.name}
                                  onChange={(event) =>
                                    updateZone(zone.id, (current) => ({
                                      ...current,
                                      rates: current.rates.map((item) =>
                                        item.id === rate.id ? { ...item, name: event.target.value } : item,
                                      ),
                                    }))
                                  }
                                />
                              </div>
                              <div>
                                <Label>Tutar</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={rate.price}
                                  onChange={(event) =>
                                    updateZone(zone.id, (current) => ({
                                      ...current,
                                      rates: current.rates.map((item) =>
                                        item.id === rate.id ? { ...item, price: Number(event.target.value || 0) } : item,
                                      ),
                                    }))
                                  }
                                />
                              </div>
                              <div>
                                <Label>Teslimat süresi</Label>
                                <Input
                                  type="text"
                                  value={rate.estimatedDays || ""}
                                  onChange={(event) =>
                                    updateZone(zone.id, (current) => ({
                                      ...current,
                                      rates: current.rates.map((item) =>
                                        item.id === rate.id
                                          ? { ...item, estimatedDays: event.target.value, condition: event.target.value }
                                          : item,
                                      ),
                                    }))
                                  }
                                  placeholder="1-3 iş günü"
                                />
                              </div>
                              <div>
                                <Label>Ücretsiz eşik</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={rate.minOrder ?? ""}
                                  onChange={(event) =>
                                    updateZone(zone.id, (current) => ({
                                      ...current,
                                      rates: current.rates.map((item) =>
                                        item.id === rate.id
                                          ? { ...item, minOrder: event.target.value ? Number(event.target.value) : undefined }
                                          : item,
                                      ),
                                    }))
                                  }
                                  placeholder="500"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  updateZone(zone.id, (current) => ({
                                    ...current,
                                    rates: current.rates.filter((item) => item.id !== rate.id),
                                  }))
                                }
                                className="inline-flex h-10 items-center justify-center rounded-[8px] border border-rose-200 bg-white px-3 text-rose-600 transition hover:bg-rose-50"
                                aria-label="Tarifeyi sil"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            updateZone(zone.id, (current) => ({
                              ...current,
                              rates: [...current.rates, createEmptyShippingRate()],
                            }))
                          }
                          className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
                        >
                          <Plus className="h-4 w-4" />
                          Tarife ekle
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {tab === "settings" ? (
            <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <SectionHeader title="Varsayılan ayarlar" summary="Otomatik gönderi" />
              <div className="grid gap-5 p-4 xl:p-5 min-[880px]:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                <div>
                  <Label>Varsayılan kargo firması</Label>
                  <Select
                    value={settings.defaultProvider ?? ""}
                    onChange={(event) =>
                      setSettings({ ...settings, defaultProvider: (event.target.value || null) as ShippingIntegrationProvider | null })
                    }
                  >
                    <option value="">Seçiniz</option>
                    {settings.integrations
                      .filter((item) => item.enabled)
                      .map((item) => (
                        <option key={item.provider} value={item.provider}>
                          {item.displayName}
                        </option>
                      ))}
                  </Select>
                </div>
                <div className="border-l-0 border-[#E1E7EF] text-sm font-medium leading-6 text-[#6B7280] min-[880px]:border-l min-[880px]:pl-5">
                  Varsayılan sağlayıcı seçildiğinde otomatik gönderi işlemleri bu firma üzerinden hazırlanır.
                </div>
              </div>
            </section>
          ) : null}
        </AdminPageShell>
      </div>
    </main>
  );
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

function SectionHeader({
  title,
  summary,
  action,
}: {
  title: string;
  summary: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[58px] flex-wrap items-center justify-between gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 xl:px-5">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">{title}</h2>
        <p className="mt-1 text-xs font-medium text-[#6B7280]">{summary}</p>
      </div>
      {action}
    </div>
  );
}

function FieldValue({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: IntegrationStatus["variant"] | "neutral";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-sm font-semibold text-[#111827]",
          tone === "success" && "text-emerald-700",
          tone === "warning" && "text-[#E85D04]",
          tone === "error" && "text-rose-600",
          tone === "inactive" && "text-[#6B7280]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[10px] border border-[#E1E7EF] bg-white p-4">
      <h4 className="text-sm font-semibold text-[#111827]">{title}</h4>
      <p className="mt-1 text-xs font-medium text-[#6B7280]">{description}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-[#6B7280]">{children}</label>;
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-10 w-full rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition placeholder:text-[#8B95A5] focus:border-[#FFD1B5] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]",
        props.className,
      )}
    />
  );
}

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-10 w-full rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] outline-none transition focus:border-[#FFD1B5] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]",
        props.className,
      )}
    />
  );
}

function ExternalLinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      {children}
    </a>
  );
}
