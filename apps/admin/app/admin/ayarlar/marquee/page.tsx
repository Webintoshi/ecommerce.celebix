"use client";

import { useState, useEffect } from "react";
import { Save, Plus, Trash2, GripVertical, Settings2, Play, Pause, ArrowLeftRight, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import { MarqueeSettings, MarqueeItem, MarqueeIcon, MarqueeSpeed, MarqueeDirection, MarqueeAnimation } from "@/lib/db/settings";

const ICON_OPTIONS: { value: MarqueeIcon; label: string }[] = [
  { value: "leaf", label: "Yaprak" },
  { value: "truck", label: "Kargo" },
  { value: "shield", label: "Kalkan" },
  { value: "heart", label: "Kalp" },
  { value: "award", label: "Ödül" },
  { value: "sparkle", label: "Parlama" },
];

const SPEED_OPTIONS: { value: MarqueeSpeed; label: string }[] = [
  { value: "slow", label: "Yavaş (40s)" },
  { value: "normal", label: "Normal (25s)" },
  { value: "fast", label: "Hızlı (15s)" },
];

const DIRECTION_OPTIONS: { value: MarqueeDirection; label: string }[] = [
  { value: "left", label: "Sola Kay" },
  { value: "right", label: "Sağa Kay" },
];

const ANIMATION_OPTIONS: { value: MarqueeAnimation; label: string }[] = [
  { value: "marquee", label: "Kayan Yazı" },
  { value: "fade", label: "Solma Efekti" },
  { value: "slide", label: "Kaydırma" },
];

const DEFAULT_MARQUEE_SETTINGS: MarqueeSettings = {
  items: [
    { id: "1", text: "Taze Fıstık Ezmesi", icon: "leaf", badge: "Taze" },
    { id: "2", text: "Aynı Gün Kargo", icon: "truck", badge: "Hızlı" },
    { id: "3", text: "Kalite Belgeli", icon: "award", badge: "Garanti" },
    { id: "4", text: "Ev Yapımı Tarif", icon: "heart", badge: "Özel" },
  ],
  speed: "normal",
  direction: "left",
  pauseOnHover: true,
  showStars: true,
  animation: "marquee",
  enabled: true,
};

export default function MarqueeSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<MarqueeSettings>(DEFAULT_MARQUEE_SETTINGS);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings?type=marquee");
      const data = await res.json();

      if (data.success && data.marqueeSettings) {
        setSettings({ ...DEFAULT_MARQUEE_SETTINGS, ...data.marqueeSettings });
      }
    } catch (error) {
      console.error("Failed to fetch marquee settings:", error);
      toast.error("Ayarlar yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

      if (data.success) {
        toast.success("Marquee ayarları başarıyla kaydedildi");
      } else {
        throw new Error(data.error || "Kaydetme başarısız");
      }
    } catch (error) {
      console.error("Failed to save marquee settings:", error);
      toast.error("Ayarlar kaydedilirken hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  const addItem = () => {
    const newItem: MarqueeItem = {
      id: Date.now().toString(),
      text: "Yeni Öğe",
      icon: "leaf",
      badge: "Yeni",
    };
    setSettings((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
  };

  const updateItem = (id: string, updates: Partial<MarqueeItem>) => {
    setSettings((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    }));
  };

  const removeItem = (id: string) => {
    setSettings((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== id),
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Marquee Ayarları</h1>
          <p className="text-sm text-gray-500 mt-1">Kayan yazı bölümünü özelleştirin.</p>
        </div>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Kaydet
        </button>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-gray-500" />
              Genel Ayarlar
            </h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="enabled"
                checked={settings.enabled}
                onChange={(e) => setSettings((prev) => ({ ...prev, enabled: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
              />
              <label htmlFor="enabled" className="text-sm font-medium text-gray-700">
                Marquee bölümünü göster
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hız</label>
                <select
                  value={settings.speed}
                  onChange={(e) => setSettings((prev) => ({ ...prev, speed: e.target.value as MarqueeSpeed }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all bg-white text-sm"
                >
                  {SPEED_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Yön</label>
                <select
                  value={settings.direction}
                  onChange={(e) => setSettings((prev) => ({ ...prev, direction: e.target.value as MarqueeDirection }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all bg-white text-sm"
                >
                  {DIRECTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Animasyon</label>
                <select
                  value={settings.animation}
                  onChange={(e) => setSettings((prev) => ({ ...prev, animation: e.target.value as MarqueeAnimation }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all bg-white text-sm"
                >
                  {ANIMATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="pauseOnHover"
                  checked={settings.pauseOnHover}
                  onChange={(e) => setSettings((prev) => ({ ...prev, pauseOnHover: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                />
                <label htmlFor="pauseOnHover" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                  <Pause className="w-3 h-3" /> Hover'da durdur
                </label>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="showStars"
                  checked={settings.showStars}
                  onChange={(e) => setSettings((prev) => ({ ...prev, showStars: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                />
                <label htmlFor="showStars" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                  <Star className="w-3 h-3" /> Yıldız ayırıcı göster
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-gray-500" />
              İçerik Öğeleri
            </h3>
            <button
              onClick={addItem}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Öğe Ekle
            </button>
          </div>
          <div className="p-6 space-y-4">
            {settings.items.map((item, index) => (
              <div
                key={item.id}
                className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100"
              >
                <div className="mt-2 cursor-grab text-gray-400 hover:text-gray-600">
                  <GripVertical className="w-4 h-4" />
                </div>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1">Metin</label>
                    <input
                      type="text"
                      value={item.text}
                      onChange={(e) => updateItem(item.id, { text: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 mb-1">İkon</label>
                    <select
                      value={item.icon}
                      onChange={(e) => updateItem(item.id, { icon: e.target.value as MarqueeIcon })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm bg-white"
                    >
                      {ICON_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 mb-1">Etiket (Badge)</label>
                    <input
                      type="text"
                      value={item.badge || ""}
                      onChange={(e) => updateItem(item.id, { badge: e.target.value })}
                      placeholder="Özel"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 mb-1">Link (Opsiyonel)</label>
                    <input
                      type="text"
                      value={item.link || ""}
                      onChange={(e) => updateItem(item.id, { link: e.target.value })}
                      placeholder="/sayfa"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm"
                    />
                  </div>
                </div>

                <button
                  onClick={() => removeItem(item.id)}
                  className="mt-6 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  disabled={settings.items.length <= 1}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
          <h4 className="font-semibold text-blue-900 flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4" />
            Önizleme
          </h4>
          <p className="text-sm text-blue-700 leading-relaxed">
            Marquee bölümü ana sayfanızda #7B1113 arka plan rengiyle görünecek. 
            Öğelerinizi yukarıda ekleyip düzenleyebilirsiniz.
          </p>
        </div>
      </div>
    </div>
  );
}
