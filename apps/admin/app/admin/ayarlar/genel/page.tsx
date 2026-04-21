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
  message: `${STORE_RUNTIME.name} için yeni koleksiyonlar yayında.`,
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
      className={`group relative w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl text-left transition-all duration-300 ease-out overflow-hidden ${
        active
          ? "bg-zinc-100/80 text-zinc-950 font-semibold shadow-sm"
          : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
      }`}
    >
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-zinc-900 rounded-r-full" />
      )}
      <Icon className={`w-[18px] h-[18px] transition-colors duration-300 ${active ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-600"}`} />
      <span className="text-[13.5px] tracking-tight">{label}</span>
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
    <div id={id} className="scroll-mt-28 bg-white rounded-[24px] shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] border border-zinc-200/60 transition-all duration-500 hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-3.5 px-6 py-5 border-b border-zinc-100/80">
        <div className="w-9 h-9 rounded-2xl bg-zinc-50/80 flex items-center justify-center border border-zinc-100/50 shadow-sm">
          <Icon className="w-4 h-4 text-zinc-700" />
        </div>
        <h2 className="text-base font-semibold tracking-tight text-zinc-900">{title}</h2>
      </div>
      <div className="p-6 sm:p-7">{children}</div>
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
    <div className="space-y-2">
      <label className="text-[13px] font-medium text-zinc-700 tracking-tight">{label}</label>
      <div className="relative group">
        {Icon && (
          <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 transition-colors duration-200 group-focus-within:text-zinc-900" />
        )}
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`w-full rounded-2xl border border-zinc-200/80 bg-zinc-50/50 px-4 py-2.5 text-[13.5px] text-zinc-900 transition-all duration-300 ease-out placeholder:text-zinc-400 hover:bg-zinc-50 hover:border-zinc-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 ${
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
    <div className="space-y-2">
      <label className="text-[13px] font-medium text-zinc-700 tracking-tight">{label}</label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-2xl border border-zinc-200/80 bg-zinc-50/50 px-4 py-3 text-[13.5px] text-zinc-900 transition-all duration-300 ease-out placeholder:text-zinc-400 hover:bg-zinc-50 hover:border-zinc-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 resize-none leading-relaxed"
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
    <div className="space-y-2">
      <label className="text-[13px] font-medium text-zinc-700 tracking-tight">{label}</label>
      <div className="relative">
        <select
          name={name}
          value={value}
          onChange={onChange}
          className="w-full appearance-none rounded-2xl border border-zinc-200/80 bg-zinc-50/50 px-4 py-2.5 text-[13.5px] text-zinc-900 transition-all duration-300 ease-out hover:bg-zinc-50 hover:border-zinc-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-zinc-400">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
        </div>
      </div>
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
      toast.error("Ayarlar yüklenirken hata oluştu");
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
        throw new Error(payload.error || `${options.errorLabel} yüklenemedi`);
      }

      setFormData((prev) => ({ ...prev, [options.field]: String(payload.url) }));
      toast.success(options.successMessage);
    } catch (error) {
      console.error(`${options.errorLabel} upload error:`, error);
      toast.error(
        error instanceof Error ? error.message : `${options.errorLabel} yüklenirken hata oluştu`
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
      successMessage: "Logo yüklendi",
      setUploading: setLogoUploading,
      errorLabel: "Logo",
    });
  }

  async function handleFaviconUpload(event: React.ChangeEvent<HTMLInputElement>) {
    await handleAssetUpload(event, {
      field: "faviconUrl",
      folder: "branding",
      successMessage: "Favicon yüklendi",
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
        throw new Error(settingsPayload.error || "Kaydetme başarısız");
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
      toast.error(error instanceof Error ? error.message : "Kaydedilirken hata oluştu");
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
    <div className="min-h-screen bg-[#f6efe7] font-sans text-[#2f241d] selection:bg-[#FE6100]/20 selection:text-[#C54E00]">
      {/* Sticky Header */}
      <div className="sticky top-0 z-40 bg-[#f6efe7]/80 backdrop-blur-2xl border-b border-[#eadccd] supports-[backdrop-filter]:bg-[#f6efe7]/60">
        <div className="flex items-center justify-between px-6 py-4 xl:px-8">
          <div>
            <h1 className="text-xl font-bold tracking-[-0.03em] text-[#2f241d]">Mağaza Ayarları</h1>
          </div>
          <button
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E45700] px-6 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.22)] transition-all duration-300 ease-out hover:from-[#f15c00] hover:to-[#d84f00] hover:translate-y-[-1px] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/18"
          >
            {saving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Kaydet
          </button>
        </div>
      </div>

      <div className="border-b border-[#eadccd] bg-white/50 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-white/30 2xl:hidden md:px-6">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {[
            { id: "brand", label: "Marka" },
            { id: "contact", label: "Iletisim" },
            { id: "floating-contact", label: "Floating Iletisim" },
            { id: "region", label: "Sosyal ve Bolge" },
            { id: "announcement", label: "Duyuru" },
            { id: "typography", label: "Yazı Tipleri" },
          ].map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => scrollToSection(section.id)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium transition-all duration-300 ${
                activeSection === section.id
                  ? "bg-gradient-to-r from-[#FE6100]/10 to-[#FFB067]/10 border border-[#FE6100]/18 text-[#C54E00]"
                  : "bg-white border border-[#eadccd] text-[#7b6656] hover:bg-[#fff8f1] hover:text-[#C54E00] hover:border-[#FE6100]/25"
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="flex xl:px-4 2xl:px-8 max-w-[1600px] mx-auto">
        {/* Left Sidebar Navigation */}
        <aside className="sticky top-[73px] hidden h-[calc(100vh-73px)] w-[260px] overflow-y-auto border-r border-[#eadccd] bg-transparent py-8 pr-6 2xl:block">
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
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6 md:py-8 lg:pl-8">
          <div className="mx-auto grid max-w-[1000px] grid-cols-1 gap-6 2xl:grid-cols-2">
            {/* Brand Card - Spans 2 cols */}
            <div className="2xl:col-span-2">
              <Card title="Marka Bilgileri" icon={Store} id="brand">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="flex flex-col gap-6 md:col-span-2 lg:flex-row">
                    {/* Logo Upload */}
                    <div className="flex-shrink-0">
                      <div className="w-28 h-28 rounded-[24px] bg-[#fdf8f3] flex items-center justify-center overflow-hidden border border-dashed border-[#eadccd] transition-colors hover:bg-[#fff8f1] hover:border-[#FE6100]/30">
                        {formData.logoUrl ? (
                          <Image
                            src={formData.logoUrl}
                            alt="Logo"
                            width={112}
                            height={112}
                            className="w-full h-full object-contain p-3"
                            unoptimized
                          />
                        ) : (
                          <ImageIcon className="w-8 h-8 text-[#d4c3b3]" />
                        )}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-white border border-[#eadccd] text-[#6e5b4e] rounded-2xl text-[13px] font-semibold cursor-pointer transition-all hover:bg-[#fff7f1] hover:border-[#FE6100]/20 hover:text-[#C54E00] shadow-sm">
                          {logoUploading ? (
                            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#d4c3b3] border-t-[#C54E00]" />
                          ) : (
                            <Upload className="h-3.5 w-3.5" />
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
                            className="p-2.5 text-[#a08e82] hover:text-rose-600 rounded-2xl hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-all"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Favicon Upload */}
                    <div className="flex-shrink-0">
                      <div className="w-28 h-28 rounded-[24px] bg-[#fdf8f3] flex items-center justify-center overflow-hidden border border-dashed border-[#eadccd] transition-colors hover:bg-[#fff8f1] hover:border-[#FE6100]/30">
                        {formData.faviconUrl ? (
                          <img
                            src={formData.faviconUrl}
                            alt="Favicon"
                            className="w-full h-full object-contain p-3"
                          />
                        ) : (
                          <Globe className="w-8 h-8 text-[#d4c3b3]" />
                        )}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-white border border-[#eadccd] text-[#6e5b4e] rounded-2xl text-[13px] font-semibold cursor-pointer transition-all hover:bg-[#fff7f1] hover:border-[#FE6100]/20 hover:text-[#C54E00] shadow-sm">
                          {faviconUploading ? (
                            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#d4c3b3] border-t-[#C54E00]" />
                          ) : (
                            <Upload className="h-3.5 w-3.5" />
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
                            className="p-2.5 text-[#a08e82] hover:text-rose-600 rounded-2xl hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-all"
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
                <div className="flex flex-col gap-4 rounded-[24px] border border-[#eadccd] bg-white p-5 md:flex-row md:items-center md:justify-between shadow-[0_4px_12px_-4px_rgba(99,67,37,0.04)]">
                  <div>
                    <h3 className="text-[14px] font-semibold tracking-tight text-[#2f241d]">
                      Yüzen İletişim Butonu
                    </h3>
                    <p className="mt-1 text-[13px] text-[#7d6959]">
                      Sadece aktif edilen ve link girilen kanallar vitrinde gösterilir.
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
                    <div className="h-6 w-11 rounded-full bg-[#eadccd] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#FE6100]/15 peer-checked:bg-[#FE6100] peer-checked:after:translate-x-full after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-white after:bg-white after:transition-all after:content-[''] shadow-inner" />
                    <span className="ml-3 text-[13.5px] font-medium text-[#2f241d]">
                      {floatingContact.enabled ? "Aktif" : "Pasif"}
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[220px_1fr]">
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

                  <div className="rounded-[24px] border border-dashed border-[#eadccd] bg-[#fdf8f3] p-5">
                    <span className="text-[13px] font-semibold text-[#6e5b4e] tracking-tight">Not</span>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-[#8c7564]">
                      WhatsApp ve Instagram alanları kullanıcı adı veya tam link kabul eder.
                      Form alanı için dahili rota ya da tam URL girebilirsiniz.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {FLOATING_CONTACT_CHANNELS.map((channelConfig) => {
                    const channel =
                      floatingContact.channels.find(
                        (item) => item.type === channelConfig.type
                      ) ?? null;

                    return (
                      <div
                        key={channelConfig.type}
                        className="rounded-[24px] border border-[#eadccd] bg-white p-5 shadow-[0_4px_12px_-4px_rgba(99,67,37,0.04)] transition-all duration-300 hover:shadow-[0_12px_30px_-4px_rgba(99,67,37,0.08)] hover:border-[#FE6100]/15"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <h3 className="text-[14px] font-semibold tracking-tight text-[#2f241d]">
                              {getFloatingContactDefaultLabel(channelConfig.type)}
                            </h3>
                            <p className="mt-1 text-[13px] text-[#7d6959]">
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
                            <div className="h-6 w-11 rounded-full bg-[#eadccd] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#FE6100]/15 peer-checked:bg-[#FE6100] peer-checked:after:translate-x-full after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-white after:bg-white after:transition-all after:content-[''] shadow-inner" />
                            <span className="ml-3 text-[13.5px] font-medium text-[#2f241d]">
                              {channel?.enabled ? "Aktif" : "Kapalı"}
                            </span>
                          </label>
                        </div>

                        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
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
                            label="Bağlantı"
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
              <div className="space-y-4">
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
                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[#f1e5d9] mt-4">
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
            <div className="2xl:col-span-2">
              <Card title="Üst Bar Duyurusu" icon={Bell} id="announcement">
                <div className="flex items-center gap-3 mb-6 bg-[#fdf8f3] p-5 rounded-[24px] border border-[#eadccd] shadow-[0_4px_12px_-4px_rgba(99,67,37,0.04)]">
                  <label className="relative inline-flex items-center cursor-pointer w-full">
                    <div className="flex-1">
                      <h3 className="text-[14px] font-semibold tracking-tight text-[#2f241d]">
                        Duyuru Çubuğu
                      </h3>
                      <p className="mt-0.5 text-[13px] text-[#7d6959]">
                        Sitenizin en üstünde görünecek duyuruyu aktifleştirin.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      name="enabled"
                      checked={announcementData.enabled}
                      onChange={handleChange}
                      className="sr-only peer"
                    />
                    <div className="h-6 w-11 rounded-full bg-[#eadccd] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#FE6100]/15 peer-checked:bg-[#FE6100] peer-checked:after:translate-x-full after:absolute after:right-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-white after:bg-white after:transition-all after:content-[''] shadow-inner" />
                  </label>
                </div>

                {announcementData.enabled && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-500">
                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
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
                    <div className="space-y-4">
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

                  <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-[240px_1fr]">
                    <div className="space-y-2">
                      <label className="text-[13px] font-medium text-[#6e5b4e] tracking-tight">Bar Rengi</label>
                      <div className="flex items-center gap-3">
                        <label className="relative h-[42px] w-[52px] overflow-hidden rounded-[20px] border border-[#eadccd] shadow-sm cursor-pointer hover:border-[#FE6100]/30 transition-colors">
                          <input
                            type="color"
                            name="backgroundColor"
                            value={announcementColor}
                            onChange={handleAnnouncementChange}
                            className="absolute -inset-4 h-[200%] w-[200%] cursor-pointer opacity-0"
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
                      <p className="text-[12.5px] text-[#9a8474] pt-1">
                        Yazı ve buton kontrastı otomatik ayarlanır.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <span className="text-[13px] font-medium text-[#6e5b4e] tracking-tight">Canlı Önizleme</span>
                      <div
                        className="rounded-[24px] border border-[#eadccd]/50 px-5 py-3 shadow-[0_8px_20px_-4px_rgba(99,67,37,0.06)] transition-colors duration-300"
                        style={{ backgroundColor: announcementColor }}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
                          <span
                            className="text-[13.5px] font-medium tracking-wide text-center sm:text-left"
                            style={{ color: announcementTextColor }}
                          >
                            {announcementData.message || DEFAULT_ANNOUNCEMENT.message}
                          </span>
                          {announcementData.linkText ? (
                            <span
                              className={`inline-flex items-center justify-center rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-transform hover:scale-105 active:scale-95 cursor-pointer ${announcementButtonClass}`}
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
            <div className="2xl:col-span-2">
              <Card title="Yazı Tipleri" icon={Type} id="typography">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="md:col-span-2 xl:col-span-2">
                    <TypographyFontPicker
                      label="Başlık Fontu"
                      value={typography.headingFont}
                      onChange={(font) => handleTypographyChange("headingFont", font)}
                      catalog={fontCatalog}
                    />
                  </div>
                  <div className="md:col-span-2 xl:col-span-2">
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
          <div className="flex justify-end mt-8 pt-6 border-t border-[#eadccd]">
            <button
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E45700] px-8 py-3.5 text-[14px] font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.22)] transition-all duration-300 ease-out hover:from-[#f15c00] hover:to-[#d84f00] hover:translate-y-[-1px] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/18"
            >
              {saving ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
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
