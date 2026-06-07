"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Gift,
  Palette,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Trophy,
  Users,
} from "lucide-react";
import { OptionalModuleDisabledCard } from "@/components/admin/OptionalModuleDisabledCard";
import type { OptionalAdminModuleState } from "@/lib/optional-admin-modules";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { LuckyWheelConfig, LuckyWheelPrize, LuckyWheelSpin, LuckyWheelStats } from "@/types/lucky-wheel";

type WizardStep = "config" | "prizes" | "preview" | "spins";

type PrizeDraft = Omit<LuckyWheelPrize, "id" | "created_at" | "updated_at"> & { id?: string };

const EMOJI_OPTIONS = ["🎁", "🎉", "💰", "🏆", "⭐", "🔥", "💎", "🎯", "🎊", "🛍️", "💵", "🎀", "🚀", "🌟", "❤️"];

const PRESET_COLORS = [
  { primary: "#FF6B35", secondary: "#FFE66D", name: "Turuncu" },
  { primary: "#7B1113", secondary: "#F1DADB", name: "Celebix Bordo" },
  { primary: "#4F46E5", secondary: "#C7D2FE", name: "İndigo" },
  { primary: "#059669", secondary: "#A7F3D0", name: "Yeşil" },
  { primary: "#DC2626", secondary: "#FECACA", name: "Kırmızı" },
  { primary: "#7C3AED", secondary: "#DDD6FE", name: "Mor" },
];

function defaultConfig(): LuckyWheelConfig {
  const now = new Date();
  const end = new Date();
  end.setMonth(end.getMonth() + 1);
  return {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Şans Çarkı",
    is_active: false,
    start_date: now.toISOString(),
    end_date: end.toISOString(),
    max_total_spins: 1000,
    max_spins_per_user: 1,
    cooldown_hours: 24,
    probability_mode: "percentage",
    require_membership: false,
    require_email_verified: false,
    wheel_segments: 8,
    primary_color: "#FF6B35",
    secondary_color: "#FFE66D",
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
}

function toDateInput(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function createDefaultPrize(order: number): PrizeDraft {
  return {
    config_id: "00000000-0000-0000-0000-000000000001",
    name: `Ödül ${order}`,
    description: null,
    prize_type: "coupon",
    probability_value: 10,
    stock_total: 100,
    stock_remaining: 100,
    is_unlimited_stock: false,
    color_hex: "#FFFFFF",
    icon_emoji: EMOJI_OPTIONS[order % EMOJI_OPTIONS.length],
    image_url: null,
    display_order: order,
    is_active: true,
    coupon_prefix: "WHEEL",
    coupon_type: "percentage",
    coupon_value: 10,
    coupon_min_order: 0,
    coupon_validity_hours: 168,
  };
}

export default function LuckyWheelAdminPage() {
  const [currentStep, setCurrentStep] = useState<WizardStep>("config");
  const [loading, setLoading] = useState(true);
  const [featureDisabled, setFeatureDisabled] = useState<OptionalAdminModuleState | null>(null);
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [config, setConfig] = useState<LuckyWheelConfig>(defaultConfig());
  const [prizes, setPrizes] = useState<PrizeDraft[]>([]);
  const [spins, setSpins] = useState<LuckyWheelSpin[]>([]);
  const [stats, setStats] = useState<LuckyWheelStats | null>(null);
  const [editingPrizeIndex, setEditingPrizeIndex] = useState<number | null>(null);
  const [simulationSummary, setSimulationSummary] = useState<string>("");

  const probabilityTotal = useMemo(
    () => prizes.filter((item) => item.is_active).reduce((sum, item) => sum + Number(item.probability_value || 0), 0),
    [prizes]
  );

  const activePrizes = useMemo(() => prizes.filter((p) => p.is_active), [prizes]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [configResponse, prizesResponse, spinsResponse] = await Promise.all([
        fetch("/api/admin/discounts/lucky-wheel/config", { cache: "no-store" }),
        fetch("/api/admin/discounts/lucky-wheel/prizes", { cache: "no-store" }),
        fetch("/api/admin/discounts/lucky-wheel/spins?limit=200", { cache: "no-store" }),
      ]);

      const [configResult, prizesResult, spinsResult] = await Promise.all([
        configResponse.json(),
        prizesResponse.json(),
        spinsResponse.json(),
      ]);

      const disabledResult = [configResult, prizesResult, spinsResult].find(
        (result) => result?.featureDisabled,
      ) as Partial<OptionalAdminModuleState> | undefined;

      if (disabledResult?.featureDisabled) {
        setFeatureDisabled(disabledResult as OptionalAdminModuleState);
        setConfig(defaultConfig());
        setPrizes([]);
        setSpins([]);
        setStats(null);
        setSimulationSummary("");
        return;
      }

      if (!configResponse.ok || !configResult.success) {
        throw new Error(configResult?.error || "Şans çarkı konfigürasyonu alınamadı.");
      }
      if (!prizesResponse.ok || !prizesResult.success) {
        throw new Error(prizesResult?.error || "Şans çarkı ödülleri alınamadı.");
      }
      if (!spinsResponse.ok || !spinsResult.success) {
        throw new Error(spinsResult?.error || "Şans çarkı spin verileri alınamadı.");
      }

      if (configResult.config) {
        setConfig(configResult.config as LuckyWheelConfig);
      }
      setFeatureDisabled(null);
      setPrizes((prizesResult.prizes || []) as PrizeDraft[]);
      setSpins((spinsResult.spins || []) as LuckyWheelSpin[]);
      setStats((spinsResult.stats || null) as LuckyWheelStats | null);
    } catch (error) {
      setFeatureDisabled(null);
      toast.error(error instanceof Error ? error.message : "Veriler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleSaveConfig = async () => {
    const payload = {
      ...config,
      start_date: toDateInput(config.start_date),
      end_date: toDateInput(config.end_date),
    };

    const response = await fetch("/api/admin/discounts/lucky-wheel/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: payload }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result?.error || "Konfigürasyon kaydedilemedi.");
    }
    setConfig(result.config as LuckyWheelConfig);
  };

  const handleSavePrizes = async () => {
    const normalizedPrizes = prizes.map((item, index) => ({
      ...item,
      config_id: config.id,
      display_order: index + 1,
      stock_total: Number(item.stock_total || 0),
      stock_remaining: item.is_unlimited_stock ? Number(item.stock_total || 0) : Number(item.stock_remaining ?? item.stock_total ?? 0),
      probability_value: Number(item.probability_value || 0),
      coupon_value: item.prize_type === "coupon" ? Number(item.coupon_value || 0) : null,
      coupon_min_order: item.prize_type === "coupon" ? Number(item.coupon_min_order || 0) : null,
      coupon_validity_hours: item.prize_type === "coupon" ? Number(item.coupon_validity_hours || 168) : null,
      coupon_prefix: item.prize_type === "coupon" ? item.coupon_prefix || "WHEEL" : null,
      coupon_type: item.prize_type === "coupon" ? item.coupon_type || "percentage" : null,
    }));

    const response = await fetch("/api/admin/discounts/lucky-wheel/prizes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configId: config.id, prizes: normalizedPrizes }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result?.error || "Ödüller kaydedilemedi.");
    }
    setPrizes((result.prizes || []) as PrizeDraft[]);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await handleSavePrizes();
      await handleSaveConfig();
      await loadData();
      toast.success("Şans çarkı ayarları kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kayıt işlemi başarısız.");
    } finally {
      setSaving(false);
    }
  };

  const handleSimulate = async () => {
    setSimulating(true);
    setSimulationSummary("");
    try {
      const response = await fetch("/api/admin/discounts/lucky-wheel/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configId: config.id, spinCount: 1000 }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Simülasyon çalıştırılamadı.");
      }

      const simulation = result.simulation;
      const winners = (simulation.prizeResults || [])
        .filter((item: { prizeName: string }) => !item.prizeName.toLowerCase().includes("şansını"))
        .reduce((sum: number, item: { won: number }) => sum + Number(item.won || 0), 0);
      const summary = `1000 spin simülasyonu tamamlandı. Kazanan spin: ${winners}, kazanma oranı: ${Number(simulation.winnerRate || 0).toFixed(2)}%`;
      setSimulationSummary(summary);
      toast.success("Simülasyon tamamlandı.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Simülasyon hatası.");
    } finally {
      setSimulating(false);
    }
  };

  const updatePrize = (index: number, field: keyof PrizeDraft, value: unknown) => {
    setPrizes((current) => {
      const next = [...current];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const removePrize = (index: number) => {
    setPrizes((current) => current.filter((_, itemIndex) => itemIndex !== index).map((item, order) => ({ ...item, display_order: order + 1 })));
    if (editingPrizeIndex === index) setEditingPrizeIndex(null);
  };

  const addPrize = () => {
    setPrizes((current) => [...current, createDefaultPrize(current.length + 1)]);
    setEditingPrizeIndex(prizes.length);
  };

  const steps: { id: WizardStep; label: string; icon: typeof Settings }[] = [
    { id: "config", label: "Ayarlar", icon: Settings },
    { id: "prizes", label: "Ödüller", icon: Gift },
    { id: "preview", label: "Ön İzleme", icon: Eye },
    { id: "spins", label: "İstatistikler", icon: Activity },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (featureDisabled) {
    return (
      <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Şans Çarkı Yönetimi</h1>
            <p className="mt-1 text-sm text-gray-500">
              Müşterileriniz için eğlenceli bir kazanma deneyimi oluşturun
            </p>
          </div>
          <OptionalModuleDisabledCard
            title={featureDisabled.title}
            message={featureDisabled.message}
            detail={featureDisabled.detail}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Şans Çarkı Yönetimi</h1>
            <p className="mt-1 text-sm text-gray-500">Müşterileriniz için eğlenceli bir kazanma deneyimi oluşturun</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSimulate}
              disabled={simulating}
              className="inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition-colors"
            >
              <Play className="h-4 w-4" />
              {simulating ? "Simüle ediliyor..." : "Simülasyon"}
            </button>
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-lg shadow-primary/20"
            >
              <Save className="h-4 w-4" />
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </div>

        {/* Simülasyon Sonucu */}
        {simulationSummary && (
          <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-700">
            {simulationSummary}
          </div>
        )}

        {/* Progress Steps */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const isActive = currentStep === step.id;
              const isCompleted =
                (step.id === "config" && currentStep !== "config") ||
                (step.id === "prizes" && (currentStep === "preview" || currentStep === "spins")) ||
                (step.id === "preview" && currentStep === "spins");

              return (
                <button
                  key={step.id}
                  onClick={() => setCurrentStep(step.id)}
                  className="flex items-center gap-3 group"
                >
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                      isActive && "bg-primary text-white shadow-lg shadow-primary/30",
                      isCompleted && "bg-green-100 text-green-600",
                      !isActive && !isCompleted && "bg-gray-100 text-gray-500 group-hover:bg-gray-200"
                    )}
                  >
                    {isCompleted ? <Check className="w-5 h-5" /> : <step.icon className="w-5 h-5" />}
                  </div>
                  <div className="hidden md:block text-left">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        isActive ? "text-gray-900" : isCompleted ? "text-green-700" : "text-gray-500"
                      )}
                    >
                      {step.label}
                    </p>
                    <p className="text-xs text-gray-400">Adım {index + 1}</p>
                  </div>
                  {index < steps.length - 1 && (
                    <ChevronRight className="w-5 h-5 text-gray-300 hidden lg:block" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 1: Config */}
        {currentStep === "config" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* General Settings */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Settings className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900 text-lg">Genel Ayarlar</h2>
                  <p className="text-sm text-gray-500">Temel çark ayarları</p>
                </div>
              </div>

              <div className="space-y-5">
                {/* Aktif Toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", config.is_active ? "bg-green-100" : "bg-gray-200")}>
                      <Check className={cn("w-5 h-5", config.is_active ? "text-green-600" : "text-gray-400")} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Çarkı Aktif Et</p>
                      <p className="text-sm text-gray-500">Müşteriler çarkı görebilir ve çevirebilir</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, is_active: !prev.is_active }))}
                    className={cn(
                      "relative w-14 h-8 rounded-full transition-colors",
                      config.is_active ? "bg-primary" : "bg-gray-300"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform shadow-sm",
                        config.is_active ? "translate-x-6" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>

                {/* Campaign Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Kampanya Adı</label>
                  <input
                    value={config.name}
                    onChange={(e) => setConfig((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="örn: Yılbaşı Şans Çarkı"
                  />
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Başlangıç</label>
                    <input
                      type="date"
                      value={toDateInput(config.start_date)}
                      onChange={(e) => setConfig((prev) => ({ ...prev, start_date: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Bitiş</label>
                    <input
                      type="date"
                      value={toDateInput(config.end_date)}
                      onChange={(e) => setConfig((prev) => ({ ...prev, end_date: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Rules & Appearance */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Palette className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900 text-lg">Kurallar ve Görünüm</h2>
                  <p className="text-sm text-gray-500">Spin limitleri ve çark renkleri</p>
                </div>
              </div>

              <div className="space-y-5">
                {/* Spin Limits */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Toplam Spin</label>
                    <input
                      type="number"
                      value={config.max_total_spins}
                      onChange={(e) => setConfig((prev) => ({ ...prev, max_total_spins: Number(e.target.value) }))}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Kişi Başı</label>
                    <input
                      type="number"
                      value={config.max_spins_per_user}
                      onChange={(e) => setConfig((prev) => ({ ...prev, max_spins_per_user: Number(e.target.value) }))}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Bekleme (saat)</label>
                    <input
                      type="number"
                      value={config.cooldown_hours}
                      onChange={(e) => setConfig((prev) => ({ ...prev, cooldown_hours: Number(e.target.value) }))}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>
                </div>

                {/* Wheel Segments */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Çark Bölüm Sayısı</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={4}
                      max={16}
                      step={2}
                      value={config.wheel_segments}
                      onChange={(e) => setConfig((prev) => ({ ...prev, wheel_segments: Number(e.target.value) }))}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <span className="w-12 text-center font-semibold text-gray-900">{config.wheel_segments}</span>
                  </div>
                </div>

                {/* Color Presets */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Renk Teması</label>
                  <div className="flex flex-wrap gap-3">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color.name}
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            primary_color: color.primary,
                            secondary_color: color.secondary,
                          }))
                        }
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all",
                          config.primary_color === color.primary
                            ? "border-primary bg-primary/5"
                            : "border-gray-200 hover:border-gray-300"
                        )}
                      >
                        <div className="flex -space-x-1">
                          <div className="w-4 h-4 rounded-full border border-white" style={{ backgroundColor: color.primary }} />
                          <div className="w-4 h-4 rounded-full border border-white" style={{ backgroundColor: color.secondary }} />
                        </div>
                        <span className="text-sm font-medium text-gray-700">{color.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Next Step Button */}
            <div className="lg:col-span-2 flex justify-end">
              <button
                onClick={() => setCurrentStep("prizes")}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-colors"
              >
                Ödülleri Ayarla
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Prizes */}
        {currentStep === "prizes" && (
          <div className="space-y-6">
            {/* Probability Warning */}
            {config.probability_mode === "percentage" && Math.abs(probabilityTotal - 100) > 0.1 && (
              <div
                className={cn(
                  "rounded-xl px-4 py-3 text-sm flex items-center gap-2",
                  Math.abs(probabilityTotal - 100) < 1
                    ? "bg-amber-50 border border-amber-200 text-amber-700"
                    : "bg-red-50 border border-red-200 text-red-700"
                )}
              >
                <Trophy className="w-4 h-4" />
                Aktif ödüllerin olasılık toplamı: %{probabilityTotal.toFixed(1)} (100 olmalı)
              </div>
            )}

            {/* Prizes List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {prizes.map((prize, index) => (
                <div
                  key={prize.id || `prize-${index}`}
                  className={cn(
                    "bg-white rounded-2xl border p-5 transition-all",
                    editingPrizeIndex === index
                      ? "border-primary ring-2 ring-primary/20 shadow-lg"
                      : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  {!editingPrizeIndex || editingPrizeIndex !== index ? (
                    // Compact View
                    <div className="flex items-center gap-4">
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-sm"
                        style={{ backgroundColor: prize.color_hex }}
                      >
                        {prize.icon_emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900 truncate">{prize.name}</h3>
                          {!prize.is_active && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">Pasif</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                          <span>%{prize.probability_value}</span>
                          <span>•</span>
                          <span>{prize.prize_type === "coupon" ? "Kupon" : "Ödül Yok"}</span>
                          {!prize.is_unlimited_stock && (
                            <>
                              <span>•</span>
                              <span>Stok: {prize.stock_remaining}/{prize.stock_total}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingPrizeIndex(index)}
                          className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-colors"
                        >
                          Düzenle
                        </button>
                        <button
                          onClick={() => removePrize(index)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Expanded Edit View
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">Ödül Düzenle</h3>
                        <button
                          onClick={() => setEditingPrizeIndex(null)}
                          className="text-sm text-gray-500 hover:text-gray-700"
                        >
                          Kapat
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Adı</label>
                          <input
                            value={prize.name}
                            onChange={(e) => updatePrize(index, "name", e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Olasılık %</label>
                          <input
                            type="number"
                            step="0.1"
                            value={prize.probability_value}
                            onChange={(e) => updatePrize(index, "probability_value", Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Tip</label>
                          <select
                            value={prize.prize_type}
                            onChange={(e) => updatePrize(index, "prize_type", e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                          >
                            <option value="coupon">İndirim Kuponu</option>
                            <option value="none">Ödül Yok (Kaybet)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Stok</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={prize.stock_total}
                              disabled={prize.is_unlimited_stock}
                              onChange={(e) => updatePrize(index, "stock_total", Number(e.target.value))}
                              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm disabled:bg-gray-100"
                            />
                            <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={prize.is_unlimited_stock}
                                onChange={(e) => updatePrize(index, "is_unlimited_stock", e.target.checked)}
                              />
                              Sınırsız
                            </label>
                          </div>
                        </div>
                      </div>

                      {prize.prize_type === "coupon" && (
                        <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-xl">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Prefix</label>
                            <input
                              value={prize.coupon_prefix || ""}
                              onChange={(e) => updatePrize(index, "coupon_prefix", e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono"
                              placeholder="WHEEL"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">İndirim Tipi</label>
                            <select
                              value={prize.coupon_type || "percentage"}
                              onChange={(e) => updatePrize(index, "coupon_type", e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                            >
                              <option value="percentage">Yüzde (%)</option>
                              <option value="fixed">Sabit (₺)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Değer</label>
                            <input
                              type="number"
                              value={prize.coupon_value || 0}
                              onChange={(e) => updatePrize(index, "coupon_value", Number(e.target.value))}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Geçerlilik (saat)</label>
                            <input
                              type="number"
                              value={prize.coupon_validity_hours || 168}
                              onChange={(e) => updatePrize(index, "coupon_validity_hours", Number(e.target.value))}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Renk</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={prize.color_hex}
                              onChange={(e) => updatePrize(index, "color_hex", e.target.value)}
                              className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                            />
                            <span className="text-sm text-gray-500">{prize.color_hex}</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Emoji</label>
                          <div className="flex flex-wrap gap-1">
                            {EMOJI_OPTIONS.map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() => updatePrize(index, "icon_emoji", emoji)}
                                className={cn(
                                  "w-8 h-8 rounded-lg text-lg transition-all",
                                  prize.icon_emoji === emoji
                                    ? "bg-primary/20 ring-2 ring-primary"
                                    : "hover:bg-gray-100"
                                )}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={prize.is_active}
                          onChange={(e) => updatePrize(index, "is_active", e.target.checked)}
                        />
                        <span className="text-sm">Aktif</span>
                      </label>
                    </div>
                  )}
                </div>
              ))}

              {/* Add Prize Button */}
              <button
                onClick={addPrize}
                className="border-2 border-dashed border-gray-300 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Plus className="w-6 h-6" />
                </div>
                <span className="font-medium">Yeni Ödül Ekle</span>
              </button>
            </div>

            {/* Navigation */}
            <div className="flex justify-between">
              <button
                onClick={() => setCurrentStep("config")}
                className="inline-flex items-center gap-2 px-6 py-3 border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
                Geri
              </button>
              <button
                onClick={() => setCurrentStep("preview")}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-colors"
              >
                Ön İzleme
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {currentStep === "preview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                  <Eye className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900 text-lg">Canlı Ön İzleme</h2>
                  <p className="text-sm text-gray-500">Müşterilerin göreceği çark</p>
                </div>
              </div>

              {/* Visual Wheel Preview */}
              <div className="aspect-square max-w-sm mx-auto relative">
                <svg viewBox="0 0 200 200" className="w-full h-full">
                  {/* Wheel Segments */}
                  {activePrizes.map((prize, index) => {
                    const segmentAngle = 360 / activePrizes.length;
                    const startAngle = index * segmentAngle - 90;
                    const endAngle = (index + 1) * segmentAngle - 90;
                    const startRad = (startAngle * Math.PI) / 180;
                    const endRad = (endAngle * Math.PI) / 180;
                    const x1 = 100 + 80 * Math.cos(startRad);
                    const y1 = 100 + 80 * Math.sin(startRad);
                    const x2 = 100 + 80 * Math.cos(endRad);
                    const y2 = 100 + 80 * Math.sin(endRad);

                    return (
                      <g key={index}>
                        <path
                          d={`M 100 100 L ${x1} ${y1} A 80 80 0 0 1 ${x2} ${y2} Z`}
                          fill={index % 2 === 0 ? config.primary_color : config.secondary_color}
                          stroke="white"
                          strokeWidth="2"
                        />
                        <text
                          x={100 + 55 * Math.cos((startRad + endRad) / 2)}
                          y={100 + 55 * Math.sin((startRad + endRad) / 2)}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize="12"
                          fill="#333"
                        >
                          {prize.icon_emoji}
                        </text>
                      </g>
                    );
                  })}
                  {/* Center */}
                  <circle cx="100" cy="100" r="25" fill="white" stroke="#ddd" strokeWidth="2" />
                  <text x="100" y="100" textAnchor="middle" dominantBaseline="middle" fontSize="20">
                    🎯
                  </text>
                  {/* Pointer */}
                  <polygon points="100,10 95,25 105,25" fill="#333" />
                </svg>
              </div>

              {/* Prize Legend */}
              <div className="mt-6 grid grid-cols-2 gap-2">
                {activePrizes.map((prize, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: index % 2 === 0 ? config.primary_color : config.secondary_color }}
                    />
                    <span className="truncate">
                      {prize.icon_emoji} {prize.name} (%{prize.probability_value})
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Ödül Dağılımı</h3>
                <div className="space-y-3">
                  {activePrizes.map((prize, index) => (
                    <div key={index}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="flex items-center gap-2">
                          <span className="text-lg">{prize.icon_emoji}</span>
                          {prize.name}
                        </span>
                        <span className="font-medium">%{prize.probability_value}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${prize.probability_value}%`,
                            backgroundColor: index % 2 === 0 ? config.primary_color : config.secondary_color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6">
                <h3 className="font-semibold text-gray-900 mb-2">Hazır mısınız?</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Tüm ayarları kontrol ettikten sonra kaydedin ve çarkı yayına alın.
                </p>
                <button
                  onClick={handleSaveAll}
                  disabled={saving}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {saving ? "Kaydediliyor..." : "Tüm Ayarları Kaydet"}
                </button>
              </div>
            </div>

            {/* Navigation */}
            <div className="lg:col-span-2 flex justify-between">
              <button
                onClick={() => setCurrentStep("prizes")}
                className="inline-flex items-center gap-2 px-6 py-3 border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
                Ödüllere Dön
              </button>
              <button
                onClick={() => setCurrentStep("spins")}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors"
              >
                İstatistikleri Gör
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Spins */}
        {currentStep === "spins" && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Toplam Spin" value={stats?.totalSpins || 0} icon={RefreshCw} color="blue" />
              <StatCard title="Tekil Kullanıcı" value={stats?.uniqueUsers || 0} icon={Users} color="green" />
              <StatCard title="Kazanan" value={stats?.winners || 0} icon={Trophy} color="amber" />
              <StatCard
                title="Kazanma Oranı"
                value={`${(stats?.winRate || 0).toFixed(1)}%`}
                icon={Activity}
                color="purple"
              />
            </div>

            {/* Spins Table */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Son Spinler</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium text-gray-600">Tarih</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-600">Kullanıcı</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-600">Ödül</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-600">Kupon</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {spins.map((spin) => (
                      <tr key={spin.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-gray-600">{new Date(spin.created_at).toLocaleString("tr-TR")}</td>
                        <td className="px-6 py-3 text-gray-900">{spin.user_name || spin.user_email || spin.user_phone || "Anonim"}</td>
                        <td className="px-6 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium",
                              spin.is_winner ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                            )}
                          >
                            {spin.prize_name || "Ödül yok"}
                          </span>
                        </td>
                        <td className="px-6 py-3 font-mono text-xs text-gray-700">{spin.coupon_code || "-"}</td>
                      </tr>
                    ))}
                    {spins.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                            <Activity className="w-8 h-8 text-gray-400" />
                          </div>
                          <p>Henüz spin kaydı bulunmuyor.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-start">
              <button
                onClick={() => setCurrentStep("preview")}
                className="inline-flex items-center gap-2 px-6 py-3 border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
                Ön İzlemeye Dön
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  icon: typeof Activity;
  color: "blue" | "green" | "amber" | "purple";
}) {
  const colors = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    amber: "bg-amber-100 text-amber-600",
    purple: "bg-purple-100 text-purple-600",
  };

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
