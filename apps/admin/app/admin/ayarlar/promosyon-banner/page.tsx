"use client";

import { useState, useEffect } from "react";
import { Image as ImageIcon, Loader2, Save, Trash2, Plus, Smartphone, Monitor, Sparkles, Palette, Zap } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

interface PromoBanner {
  id: number;
  image: string;
  mobileImage?: string;
  title: string;
  subtitle: string;
  buttonText: string;
  buttonLink: string;
  order: number;
  badge?: string;
  color?: string;
  imageStats?: ImageStats;
  mobileImageStats?: ImageStats;
}

interface ImageStats {
  format: string;
  width: number;
  height: number;
  originalSize: number;
  processedSize: number;
  savings: number;
}

const BADGE_OPTIONS = [
  { value: "", label: "Rozet Yok" },
  { value: "🔥 Çok Satan", label: "🔥 Çok Satan" },
  { value: "✨ Yeni", label: "✨ Yeni" },
  { value: "🌿 Organik", label: "🌿 Organik" },
  { value: "⭐ Favori", label: "⭐ Favori" },
  { value: "💰 İndirim", label: "💰 İndirim" },
  { value: "🎁 Kampanya", label: "🎁 Kampanya" },
  { value: "🏆 Premium", label: "🏆 Premium" },
];

const COLOR_OPTIONS = [
  { value: "from-amber-500 to-orange-600", label: "Turuncu/Amber", color: "bg-gradient-to-r from-amber-500 to-orange-600" },
  { value: "from-emerald-500 to-teal-600", label: "Yeşil/Teal", color: "bg-gradient-to-r from-emerald-500 to-teal-600" },
  { value: "from-rose-500 to-pink-600", label: "Pembe/Rose", color: "bg-gradient-to-r from-rose-500 to-pink-600" },
  { value: "from-blue-500 to-indigo-600", label: "Mavi/İndigo", color: "bg-gradient-to-r from-blue-500 to-indigo-600" },
  { value: "from-violet-500 to-purple-600", label: "Mor/Violet", color: "bg-gradient-to-r from-violet-500 to-purple-600" },
  { value: "from-primary to-primary/80", label: "Celebix Kirmizi", color: "bg-gradient-to-r from-[#7B1113] to-[#7B1113]/80" },
  { value: "from-cyan-500 to-blue-600", label: "Turkuaz/Mavi", color: "bg-gradient-to-r from-cyan-500 to-blue-600" },
  { value: "from-lime-500 to-green-600", label: "Limon Yeşili", color: "bg-gradient-to-r from-lime-500 to-green-600" },
];

export default function PromoBannerSettingsPage() {
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<{ [key: string]: boolean }>({});
  const [optimizing, setOptimizing] = useState<{ [key: string]: boolean }>({});
  const [activeImageTab, setActiveImageTab] = useState<{ [key: number]: 'desktop' | 'mobile' }>({});

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings?key=promo_banners", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Promosyon banner ayarlari yuklenemedi.");
      }

      if (data.setting?.value?.banners) {
        setBanners(data.setting.value.banners);
      } else {
        setBanners([]);
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      toast.error("Ayarlar yüklenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "promo_banners",
          value: { banners }
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Promosyon banner ayarlari kaydedilemedi.");
      }
      toast.success("Ayarlar başarıyla kaydedildi.");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Kaydedilirken bir hata oluştu.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddBanner = () => {
    const newBanner: PromoBanner = {
      id: Date.now(),
      image: "",
      mobileImage: "",
      title: "Yeni Başlık",
      subtitle: "Yeni Alt Başlık",
      buttonText: "İncele",
      buttonLink: "/koleksiyon",
      order: banners.length + 1,
      badge: "✨ Yeni",
      color: "from-primary to-primary/80"
    };
    setBanners([...banners, newBanner]);
    setActiveImageTab({ ...activeImageTab, [newBanner.id]: 'desktop' });
  };

  const handleRemoveBanner = (id: number) => {
    setBanners(banners.filter(b => b.id !== id));
  };

  const handleUpdateBanner = (id: number, field: keyof PromoBanner, value: string | number) => {
    setBanners(banners.map(b => b.id === id ? { ...b, [field]: value } : b));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, bannerId: number, type: 'desktop' | 'mobile') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(prev => ({ ...prev, [`${bannerId}-${type}`]: true }));

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", "promo-banners");

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        handleUpdateBanner(bannerId, type === 'desktop' ? 'image' : 'mobileImage', data.url);
        
        const stats: ImageStats = {
          format: data.format,
          width: data.width,
          height: data.height,
          originalSize: data.originalSize,
          processedSize: data.processedSize,
          savings: data.savings
        };
        
        if (type === 'desktop') {
          setBanners(banners.map(b => b.id === bannerId ? { ...b, imageStats: stats } : b));
        } else {
          setBanners(banners.map(b => b.id === bannerId ? { ...b, mobileImageStats: stats } : b));
        }
        
        toast.success(`${type === 'desktop' ? 'Masaüstü' : 'Mobil'} görsel yüklendi. ${data.savings}% sıkıştırıldı!`);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Görsel yüklenirken hata oluştu.");
    } finally {
      setUploading(prev => ({ ...prev, [`${bannerId}-${type}`]: false }));
    }
  };

  const handleOptimizeImage = async (bannerId: number, type: 'desktop' | 'mobile') => {
    const banner = banners.find(b => b.id === bannerId);
    const imageUrl = type === 'desktop' ? banner?.image : banner?.mobileImage;
    
    if (!imageUrl) {
      toast.error("Optimize edilecek görsel bulunamadı.");
      return;
    }

    setOptimizing(prev => ({ ...prev, [`${bannerId}-${type}`]: true }));

    try {
      const res = await fetch("/api/upload/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, folder: "promo-banners" })
      });
      const data = await res.json();

      if (data.success) {
        handleUpdateBanner(bannerId, type === 'desktop' ? 'image' : 'mobileImage', data.url);
        
        const stats: ImageStats = {
          format: data.format,
          width: data.width,
          height: data.height,
          originalSize: data.originalSize,
          processedSize: data.processedSize,
          savings: data.savings
        };
        
        if (type === 'desktop') {
          setBanners(banners.map(b => b.id === bannerId ? { ...b, imageStats: stats } : b));
        } else {
          setBanners(banners.map(b => b.id === bannerId ? { ...b, mobileImageStats: stats } : b));
        }
        
        toast.success(`Görsel optimize edildi! ${data.savings}% daha küçük.`);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error("Optimize error:", error);
      toast.error("Görsel optimize edilirken hata oluştu.");
    } finally {
      setOptimizing(prev => ({ ...prev, [`${bannerId}-${type}`]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Promosyon Banner Yönetimi</h1>
          <p className="text-gray-500 text-sm mt-1">
            Ana sayfadaki promosyon bannerlarını yönetin. Önerilen boyutlar: 
            <span className="font-medium text-gray-700"> Masaüstü: 1080x1350px</span> (4:5), 
            <span className="font-medium text-gray-700"> Mobil: 1080x600px</span> (16:9)
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 shadow-lg shadow-primary/25"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Kaydet
        </button>
      </div>

      {/* Banner Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {banners.map((banner, index) => (
          <div key={banner.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden group flex flex-col h-full">
            {/* Card Header */}
            <div className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary font-bold text-sm">
                  {index + 1}
                </span>
                <span className="font-semibold text-gray-700">Banner</span>
              </div>
              <button
                onClick={() => handleRemoveBanner(banner.id)}
                className="text-gray-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5 flex-1 flex flex-col">
              {/* Image Upload Tabs */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-xl">
                  <button
                    onClick={() => setActiveImageTab({ ...activeImageTab, [banner.id]: 'desktop' })}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      (activeImageTab[banner.id] || 'desktop') === 'desktop'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Monitor className="w-4 h-4" />
                    Masaüstü
                  </button>
                  <button
                    onClick={() => setActiveImageTab({ ...activeImageTab, [banner.id]: 'mobile' })}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      activeImageTab[banner.id] === 'mobile'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Smartphone className="w-4 h-4" />
                    Mobil
                  </button>
                </div>

                {/* Image Upload Area */}
                <div className="relative aspect-[4/5] bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 hover:border-primary/50 transition-colors overflow-hidden group/upload">
                  {(activeImageTab[banner.id] === 'mobile' ? banner.mobileImage : banner.image) ? (
                    <>
                      <Image 
                        src={activeImageTab[banner.id] === 'mobile' ? banner.mobileImage! : banner.image} 
                        alt="Banner Preview" 
                        fill 
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 33vw"
                        unoptimized
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/upload:opacity-100 transition-opacity flex items-center justify-center">
                        <label className="cursor-pointer bg-white text-gray-900 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors shadow-lg">
                          Değiştir
                          <input 
                            type="file" 
                            className="hidden" 
                            accept="image/*" 
                            onChange={(e) => handleFileUpload(e, banner.id, activeImageTab[banner.id] || 'desktop')} 
                          />
                        </label>
                      </div>
                    </>
                  ) : (
                    <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer">
                      {uploading[`${banner.id}-${activeImageTab[banner.id] || 'desktop'}`] ? (
                        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                      ) : (
                        <>
                          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3 group-hover/upload:bg-primary/10 transition-colors">
                            <ImageIcon className="w-6 h-6 text-gray-400 group-hover/upload:text-primary transition-colors" />
                          </div>
                          <span className="text-sm text-gray-500 font-medium">
                            {activeImageTab[banner.id] === 'mobile' ? 'Mobil görsel yükle' : 'Masaüstü görsel yükle'}
                          </span>
                          <span className="text-xs text-gray-400 mt-1">
                            {activeImageTab[banner.id] === 'mobile' ? 'Önerilen: 1080x600px' : 'Önerilen: 1080x1350px'}
                          </span>
                        </>
                      )}
                      <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*" 
                        onChange={(e) => handleFileUpload(e, banner.id, activeImageTab[banner.id] || 'desktop')} 
                      />
                    </label>
                  )}
                </div>

                {/* Quick URL Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="veya görsel URL'si girin"
                    value={activeImageTab[banner.id] === 'mobile' ? (banner.mobileImage || '') : banner.image}
                    onChange={(e) => handleUpdateBanner(banner.id, activeImageTab[banner.id] === 'mobile' ? 'mobileImage' : 'image', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  {(activeImageTab[banner.id] === 'desktop' ? banner.image : banner.mobileImage) && 
                   !(activeImageTab[banner.id] === 'desktop' ? banner.imageStats : banner.mobileImageStats) && (
                    <button
                      onClick={() => handleOptimizeImage(banner.id, activeImageTab[banner.id] || 'desktop')}
                      disabled={optimizing[`${banner.id}-${activeImageTab[banner.id] || 'desktop'}`]}
                      className="flex items-center gap-1 px-3 py-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-lg text-xs font-medium hover:from-violet-600 hover:to-purple-700 transition-all disabled:opacity-50"
                      title="Görseli optimize et"
                    >
                      {optimizing[`${banner.id}-${activeImageTab[banner.id] || 'desktop'}`] ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Zap className="w-3.5 h-3.5" />
                      )}
                      Optimize
                    </button>
                  )}
                </div>

                {/* Image Stats Display */}
                {(activeImageTab[banner.id] === 'desktop' ? banner.imageStats : banner.mobileImageStats) && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-green-800">
                          {(activeImageTab[banner.id] === 'desktop' ? banner.imageStats : banner.mobileImageStats)?.format.toUpperCase()} • 
                          {(activeImageTab[banner.id] === 'desktop' ? banner.imageStats : banner.mobileImageStats)?.width}×
                          {(activeImageTab[banner.id] === 'desktop' ? banner.imageStats : banner.mobileImageStats)?.height}
                        </div>
                        <div className="text-xs text-green-600">
                          {(((activeImageTab[banner.id] === 'desktop' ? banner.imageStats : banner.mobileImageStats)?.processedSize ?? 0) / 1024).toFixed(1)} KB
                          <span className="mx-1">•</span>
                          <span className="font-semibold">{((activeImageTab[banner.id] === 'desktop' ? banner.imageStats : banner.mobileImageStats)?.savings ?? 0)}% tasarruf</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (activeImageTab[banner.id] === 'desktop') {
                          setBanners(banners.map(b => b.id === banner.id ? { ...b, imageStats: undefined } : b));
                        } else {
                          setBanners(banners.map(b => b.id === banner.id ? { ...b, mobileImageStats: undefined } : b));
                        }
                      }}
                      className="text-green-600 hover:text-green-800 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Badge & Color Selection */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    Rozet
                  </label>
                  <select
                    value={banner.badge || ''}
                    onChange={(e) => handleUpdateBanner(banner.id, 'badge', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                  >
                    {BADGE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-2">
                    <Palette className="w-3.5 h-3.5" />
                    Renk Teması
                  </label>
                  <select
                    value={banner.color || 'from-primary to-primary/80'}
                    onChange={(e) => handleUpdateBanner(banner.id, 'color', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                  >
                    {COLOR_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Content Fields */}
              <div className="space-y-3 flex-1">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Başlık</label>
                  <input
                    type="text"
                    value={banner.title}
                    onChange={(e) => handleUpdateBanner(banner.id, 'title', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="Örn: Doğal Fıstık Ezmesi"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Alt Başlık</label>
                  <input
                    type="text"
                    value={banner.subtitle}
                    onChange={(e) => handleUpdateBanner(banner.id, 'subtitle', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="Örn: Her Gün Taze"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Buton Metni</label>
                    <input
                      type="text"
                      value={banner.buttonText}
                      onChange={(e) => handleUpdateBanner(banner.id, 'buttonText', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      placeholder="İncele"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Link</label>
                    <input
                      type="text"
                      value={banner.buttonLink}
                      onChange={(e) => handleUpdateBanner(banner.id, 'buttonLink', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      placeholder="/kategori-slug"
                    />
                  </div>
                </div>
              </div>

              {/* Order Input */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Sıralama</label>
                <input
                  type="number"
                  min={1}
                  max={banners.length}
                  value={banner.order}
                  onChange={(e) => handleUpdateBanner(banner.id, 'order', parseInt(e.target.value) || 1)}
                  className="w-20 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-center"
                />
              </div>
            </div>
          </div>
        ))}

        {/* Add New Banner Button */}
        {banners.length < 6 && (
          <button
            onClick={handleAddBanner}
            className="border-2 border-dashed border-gray-300 rounded-2xl text-gray-500 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-3 font-medium min-h-[600px] group"
          >
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <Plus className="w-8 h-8" />
            </div>
            <span>Yeni Banner Ekle</span>
            <span className="text-xs text-gray-400 font-normal">Maksimum 6 banner</span>
          </button>
        )}
      </div>

      {/* Preview Info */}
      {banners.length > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h4 className="font-medium text-blue-900 text-sm">Mobil Görsel Önerisi</h4>
            <p className="text-blue-700 text-xs mt-1">
              Mobil cihazlarda daha iyi bir görünüm için her banner için ayrı mobil görsel yükleyin. 
              Mobil görseller yatay formatlı (16:9) olmalıdır. Yüklenmezse masaüstü görseli kullanılır.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
