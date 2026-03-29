"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
    Globe,
    Image as ImageIcon,
    Info,
    Mail,
    MapPin,
    Megaphone,
    Phone,
    Save,
    Store,
    Upload,
} from "lucide-react";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { toast } from "sonner";

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
}

interface AnnouncementSettings {
    message: string;
    link: string;
    linkText: string;
    enabled: boolean;
}

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
    const [formData, setFormData] = useState<StoreInfo>(DEFAULT_STORE_INFO);
    const [announcementData, setAnnouncementData] = useState<AnnouncementSettings>(DEFAULT_ANNOUNCEMENT);

    useEffect(() => {
        void fetchSettings();
    }, []);

    async function fetchSettings() {
        setLoading(true);

        try {
            const res = await fetch("/api/settings?type=store");
            const data = await res.json();

            if (data.success && data.storeInfo) {
                setFormData({
                    ...DEFAULT_STORE_INFO,
                    ...data.storeInfo,
                });
            }

            const announcementRes = await fetch("/api/settings?type=announcement");
            const announcementPayload = await announcementRes.json();

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

    function handleChange(
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
    ) {
        const { name, value, type } = e.target;

        if (type === "checkbox") {
            const checked = (e.target as HTMLInputElement).checked;
            setAnnouncementData((prev) => ({ ...prev, [name]: checked }));
            return;
        }

        setFormData((prev) => ({ ...prev, [name]: value }));
    }

    function handleAnnouncementChange(
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
    ) {
        const { name, value } = e.target;
        setAnnouncementData((prev) => ({ ...prev, [name]: value }));
    }

    async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setLogoUploading(true);

        try {
            const uploadForm = new FormData();
            uploadForm.append("file", file);
            uploadForm.append("folder", "branding");
            uploadForm.append("thumbnail", "false");

            const res = await fetch("/api/upload", {
                method: "POST",
                body: uploadForm,
            });

            const data = await res.json();

            if (!res.ok || !data.success || !data.url) {
                throw new Error(data.error || "Logo yuklenemedi");
            }

            setFormData((prev) => ({ ...prev, logoUrl: String(data.url) }));
            toast.success("Site logosu yuklendi");
        } catch (error) {
            console.error("Logo upload error:", error);
            toast.error(error instanceof Error ? error.message : "Logo yuklenirken hata olustu");
        } finally {
            setLogoUploading(false);
            e.target.value = "";
        }
    }

    async function handleSubmit(e?: React.FormEvent) {
        e?.preventDefault();
        setSaving(true);

        try {
            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "store",
                    storeInfo: formData,
                }),
            });

            const data = await res.json();

            if (!data.success) {
                throw new Error(data.error || "Kaydetme basarisiz");
            }

            const announcementRes = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "announcement",
                    announcementSettings: announcementData,
                }),
            });

            const announcementResult = await announcementRes.json();

            if (!announcementResult.success) {
                throw new Error(announcementResult.error || "Duyuru cubugu kaydedilemedi");
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
            <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 flex items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900" />
            </div>
        );
    }

    return (
        <div className="mx-auto min-h-screen max-w-5xl space-y-8 bg-gray-50/50 p-6 md:p-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Genel Ayarlar</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Magazanizin temel bilgilerini ve logo alanini yonetin.
                    </p>
                </div>
                <button
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

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                        <div className="border-b border-gray-100 bg-gray-50/50 p-6">
                            <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                                <Store className="h-4 w-4 text-gray-400" />
                                Magaza Bilgileri
                            </h3>
                        </div>

                        <div className="space-y-4 p-6">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-gray-700">
                                        Magaza Adi
                                    </label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1 block text-sm font-medium text-gray-700">
                                        Iletisim E-posta
                                    </label>
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
                                            <label className="mb-1 block text-sm font-medium text-gray-700">
                                                Site Logosu
                                            </label>
                                            <input
                                                type="text"
                                                name="logoUrl"
                                                value={formData.logoUrl || ""}
                                                onChange={handleChange}
                                                placeholder="https://cdn.ornek.com/branding/logo.webp"
                                                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
                                            />
                                            <p className="mt-1 text-xs text-gray-500">
                                                Header, footer ve sonraki admin/storefront kullanimlari bu logoyu baz alir.
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
                    </div>

                    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                        <div className="border-b border-gray-100 bg-gray-50/50 p-6">
                            <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                                <Globe className="h-4 w-4 text-gray-500" />
                                Bolgesel Ayarlar
                            </h3>
                        </div>
                        <div className="space-y-4 p-6">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-gray-700">
                                        Para Birimi
                                    </label>
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
                                    <label className="mb-1 block text-sm font-medium text-gray-700">
                                        Zaman Dilimi
                                    </label>
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
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                        <div className="border-b border-gray-100 bg-gray-50/50 p-6">
                            <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                                <Megaphone className="h-4 w-4 text-gray-500" />
                                Duyuru Cubugu
                            </h3>
                        </div>
                        <div className="space-y-4 p-6">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="enabled"
                                    name="enabled"
                                    checked={announcementData.enabled}
                                    onChange={handleChange}
                                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                />
                                <label htmlFor="enabled" className="text-sm font-medium text-gray-700">
                                    Duyuru cubugunu goster
                                </label>
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">Mesaj</label>
                                <input
                                    type="text"
                                    name="message"
                                    value={announcementData.message}
                                    onChange={handleAnnouncementChange}
                                    disabled={!announcementData.enabled}
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">Link</label>
                                <input
                                    type="text"
                                    name="link"
                                    value={announcementData.link}
                                    onChange={handleAnnouncementChange}
                                    disabled={!announcementData.enabled}
                                    placeholder="/kampanyalar"
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">Link Metni</label>
                                <input
                                    type="text"
                                    name="linkText"
                                    value={announcementData.linkText}
                                    onChange={handleAnnouncementChange}
                                    disabled={!announcementData.enabled}
                                    placeholder="Hemen Kesfet"
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-6">
                        <h4 className="mb-2 flex items-center gap-2 font-semibold text-blue-900">
                            <Info className="h-4 w-4" />
                            Ipucu
                        </h4>
                        <p className="text-sm leading-relaxed text-blue-700">
                            Magaza bilgileriniz e-postalarinizda ve fatura akislarinda gorunur. Dogru ve
                            guncel bilgilerle ilerleyin.
                        </p>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                        <h4 className="mb-3 font-semibold text-gray-900">Sosyal Medya</h4>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-medium text-gray-500">Instagram</label>
                                <input
                                    type="text"
                                    name="socialInstagram"
                                    value={formData.socialInstagram || ""}
                                    onChange={handleChange}
                                    placeholder={`https://instagram.com/${STORE_RUNTIME.slug}`}
                                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-900 focus:ring-0"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500">Twitter / X</label>
                                <input
                                    type="text"
                                    name="socialTwitter"
                                    value={formData.socialTwitter || ""}
                                    onChange={handleChange}
                                    placeholder={`https://x.com/${STORE_RUNTIME.slug}`}
                                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-900 focus:ring-0"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
