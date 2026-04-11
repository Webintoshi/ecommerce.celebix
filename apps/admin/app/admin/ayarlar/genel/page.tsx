"use client";

import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import {
  Building2,
  Mail,
  MapPin,
  Phone,
  Save,
  Upload,
  X,
  Instagram,
  Twitter,
  Globe,
  Type,
  Megaphone,
  ImageIcon,
  Check,
  Palette,
  Bell,
  Store,
  Contact,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { TypographyFontPicker } from "@/components/admin/TypographyFontPicker";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import {
  buildStoreTypographyStylesheetUrl,
  DEFAULT_STORE_TYPOGRAPHY,
  FEATURED_STORE_TYPOGRAPHY_FONT_OPTIONS,
  normalizeStoreTypographySettings,
  STORE_BODY_SIZE_OPTIONS,
  STORE_HEADING_SCALE_OPTIONS,
  STORE_LETTER_SPACING_OPTIONS,
  STORE_TYPOGRAPHY_WEIGHT_OPTIONS,
  type StoreTypographyFontOption,
  type StoreTypographyRoleMode,
  type StoreTypographySettings,
} from "@celebix/platform-config/src/typography";
import {
  DEFAULT_FLOATING_CONTACT_SETTINGS,
  getFloatingContactDefaultLabel,
  normalizeFloatingContactSettings,
  type FloatingContactChannelType,
  type FloatingContactPosition,
  type FloatingContactSettings,
} from "@celebix/platform-config/src/floating-contact";

interface StoreInfo {
  name: string;
  email: string;
  phone: string;
  address: string;
  currency: string;
  timezone: string;
  logoUrl?: string;
  faviconUrl?: string;
  socialInstagram?: string;
  socialTwitter?: string;
  typography?: StoreTypographySettings;
  floatingContact?: FloatingContactSettings;
}

interface AnnouncementSettings {
  message: string;
  link: string;
  linkText: string;
  enabled: boolean;
  backgroundColor: string;
}

type GoogleFontsPayload = {
  success?: boolean;
  degraded?: boolean;
  fonts?: StoreTypographyFontOption[];
};

const DEFAULT_STORE_INFO: StoreInfo = {
  name: STORE_RUNTIME.name,
  email: STORE_RUNTIME.supportEmail,
  phone: STORE_RUNTIME.supportPhone,
  address: "",
  currency: "TRY",
  timezone: "Europe/Istanbul",
  logoUrl: "",
  faviconUrl: "",
  socialInstagram: "",
  socialTwitter: "",
  typography: DEFAULT_STORE_TYPOGRAPHY,
  floatingContact: DEFAULT_FLOATING_CONTACT_SETTINGS,
};

const FLOATING_CONTACT_POSITION_OPTIONS: Array<{
  value: FloatingContactPosition;
  label: string;
}> = [
  { value: "bottom-right", label: "Sag Alt" },
  { value: "bottom-left", label: "Sol Alt" },
  { value: "top-right", label: "Sag Ust" },
  { value: "top-left", label: "Sol Ust" },
];

const FLOATING_CONTACT_CHANNELS: Array<{
  type: FloatingContactChannelType;
  description: string;
  placeholder: string;
}> = [
  {
    type: "whatsapp",
    description: "Numara veya tam WhatsApp linki girin.",
    placeholder: "+90 555 123 45 67",
  },
  {
    type: "instagram",
    description: "Kullanici adi veya profil linki girin.",
    placeholder: "@markaniz",
  },
  {
    type: "form",
    description: "Iletisim veya destek formu linki girin.",
    placeholder: "/iletisim",
  },
];

const DEFAULT_ANNOUNCEMENT: AnnouncementSettings = {
  message: `${STORE_RUNTIME.name} icin yeni koleksiyonlar yayinda.`,
  link: "/kampanyalar",
  linkText: "Hemen Kesfet",
  enabled: true,
  backgroundColor: "#7B1113",
};

function normalizeAnnouncementColor(value?: string) {
  const normalized = (value || "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
    return normalized.toUpperCase();
  }

  if (/^#[0-9A-Fa-f]{3}$/.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`.toUpperCase();
  }

  return DEFAULT_ANNOUNCEMENT.backgroundColor;
}

function getAnnouncementTextColor(hexColor: string) {
  const color = normalizeAnnouncementColor(hexColor);
  const red = parseInt(color.slice(1, 3), 16);
  const green = parseInt(color.slice(3, 5), 16);
  const blue = parseInt(color.slice(5, 7), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;

  return brightness > 150 ? "#0B1120" : "#FFFFFF";
}

// Quick Nav Item
function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
        active
          ? "bg-neutral-900 text-white shadow-lg shadow-neutral-900/20"
          : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="font-medium">{label}</span>
    </button>
  );
}

// Compact Card Component
function Card({
  children,
  title,
  icon: Icon,
  id,
}: {
  children: React.ReactNode;
  title: string;
  icon: React.ElementType;
  id: string;
}) {
  return (
    <div id={id} className="bg-white rounded-2xl shadow-sm border border-gray-100">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-50">
        <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center">
          <Icon className="w-5 h-5 text-white" />
        </div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// Form Components
function Input({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  icon: Icon,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="relative">
        {Icon && (
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        )}
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent ${
            Icon ? "pl-10" : ""
          }`}
        />
      </div>
    </div>
  );
}

function TextArea({
  label,
  name,
  value,
  onChange,
  placeholder,
  rows = 2,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent resize-none"
      />
    </div>
  );
}

function Select({
  label,
  name,
  value,
  onChange,
  options,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function GeneralSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [fontCatalog, setFontCatalog] = useState<StoreTypographyFontOption[]>(
    FEATURED_STORE_TYPOGRAPHY_FONT_OPTIONS
  );
  const [activeSection, setActiveSection] = useState("brand");
  const [formData, setFormData] = useState<StoreInfo>(DEFAULT_STORE_INFO);
  const [announcementData, setAnnouncementData] =
    useState<AnnouncementSettings>(DEFAULT_ANNOUNCEMENT);

  useEffect(() => {
    void fetchSettings();
    void fetchGoogleFonts();
  }, []);

  useEffect(() => {
    const stylesheetUrl = buildStoreTypographyStylesheetUrl(formData.typography);
    const linkId = "celebix-admin-typography-preview";
    let link = document.getElementById(linkId) as HTMLLinkElement | null;

    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = stylesheetUrl;
  }, [formData.typography]);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  async function fetchSettings() {
    setLoading(true);
    try {
      const settingsResponse = await fetch("/api/settings?type=store");
      const settingsPayload = await settingsResponse.json();

      if (settingsPayload.success && settingsPayload.storeInfo) {
        setFormData({
          ...DEFAULT_STORE_INFO,
          ...settingsPayload.storeInfo,
          typography: normalizeStoreTypographySettings(
            settingsPayload.storeInfo.typography
          ),
          floatingContact: normalizeFloatingContactSettings(
            settingsPayload.storeInfo.floatingContact
          ),
        });
      }

      const announcementResponse = await fetch("/api/settings?type=announcement");
      const announcementPayload = await announcementResponse.json();

      if (announcementPayload.success && announcementPayload.announcementSettings) {
        setAnnouncementData({
          ...DEFAULT_ANNOUNCEMENT,
          ...announcementPayload.announcementSettings,
        });
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
      toast.error("Ayarlar yuklenirken hata olustu");
    } finally {
      setLoading(false);
    }
  }

  async function fetchGoogleFonts() {
    try {
      const response = await fetch("/api/admin/google-fonts", {
        cache: "force-cache",
      });
      const payload = (await response.json()) as GoogleFontsPayload;

      if (response.ok && payload.success && Array.isArray(payload.fonts)) {
        setFontCatalog(payload.fonts);
      }
    } catch (error) {
      console.error("Failed to fetch Google font catalog:", error);
    }
  }

  function handleChange(
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value, type } = event.target;

    if (type === "checkbox") {
      const checked = (event.target as HTMLInputElement).checked;
      setAnnouncementData((prev) => ({ ...prev, [name]: checked }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function handleAnnouncementChange(
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = event.target;
    setAnnouncementData((prev) => ({
      ...prev,
      [name]: name === "backgroundColor" ? normalizeAnnouncementColor(value) : value,
    }));
  }

  function handleTypographyChange<Key extends keyof StoreTypographySettings>(
    key: Key,
    value: StoreTypographySettings[Key]
  ) {
    setFormData((prev) => ({
      ...prev,
      typography: {
        ...normalizeStoreTypographySettings(prev.typography),
        [key]: value,
      },
    }));
  }

  function handleFloatingContactChange<Key extends keyof FloatingContactSettings>(
    key: Key,
    value: FloatingContactSettings[Key]
  ) {
    setFormData((prev) => ({
      ...prev,
      floatingContact: {
        ...normalizeFloatingContactSettings(prev.floatingContact),
        [key]: value,
      },
    }));
  }

  function handleFloatingContactChannelChange(
    channelType: FloatingContactChannelType,
    key: "enabled" | "label" | "href",
    value: boolean | string
  ) {
    setFormData((prev) => {
      const current = normalizeFloatingContactSettings(prev.floatingContact);

      return {
        ...prev,
        floatingContact: {
          ...current,
          channels: current.channels.map((channel) => {
            if (channel.type !== channelType) {
              return channel;
            }

            if (key === "href") {
              const hrefValue = typeof value === "string" ? value : "";
              return {
                ...channel,
                href: hrefValue,
                enabled: hrefValue.trim().length > 0 ? true : false,
              };
            }

            return { ...channel, [key]: value };
          }),
        },
      };
    });
  }

  async function handleAssetUpload(
    event: React.ChangeEvent<HTMLInputElement>,
    options: {
      field: "logoUrl" | "faviconUrl";
      folder: string;
      successMessage: string;
      setUploading: (value: boolean) => void;
      errorLabel: string;
    }
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    options.setUploading(true);
    try {
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      uploadForm.append("folder", options.folder);
      uploadForm.append("thumbnail", "false");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: uploadForm,
      });
      const payload = await response.json();

      if (!response.ok || !payload.success || !payload.url) {
        throw new Error(payload.error || `${options.errorLabel} yuklenemedi`);
      }

      setFormData((prev) => ({ ...prev, [options.field]: String(payload.url) }));
      toast.success(options.successMessage);
    } catch (error) {
      console.error(`${options.errorLabel} upload error:`, error);
      toast.error(
        error instanceof Error ? error.message : `${options.errorLabel} yuklenirken hata olustu`
      );
    } finally {
      options.setUploading(false);
      event.target.value = "";
    }
  }

  async function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    await handleAssetUpload(event, {
      field: "logoUrl",
      folder: "branding",
      successMessage: "Logo yuklendi",
      setUploading: setLogoUploading,
      errorLabel: "Logo",
    });
  }

  async function handleFaviconUpload(event: React.ChangeEvent<HTMLInputElement>) {
    await handleAssetUpload(event, {
      field: "faviconUrl",
      folder: "branding",
      successMessage: "Favicon yuklendi",
      setUploading: setFaviconUploading,
      errorLabel: "Favicon",
    });
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const settingsResponse = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "store",
          storeInfo: {
            ...formData,
            typography: normalizeStoreTypographySettings(formData.typography),
            floatingContact: normalizeFloatingContactSettings(formData.floatingContact),
          },
        }),
      });
      const settingsPayload = await settingsResponse.json();

      if (!settingsPayload.success) {
        throw new Error(settingsPayload.error || "Kaydetme basarisiz");
      }

      const announcementResponse = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "announcement",
          announcementSettings: announcementData,
        }),
      });
      const announcementPayload = await announcementResponse.json();

      if (!announcementPayload.success) {
        throw new Error(announcementPayload.error || "Duyuru kaydedilemedi");
      }

      toast.success("Tum ayarlar kaydedildi");
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error(error instanceof Error ? error.message : "Kaydedilirken hata olustu");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-neutral-900" />
      </div>
    );
  }

  const typography = normalizeStoreTypographySettings(formData.typography);
  const floatingContact = normalizeFloatingContactSettings(formData.floatingContact);
  const announcementColor = normalizeAnnouncementColor(announcementData.backgroundColor);
  const announcementTextColor = getAnnouncementTextColor(announcementColor);
  const announcementButtonClass =
    announcementTextColor === "#FFFFFF"
      ? "bg-white/12 text-white"
      : "bg-[#0B1120]/10 text-[#0B1120]";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Mağaza Ayarları</h1>
            <p className="text-xs text-gray-500 mt-0.5">Mağazanızın temel bilgilerini yönetin</p>
          </div>
          <button
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-neutral-900/20 transition-all hover:bg-neutral-800 active:scale-95 disabled:opacity-50"
          >
            {saving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Kaydet
          </button>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="flex">
        {/* Left Sidebar Navigation */}
        <aside className="w-64 sticky top-[73px] h-[calc(100vh-73px)] border-r border-gray-100 bg-white/50 backdrop-blur-sm p-4 overflow-y-auto hidden lg:block">
          <nav className="space-y-1">
            <NavItem
              icon={Store}
              label="Marka"
              active={activeSection === "brand"}
              onClick={() => scrollToSection("brand")}
            />
            <NavItem
              icon={Contact}
              label="İletişim"
              active={activeSection === "contact"}
              onClick={() => scrollToSection("contact")}
            />
            <NavItem
              icon={MessageCircle}
              label="Floating Iletisim"
              active={activeSection === "floating-contact"}
              onClick={() => scrollToSection("floating-contact")}
            />
            <NavItem
              icon={Globe}
              label="Sosyal & Bölge"
              active={activeSection === "region"}
              onClick={() => scrollToSection("region")}
            />
            <NavItem
              icon={Bell}
              label="Duyuru"
              active={activeSection === "announcement"}
              onClick={() => scrollToSection("announcement")}
            />
            <NavItem
              icon={Type}
              label="Yazı Tipleri"
              active={activeSection === "typography"}
              onClick={() => scrollToSection("typography")}
            />
          </nav>
        </aside>

        {/* Main Content - Two Column Grid */}
        <main className="flex-1 p-6">
          <div className="max-w-5xl mx-auto grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* Brand Card - Spans 2 cols */}
            <div className="xl:col-span-2">
              <Card title="Marka Bilgileri" icon={Store} id="brand">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2 flex gap-4">
                    {/* Logo Upload */}
                    <div className="flex-shrink-0">
                      <div className="w-24 h-24 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-200">
                        {formData.logoUrl ? (
                          <Image
                            src={formData.logoUrl}
                            alt="Logo"
                            width={96}
                            height={96}
                            className="w-full h-full object-contain p-2"
                            unoptimized
                          />
                        ) : (
                          <ImageIcon className="w-8 h-8 text-gray-300" />
                        )}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-neutral-800">
                          {logoUploading ? (
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                          ) : (
                            <Upload className="h-3 w-3" />
                          )}
                          Logo
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleLogoUpload}
                            disabled={logoUploading}
                          />
                        </label>
                        {formData.logoUrl && (
                          <button
                            onClick={() => setFormData((prev) => ({ ...prev, logoUrl: "" }))}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Favicon Upload */}
                    <div className="flex-shrink-0">
                      <div className="w-24 h-24 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-200">
                        {formData.faviconUrl ? (
                          <img
                            src={formData.faviconUrl}
                            alt="Favicon"
                            className="w-full h-full object-contain p-2"
                          />
                        ) : (
                          <Globe className="w-8 h-8 text-gray-300" />
                        )}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-neutral-800">
                          {faviconUploading ? (
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                          ) : (
                            <Upload className="h-3 w-3" />
                          )}
                          Favicon
                          <input
                            type="file"
                            accept="image/*,.ico"
                            className="hidden"
                            onChange={handleFaviconUpload}
                            disabled={faviconUploading}
                          />
                        </label>
                        {formData.faviconUrl && (
                          <button
                            onClick={() => setFormData((prev) => ({ ...prev, faviconUrl: "" }))}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Store Name & Email */}
                    <div className="flex-1 space-y-3">
                      <Input
                        label="Mağaza Adı"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="DeryCraft"
                      />
                      <Input
                        label="E-posta"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="info@magaza.com"
                      />
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Contact Card */}
            <Card title="İletişim" icon={Phone} id="contact">
              <div className="space-y-3">
                <Input
                  label="Telefon"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+90 555 123 4567"
                  icon={Phone}
                />
                <TextArea
                  label="Adres"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="İşletme adresiniz..."
                  rows={2}
                />
              </div>
            </Card>

            <Card title="Floating Iletisim" icon={MessageCircle} id="floating-contact">
              <div className="space-y-4">
                <div className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-gray-50/80 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      Yuzen iletisim butonu
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Sadece aktif edilen ve link girilen kanallar vitrinde gosterilir.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={floatingContact.enabled}
                      onChange={(event) =>
                        handleFloatingContactChange("enabled", event.target.checked)
                      }
                      className="sr-only peer"
                    />
                    <div className="h-6 w-11 rounded-full bg-gray-200 peer-checked:bg-neutral-900 peer-checked:after:translate-x-full after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-['']" />
                    <span className="ml-3 text-sm font-medium text-gray-900">
                      {floatingContact.enabled ? "Aktif" : "Pasif"}
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
                  <Select
                    label="Konum"
                    name="floatingContactPosition"
                    value={floatingContact.position}
                    onChange={(event) =>
                      handleFloatingContactChange(
                        "position",
                        event.target.value as FloatingContactPosition
                      )
                    }
                    options={FLOATING_CONTACT_POSITION_OPTIONS}
                  />

                  <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-4">
                    <span className="text-sm font-medium text-gray-700">Not</span>
                    <p className="mt-2 text-sm leading-6 text-gray-500">
                      WhatsApp ve Instagram alanlari kullanici adi veya tam link kabul eder.
                      Form alani icin dahili rota ya da tam URL girebilirsiniz.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {FLOATING_CONTACT_CHANNELS.map((channelConfig) => {
                    const channel =
                      floatingContact.channels.find(
                        (item) => item.type === channelConfig.type
                      ) ?? null;

                    return (
                      <div
                        key={channelConfig.type}
                        className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900">
                              {getFloatingContactDefaultLabel(channelConfig.type)}
                            </h3>
                            <p className="mt-1 text-sm text-gray-500">
                              {channelConfig.description}
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(channel?.enabled)}
                              onChange={(event) =>
                                handleFloatingContactChannelChange(
                                  channelConfig.type,
                                  "enabled",
                                  event.target.checked
                                )
                              }
                              className="sr-only peer"
                            />
                            <div className="h-6 w-11 rounded-full bg-gray-200 peer-checked:bg-neutral-900 peer-checked:after:translate-x-full after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-['']" />
                            <span className="ml-3 text-sm font-medium text-gray-900">
                              {channel?.enabled ? "Aktif" : "Kapali"}
                            </span>
                          </label>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                          <Input
                            label="Gorunen Baslik"
                            name={`${channelConfig.type}-label`}
                            value={
                              channel?.label ||
                              getFloatingContactDefaultLabel(channelConfig.type)
                            }
                            onChange={(event) =>
                              handleFloatingContactChannelChange(
                                channelConfig.type,
                                "label",
                                event.target.value
                              )
                            }
                            placeholder={getFloatingContactDefaultLabel(channelConfig.type)}
                          />
                          <Input
                            label="Baglanti"
                            name={`${channelConfig.type}-href`}
                            value={channel?.href || ""}
                            onChange={(event) =>
                              handleFloatingContactChannelChange(
                                channelConfig.type,
                                "href",
                                event.target.value
                              )
                            }
                            placeholder={channelConfig.placeholder}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>

            {/* Social & Regional Combined */}
            <Card title="Sosyal Medya & Bölge" icon={Globe} id="region">
              <div className="space-y-3">
                <Input
                  label="Instagram"
                  name="socialInstagram"
                  value={formData.socialInstagram || ""}
                  onChange={handleChange}
                  placeholder="@kullaniciadi"
                  icon={Instagram}
                />
                <Input
                  label="X (Twitter)"
                  name="socialTwitter"
                  value={formData.socialTwitter || ""}
                  onChange={handleChange}
                  placeholder="@kullaniciadi"
                  icon={Twitter}
                />
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 mt-3">
                  <Select
                    label="Para Birimi"
                    name="currency"
                    value={formData.currency}
                    onChange={handleChange}
                    options={[
                      { value: "TRY", label: "₺ TL" },
                      { value: "USD", label: "$ USD" },
                      { value: "EUR", label: "€ EUR" },
                    ]}
                  />
                  <Select
                    label="Zaman Dilimi"
                    name="timezone"
                    value={formData.timezone}
                    onChange={handleChange}
                    options={[
                      { value: "Europe/Istanbul", label: "İstanbul" },
                      { value: "UTC", label: "UTC" },
                    ]}
                  />
                </div>
              </div>
            </Card>

            {/* Announcement Card - Full Width */}
            <div className="xl:col-span-2">
              <Card title="Üst Bar Duyurusu" icon={Bell} id="announcement">
                <div className="flex items-center gap-3 mb-4">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      name="enabled"
                      checked={announcementData.enabled}
                      onChange={handleChange}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-neutral-900"></div>
                    <span className="ml-3 text-sm font-medium text-gray-900">
                      {announcementData.enabled ? "Aktif" : "Pasif"}
                    </span>
                  </label>
                </div>

                {announcementData.enabled && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <TextArea
                        label="Duyuru Metni"
                        name="message"
                        value={announcementData.message}
                        onChange={handleAnnouncementChange}
                        placeholder="Yeni sezon ürünleri stokta!"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-3">
                      <Input
                        label="Buton Metni"
                        name="linkText"
                        value={announcementData.linkText}
                        onChange={handleAnnouncementChange}
                        placeholder="İncele"
                      />
                      <Input
                        label="Link"
                        name="link"
                        value={announcementData.link}
                        onChange={handleAnnouncementChange}
                        placeholder="/urunler"
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700">Bar Rengi</label>
                      <div className="flex items-center gap-3">
                        <label className="relative h-12 w-16 overflow-hidden rounded-xl border border-gray-200 shadow-sm cursor-pointer">
                          <input
                            type="color"
                            name="backgroundColor"
                            value={announcementColor}
                            onChange={handleAnnouncementChange}
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          />
                          <span
                            className="block h-full w-full"
                            style={{ backgroundColor: announcementColor }}
                          />
                        </label>
                        <div className="flex-1">
                          <Input
                            label=""
                            name="backgroundColor"
                            value={announcementColor}
                            onChange={handleAnnouncementChange}
                            placeholder="#7B1113"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">
                        Yazi ve buton kontrasti otomatik ayarlanir.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <span className="text-sm font-medium text-gray-700">On Izleme</span>
                      <div
                        className="rounded-2xl border border-black/5 px-4 py-3 shadow-sm"
                        style={{ backgroundColor: announcementColor }}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-center">
                          <span
                            className="text-sm font-medium tracking-wide text-center sm:text-left"
                            style={{ color: announcementTextColor }}
                          >
                            {announcementData.message || DEFAULT_ANNOUNCEMENT.message}
                          </span>
                          {announcementData.linkText ? (
                            <span
                              className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${announcementButtonClass}`}
                            >
                              {announcementData.linkText}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>
                )}
              </Card>
            </div>

            {/* Typography Card - Full Width */}
            <div className="xl:col-span-2">
              <Card title="Yazı Tipleri" icon={Type} id="typography">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2">
                    <TypographyFontPicker
                      label="Başlık Fontu"
                      value={typography.headingFont}
                      onChange={(font) => handleTypographyChange("headingFont", font)}
                      catalog={fontCatalog}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <TypographyFontPicker
                      label="Metin Fontu"
                      value={typography.bodyFont}
                      onChange={(font) => handleTypographyChange("bodyFont", font)}
                      catalog={fontCatalog}
                    />
                  </div>
                  <Select
                    label="Boyut"
                    name="bodySizePx"
                    value={String(typography.bodySizePx)}
                    onChange={(e) =>
                      handleTypographyChange("bodySizePx", Number(e.target.value))
                    }
                    options={STORE_BODY_SIZE_OPTIONS.map((opt) => ({
                      value: String(opt.id),
                      label: opt.label,
                    }))}
                  />
                  <Select
                    label="Başlık Boyutu"
                    name="headingScale"
                    value={typography.headingScale}
                    onChange={(e) => handleTypographyChange("headingScale", e.target.value)}
                    options={STORE_HEADING_SCALE_OPTIONS.map((opt) => ({
                      value: String(opt.id),
                      label: opt.label,
                    }))}
                  />
                  <Select
                    label="Harf Aralığı"
                    name="letterSpacing"
                    value={typography.letterSpacing}
                    onChange={(e) => handleTypographyChange("letterSpacing", e.target.value)}
                    options={STORE_LETTER_SPACING_OPTIONS.map((opt) => ({
                      value: String(opt.id),
                      label: opt.label,
                    }))}
                  />
                  <Select
                    label="Kalınlık"
                    name="headingWeight"
                    value={String(typography.headingWeight)}
                    onChange={(e) =>
                      handleTypographyChange("headingWeight", Number(e.target.value))
                    }
                    options={STORE_TYPOGRAPHY_WEIGHT_OPTIONS.map((opt) => ({
                      value: String(opt.id),
                      label: opt.label,
                    }))}
                  />
                </div>
              </Card>
            </div>
          </div>

          {/* Bottom Save */}
          <div className="flex justify-end mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-neutral-900/20 transition-all hover:bg-neutral-800 active:scale-95 disabled:opacity-50"
            >
              {saving ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Değişiklikleri Kaydet
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
