"use client";

import { useMemo, useState } from "react";
import type { ElementType } from "react";
import {
  CheckCircle,
  CreditCard,
  Eye,
  Filter,
  Heart,
  MousePointer,
  Search,
  Share2,
  ShoppingCart,
  TrendingUp,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { LiveAnalyticsEvent, LiveAnalyticsSnapshot } from "@/lib/admin-data-types";
import { cn } from "@/lib/utils";

interface EventConfig {
  icon: ElementType;
  label: string;
  color: string;
  bgColor: string;
}

const EVENT_CONFIGS: Record<string, EventConfig> = {
  add_to_cart: {
    icon: ShoppingCart,
    label: "Sepete eklendi",
    color: "text-[var(--admin-accent)]",
    bgColor: "bg-[#fff1e7]",
  },
  remove_from_cart: {
    icon: ShoppingCart,
    label: "Sepetten çıkarıldı",
    color: "text-rose-600",
    bgColor: "bg-rose-100",
  },
  view_product: {
    icon: Eye,
    label: "Ürün görüntülendi",
    color: "text-slate-600",
    bgColor: "bg-slate-100",
  },
  checkout_start: {
    icon: CreditCard,
    label: "Ödeme başladı",
    color: "text-amber-700",
    bgColor: "bg-amber-100",
  },
  purchase: {
    icon: CheckCircle,
    label: "Satın alma",
    color: "text-emerald-600",
    bgColor: "bg-emerald-100",
  },
  search: {
    icon: Search,
    label: "Arama yapıldı",
    color: "text-sky-600",
    bgColor: "bg-sky-100",
  },
  click: {
    icon: MousePointer,
    label: "Tıklama",
    color: "text-slate-600",
    bgColor: "bg-slate-100",
  },
  wishlist_add: {
    icon: Heart,
    label: "Favorilere eklendi",
    color: "text-pink-600",
    bgColor: "bg-pink-100",
  },
  share: {
    icon: Share2,
    label: "Paylaşıldı",
    color: "text-orange-600",
    bgColor: "bg-orange-100",
  },
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60) return "Şimdi";
  if (diff < 3600) return `${Math.floor(diff / 60)} dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa`;
  return `${Math.floor(diff / 86400)} g`;
}

function formatPageUrl(url: string): string {
  if (url === "/" || url === "") return "Ana Sayfa";
  if (url.startsWith("/urun/")) return "Ürün Sayfası";
  if (url.length > 22) return `${url.slice(0, 22)}...`;
  return url;
}

function getEventValue(event: LiveAnalyticsEvent): string {
  const data = event.data || {};

  if (typeof data.productName === "string" && data.productName.length > 0) {
    return data.productName.length > 24 ? `${data.productName.slice(0, 24)}...` : data.productName;
  }

  if (typeof data.query === "string" && data.query.length > 0) {
    return `“${data.query}”`;
  }

  if (typeof data.amount === "number") {
    return `₺${data.amount.toLocaleString("tr-TR")}`;
  }

  return "";
}

export default function ActivityFeed({ data }: { data: LiveAnalyticsSnapshot }) {
  const [filter, setFilter] = useState<string | null>(null);
  const events = data.recentEvents || [];

  const filteredEvents = useMemo(
    () => (filter ? events.filter((event) => event.type === filter) : events),
    [events, filter]
  );
  const eventTypes = useMemo(() => [...new Set(events.map((event) => event.type))], [events]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-[12px] border border-[var(--admin-border)] bg-white shadow-[var(--shadow-xs)]"
    >
      <div className="border-b border-[var(--admin-border)] px-6 py-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--admin-accent)]">
              Canlı Aktivite
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-gray-950">
              Son Hareketler
            </h3>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/50 bg-gradient-to-r from-emerald-50 to-teal-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            Akış açık
          </div>
        </div>
      </div>

      {eventTypes.length > 0 ? (
        <div className="border-b border-[var(--admin-border)] px-5 py-4">
          <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setFilter(null)}
              className={cn(
                "inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                filter === null
                  ? "border-[var(--admin-accent-border)] bg-[var(--admin-accent)] text-white shadow-[0_10px_20px_rgba(255,106,0,0.18)]"
                  : "border-[var(--admin-border)] bg-white text-gray-600 hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent)]"
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              Tümü
            </button>

            {eventTypes.slice(0, 5).map((type) => {
              const config = EVENT_CONFIGS[type];
              if (!config) return null;
              const Icon = config.icon;

              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFilter(filter === type ? null : type)}
                  className={cn(
                    "inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                    filter === type
                      ? "border-[var(--admin-accent-border)] bg-[var(--admin-accent)] text-white shadow-[0_10px_20px_rgba(255,106,0,0.18)]"
                      : "border-[var(--admin-border)] bg-white text-gray-600 hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent)]"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {config.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="max-h-[360px] overflow-y-auto">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <TrendingUp className="h-10 w-10 text-[var(--admin-accent)]/30" />
            <p className="mt-4 text-sm font-medium text-gray-600">Henüz gösterilecek canlı hareket bulunmuyor.</p>
            <p className="mt-1 text-xs text-gray-500">Yeni kullanıcı aksiyonları burada listelenecek.</p>
          </div>
        ) : (
          <div className="space-y-3 p-5">
            <AnimatePresence mode="popLayout">
              {filteredEvents.slice(0, 6).map((event, index) => {
                const config = EVENT_CONFIGS[event.type] || {
                  icon: Eye,
                  label: event.type,
                  color: "text-slate-600",
                  bgColor: "bg-slate-100",
                };
                const Icon = config.icon;
                const eventValue = getEventValue(event);

                return (
                  <motion.div
                    key={`${event.createdAt}-${index}`}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2, delay: index * 0.02 }}
                    className="flex items-start gap-3 rounded-[12px] border border-white/70 bg-white/75 px-4 py-4 shadow-sm transition-all duration-200 hover:border-[var(--admin-border)] hover:bg-white"
                  >
                    <div className={cn("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[8px]", config.bgColor)}>
                      <Icon className={cn("h-[18px] w-[18px]", config.color)} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-gray-950">{config.label}</p>
                        {eventValue ? (
                          <span className="truncate text-sm font-medium text-gray-500">{eventValue}</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">{formatPageUrl(event.pageUrl)}</p>
                    </div>

                    <span className="flex-shrink-0 text-xs font-medium text-gray-400">
                      {formatTimeAgo(event.createdAt)}
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {events.length > 0 ? (
        <div className="border-t border-[var(--admin-border)] bg-[var(--admin-accent-soft)] px-5 py-3 text-xs font-medium text-gray-500">
          <div className="flex items-center justify-between">
            <span>
              Son <span className="font-semibold text-gray-700">{Math.min(events.length, 6)}</span> hareket gösteriliyor
            </span>
            <span className="text-[var(--admin-accent)]">Otomatik güncelleniyor</span>
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}
