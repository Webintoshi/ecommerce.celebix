"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
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
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { TypographyFontPicker } from "@/components/admin/TypographyFontPicker";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import {
  buildStoreTypographyStylesheetUrl,
  DEFAULT_STORE_TYPOGRAPHY,
  FEATURED_STORE_TYPOGRAPHY_FONT_OPTIONS,
  normalizeStoreTypographySettings,
  resolveStoreTypographyRoleFont,
  STORE_BODY_SIZE_OPTIONS,
  STORE_HEADING_SCALE_OPTIONS,
  STORE_LETTER_SPACING_OPTIONS,
  STORE_MENU_SIZE_OPTIONS,
  STORE_PRODUCT_CARD_TITLE_SIZE_OPTIONS,
  STORE_PRODUCT_PAGE_TITLE_SIZE_OPTIONS,
  STORE_TYPOGRAPHY_ROLE_MODE_OPTIONS,
  STORE_TYPOGRAPHY_WEIGHT_OPTIONS,
  type StoreTypographyFontOption,
  type StoreTypographyRoleMode,
  type StoreTypographySettings,
} from "@celebix/platform-config/src/typography";

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
}

interface AnnouncementSettings {
  message: string;
  link: string;
  linkText: string;
  enabled: boolean;
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
};

const DEFAULT_ANNOUNCEMENT: AnnouncementSettings = {
  message: `${STORE_RUNTIME.name} icin yeni koleksiyonlar yayinda.`,
  link: "/kampanyalar",
  linkText: "Hemen Kesfet",
  enabled: true,
};

// Simple Card Component
function Card({
  children,
  title,
  icon: Icon,
  description,
}: {
  children: React.ReactNode;
  title: string;
  icon: React.ElementType;
  description?: string;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-neutral-900 flex items-center justify-center">
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            {description && (
              <p className="text-sm text-gray-500 mt-0.5">{description}</p>
            )}
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {isOpen && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
}

// Simple Input Component
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
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="relative">
        {Icon && (
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        )}
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base transition-all focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent ${
            Icon ? "pl-12" : ""
          }`}
        />
      </div>
    </div>
  );
}

// Simple TextArea Component
function TextArea({
  label,
  name,
  value,
  onChange,
  placeholder,
  rows = 3,
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
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base transition-all focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent resize-none"
      />
    </div>
  );
}

// Simple Select Component
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
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base transition-all focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent appearance-none"
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
  const [fontCatalogLoading, setFontCatalogLoading] = useState(false);
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
    setFontCatalogLoading(true);
    try {
      const response = await fetch("/api/admin/google-fonts", {
        cache: "force-cache",
      });
      const payload = (await response.json()) as GoogleFontsPayload;

      if (!response.ok || payload.success === false || !Array.isArray(payload.fonts)) {
        throw new Error("Google font katalogu getirilemedi");
      }

      setFontCatalog(payload.fonts);
    } catch (error) {
      console.error("Failed to fetch Google font catalog:", error);
      setFontCatalog(FEATURED_STORE_TYPOGRAPHY_FONT_OPTIONS);
    } finally {
      setFontCatalogLoading(false);
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
    setAnnouncementData((prev) => ({ ...prev, [name]: value }));
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

  function handleTypographyRoleModeChange(
    key: "menuFont" | "productTitleFont",
    mode: StoreTypographyRoleMode
  ) {
    setFormData((prev) => ({
      ...prev,
      typography: {
        ...normalizeStoreTypographySettings(prev.typography),
        [key]: {
          ...normalizeStoreTypographySettings(prev.typography)[key],
          mode,
        },
      },
    }));
  }

  function handleTypographyRoleCustomFont(
    key: "menuFont" | "productTitleFont",
    font: StoreTypographyFontOption
  ) {
    setFormData((prev) => ({
      ...prev,
      typography: {
        ...normalizeStoreTypographySettings(prev.typography),
        [key]: {
          mode: "custom",
          font,
        },
      },
    }));
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
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-neutral-900" />
      </div>
    );
  }

  const typography = normalizeStoreTypographySettings(formData.typography);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mağaza Ayarları</h1>
            <p className="text-sm text-gray-500 mt-0.5">Mağazanızın temel bilgilerini buradan yönetin</p>
          </div>
          <button
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-6 py-3 text-base font-medium text-white shadow-lg shadow-neutral-900/20 transition-all hover:bg-neutral-800 hover:shadow-xl hover:shadow-neutral-900/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            ) : (
              <Save className="h-5 w-5" />
            )}
            Kaydet
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Brand Info Card */}
        <Card
          title="Marka Bilgileri"
          icon={Building2}
          description="Mağaza adı ve iletişim bilgileri"
        >
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Mağaza Adı"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Örn: DeryCraft"
              />
              <Input
                label="E-posta"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="info@magaza.com"
                icon={Mail}
              />
            </div>

            {/* Logo Upload */}
            <div className="rounded-xl border-2 border-dashed border-gray-200 p-6">
              <div className="flex items-start gap-4">
                <div className="w-24 h-24 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden border border-gray-100">
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
                <div className="flex-1">
                  <p className="font-medium text-gray-900 mb-1">Site Logosu</p>
                  <p className="text-sm text-gray-500 mb-3">
                    Web sitenizde görünecek ana logo
                  </p>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-neutral-800 transition-colors">
                      {logoUploading ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Logo Yükle
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
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, logoUrl: "" }))
                        }
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Favicon Upload */}
            <div className="rounded-xl border-2 border-dashed border-gray-200 p-6">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden border border-gray-100">
                  {formData.faviconUrl ? (
                    <img
                      src={formData.faviconUrl}
                      alt="Favicon"
                      className="w-full h-full object-contain p-1"
                    />
                  ) : (
                    <Globe className="w-6 h-6 text-gray-300" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 mb-1">Favicon</p>
                  <p className="text-sm text-gray-500 mb-3">
                    Tarayıcı sekmesinde görünen küçük ikon
                  </p>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-neutral-800 transition-colors">
                      {faviconUploading ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Favicon Yükle
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
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, faviconUrl: "" }))
                        }
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Contact Info Card */}
        <Card title="İletişim Bilgileri" icon={Phone} description="Müşterilerinize görünen iletişim">
          <div className="space-y-4">
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

        {/* Social Media Card */}
        <Card title="Sosyal Medya" icon={Instagram} description="Sosyal medya hesaplarınız">
          <div className="space-y-4">
            <Input
              label="Instagram"
              name="socialInstagram"
              value={formData.socialInstagram || ""}
              onChange={handleChange}
              placeholder="https://instagram.com/kullaniciadi"
            />
            <Input
              label="X (Twitter)"
              name="socialTwitter"
              value={formData.socialTwitter || ""}
              onChange={handleChange}
              placeholder="https://x.com/kullaniciadi"
            />
          </div>
        </Card>

        {/* Regional Settings Card */}
        <Card title="Bölgesel Ayarlar" icon={Globe} description="Para birimi ve zaman dilimi">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Para Birimi"
              name="currency"
              value={formData.currency}
              onChange={handleChange}
              options={[
                { value: "TRY", label: "Türk Lirası (₺)" },
                { value: "USD", label: "Amerikan Doları ($)" },
                { value: "EUR", label: "Euro (€)" },
              ]}
            />
            <Select
              label="Zaman Dilimi"
              name="timezone"
              value={formData.timezone}
              onChange={handleChange}
              options={[
                { value: "Europe/Istanbul", label: "İstanbul (GMT+3)" },
                { value: "UTC", label: "UTC (GMT+0)" },
              ]}
            />
          </div>
        </Card>

        {/* Announcement Card */}
        <Card
          title="Üst Bar Duyurusu"
          icon={Megaphone}
          description="Sitenin üstünde görünen duyuru mesajı"
        >
          <div className="space-y-4">
            <label className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                name="enabled"
                checked={announcementData.enabled}
                onChange={handleChange}
                className="w-5 h-5 rounded border-gray-300 text-neutral-900 focus:ring-neutral-900"
              />
              <span className="font-medium text-gray-900">Duyuru aktif</span>
            </label>

            {announcementData.enabled && (
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <TextArea
                  label="Duyuru Metni"
                  name="message"
                  value={announcementData.message}
                  onChange={handleAnnouncementChange}
                  placeholder="Örn: Yeni sezon ürünleri stokta!"
                  rows={2}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Buton Metni"
                    name="linkText"
                    value={announcementData.linkText}
                    onChange={handleAnnouncementChange}
                    placeholder="İncele"
                  />
                  <Input
                    label="Buton Linki"
                    name="link"
                    value={announcementData.link}
                    onChange={handleAnnouncementChange}
                    placeholder="/urunler"
                  />
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Typography Card - Simplified */}
        <Card
          title="Yazı Tipleri"
          icon={Type}
          description="Sitenizde kullanılan fontlar"
        >
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TypographyFontPicker
                label="Başlık Fontu"
                value={typography.headingFont}
                onChange={(font) => handleTypographyChange("headingFont", font)}
                catalog={fontCatalog}
              />
              <TypographyFontPicker
                label="Metin Fontu"
                value={typography.bodyFont}
                onChange={(font) => handleTypographyChange("bodyFont", font)}
                catalog={fontCatalog}
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                onChange={(e) =>
                  handleTypographyChange("headingScale", e.target.value)
                }
                options={STORE_HEADING_SCALE_OPTIONS.map((opt) => ({
                  value: String(opt.id),
                  label: opt.label,
                }))}
              />
              <Select
                label="Harf Aralığı"
                name="letterSpacing"
                value={typography.letterSpacing}
                onChange={(e) =>
                  handleTypographyChange("letterSpacing", e.target.value)
                }
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
          </div>
        </Card>

        {/* Save Button at Bottom */}
        <div className="flex justify-end pt-4">
          <button
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-8 py-4 text-lg font-medium text-white shadow-lg shadow-neutral-900/20 transition-all hover:bg-neutral-800 hover:shadow-xl hover:shadow-neutral-900/30 active:scale-95 disabled:opacity-50"
          >
            {saving ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            ) : (
              <Check className="h-5 w-5" />
            )}
            Değişiklikleri Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
