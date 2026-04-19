"use client";

import { useEffect, useState } from "react";
import {
  GripVertical,
  Loader2,
  Pause,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  MarqueeAnimation,
  MarqueeDirection,
  MarqueeIcon,
  MarqueeItem,
  MarqueeSettings,
  MarqueeSpeed,
} from "@/lib/db/settings";

const ICON_OPTIONS: { value: MarqueeIcon; label: string }[] = [
  { value: "leaf", label: "Yaprak" },
  { value: "truck", label: "Kargo" },
  { value: "shield", label: "Kalkan" },
  { value: "heart", label: "Kalp" },
  { value: "award", label: "Odul" },
  { value: "sparkle", label: "Parlama" },
];

const SPEED_OPTIONS: { value: MarqueeSpeed; label: string }[] = [
  { value: "slow", label: "Yavas" },
  { value: "normal", label: "Normal" },
  { value: "fast", label: "Hizli" },
];

const DIRECTION_OPTIONS: { value: MarqueeDirection; label: string }[] = [
  { value: "left", label: "Sola Kay" },
  { value: "right", label: "Saga Kay" },
];

const ANIMATION_OPTIONS: { value: MarqueeAnimation; label: string }[] = [
  { value: "marquee", label: "Kayan Yazi" },
  { value: "fade", label: "Solma" },
  { value: "slide", label: "Kaydirma" },
];

const DEFAULT_MARQUEE_SETTINGS: MarqueeSettings = {
  items: [
    { id: "1", text: "Taze fistik ezmesi", icon: "leaf", badge: "Taze" },
    { id: "2", text: "Ayni gun kargo", icon: "truck", badge: "Hizli" },
    { id: "3", text: "Kalite belgeli", icon: "award", badge: "Garanti" },
    { id: "4", text: "Ev yapimi tarif", icon: "heart", badge: "Ozel" },
  ],
  speed: "normal",
  direction: "left",
  pauseOnHover: true,
  showStars: true,
  animation: "marquee",
  enabled: true,
};

export function DesignMarqueeSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<MarqueeSettings>(DEFAULT_MARQUEE_SETTINGS);

  useEffect(() => {
    void fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings?type=marquee");
      const data = await res.json();

      if (data.success && data.marqueeSettings) {
        setSettings({ ...DEFAULT_MARQUEE_SETTINGS, ...data.marqueeSettings });
      }
    } catch (error) {
      console.error("Failed to fetch marquee settings:", error);
      toast.error("Ayarlar yuklenirken hata olustu");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "marquee",
          marqueeSettings: settings,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Kaydetme basarisiz");
      }

      toast.success("Kayan yazi ayarlari kaydedildi");
    } catch (error) {
      console.error("Failed to save marquee settings:", error);
      toast.error("Ayarlar kaydedilirken hata olustu");
    } finally {
      setSaving(false);
    }
  }

  function addItem() {
    const newItem: MarqueeItem = {
      id: Date.now().toString(),
      text: "Yeni oge",
      icon: "leaf",
      badge: "Yeni",
    };

    setSettings((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
  }

  function updateItem(id: string, updates: Partial<MarqueeItem>) {
    setSettings((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    }));
  }

  function removeItem(id: string) {
    setSettings((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== id),
    }));
  }

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-[#efe3d7] pb-5 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FE6100]">Kayan yazi</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#2f241d]">Hizli bilgi seridi</h2>
          <p className="mt-2 text-sm leading-6 text-[#7b685b]">
            Ustte kayan bilgi metinlerini, hizini ve gorunurluk ayarlarini bu bolumden yonetin.
          </p>
        </div>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#2f241d] to-[#4a3629] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#241a15] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Kayan Yaziyi Kaydet
        </button>
      </div>

      <div className="rounded-[24px] border border-[#ecdccd] bg-[#fff9f4] px-4 py-4 text-sm leading-6 text-[#7b685b]">
        Bu alan magazanin en hizli duyuru serididir. Kisa, net ve tekrar kullanilabilir mesajlar yazin.
      </div>

      <div className="space-y-6">
        <div className="overflow-hidden rounded-[28px] border border-[#eadccd] bg-white shadow-sm">
          <div className="border-b border-[#f0e4d8] bg-[#fcf7f1] p-6">
            <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-[#2f241d]">
              <Settings2 className="h-4 w-4 text-[#9d816d]" />
              Genel ayarlar
            </h3>
          </div>
          <div className="space-y-5 p-6">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="enabled"
                checked={settings.enabled}
                onChange={(e) => setSettings((prev) => ({ ...prev, enabled: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
              />
              <label htmlFor="enabled" className="text-sm font-medium text-[#2f241d]">
                Kayan yazi bolumunu goster
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#2f241d]">Hiz</label>
                <select
                  value={settings.speed}
                  onChange={(e) => setSettings((prev) => ({ ...prev, speed: e.target.value as MarqueeSpeed }))}
                  className="w-full rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 text-sm focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                >
                  {SPEED_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[#2f241d]">Yon</label>
                <select
                  value={settings.direction}
                  onChange={(e) => setSettings((prev) => ({ ...prev, direction: e.target.value as MarqueeDirection }))}
                  className="w-full rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 text-sm focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                >
                  {DIRECTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[#2f241d]">Animasyon</label>
                <select
                  value={settings.animation}
                  onChange={(e) => setSettings((prev) => ({ ...prev, animation: e.target.value as MarqueeAnimation }))}
                  className="w-full rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 text-sm focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                >
                  {ANIMATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-5">
              <label className="inline-flex items-center gap-3 text-sm font-medium text-[#2f241d]">
                <input
                  type="checkbox"
                  checked={settings.pauseOnHover}
                  onChange={(e) => setSettings((prev) => ({ ...prev, pauseOnHover: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                />
                <span className="inline-flex items-center gap-1">
                  <Pause className="h-3.5 w-3.5" />
                  Uzerine gelince dursun
                </span>
              </label>

              <label className="inline-flex items-center gap-3 text-sm font-medium text-[#2f241d]">
                <input
                  type="checkbox"
                  checked={settings.showStars}
                  onChange={(e) => setSettings((prev) => ({ ...prev, showStars: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                />
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5" />
                  Ayirici yildizlari goster
                </span>
              </label>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-[#eadccd] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#f0e4d8] bg-[#fcf7f1] p-6">
            <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-[#2f241d]">
              <Sparkles className="h-4 w-4 text-[#9d816d]" />
              Yazi ogeleri
            </h3>
            <button
              onClick={addItem}
              className="inline-flex items-center gap-1 rounded-xl bg-[#FE6100] px-3 py-2 text-xs font-medium text-white hover:bg-[#e45700]"
            >
              <Plus className="h-3.5 w-3.5" />
              Oge Ekle
            </button>
          </div>

          <div className="space-y-4 p-6">
            {settings.items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-2xl border border-[#efe3d7] bg-[#faf5ef] p-4"
              >
                <div className="mt-2 cursor-grab text-[#b8977f] hover:text-[#7b685b]">
                  <GripVertical className="h-4 w-4" />
                </div>

                <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs text-[#7b685b]">Metin</label>
                    <input
                      type="text"
                      value={item.text}
                      onChange={(e) => updateItem(item.id, { text: e.target.value })}
                      className="w-full rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 text-sm focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-[#7b685b]">Ikon</label>
                    <select
                      value={item.icon}
                      onChange={(e) => updateItem(item.id, { icon: e.target.value as MarqueeIcon })}
                      className="w-full rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 text-sm focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                    >
                      {ICON_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-[#7b685b]">Etiket</label>
                    <input
                      type="text"
                      value={item.badge || ""}
                      onChange={(e) => updateItem(item.id, { badge: e.target.value })}
                      placeholder="Ozel"
                      className="w-full rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 text-sm focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-[#7b685b]">Link (opsiyonel)</label>
                    <input
                      type="text"
                      value={item.link || ""}
                      onChange={(e) => updateItem(item.id, { link: e.target.value })}
                      placeholder="/sayfa"
                      className="w-full rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 text-sm focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                    />
                  </div>
                </div>

                <button
                  onClick={() => removeItem(item.id)}
                  className="mt-6 rounded-xl p-2 text-[#b8977f] transition-colors hover:bg-red-50 hover:text-red-600"
                  disabled={settings.items.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-blue-100 bg-blue-50 p-5">
          <h4 className="inline-flex items-center gap-2 text-sm font-semibold text-blue-900">
            <Sparkles className="h-4 w-4" />
            Hizli ipucu
          </h4>
          <p className="mt-2 text-sm leading-6 text-blue-700">
            Kayan yazi kisa kalirsa daha iyi okunur. Her ogeyi tek mesaj gibi dusunun: kargo, kampanya, kalite veya duyuru.
          </p>
        </div>
      </div>
    </div>
  );
}
