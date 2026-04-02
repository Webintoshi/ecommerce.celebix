"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  Globe,
  Image as ImageIcon,
  Mail,
  MapPin,
  Megaphone,
  Phone,
  Save,
  Store,
  Type,
  Upload,
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

export default function GeneralSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [fontCatalog, setFontCatalog] = useState<StoreTypographyFontOption[]>(FEATURED_STORE_TYPOGRAPHY_FONT_OPTIONS);
  const [fontCatalogLoading, setFontCatalogLoading] = useState(false);
  const [fontCatalogDegraded, setFontCatalogDegraded] = useState(false);
  const [formData, setFormData] = useState<StoreInfo>(DEFAULT_STORE_INFO);
  const [announcementData, setAnnouncementData] = useState<AnnouncementSettings>(DEFAULT_ANNOUNCEMENT);

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
          typography: normalizeStoreTypographySettings(settingsPayload.storeInfo.typography),
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
      setFontCatalogDegraded(Boolean(payload.degraded));
    } catch (error) {
      console.error("Failed to fetch Google font catalog:", error);
      setFontCatalog(FEATURED_STORE_TYPOGRAPHY_FONT_OPTIONS);
      setFontCatalogDegraded(true);
    } finally {
      setFontCatalogLoading(false);
    }
  }

  function handleChange(
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
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
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = event.target;
    setAnnouncementData((prev) => ({ ...prev, [name]: value }));
  }

  function handleTypographyChange<Key extends keyof StoreTypographySettings>(
    key: Key,
    value: StoreTypographySettings[Key],
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
    mode: StoreTypographyRoleMode,
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
    font: StoreTypographyFontOption,
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

  async function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setLogoUploading(true);

    try {
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      uploadForm.append("folder", "branding");
      uploadForm.append("thumbnail", "false");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: uploadForm,
      });
      const payload = await response.json();

      if (!response.ok || !payload.success || !payload.url) {
        throw new Error(payload.error || "Logo yuklenemedi");
      }

      setFormData((prev) => ({ ...prev, logoUrl: String(payload.url) }));
      toast.success("Site logosu yuklendi");
    } catch (error) {
      console.error("Logo upload error:", error);
      toast.error(error instanceof Error ? error.message : "Logo yuklenirken hata olustu");
    } finally {
      setLogoUploading(false);
      event.target.value = "";
    }
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
        throw new Error(announcementPayload.error || "Duyuru cubugu kaydedilemedi");
      }

      toast.success("Genel ayarlar basariyla kaydedildi");
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error(error instanceof Error ? error.message : "Ayarlar kaydedilirken hata olustu");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50/50 p-6 md:p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900" />
      </div>
    );
  }

  const typography = normalizeStoreTypographySettings(formData.typography);

  return (
    <div className="mx-auto min-h-screen max-w-6xl space-y-8 bg-gray-50/50 p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Genel Ayarlar</h1>
          <p className="mt-1 text-sm text-gray-500">
            Magaza bilgilerini, marka gorunusunu ve tipografi sistemini yonetin.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Kaydet
        </button>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-gray-50/50 p-6">
              <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                <Store className="h-4 w-4 text-gray-400" />
                Magaza Bilgileri
              </h3>
            </div>

            <div className="space-y-4 p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Magaza Adi</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Iletisim E-posta</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start">
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-white shadow-sm">
                    {formData.logoUrl ? (
                      <Image
                        src={formData.logoUrl}
                        alt={`${formData.name} logosu`}
                        width={96}
                        height={96}
                        className="h-full w-full object-contain"
                        unoptimized
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-gray-400">
                        <ImageIcon className="h-6 w-6" />
                        <span className="text-[11px] font-medium">Logo yok</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Site Logosu</label>
                      <input
                        type="text"
                        name="logoUrl"
                        value={formData.logoUrl || ""}
                        onChange={handleChange}
                        placeholder="https://cdn.ornek.com/branding/logo.webp"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Header, footer ve ortak storefront yuzeyleri bu logoyu kullanir.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800">
                        {logoUploading ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        Logo Yukle
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleLogoUpload}
                          disabled={logoUploading}
                        />
                      </label>

                      {formData.logoUrl ? (
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, logoUrl: "" }))}
                          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900"
                        >
                          Logoyu Temizle
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Telefon</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Adres</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <textarea
                    rows={3}
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    className="w-full resize-none rounded-lg border border-gray-200 py-2 pl-10 pr-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-gray-50/50 p-6">
              <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                <Globe className="h-4 w-4 text-gray-500" />
                Bolgesel Ayarlar
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Para Birimi</label>
                <select
                  name="currency"
                  value={formData.currency}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="TRY">Turk Lirasi (TL)</option>
                  <option value="USD">Amerikan Dolari ($)</option>
                  <option value="EUR">Euro (EUR)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Zaman Dilimi</label>
                <select
                  name="timezone"
                  value={formData.timezone}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="Europe/Istanbul">Europe/Istanbul (GMT+3)</option>
                  <option value="UTC">UTC (GMT+0)</option>
                  <option value="Europe/London">Europe/London (GMT+1)</option>
                </select>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-gray-50/50 p-6">
              <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                <Type className="h-4 w-4 text-gray-500" />
                Tipografi Sistemi
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Baslik, govde, menu ve urun isimlerini ayri yonetin. Storefrontta sadece secilen font aileleri yuklenir.
              </p>
            </div>

            <div className="space-y-6 p-6">

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <TypographyFontPicker
                  label="Baslik Fontu"
                  value={typography.headingFont}
                  onChange={(font) => handleTypographyChange("headingFont", font)}
                  catalog={fontCatalog}
                  helperText="Hero, sayfa basliklari ve section basliklari bu aileyi kullanir."
                />
                <TypographyFontPicker
                  label="Govde Fontu"
                  value={typography.bodyFont}
                  onChange={(font) => handleTypographyChange("bodyFont", font)}
                  catalog={fontCatalog}
                  helperText="Paragraflar, butonlar ve form alanlari varsayilan olarak bu aileyi kullanir."
                />
              </div>

              <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">Google Fonts katalogu</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    Admin tarafinda tum Google fontlarini arayabilirsiniz. Storefrontta ise sadece secilen rollerin font dosyalari yuklenir.
                  </p>
                </div>
                <div className="text-right text-xs text-gray-500">
                  {fontCatalogLoading ? <p>Katalog yukleniyor...</p> : <p>{fontCatalog.length}+ font kullanima hazir</p>}
                  {fontCatalogDegraded ? (
                    <p className="mt-1 text-amber-600">Google katalogu gecici olarak daraltildi; on plana cikan fontlar aktif.</p>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <SelectField
                  label="Baslik Kalinligi"
                  value={typography.headingWeight}
                  options={STORE_TYPOGRAPHY_WEIGHT_OPTIONS}
                  onChange={(value) => handleTypographyChange("headingWeight", value)}
                  helperText="Sayfa ve section basliklarinin vurgu seviyesini belirler."
                />
                <SelectField
                  label="Govde Kalinligi"
                  value={typography.bodyWeight}
                  options={STORE_TYPOGRAPHY_WEIGHT_OPTIONS}
                  onChange={(value) => handleTypographyChange("bodyWeight", value)}
                  helperText="Paragraf, buton ve formlarda temel agirlik olarak kullanilir."
                />
                <SelectField
                  label="Govde Boyutu"
                  value={typography.bodySizePx}
                  options={STORE_BODY_SIZE_OPTIONS}
                  onChange={(value) => handleTypographyChange("bodySizePx", value)}
                  helperText="Tum genel govde metni ve form alanlari icin temel boyut."
                />
                <SelectField
                  label="Baslik Ritmi"
                  value={typography.headingScale}
                  options={STORE_HEADING_SCALE_OPTIONS}
                  onChange={(value) => handleTypographyChange("headingScale", value)}
                  helperText="Hero ve section basliklarinin genel olcegini ayarlar."
                />
                <SelectField
                  label="Harf Araligi"
                  value={typography.letterSpacing}
                  options={STORE_LETTER_SPACING_OPTIONS}
                  onChange={(value) => handleTypographyChange("letterSpacing", value)}
                  helperText="Basliklarda daha sik veya daha acik bir ritim kurar."
                />
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">Menu Basliklari</h4>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      Header, mobil menu ve navigation baglantilari bu rolu kullanir.
                    </p>
                  </div>
                  <div className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                    {typography.menuFont.mode}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <SelectField
                    label="Menu Font Kaynagi"
                    value={typography.menuFont.mode}
                    options={STORE_TYPOGRAPHY_ROLE_MODE_OPTIONS}
                    onChange={(value) => handleTypographyRoleModeChange("menuFont", value)}
                    helperText="Govde veya basligi miras alabilir, gerekirse ozel Google font secilebilir."
                  />
                  <SelectField
                    label="Menu Kalinligi"
                    value={typography.menuWeight}
                    options={STORE_TYPOGRAPHY_WEIGHT_OPTIONS}
                    onChange={(value) => handleTypographyChange("menuWeight", value)}
                    helperText="Navigation vurgusunu daha sakin ya da daha belirgin yapar."
                  />
                  <SelectField
                    label="Menu Boyutu"
                    value={typography.menuSizePx}
                    options={STORE_MENU_SIZE_OPTIONS}
                    onChange={(value) => handleTypographyChange("menuSizePx", value)}
                    helperText="Masaustu ve mobil menude kullanilan temel menu boyutu."
                  />
                  {typography.menuFont.mode === "custom" ? (
                    <div className="xl:col-span-2">
                      <TypographyFontPicker
                        label="Menu Ozel Fontu"
                        value={resolveStoreTypographyRoleFont(typography, "menu")}
                        onChange={(font) => handleTypographyRoleCustomFont("menuFont", font)}
                        catalog={fontCatalog}
                        helperText="Sadece menu yuzeylerinde kullanilir; diger roller etkilenmez."
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">Ürün Başlıkları</h4>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      Ürün kartlarındaki isimler ile ürün detay sayfası başlığı bu rol tarafından yönetilir.
                    </p>
                  </div>
                  <div className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                    {typography.productTitleFont.mode}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <SelectField
                    label="Ürün Font Kaynağı"
                    value={typography.productTitleFont.mode}
                    options={STORE_TYPOGRAPHY_ROLE_MODE_OPTIONS}
                    onChange={(value) => handleTypographyRoleModeChange("productTitleFont", value)}
                    helperText="Ürün kartları ve PDP başlığı için ayrı tipografi kurabilirsiniz."
                  />
                  <SelectField
                    label="Ürün Kalınlığı"
                    value={typography.productTitleWeight}
                    options={STORE_TYPOGRAPHY_WEIGHT_OPTIONS}
                    onChange={(value) => handleTypographyChange("productTitleWeight", value)}
                    helperText="Ürün isimlerinin vitrin ağırlığını belirler."
                  />
                  <SelectField
                    label="Ürün Kartı Boyutu"
                    value={typography.productCardTitleSizePx}
                    options={STORE_PRODUCT_CARD_TITLE_SIZE_OPTIONS}
                    onChange={(value) => handleTypographyChange("productCardTitleSizePx", value)}
                    helperText="Grid, arama popup ve benzer urun bloklarindaki isim boyutu."
                  />
                  <SelectField
                    label="Ürün Detay Başlığı"
                    value={typography.productPageTitleSizePx}
                    options={STORE_PRODUCT_PAGE_TITLE_SIZE_OPTIONS}
                    onChange={(value) => handleTypographyChange("productPageTitleSizePx", value)}
                    helperText="PDP ana basliginin buyuklugunu kontrol eder."
                  />
                  {typography.productTitleFont.mode === "custom" ? (
                    <div className="xl:col-span-2">
                      <TypographyFontPicker
                        label="Ürün Özel Fontu"
                        value={resolveStoreTypographyRoleFont(typography, "productTitle")}
                        onChange={(font) => handleTypographyRoleCustomFont("productTitleFont", font)}
                        catalog={fontCatalog}
                        helperText="Sadece urun isimlerine uygulanir; govde ve baslik ailesi ayrik kalir."
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-gray-50/50 p-6">
              <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                <Megaphone className="h-4 w-4 text-gray-500" />
                Ust Bar Duyurusu
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Header ustunde cikan mesaj bandini ve yonlendirme baglantisini buradan yonetin.
              </p>
            </div>

            <div className="space-y-4 p-6">
              <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-3">
                <input
                  type="checkbox"
                  name="enabled"
                  checked={announcementData.enabled}
                  onChange={handleChange}
                  className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Duyuru aktif</p>
                  <p className="text-xs text-gray-500">Tum storefrontlarda header ustunde gosterilir.</p>
                </div>
              </label>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Duyuru Metni</label>
                <textarea
                  rows={3}
                  name="message"
                  value={announcementData.message}
                  onChange={handleAnnouncementChange}
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="Yeni sezon deri aksesuarlar stokta."
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Buton Linki</label>
                  <input
                    type="text"
                    name="link"
                    value={announcementData.link}
                    onChange={handleAnnouncementChange}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="/urunler"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Buton Metni</label>
                  <input
                    type="text"
                    name="linkText"
                    value={announcementData.linkText}
                    onChange={handleAnnouncementChange}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="Koleksiyonu Gor"
                  />
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">

          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-gray-50/50 p-6">
              <h3 className="font-semibold text-gray-900">Sosyal Baglantilar</h3>
              <p className="mt-1 text-sm text-gray-500">
                Footer, iletisim ve marka yuzeylerinde kullanilan sosyal baglantilar.
              </p>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Instagram</label>
                <input
                  type="text"
                  name="socialInstagram"
                  value={formData.socialInstagram || ""}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="https://instagram.com/marka"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">X / Twitter</label>
                <input
                  type="text"
                  name="socialTwitter"
                  value={formData.socialTwitter || ""}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="https://x.com/marka"
                />
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

type SelectFieldProps<T extends string | number> = {
  label: string;
  value: T;
  options: Array<{ id: T; label: string; description: string }>;
  onChange: (value: T) => void;
  helperText?: string;
};

function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  helperText,
}: SelectFieldProps<T>) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <label className="block text-sm font-medium text-gray-900">{label}</label>
      {helperText ? <p className="mt-1 text-xs leading-5 text-gray-500">{helperText}</p> : null}
      <select
        value={String(value)}
        onChange={(event) => {
          const selected = options.find((option) => String(option.id) === event.target.value);
          if (selected) {
            onChange(selected.id);
          }
        }}
        className="mt-3 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
      >
        {options.map((option) => (
          <option key={String(option.id)} value={String(option.id)}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="mt-2 text-xs leading-5 text-gray-500">
        {options.find((option) => option.id === value)?.description}
      </p>
    </div>
  );
}
