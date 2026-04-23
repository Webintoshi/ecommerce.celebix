"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Loader2,
  Mail,
  Package2,
  Phone,
  RefreshCcw,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import {
  getAbandonedCarts,
  getAbandonedCartStats,
  markCartAsRecovered,
  deleteAbandonedCart,
  type AbandonedCart,
  type AbandonedCartItem,
  type AbandonedCartSort,
} from "@/lib/abandoned-carts";
import {
  extractAdminStoredAssetUrl,
  resolveAdminDirectAssetUrl,
} from "@/lib/asset-url";
import { buildStorefrontUrl } from "@/lib/store-runtime";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type AbandonedCartStats = Awaited<ReturnType<typeof getAbandonedCartStats>>;
type CustomerTypeFilter = "all" | "anonymous" | "registered";
type StatusFilter = "all" | "abandoned" | "recovered" | "active" | "cleared";

const SORT_OPTIONS: { value: AbandonedCartSort; label: string }[] = [
  { value: "date-desc", label: "Sıralama: Yeni olandan eskiye" },
  { value: "date-asc", label: "Sıralama: Eski olandan yeniye" },
  { value: "total-desc", label: "Sıralama: Tutar yüksekten düşüğe" },
  { value: "total-asc", label: "Sıralama: Tutar düşükten yükseğe" },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Tüm durumlar" },
  { value: "abandoned", label: "Terk edildi" },
  { value: "recovered", label: "Kurtarıldı" },
  { value: "active", label: "Aktif" },
  { value: "cleared", label: "Temizlendi" },
];

const CUSTOMER_TYPE_OPTIONS: { value: CustomerTypeFilter; label: string }[] = [
  { value: "all", label: "Tüm müşteri tipleri" },
  { value: "registered", label: "Kayıtlı kullanıcı" },
  { value: "anonymous", label: "Anonim kullanıcı" },
];

const ITEMS_PER_PAGE = 10;

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
}: {
  src?: string | null;
  alt: string;
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
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#F7F8FA] text-[#9CA3AF]">
        <Package2 className="h-5 w-5" />
      </div>
    );
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
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCartDate(value: Date | string | undefined) {
  return format(toDate(value), "d MMM yyyy", { locale: tr });
}

function formatCartDateTime(value: Date | string | undefined) {
  return format(toDate(value), "d MMM yyyy · HH:mm", { locale: tr });
}

function formatRelativeTime(value: Date | string | undefined) {
  return formatDistanceToNow(toDate(value), { locale: tr, addSuffix: true });
}

function getCustomerName(cart: AbandonedCart) {
  const name = `${cart.firstName || ""} ${cart.lastName || ""}`.trim();
  return name || "Anonim Kullanıcı";
}

function getRecoveryLabel(cart: AbandonedCart) {
  if (cart.recovered || cart.status === "recovered") {
    return {
      label: "Kurtarıldı",
      className: "border-[#BBF7D0] bg-[#EAF8EF] text-[#16A34A]",
    };
  }

  return {
    label: "Bekliyor",
    className: "border-[#BFDBFE] bg-[#EAF2FF] text-[#3B82F6]",
  };
}

function getCartStatus(cart: AbandonedCart) {
  const status = cart.status ?? (cart.recovered ? "recovered" : "abandoned");

  const variants = {
    abandoned: {
      label: "Terk edildi",
      className: "border-[#FECACA] bg-[#FDECEC] text-[#EF4444]",
      icon: XCircle,
    },
    recovered: {
      label: "Kurtarıldı",
      className: "border-[#BBF7D0] bg-[#EAF8EF] text-[#16A34A]",
      icon: CheckCircle2,
    },
    active: {
      label: "Aktif",
      className: "border-[#BFDBFE] bg-[#EAF2FF] text-[#3B82F6]",
      icon: ShoppingCart,
    },
    cleared: {
      label: "Temizlendi",
      className: "border-[#E5E7EB] bg-[#F7F8FA] text-[#6B7280]",
      icon: CheckCircle2,
    },
  } as const;

  return variants[status] || variants.abandoned;
}

function getChangePercent(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) return 0;
    return 100;
  }

  return ((current - previous) / previous) * 100;
}

function MetricCard({
  title,
  value,
  context,
  delta,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  context: string;
  delta?: number | null;
  icon: typeof ShoppingCart;
  tone: string;
}) {
  const isPositive = (delta ?? 0) >= 0;

  return (
    <div className="rounded-[26px] border border-[#E7EAF0] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <p className="text-sm font-medium text-[#6B7280]">{title}</p>
          <div className="flex items-end gap-3">
            <p className="text-[1.75rem] font-semibold tracking-[-0.04em] text-[#1F2937]">
              {value}
            </p>
            {typeof delta === "number" ? (
              <span
                className={cn(
                  "inline-flex rounded-full border px-2 py-1 text-xs font-semibold",
                  isPositive
                    ? "border-[#BBF7D0] bg-[#EAF8EF] text-[#16A34A]"
                    : "border-[#FECACA] bg-[#FDECEC] text-[#EF4444]"
                )}
              >
                {isPositive ? "↑" : "↓"} %{Math.abs(delta).toFixed(0)}
              </span>
            ) : null}
          </div>
          <p className="text-xs font-medium text-[#6B7280]">{context}</p>
        </div>
        <div
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-[1.1rem] border",
            tone
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-[#E7EAF0] bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <Skeleton className="h-7 w-28 bg-[#EEF1F4]" />
            <Skeleton className="h-10 w-60 bg-[#EEF1F4]" />
            <Skeleton className="h-4 w-80 bg-[#EEF1F4]" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-11 w-11 rounded-2xl bg-[#EEF1F4]" />
            <Skeleton className="h-11 w-11 rounded-2xl bg-[#EEF1F4]" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[26px] border border-[#E7EAF0] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="w-full space-y-3">
                <Skeleton className="h-4 w-28 bg-[#EEF1F4]" />
                <Skeleton className="h-9 w-24 bg-[#EEF1F4]" />
                <Skeleton className="h-3 w-20 bg-[#EEF1F4]" />
              </div>
              <Skeleton className="h-14 w-14 rounded-[1.1rem] bg-[#EEF1F4]" />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-[28px] border border-[#E7EAF0] bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_220px_220px_260px_auto]">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 rounded-2xl bg-[#EEF1F4]" />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[28px] border border-[#E7EAF0] bg-white shadow-[0_12px_36px_rgba(15,23,42,0.05)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF1F4] px-5 py-4">
              <div className="flex gap-2">
                <Skeleton className="h-7 w-24 rounded-full bg-[#EEF1F4]" />
                <Skeleton className="h-7 w-28 rounded-full bg-[#EEF1F4]" />
                <Skeleton className="h-7 w-24 rounded-full bg-[#EEF1F4]" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-10 w-40 rounded-xl bg-[#EEF1F4]" />
                <Skeleton className="h-10 w-32 rounded-xl bg-[#EEF1F4]" />
                <Skeleton className="h-10 w-10 rounded-xl bg-[#EEF1F4]" />
              </div>
            </div>
            <div className="grid gap-4 px-5 py-5 xl:grid-cols-[1.05fr_0.95fr_1.15fr]">
              <Skeleton className="h-40 rounded-[22px] bg-[#EEF1F4]" />
              <Skeleton className="h-40 rounded-[22px] bg-[#EEF1F4]" />
              <Skeleton className="h-40 rounded-[22px] bg-[#EEF1F4]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({
  hasFilters,
  onReset,
}: {
  hasFilters: boolean;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#BBF7D0] bg-[#EAF8EF] text-[#16A34A]">
        <CheckCircle2 className="h-9 w-9" />
      </div>
      <h3 className="mt-5 text-xl font-semibold text-[#1F2937]">
        {hasFilters ? "Uygun sepet bulunamadı" : "Terk edilmiş sepet bulunmuyor"}
      </h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-[#6B7280]">
        {hasFilters
          ? "Arama ve filtreleri değiştirerek tekrar deneyin."
          : "Bu iyi haber. Şu anda kurtarma gerektiren aktif bir sepet görünmüyor."}
      </p>
      {hasFilters ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-5"
          onClick={onReset}
        >
          Filtreleri temizle
        </Button>
      ) : null}
    </div>
  );
}

function CartDetailModal({
  cart,
  onClose,
}: {
  cart: AbandonedCart;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="abandoned-cart-modal-title"
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[32px] border border-[#E7EAF0] bg-white shadow-[0_30px_90px_rgba(0,0,0,0.22)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#EEF1F4] px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FF6A00]">
              Sepet Detayı
            </p>
            <h3
              id="abandoned-cart-modal-title"
              className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#1F2937]"
            >
              {getCustomerName(cart)}
            </h3>
            <p className="mt-1 text-sm text-[#6B7280]">
              {formatCartDateTime(cart.createdAt)}
            </p>
          </div>
          <button
            type="button"
            aria-label="Detay penceresini kapat"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#E7EAF0] bg-white text-[#6B7280] transition-colors hover:border-[#FFD7BF] hover:text-[#E85D04]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[22px] border border-[#E7EAF0] bg-[#FBFCFD] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9CA3AF]">
                Sepet toplamı
              </p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#1F2937]">
                {formatCurrency(cart.total || 0)}
              </p>
            </div>
            <div className="rounded-[22px] border border-[#E7EAF0] bg-[#FBFCFD] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9CA3AF]">
                Ürün adedi
              </p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#1F2937]">
                {cart.itemCount}
              </p>
            </div>
            <div className="rounded-[22px] border border-[#E7EAF0] bg-[#FBFCFD] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9CA3AF]">
                Durum
              </p>
              <p className="mt-3 text-base font-semibold text-[#1F2937]">
                {getCartStatus(cart).label}
              </p>
            </div>
            <div className="rounded-[22px] border border-[#E7EAF0] bg-[#FBFCFD] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9CA3AF]">
                Geri kazanım
              </p>
              <p className="mt-3 text-base font-semibold text-[#1F2937]">
                {getRecoveryLabel(cart).label}
              </p>
            </div>
          </div>

          <section>
            <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">
              Müşteri Bilgileri
            </h4>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-[22px] border border-[#E7EAF0] bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9CA3AF]">
                  Müşteri
                </p>
                <p className="mt-2 text-base font-semibold text-[#1F2937]">
                  {getCustomerName(cart)}
                </p>
              </div>
              <div className="rounded-[22px] border border-[#E7EAF0] bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9CA3AF]">
                  E-posta
                </p>
                <p className="mt-2 text-base font-semibold text-[#1F2937]">
                  {cart.email || "E-posta bilgisi yok"}
                </p>
              </div>
              <div className="rounded-[22px] border border-[#E7EAF0] bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9CA3AF]">
                  Telefon
                </p>
                <p className="mt-2 text-base font-semibold text-[#1F2937]">
                  {cart.phone || "Telefon bilgisi yok"}
                </p>
              </div>
              <div className="rounded-[22px] border border-[#E7EAF0] bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9CA3AF]">
                  Kimlik
                </p>
                <p className="mt-2 text-sm font-medium text-[#374151]">
                  {cart.userId || cart.sessionId || "Davranış verisi"}
                </p>
              </div>
            </div>
          </section>

          <section>
            <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">
              Sepet İçeriği
            </h4>
            <div className="mt-3 space-y-3">
              {cart.items.map((item: AbandonedCartItem) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-4 rounded-[24px] border border-[#E7EAF0] bg-white p-4 md:flex-row md:items-center"
                >
                  <div className="h-20 w-20 overflow-hidden rounded-2xl border border-[#E7EAF0] bg-[#F7F8FA]">
                    <AbandonedCartItemImage src={item.productImage} alt={item.productName} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-[#1F2937]">
                      {item.productName}
                    </p>
                    <p className="mt-1 text-sm text-[#6B7280]">
                      {item.variantName || "Varsayılan varyant"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 md:text-right">
                    <span className="rounded-full border border-[#E7EAF0] bg-[#F7F8FA] px-3 py-1 text-xs font-semibold text-[#6B7280]">
                      x{item.quantity}
                    </span>
                    <p className="text-lg font-semibold text-[#FF6A00]">
                      {formatCurrency((item.price || 0) * (item.quantity || 0))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function AbandonedCartsPage() {
  const [allCarts, setAllCarts] = useState<AbandonedCart[]>([]);
  const [stats, setStats] = useState<AbandonedCartStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedCart, setSelectedCart] = useState<AbandonedCart | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [customerTypeFilter, setCustomerTypeFilter] =
    useState<CustomerTypeFilter>("all");
  const [sort, setSort] = useState<AbandonedCartSort>("date-desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    setErrorMessage("");
    try {
      const [cartsData, cartStats] = await Promise.all([
        getAbandonedCarts(),
        getAbandonedCartStats(),
      ]);

      setAllCarts(cartsData);
      setStats(cartStats);
      setLastUpdatedAt(new Date());
    } catch (error) {
      console.error("Error loading abandoned carts:", error);
      setErrorMessage("Terk edilen sepetler yüklenemedi.");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setCustomerTypeFilter("all");
    setSort("date-desc");
    setCurrentPage(1);
  };

  const filteredCarts = useMemo(() => {
    const searchLower = searchQuery.trim().toLowerCase();

    const filtered = allCarts.filter((cart) => {
      const name = getCustomerName(cart).toLowerCase();
      const email = (cart.email || "").toLowerCase();
      const phone = (cart.phone || "").toLowerCase();
      const matchesSearch =
        !searchLower ||
        name.includes(searchLower) ||
        email.includes(searchLower) ||
        phone.includes(searchLower);

      const matchesStatus = statusFilter === "all" ? true : cart.status === statusFilter;
      const matchesCustomerType =
        customerTypeFilter === "all"
          ? true
          : customerTypeFilter === "anonymous"
            ? cart.isAnonymous
            : !cart.isAnonymous;

      return matchesSearch && matchesStatus && matchesCustomerType;
    });

    return filtered.sort((left, right) => {
      switch (sort) {
        case "date-asc":
          return toDate(left.createdAt).getTime() - toDate(right.createdAt).getTime();
        case "total-desc":
          return (right.total || 0) - (left.total || 0);
        case "total-asc":
          return (left.total || 0) - (right.total || 0);
        case "date-desc":
        default:
          return toDate(right.createdAt).getTime() - toDate(left.createdAt).getTime();
      }
    });
  }, [allCarts, searchQuery, statusFilter, customerTypeFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredCarts.length / ITEMS_PER_PAGE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedCarts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredCarts.slice(start, start + ITEMS_PER_PAGE);
  }, [currentPage, filteredCarts]);

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

  const previousRecovered = Math.max(safeStats.recovered - safeStats.last24h.recovered, 0);
  const previousActive = Math.max(
    safeStats.total - safeStats.last24h.abandoned - previousRecovered,
    0
  );
  const previousValue = Math.max(
    safeStats.totalValue - safeStats.last24h.lostValue,
    0
  );

  const totalDelta = getChangePercent(safeStats.last24h.abandoned, previousActive);
  const activeTerk = Math.max(safeStats.total - safeStats.recovered, 0);
  const activeDelta = getChangePercent(activeTerk, previousActive);
  const totalValueDelta = getChangePercent(safeStats.last24h.lostValue, previousValue);
  const averageDelta = getChangePercent(
    safeStats.avgValue,
    previousRecovered > 0 ? previousValue / Math.max(previousRecovered, 1) : 0
  );

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    statusFilter !== "all" ||
    customerTypeFilter !== "all";

  const visibleStart = filteredCarts.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const visibleEnd = Math.min(currentPage * ITEMS_PER_PAGE, filteredCarts.length);

  const paginationNumbers = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    if (currentPage <= 3) {
      return [1, 2, 3, 4, 5];
    }

    if (currentPage >= totalPages - 2) {
      return Array.from({ length: 5 }, (_, index) => totalPages - 4 + index);
    }

    return Array.from({ length: 5 }, (_, index) => currentPage - 2 + index);
  }, [currentPage, totalPages]);

  const handleMarkRecovered = async (id: string) => {
    await markCartAsRecovered(id);
    await loadData();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Bu sepeti silmek istediğinizden emin misiniz?")) {
      return;
    }

    await deleteAbandonedCart(id);
    await loadData();
  };

  return (
    <main className="min-h-screen bg-[#F7F8FA]">
      <div className="mx-auto max-w-[1600px] px-3 py-4 md:px-5 md:py-6 lg:px-8">
        <div className="space-y-6">
          <section className="rounded-[28px] border border-[#E7EAF0] bg-white px-6 py-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)] md:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <span className="inline-flex items-center rounded-full border border-[#FFD7BF] bg-[#FFF1E8] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#E85D04]">
                  Celebix Admin
                </span>
                <div className="space-y-2">
                  <h1 className="text-[2rem] font-semibold tracking-[-0.05em] text-[#1F2937]">
                    Terkedilen Sepetler
                  </h1>
                  <p className="max-w-2xl text-sm leading-6 text-[#6B7280] md:text-[0.95rem]">
                    Terk edilen sepetleri takip edin, kurtarma fırsatlarını yönetin.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 lg:justify-end">
                <Link
                  href="/admin/ayarlar/bildirimler"
                  aria-label="Bildirim ayarları"
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "sm" }),
                    "relative h-11 w-11 rounded-2xl border-[#E7EAF0] px-0 text-[#374151] shadow-none"
                  )}
                >
                  <Bell className="h-4 w-4" />
                  {activeTerk > 0 ? (
                    <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#FF6A00]" />
                  ) : null}
                </Link>
                <button
                  type="button"
                  onClick={handleRefresh}
                  aria-label="Sepetleri yenile"
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "sm" }),
                    "h-11 w-11 rounded-2xl border-[#E7EAF0] px-0 text-[#374151] shadow-none"
                  )}
                >
                  {isRefreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {lastUpdatedAt ? (
              <p className="mt-4 text-xs font-medium text-[#9CA3AF]">
                Son güncelleme: {formatCartDateTime(lastUpdatedAt)}
              </p>
            ) : null}
          </section>

          {loading ? (
            <PageSkeleton />
          ) : (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  title="Toplam Sepet"
                  value={safeStats.total.toLocaleString("tr-TR")}
                  context="Son 24 saatte"
                  delta={totalDelta}
                  icon={ShoppingCart}
                  tone="border-[#FFD7BF] bg-[#FFF1E8] text-[#FF6A00]"
                />
                <MetricCard
                  title="Aktif Terk"
                  value={activeTerk.toLocaleString("tr-TR")}
                  context="Son 24 saatte"
                  delta={activeDelta}
                  icon={CalendarClock}
                  tone="border-[#FDE68A] bg-[#FFF7E8] text-[#F59E0B]"
                />
                <MetricCard
                  title="Toplam Değer"
                  value={formatCurrency(safeStats.totalValue)}
                  context="Son 24 saatte"
                  delta={totalValueDelta}
                  icon={Wallet}
                  tone="border-[#BBF7D0] bg-[#EAF8EF] text-[#16A34A]"
                />
                <MetricCard
                  title="Ortalama Sepet"
                  value={formatCurrency(Number(safeStats.avgValue.toFixed(2)))}
                  context="Son 24 saatte"
                  delta={averageDelta}
                  icon={Package2}
                  tone="border-[#DDD6FE] bg-[#F3EEFF] text-[#8B5CF6]"
                />
              </section>

              <section className="rounded-[28px] border border-[#E7EAF0] bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_220px_220px_260px_auto]">
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(event) => {
                        setSearchQuery(event.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="İsim, e-posta veya telefon ile ara"
                      className="h-12 w-full rounded-2xl border border-[#E7EAF0] bg-white pl-11 pr-4 text-sm text-[#1F2937] placeholder:text-[#9CA3AF] focus:border-[#FFD7BF] focus:outline-none focus:ring-4 focus:ring-[#FFF1E8]"
                    />
                  </label>

                  <div className="relative">
                    <select
                      value={statusFilter}
                      onChange={(event) => {
                        setStatusFilter(event.target.value as StatusFilter);
                        setCurrentPage(1);
                      }}
                      className="h-12 w-full appearance-none rounded-2xl border border-[#E7EAF0] bg-white px-4 pr-10 text-sm text-[#374151] focus:border-[#FFD7BF] focus:outline-none focus:ring-4 focus:ring-[#FFF1E8]"
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                  </div>

                  <div className="relative">
                    <select
                      value={customerTypeFilter}
                      onChange={(event) => {
                        setCustomerTypeFilter(event.target.value as CustomerTypeFilter);
                        setCurrentPage(1);
                      }}
                      className="h-12 w-full appearance-none rounded-2xl border border-[#E7EAF0] bg-white px-4 pr-10 text-sm text-[#374151] focus:border-[#FFD7BF] focus:outline-none focus:ring-4 focus:ring-[#FFF1E8]"
                    >
                      {CUSTOMER_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                  </div>

                  <div className="relative">
                    <select
                      value={sort}
                      onChange={(event) => setSort(event.target.value as AbandonedCartSort)}
                      className="h-12 w-full appearance-none rounded-2xl border border-[#E7EAF0] bg-white px-4 pr-10 text-sm text-[#374151] focus:border-[#FFD7BF] focus:outline-none focus:ring-4 focus:ring-[#FFF1E8]"
                    >
                      {SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                  </div>

                  <div className="flex items-center justify-between gap-3 xl:justify-end">
                    <span className="rounded-full border border-[#E7EAF0] bg-[#FBFCFD] px-3 py-2 text-sm font-medium text-[#6B7280]">
                      {filteredCarts.length} sonuç
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-2xl"
                      onClick={handleResetFilters}
                    >
                      Filtreleri Temizle
                    </Button>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                {errorMessage ? (
                  <div
                    role="alert"
                    className="rounded-[22px] border border-[#FECACA] bg-[#FDECEC] px-4 py-3 text-sm font-medium text-[#B91C1C]"
                  >
                    {errorMessage}
                  </div>
                ) : null}

                {filteredCarts.length === 0 ? (
                  <section className="rounded-[28px] border border-[#E7EAF0] bg-white shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
                    <EmptyState hasFilters={hasActiveFilters} onReset={handleResetFilters} />
                  </section>
                ) : (
                  <>
                    {paginatedCarts.map((cart) => {
                      const statusMeta = getCartStatus(cart);
                      const recoveryMeta = getRecoveryLabel(cart);
                      const previewItems = cart.items.slice(0, 2);
                      const remainingItems = Math.max(cart.items.length - previewItems.length, 0);
                      const StatusIcon = statusMeta.icon;

                      return (
                        <article
                          key={cart.id}
                          className="overflow-hidden rounded-[28px] border border-[#E7EAF0] bg-white shadow-[0_12px_36px_rgba(15,23,42,0.05)]"
                        >
                          <div className="flex flex-col gap-4 border-b border-[#EEF1F4] px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold",
                                  statusMeta.className
                                )}
                              >
                                <StatusIcon className="h-3.5 w-3.5" />
                                {statusMeta.label}
                              </span>
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E7EAF0] bg-[#F7F8FA] px-3 py-1.5 text-xs font-semibold text-[#6B7280]">
                                <UserRound className="h-3.5 w-3.5" />
                                {cart.isAnonymous ? "Anonim kullanıcı" : "Kayıtlı kullanıcı"}
                              </span>
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E7EAF0] bg-[#FBFCFD] px-3 py-1.5 text-xs font-medium text-[#6B7280]">
                                <CalendarClock className="h-3.5 w-3.5" />
                                {formatRelativeTime(cart.createdAt)}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                              {!cart.recovered ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="rounded-xl border-[#BBF7D0] bg-[#EAF8EF] text-[#16A34A] shadow-none hover:border-[#86EFAC] hover:bg-[#DCFCE7]"
                                  onClick={() => void handleMarkRecovered(cart.id)}
                                >
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                  Kurtarıldı Olarak İşaretle
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-xl"
                                onClick={() => setSelectedCart(cart)}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                Detayları Gör
                              </Button>
                              <button
                                type="button"
                                onClick={() => void handleDelete(cart.id)}
                                aria-label="Sepeti sil"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#FECACA] bg-white text-[#EF4444] transition-colors hover:bg-[#FDECEC]"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          <div className="grid gap-5 px-5 py-5 xl:grid-cols-[1.05fr_0.95fr_1.15fr]">
                            <section className="rounded-[24px] border border-[#EEF1F4] bg-[#FBFCFD] p-5">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">
                                Müşteri Bilgileri
                              </p>
                              <div className="mt-4 flex gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[#E7EAF0] bg-white text-[#9CA3AF]">
                                  <UserRound className="h-6 w-6" />
                                </div>
                                <div className="min-w-0 space-y-2">
                                  <p className="text-lg font-semibold tracking-[-0.02em] text-[#1F2937]">
                                    {getCustomerName(cart)}
                                  </p>
                                  <div className="space-y-1 text-sm text-[#6B7280]">
                                    <div className="flex items-center gap-2">
                                      <Mail className="h-4 w-4 text-[#9CA3AF]" />
                                      <span>{cart.email || "E-posta bilgisi yok"}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Phone className="h-4 w-4 text-[#9CA3AF]" />
                                      <span>{cart.phone || "Telefon bilgisi yok"}</span>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2 pt-1">
                                    <span className="rounded-full border border-[#E7EAF0] bg-white px-3 py-1 text-xs font-medium text-[#6B7280]">
                                      {cart.userId
                                        ? `Müşteri ID: ${cart.userId}`
                                        : cart.sessionId
                                          ? `Oturum: ${cart.sessionId.slice(0, 10)}...`
                                          : "Davranış verisi"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </section>

                            <section className="rounded-[24px] border border-[#EEF1F4] bg-[#FBFCFD] p-5">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">
                                Sepet Özeti
                              </p>
                              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <div className="rounded-[20px] border border-[#E7EAF0] bg-white p-4">
                                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9CA3AF]">
                                    Sepet Değeri
                                  </p>
                                  <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#1F2937]">
                                    {formatCurrency(cart.total || 0)}
                                  </p>
                                </div>
                                <div className="rounded-[20px] border border-[#E7EAF0] bg-white p-4">
                                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9CA3AF]">
                                    Ürün Adedi
                                  </p>
                                  <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#1F2937]">
                                    {cart.itemCount}
                                  </p>
                                </div>
                                <div className="rounded-[20px] border border-[#E7EAF0] bg-white p-4">
                                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9CA3AF]">
                                    Terk Tarihi
                                  </p>
                                  <p className="mt-2 text-sm font-semibold text-[#1F2937]">
                                    {formatCartDate(cart.createdAt)}
                                  </p>
                                  <p className="mt-1 text-xs text-[#9CA3AF]">
                                    {format(toDate(cart.createdAt), "HH:mm")}
                                  </p>
                                </div>
                                <div className="rounded-[20px] border border-[#E7EAF0] bg-white p-4">
                                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9CA3AF]">
                                    Geri Kazanım
                                  </p>
                                  <div className="mt-2">
                                    <span
                                      className={cn(
                                        "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
                                        recoveryMeta.className
                                      )}
                                    >
                                      {recoveryMeta.label}
                                    </span>
                                  </div>
                                  <p className="mt-2 text-xs text-[#9CA3AF]">
                                    {formatRelativeTime(cart.createdAt)}
                                  </p>
                                </div>
                              </div>
                            </section>

                            <section className="rounded-[24px] border border-[#EEF1F4] bg-[#FBFCFD] p-5">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">
                                  Sepet İçeriği
                                </p>
                                <span className="rounded-full border border-[#E7EAF0] bg-white px-3 py-1 text-xs font-medium text-[#6B7280]">
                                  {cart.items.length} ürün
                                </span>
                              </div>
                              <div className="mt-4 space-y-3">
                                {previewItems.map((item: AbandonedCartItem) => (
                                  <div
                                    key={item.id}
                                    className="flex items-center gap-3 rounded-[20px] border border-[#E7EAF0] bg-white p-3"
                                  >
                                    <div className="h-16 w-16 overflow-hidden rounded-2xl border border-[#E7EAF0] bg-[#F7F8FA]">
                                      <AbandonedCartItemImage
                                        src={item.productImage}
                                        alt={item.productName}
                                      />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-semibold text-[#1F2937]">
                                        {item.productName}
                                      </p>
                                      <p className="mt-1 truncate text-xs text-[#6B7280]">
                                        {item.variantName || "Varsayılan varyant"}
                                      </p>
                                      <p className="mt-1 text-sm font-medium text-[#FF6A00]">
                                        {formatCurrency((item.price || 0) * (item.quantity || 0))}
                                      </p>
                                    </div>
                                    <span className="rounded-full border border-[#E7EAF0] bg-[#F7F8FA] px-2 py-1 text-xs font-semibold text-[#6B7280]">
                                      x{item.quantity}
                                    </span>
                                  </div>
                                ))}
                                {remainingItems > 0 ? (
                                  <div className="rounded-[20px] border border-dashed border-[#E7EAF0] bg-white px-4 py-3 text-sm font-medium text-[#6B7280]">
                                    +{remainingItems} ürün daha
                                  </div>
                                ) : null}
                              </div>
                            </section>
                          </div>
                        </article>
                      );
                    })}

                    <div className="flex flex-col gap-4 rounded-[28px] border border-[#E7EAF0] bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)] md:flex-row md:items-center md:justify-between">
                      <p className="text-sm text-[#6B7280]">
                        {visibleStart} - {visibleEnd} / {filteredCarts.length} sepet gösteriliyor
                      </p>

                      <div className="flex items-center gap-2 self-end md:self-auto">
                        <button
                          type="button"
                          onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                          disabled={currentPage === 1}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E7EAF0] bg-white text-[#6B7280] transition-colors hover:border-[#FFD7BF] hover:text-[#E85D04] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>

                        <div className="flex items-center gap-1">
                          {paginationNumbers.map((pageNumber) => (
                            <button
                              key={pageNumber}
                              type="button"
                              onClick={() => setCurrentPage(pageNumber)}
                              className={cn(
                                "inline-flex h-10 min-w-10 items-center justify-center rounded-xl px-3 text-sm font-semibold transition-colors",
                                pageNumber === currentPage
                                  ? "bg-[#FF6A00] text-white shadow-[0_12px_24px_rgba(255,106,0,0.18)]"
                                  : "border border-[#E7EAF0] bg-white text-[#374151] hover:border-[#FFD7BF] hover:text-[#E85D04]"
                              )}
                            >
                              {pageNumber}
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setCurrentPage((page) => Math.min(totalPages, page + 1))
                          }
                          disabled={currentPage === totalPages}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E7EAF0] bg-white text-[#6B7280] transition-colors hover:border-[#FFD7BF] hover:text-[#E85D04] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {selectedCart ? (
        <CartDetailModal cart={selectedCart} onClose={() => setSelectedCart(null)} />
      ) : null}
    </main>
  );
}
