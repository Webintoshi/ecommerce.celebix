"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAbandonedCarts,
  getFilteredAbandonedCarts,
  getAbandonedCartStats,
  markCartAsRecovered,
  deleteAbandonedCart,
  type AbandonedCart,
  type AbandonedCartFilters,
  type AbandonedCartItem,
  type AbandonedCartSort,
} from "@/lib/abandoned-carts";
import { extractAdminStoredAssetUrl, resolveAdminDirectAssetUrl } from "@/lib/asset-url";
import { buildStorefrontUrl } from "@/lib/store-runtime";
import {
  Activity,
  Calendar,
  CheckCircle,
  ChevronDown,
  Clock,
  DollarSign,
  Download,
  Filter,
  ListFilter,
  Mail,
  Package,
  Phone,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  User,
  X,
  XCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import { format, formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { cn } from "@/lib/utils";

type AbandonedCartStats = Awaited<ReturnType<typeof getAbandonedCartStats>>;

const SORT_OPTIONS: { value: AbandonedCartSort; label: string }[] = [
  { value: "date-desc", label: "Tarih: yeni olandan eski olana" },
  { value: "date-asc", label: "Tarih: eski olandan yeni olana" },
  { value: "total-desc", label: "Tutar: yüksekten düşüğe" },
  { value: "total-asc", label: "Tutar: düşükten yükseğe" },
];

const STATUS_OPTIONS: { value: NonNullable<AbandonedCartFilters["status"]>; label: string }[] = [
  { value: "all", label: "Tüm durumlar" },
  { value: "abandoned", label: "Terk edilen" },
  { value: "recovered", label: "Kurtarılan" },
  { value: "active", label: "Aktif" },
  { value: "cleared", label: "Temizlenen" },
];

const ANIMATION_EASE = [0.22, 1, 0.36, 1] as const;

function resolveAbandonedCartImageDirectSource(source?: string | null) {
  const rawSource = typeof source === "string" ? source.trim() : "";

  if (!rawSource) {
    return "";
  }

  const extractedSource = extractAdminStoredAssetUrl(rawSource);
  const normalizedSource =
    extractedSource.startsWith("/") && !extractedSource.startsWith("/api/assets?")
      ? buildStorefrontUrl(extractedSource)
      : extractedSource;

  return resolveAdminDirectAssetUrl(normalizedSource) || normalizedSource;
}

function AbandonedCartItemImage({
  src,
  alt,
  iconClassName,
}: {
  src?: string | null;
  alt: string;
  iconClassName: string;
}) {
  const initialSource = typeof src === "string" ? src.trim() : "";
  const directSource = resolveAbandonedCartImageDirectSource(initialSource);
  const [currentSource, setCurrentSource] = useState(initialSource);
  const [didFallback, setDidFallback] = useState(false);
  const [didFail, setDidFail] = useState(false);

  useEffect(() => {
    setCurrentSource(initialSource);
    setDidFallback(false);
    setDidFail(false);
  }, [initialSource]);

  const handleError = () => {
    if (!didFallback && directSource && directSource !== currentSource) {
      setCurrentSource(directSource);
      setDidFallback(true);
      return;
    }

    setDidFail(true);
  };

  if (!currentSource || didFail) {
    return <Package className={iconClassName} />;
  }

  return (
    <img
      src={currentSource}
      alt={alt}
      className="h-full w-full object-cover"
      loading="lazy"
      onError={handleError}
    />
  );
}

function toDate(value: Date | string | undefined | null) {
  if (!value) return new Date();
  return value instanceof Date ? value : new Date(value);
}

function formatCurrency(value: number) {
  return `₺${value.toLocaleString("tr-TR")}`;
}

function formatCartDate(value: Date | string | undefined) {
  return format(toDate(value), "d MMM yyyy", { locale: tr });
}

function formatCartDateTime(value: Date | string | undefined) {
  return format(toDate(value), "d MMM yyyy, HH:mm", { locale: tr });
}

function formatCartTime(value: Date | string | undefined) {
  return format(toDate(value), "HH:mm", { locale: tr });
}

function formatRelativeTime(value: Date | string | undefined) {
  return formatDistanceToNow(toDate(value), { locale: tr, addSuffix: true });
}

function getCartStatus(cart: AbandonedCart) {
  const status = cart.status ?? (cart.recovered ? "recovered" : "abandoned");

  const variants = {
    abandoned: {
      label: "Terk edildi",
      tone: "border-rose-200 bg-rose-100/90 text-rose-700",
      icon: XCircle,
    },
    recovered: {
      label: "Kurtarıldı",
      tone: "border-emerald-200 bg-emerald-100/90 text-emerald-700",
      icon: CheckCircle,
    },
    active: {
      label: "Aktif",
      tone: "border-sky-200 bg-sky-100/90 text-sky-700",
      icon: Activity,
    },
    cleared: {
      label: "Temizlendi",
      tone: "border-slate-200 bg-slate-100/90 text-slate-700",
      icon: CheckCircle,
    },
  } as const;

  return variants[status] || variants.abandoned;
}

function HeroMetric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
}) {
  return (
    <div className={cn("border border-white/70 bg-white/70 px-5 py-5 backdrop-blur-sm md:px-6", tone)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-gray-950 md:text-[30px]">{value}</p>
      <p className="mt-1 text-sm text-gray-600">{hint}</p>
    </div>
  );
}

function MetricCard({
  title,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  hint: string;
  icon: typeof Package;
  tone: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: ANIMATION_EASE }}
      className="overflow-hidden rounded-[28px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_18px_55px_rgba(0,0,0,0.08)]"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="mt-2 text-[30px] font-semibold tracking-[-0.05em] text-gray-950">{value}</p>
            <p className="mt-1 text-sm text-gray-500">{hint}</p>
          </div>
          <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl border bg-gradient-to-br shadow-sm", tone)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3 p-5 md:p-6">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-[26px] border border-[#FE6100]/8 bg-white/80 p-5">
          <div className="grid gap-4 2xl:grid-cols-[1.2fr_0.8fr_0.8fr_0.45fr] 2xl:items-center">
            <div className="space-y-3">
              <div className="h-4 w-40 rounded-full bg-gray-200" />
              <div className="h-3 w-56 rounded-full bg-gray-100" />
              <div className="h-3 w-44 rounded-full bg-gray-100" />
            </div>
            <div className="space-y-3">
              <div className="h-7 w-28 rounded-full bg-gray-200" />
              <div className="h-3 w-32 rounded-full bg-gray-100" />
            </div>
            <div className="space-y-3">
              <div className="h-4 w-24 rounded-full bg-gray-200" />
              <div className="h-3 w-36 rounded-full bg-gray-100" />
            </div>
            <div className="flex gap-2 xl:justify-end">
              <div className="h-11 w-11 rounded-2xl bg-gray-100" />
              <div className="h-11 w-11 rounded-2xl bg-gray-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AbandonedCartsPage() {
  const [allCarts, setAllCarts] = useState<AbandonedCart[]>([]);
  const [carts, setCarts] = useState<AbandonedCart[]>([]);
  const [filters, setFilters] = useState<AbandonedCartFilters>({});
  const [sort, setSort] = useState<AbandonedCartSort>("date-desc");
  const [loading, setLoading] = useState(true);
  const [selectedCart, setSelectedCart] = useState<AbandonedCart | null>(null);
  const [stats, setStats] = useState<AbandonedCartStats | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const allCartsData = await getAbandonedCarts();
      const filteredCarts = await getFilteredAbandonedCarts(filters, sort);
      const cartStats = await getAbandonedCartStats();
      setAllCarts(allCartsData as AbandonedCart[]);
      setCarts(filteredCarts as AbandonedCart[]);
      setStats(cartStats);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }, [filters, sort]);

  useEffect(() => {
    void loadData();

    const interval = window.setInterval(() => {
      void loadData();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    if (!selectedCart) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedCart(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCart]);

  const handleMarkRecovered = async (id: string) => {
    await markCartAsRecovered(id);
    await loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu sepeti silmek istediğinizden emin misiniz?")) {
      return;
    }
    await deleteAbandonedCart(id);
    await loadData();
  };

  const handleFilterChange = (key: keyof AbandonedCartFilters, value: AbandonedCartFilters[keyof AbandonedCartFilters]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const safeStats =
    stats ??
    ({
      total: 0,
      recovered: 0,
      totalValue: 0,
      avgValue: 0,
      recoveryRate: 0,
      last24h: {
        abandoned: 0,
        lostValue: 0,
        recovered: 0,
      },
      conversion: {
        addedToCart: 0,
        purchased: 0,
        rate: 0,
      },
    } satisfies AbandonedCartStats);

  const anonymousCount = useMemo(() => allCarts.filter((cart) => cart.isAnonymous).length, [allCarts]);
  const registeredCount = Math.max(allCarts.length - anonymousCount, 0);
  const activeAbandonedCount = Math.max(safeStats.total - safeStats.recovered, 0);
  const hasActiveFilters =
    Boolean(filters.search?.trim()) ||
    filters.isAnonymous !== undefined ||
    (filters.status !== undefined && filters.status !== "all");

  const activeFilterSummary = useMemo(() => {
    const chips: string[] = [];

    if (filters.search?.trim()) {
      chips.push(`Arama: ${filters.search}`);
    }

    if (filters.isAnonymous !== undefined) {
      chips.push(filters.isAnonymous ? "Anonim sepetler" : "Kayıtlı müşteriler");
    }

    if (filters.status && filters.status !== "all") {
      const statusLabel = STATUS_OPTIONS.find((option) => option.value === filters.status)?.label;
      if (statusLabel) chips.push(statusLabel);
    }

    return chips;
  }, [filters]);

  const visibleCartCount = carts.length;

  return (
    <main
      role="main"
      aria-busy={loading}
      className="min-h-screen bg-gradient-to-br from-[#faf8f5] via-[#f5f0eb] to-[#f0e8e0]"
    >
      <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <div className="space-y-8">
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: ANIMATION_EASE }}
            className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_24px_80px_rgba(254,97,0,0.12)]"
          >
            <div className="border-b border-[#FE6100]/8 px-6 py-6 md:px-8 md:py-7">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl space-y-4">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#FE6100]/20 bg-gradient-to-r from-[#FE6100]/10 to-[#FF8B3D]/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#FE6100]">
                    <ShoppingCart className="h-3.5 w-3.5" />
                    Sepet Geri Kazanımı
                  </div>

                  <div>
                    <h1 className="text-3xl font-semibold tracking-[-0.04em] text-gray-950 md:text-[40px]">
                      Terk Edilen Sepetler
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600 md:text-[15px]">
                      Potansiyel kayıp geliri görün, kullanıcı davranışını izleyin ve geri kazanım fırsatlarını
                      tek ekranda daha hızlı değerlendirin.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
                    <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/50 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-1.5 text-amber-800">
                      <Clock className="h-3.5 w-3.5" />
                      Veriler 30 saniyede bir otomatik yenilenir
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-[#FE6100]/15 bg-gradient-to-r from-[#fff4ea] to-white px-3 py-1.5 text-[#FE6100]">
                      <Activity className="h-3.5 w-3.5" />
                      {visibleCartCount.toLocaleString("tr-TR")} sepet görüntüleniyor
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/50 bg-gradient-to-r from-emerald-50 to-teal-50 px-3 py-1.5 text-emerald-700">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Kurtarma oranı %{safeStats.recoveryRate.toFixed(1)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                  <button
                    type="button"
                    onClick={() => void loadData()}
                    className="inline-flex items-center gap-2 rounded-2xl border border-[#FE6100]/15 bg-white px-4 py-2.5 text-sm font-medium text-[#FE6100] shadow-sm transition-all hover:border-[#FE6100]/25 hover:bg-[#faf5f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6100]/30"
                  >
                    <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                    Verileri Yenile
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E85A00] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(254,97,0,0.25)] transition-all hover:from-[#E85A00] hover:to-[#D94F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6100]/30"
                  >
                    <Download className="h-4 w-4" />
                    Raporu Dışa Aktar
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-px bg-gradient-to-r from-[#FE6100]/10 via-[#FF8B3D]/5 to-[#FE6100]/10 md:grid-cols-2 2xl:grid-cols-4">
              <HeroMetric
                label="Son 24 Saatte Terk"
                value={safeStats.last24h.abandoned.toLocaleString("tr-TR")}
                hint="Yeni terk edilen sepet adedi"
              />
              <HeroMetric
                label="Son 24 Saatte Kurtarılan"
                value={safeStats.last24h.recovered.toLocaleString("tr-TR")}
                hint="Geri kazanılan sepet adedi"
              />
              <HeroMetric
                label="Son 24 Saat Kayıp Değer"
                value={formatCurrency(safeStats.last24h.lostValue)}
                hint="Anlık potansiyel gelir kaybı"
              />
              <HeroMetric
                label="Sepetten Satın Alma Oranı"
                value={`%${safeStats.conversion.rate.toFixed(1)}`}
                hint="Haftalık dönüşüm görünümü"
              />
            </div>
          </motion.section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-4">
            <MetricCard
              title="Toplam sepet"
              value={safeStats.total.toLocaleString("tr-TR")}
              hint="Takip edilen tüm sepetler"
              icon={ShoppingCart}
              tone="border-[#FE6100]/15 from-[#fff2e8] to-white text-[#FE6100]"
            />
            <MetricCard
              title="Aktif terk"
              value={activeAbandonedCount.toLocaleString("tr-TR")}
              hint="Geri kazanım bekleyen sepetler"
              icon={Activity}
              tone="border-rose-200/60 from-rose-50 to-white text-rose-700"
            />
            <MetricCard
              title="Toplam değer"
              value={formatCurrency(safeStats.totalValue)}
              hint="Tüm sepetlerin toplam hacmi"
              icon={DollarSign}
              tone="border-amber-200/60 from-amber-50 to-white text-amber-700"
            />
            <MetricCard
              title="Ortalama sepet"
              value={formatCurrency(Number(safeStats.avgValue.toFixed(2)))}
              hint="Sepet başına ortalama değer"
              icon={Calendar}
              tone="border-emerald-200/60 from-emerald-50 to-white text-emerald-700"
            />
          </section>

          <section className="rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.08)] md:p-6">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FE6100]">
                    Filtreler ve Sıralama
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-gray-950">
                    Kurtarma görünümünü sadeleştirin
                  </h2>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#FE6100]/12 bg-white px-3 py-2 text-sm font-medium text-gray-600">
                  <ListFilter className="h-4 w-4 text-[#FE6100]" />
                  {carts.length.toLocaleString("tr-TR")} sonuç
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.1fr)_minmax(220px,0.3fr)_minmax(220px,0.3fr)_minmax(240px,0.34fr)]">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="İsim, e-posta veya telefon ile ara"
                    value={filters.search || ""}
                    onChange={(event) => handleFilterChange("search", event.target.value)}
                    aria-label="Sepet sahibi veya iletişim bilgisine göre ara"
                    className="w-full rounded-2xl border border-[#FE6100]/12 bg-white/85 py-3 pl-11 pr-11 text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-[#FE6100] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#FE6100]/20"
                  />
                  {filters.search ? (
                    <button
                      type="button"
                      onClick={() => handleFilterChange("search", undefined)}
                      aria-label="Aramayı temizle"
                      className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6100]/20"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>

                <div className="relative">
                  <Filter className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <select
                    value={filters.status || "all"}
                    onChange={(event) =>
                      handleFilterChange(
                        "status",
                        event.target.value === "all"
                          ? undefined
                          : (event.target.value as AbandonedCartFilters["status"])
                      )
                    }
                    aria-label="Sepet durumu filtresi"
                    className="w-full appearance-none rounded-2xl border border-[#FE6100]/12 bg-white/85 px-11 py-3 pr-10 text-sm text-gray-900 shadow-sm transition-all focus:border-[#FE6100] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#FE6100]/20"
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                </div>

                <div className="relative">
                  <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <select
                    value={filters.isAnonymous === undefined ? "all" : filters.isAnonymous ? "anonymous" : "registered"}
                    onChange={(event) =>
                      handleFilterChange(
                        "isAnonymous",
                        event.target.value === "all"
                          ? undefined
                          : event.target.value === "anonymous"
                      )
                    }
                    aria-label="Müşteri tipi filtresi"
                    className="w-full appearance-none rounded-2xl border border-[#FE6100]/12 bg-white/85 px-11 py-3 pr-10 text-sm text-gray-900 shadow-sm transition-all focus:border-[#FE6100] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#FE6100]/20"
                  >
                    <option value="all">Tüm müşteriler</option>
                    <option value="registered">Kayıtlı müşteriler</option>
                    <option value="anonymous">Anonim kullanıcılar</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                </div>

                <div className="relative">
                  <ListFilter className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as AbandonedCartSort)}
                    aria-label="Sepetleri sıralama biçimi"
                    className="w-full appearance-none rounded-2xl border border-[#FE6100]/12 bg-white/85 px-11 py-3 pr-10 text-sm text-gray-900 shadow-sm transition-all focus:border-[#FE6100] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#FE6100]/20"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                </div>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#FE6100]/10 bg-white px-3 py-1.5 text-xs font-medium text-gray-600">
                    <ShoppingCart className="h-3.5 w-3.5 text-[#FE6100]" />
                    {allCarts.length.toLocaleString("tr-TR")} toplam sepet
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600">
                    <User className="h-3.5 w-3.5 text-slate-500" />
                    {registeredCount.toLocaleString("tr-TR")} kayıtlı müşteri
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600">
                    <User className="h-3.5 w-3.5 text-amber-600" />
                    {anonymousCount.toLocaleString("tr-TR")} anonim sepet
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setFilters({});
                    setSort("date-desc");
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#FE6100]/12 bg-white px-4 py-2.5 text-sm font-medium text-[#FE6100] transition-all hover:border-[#FE6100]/20 hover:bg-[#faf5f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6100]/20"
                >
                  Filtreleri Temizle
                </button>
              </div>

              {activeFilterSummary.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {activeFilterSummary.map((item) => (
                    <span
                      key={item}
                      className="inline-flex items-center gap-2 rounded-full border border-[#FE6100]/12 bg-[#fff7f1] px-3 py-1.5 text-xs font-semibold text-[#FE6100]"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <section className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_24px_80px_rgba(254,97,0,0.1)]">
            <div className="border-b border-[#FE6100]/8 px-5 py-5 md:px-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FE6100]">
                    Sepet Listesi
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-gray-950">
                    Aktif kurtarma fırsatları
                  </h2>
                </div>
                <div className="text-sm text-gray-500">
                  {loading ? "Sepetler hazırlanıyor" : `${visibleCartCount.toLocaleString("tr-TR")} sepet listeleniyor`}
                </div>
              </div>
            </div>

            {loading ? (
              <LoadingState />
            ) : carts.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#fff3e9] to-white text-[#FE6100] shadow-sm">
                  <ShoppingCart className="h-9 w-9" />
                </div>
                <p className="mt-5 text-lg font-semibold text-gray-950">
                  {hasActiveFilters ? "Uygun sepet bulunamadı" : "Henüz terk edilen sepet bulunmuyor"}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  {hasActiveFilters
                    ? "Arama veya filtre kriterlerini değiştirerek tekrar deneyin."
                    : "Yeni sepet hareketleri oluştuğunda bu ekran otomatik olarak güncellenecektir."}
                </p>
              </div>
            ) : (
              <div className="space-y-4 p-5 md:p-6">
                {carts.map((cart) => {
                  const status = getCartStatus(cart);
                  const StatusIcon = status.icon;
                  const previewItems = cart.items.slice(0, 3);
                  const remainingItems = Math.max(cart.items.length - previewItems.length, 0);

                  return (
                    <motion.article
                      key={cart.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: ANIMATION_EASE }}
                      className="overflow-hidden rounded-[28px] border border-white/70 bg-white/80 shadow-sm transition-all duration-200 hover:border-[#FE6100]/12 hover:bg-white hover:shadow-[0_18px_35px_rgba(254,97,0,0.08)]"
                    >
                      <div className="border-b border-[#FE6100]/8 px-5 py-4 md:px-6">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold", status.tone)}>
                              <StatusIcon className="h-3.5 w-3.5" />
                              {status.label}
                            </span>
                            {cart.isAnonymous ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100/90 px-3 py-1.5 text-xs font-semibold text-slate-700">
                                <User className="h-3.5 w-3.5" />
                                Anonim kullanıcı
                              </span>
                            ) : null}
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FE6100]/12 bg-[#fff7f1] px-3 py-1.5 text-xs font-medium text-[#FE6100]">
                              <Clock className="h-3.5 w-3.5" />
                              {formatRelativeTime(cart.createdAt)}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                            {!cart.recovered ? (
                              <button
                                type="button"
                                onClick={() => void handleMarkRecovered(cart.id)}
                                className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition-all hover:border-emerald-300 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
                              >
                                <CheckCircle className="h-4 w-4" />
                                Kurtarıldı Olarak İşaretle
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setSelectedCart(cart)}
                              className="inline-flex items-center gap-2 rounded-2xl border border-[#FE6100]/12 bg-white px-4 py-2.5 text-sm font-medium text-[#FE6100] transition-all hover:border-[#FE6100]/20 hover:bg-[#faf5f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6100]/20"
                            >
                              <Package className="h-4 w-4" />
                              Detayları Gör
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(cart.id)}
                              aria-label="Sepeti sil"
                              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-100 bg-white text-rose-600 shadow-sm transition-all hover:border-rose-200 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="p-5 md:p-6">
                        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[1.2fr_0.8fr_0.95fr]">
                          <div className="space-y-4">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                                Müşteri Bilgileri
                              </p>
                              {cart.isAnonymous ? (
                                <div className="mt-3 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
                                  Bu sepet anonim bir kullanıcıya aittir. İletişim bilgisi bulunmuyorsa yalnızca davranış verisi izlenebilir.
                                </div>
                              ) : (
                                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <div className="rounded-[22px] border border-white/70 bg-white p-4 shadow-sm">
                                    <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                                      <User className="h-4 w-4 text-[#FE6100]" />
                                      Müşteri adı
                                    </div>
                                    <p className="mt-2 text-base font-semibold text-gray-950">
                                      {cart.firstName || "-"} {cart.lastName || ""}
                                    </p>
                                  </div>
                                  <div className="rounded-[22px] border border-white/70 bg-white p-4 shadow-sm">
                                    <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                                      <Mail className="h-4 w-4 text-[#FE6100]" />
                                      E-posta
                                    </div>
                                    <p className="mt-2 text-base font-semibold text-gray-950">{cart.email || "-"}</p>
                                  </div>
                                  <div className="rounded-[22px] border border-white/70 bg-white p-4 shadow-sm sm:col-span-2">
                                    <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                                      <Phone className="h-4 w-4 text-[#FE6100]" />
                                      Telefon
                                    </div>
                                    <p className="mt-2 text-base font-semibold text-gray-950">{cart.phone || "-"}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                              Sepet Özeti
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="rounded-[22px] border border-[#FE6100]/12 bg-gradient-to-br from-[#fff3e9] to-white p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#FE6100]">Sepet değeri</p>
                                <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-gray-950">
                                  {formatCurrency(cart.total || 0)}
                                </p>
                              </div>
                              <div className="rounded-[22px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Ürün adedi</p>
                                <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-gray-950">
                                  {cart.itemCount.toLocaleString("tr-TR")}
                                </p>
                              </div>
                              <div className="rounded-[22px] border border-amber-200/60 bg-gradient-to-br from-amber-50 to-white p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Terk tarihi</p>
                                <p className="mt-2 text-sm font-semibold text-gray-950">{formatCartDate(cart.createdAt)}</p>
                                <p className="mt-1 text-xs text-gray-500">{formatCartTime(cart.createdAt)}</p>
                              </div>
                              <div className="rounded-[22px] border border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-white p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Geri kazanım</p>
                                <p className="mt-2 text-sm font-semibold text-gray-950">
                                  {cart.recovered ? "Tamamlandı" : "Bekliyor"}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">{formatRelativeTime(cart.createdAt)}</p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                                Sepet İçeriği
                              </p>
                              <span className="rounded-full border border-[#FE6100]/10 bg-[#fff7f1] px-3 py-1 text-xs font-medium text-[#FE6100]">
                                {cart.items.length} ürün
                              </span>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-1">
                              {previewItems.map((item: AbandonedCartItem) => (
                                <div key={item.id} className="flex items-center gap-3 rounded-[22px] border border-white/70 bg-white p-3 shadow-sm">
                                  <div className="h-14 w-14 overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
                                    {item.productImage ? (
                                      <AbandonedCartItemImage
                                        src={item.productImage}
                                        alt={item.productName}
                                        iconClassName="h-full w-full p-3 text-gray-400"
                                      />
                                    ) : (
                                      <Package className="h-full w-full p-3 text-gray-400" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-gray-950">{item.productName}</p>
                                    <p className="mt-1 truncate text-xs text-gray-500">{item.variantName || "Varsayılan varyant"}</p>
                                    <p className="mt-1 text-sm font-medium text-[#FE6100]">
                                      {formatCurrency((item.price || 0) * (item.quantity || 0))}
                                    </p>
                                  </div>
                                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
                                    x{item.quantity}
                                  </span>
                                </div>
                              ))}
                              {remainingItems > 0 ? (
                                <div className="flex items-center justify-center rounded-[22px] border border-dashed border-[#FE6100]/20 bg-white/80 px-4 py-5 text-sm font-medium text-gray-500">
                                  +{remainingItems} ürün daha
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {selectedCart ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
          onClick={() => setSelectedCart(null)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="abandoned-cart-modal-title"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25, ease: ANIMATION_EASE }}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[32px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_30px_90px_rgba(0,0,0,0.28)]"
          >
            <div className="border-b border-[#FE6100]/8 px-6 py-5 md:px-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FE6100]">
                    Sepet Detayı
                  </p>
                  <h3 id="abandoned-cart-modal-title" className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-gray-950">
                    Terk edilen sepet özeti
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">Sepet kimliği: {selectedCart.id}</p>
                </div>
                <button
                  type="button"
                  aria-label="Detay penceresini kapat"
                  onClick={() => setSelectedCart(null)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#FE6100]/12 bg-white text-gray-500 transition-all hover:border-[#FE6100]/20 hover:text-[#FE6100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6100]/20"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-8 p-6 md:p-7">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
                <div className="rounded-[24px] border border-[#FE6100]/15 bg-gradient-to-br from-[#fff3e9] to-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#FE6100]">Sepet toplamı</p>
                  <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-gray-950">
                    {formatCurrency(selectedCart.total || 0)}
                  </p>
                </div>
                <div className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Ürün sayısı</p>
                  <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-gray-950">
                    {selectedCart.itemCount.toLocaleString("tr-TR")}
                  </p>
                </div>
                <div className="rounded-[24px] border border-amber-200/60 bg-gradient-to-br from-amber-50 to-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Oluşturulma</p>
                  <p className="mt-3 text-base font-semibold text-gray-950">
                    {formatCartDateTime(selectedCart.createdAt)}
                  </p>
                </div>
                <div className="rounded-[24px] border border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Durum</p>
                  <p className="mt-3 text-base font-semibold text-gray-950">
                    {selectedCart.recovered ? "Kurtarıldı" : "Geri kazanım bekliyor"}
                  </p>
                </div>
              </div>

              <section>
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#FE6100]">
                  <User className="h-4 w-4" />
                  Müşteri Bilgileri
                </div>

                {selectedCart.isAnonymous ? (
                  <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50/90 p-5 text-sm text-slate-600">
                    Bu sepet anonim bir kullanıcıya aittir. Kimlik bilgisi bulunmuyorsa yalnızca davranış verisi izlenebilir.
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-[22px] border border-white/70 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Ad</p>
                      <p className="mt-2 text-base font-semibold text-gray-950">{selectedCart.firstName || "-"}</p>
                    </div>
                    <div className="rounded-[22px] border border-white/70 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Soyad</p>
                      <p className="mt-2 text-base font-semibold text-gray-950">{selectedCart.lastName || "-"}</p>
                    </div>
                    <div className="rounded-[22px] border border-white/70 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">E-posta</p>
                      <p className="mt-2 text-base font-semibold text-gray-950">{selectedCart.email || "-"}</p>
                    </div>
                    <div className="rounded-[22px] border border-white/70 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Telefon</p>
                      <p className="mt-2 text-base font-semibold text-gray-950">{selectedCart.phone || "-"}</p>
                    </div>
                  </div>
                )}
              </section>

              <section>
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#FE6100]">
                  <Package className="h-4 w-4" />
                  Sepet Ürünleri
                </div>

                <div className="mt-4 space-y-3">
                  {selectedCart.items.map((item: AbandonedCartItem) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-4 rounded-[24px] border border-white/70 bg-white p-4 shadow-sm md:flex-row md:items-center"
                    >
                      <div className="h-20 w-20 overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
                        {item.productImage ? (
                          <AbandonedCartItemImage
                            src={item.productImage}
                            alt={item.productName}
                            iconClassName="h-full w-full p-4 text-gray-400"
                          />
                        ) : (
                          <Package className="h-full w-full p-4 text-gray-400" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold text-gray-950">{item.productName}</p>
                        <p className="mt-1 text-sm text-gray-500">{item.variantName || "Varsayılan varyant"}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                          <span className="rounded-full bg-slate-100 px-3 py-1">Adet: {item.quantity}</span>
                          <span className="rounded-full bg-slate-100 px-3 py-1">Stok: {item.stock ?? 0}</span>
                        </div>
                      </div>

                      <div className="md:text-right">
                        <p className="text-lg font-semibold text-[#FE6100]">
                          {formatCurrency((item.price || 0) * (item.quantity || 0))}
                        </p>
                        {item.originalPrice && item.originalPrice > item.price ? (
                          <p className="mt-1 text-sm text-gray-400 line-through">
                            {formatCurrency(item.originalPrice * item.quantity)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="flex flex-col gap-4 border-t border-[#FE6100]/8 pt-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm text-gray-600">Toplam {selectedCart.itemCount} ürün</p>
                  <p className="mt-1 text-xs text-gray-500">Oluşturulma: {formatCartDateTime(selectedCart.createdAt)}</p>
                </div>
                <div className="text-left md:text-right">
                  <p className="text-sm text-gray-600">Sepet toplamı</p>
                  <p className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-[#FE6100]">
                    {formatCurrency(selectedCart.total || 0)}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </main>
  );
}
