"use client";

import { useMemo, useState } from "react";
import type { ElementType } from "react";
import {
  ShoppingCart,
  Eye,
  CreditCard,
  CheckCircle,
  Search,
  MousePointer,
  Zap,
  TrendingUp,
  Heart,
  Share2,
  Filter,
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
    color: "text-[#FE6100]",
    bgColor: "bg-[#FE6100]/10",
  },
  remove_from_cart: {
    icon: ShoppingCart,
    label: "Sepetten çıkarıldı",
    color: "text-rose-600",
    bgColor: "bg-rose-50",
  },
  view_product: {
    icon: Eye,
    label: "Ürün görüntülendi",
    color: "text-[#2B2B2B]",
    bgColor: "bg-[#2B2B2B]/6",
  },
  checkout_start: {
    icon: CreditCard,
    label: "Ödeme başladı",
    color: "text-[#FE6100]",
    bgColor: "bg-[#FE6100]/10",
  },
  checkout_step: {
    icon: CreditCard,
    label: "Ödeme adımı",
    color: "text-[#2B2B2B]",
    bgColor: "bg-[#F2F1F8]",
  },
  purchase: {
    icon: CheckCircle,
    label: "Satın alma",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
  },
  search: {
    icon: Search,
    label: "Arama yapıldı",
    color: "text-[#C74C00]",
    bgColor: "bg-amber-50",
  },
  click: {
    icon: MousePointer,
    label: "Tıklama",
    color: "text-[#2B2B2B]/70",
    bgColor: "bg-[#2B2B2B]/6",
  },
  wishlist_add: {
    icon: Heart,
    label: "Favorilere eklendi",
    color: "text-rose-600",
    bgColor: "bg-rose-50",
  },
  share: {
    icon: Share2,
    label: "Paylaşıldı",
    color: "text-[#2B2B2B]",
    bgColor: "bg-[#F2F1F8]",
  },
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60) return "şimdi";
  if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  return `${Math.floor(diff / 86400)}g`;
}

function formatPageUrl(url: string): string {
  if (url === "/" || url === "") return "Ana Sayfa";
  if (url.startsWith("/urun/")) {
    const slug = url.replace("/urun/", "");
    return slug.split("-").slice(0, 3).join(" ");
  }
  if (url.startsWith("/kategori/")) {
    return "Kategori: " + url.replace("/kategori/", "").replace(/-/g, " ");
  }
  return url.length > 25 ? url.slice(0, 25) + "..." : url;
}

function getEventValue(event: LiveAnalyticsEvent): string {
  const data = event.data || {};

  if (data.productName) {
    const name = String(data.productName);
    return name.length > 20 ? `${name.slice(0, 20)}...` : name;
  }
  if (data.query) return `"${String(data.query)}"`;
  if (data.amount) return `₺${Number(data.amount).toLocaleString("tr-TR")}`;
  if (data.value) return `₺${Number(data.value).toLocaleString("tr-TR")}`;

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
    <div className="overflow-hidden rounded-[26px] border border-[#2B2B2B]/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(255,255,255,0.82))] shadow-[0_18px_50px_rgba(43,43,43,0.06)] backdrop-blur">
      <div className="flex items-center justify-between border-b border-[#2B2B2B]/7 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#FE6100]/10 text-[#FE6100]">
            <Zap className="h-[18px] w-[18px]" />
          </div>
          <h3 className="font-semibold text-[#2B2B2B]">Anlık Aktivite</h3>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#FE6100]/12 bg-[#FE6100]/8 px-3 py-1 text-xs font-medium text-[#C74C00]">
          <span className="h-2 w-2 rounded-full bg-[#FE6100]" />
          Canlı
        </div>
      </div>

      {eventTypes.length > 0 ? (
        <div className="border-b border-[#2B2B2B]/7 px-4 py-3">
          <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setFilter(null)}
              className={cn(
                "flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                filter === null
                  ? "border-[#2B2B2B] bg-[#2B2B2B] text-white"
                  : "border-[#2B2B2B]/8 bg-white/72 text-[#2B2B2B]/62 hover:border-[#FE6100]/16 hover:text-[#FE6100]"
              )}
            >
              Tümü
            </button>
            {eventTypes.slice(0, 4).map((type) => {
              const config = EVENT_CONFIGS[type];
              if (!config) return null;
              const Icon = config.icon;

              return (
                <button
                  key={type}
                  onClick={() => setFilter(filter === type ? null : type)}
                  className={cn(
                    "flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                    filter === type
                      ? "border-[#FE6100]/18 bg-[#FE6100]/10 text-[#C74C00]"
                      : "border-[#2B2B2B]/8 bg-white/72 text-[#2B2B2B]/62 hover:border-[#FE6100]/16 hover:text-[#FE6100]"
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {config.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="max-h-[320px] overflow-y-auto">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#F2F1F8] text-[#2B2B2B]/34">
              <TrendingUp className="h-8 w-8" />
            </div>
            <p className="text-[#2B2B2B]/58">Henüz aktivite yok</p>
            <p className="mt-1 text-xs text-[#2B2B2B]/36">Kısa süre içinde burada görünecek</p>
          </div>
        ) : (
          <div className="divide-y divide-[#2B2B2B]/6">
            <AnimatePresence mode="popLayout">
              {filteredEvents.map((event, index) => {
                const config = EVENT_CONFIGS[event.type] || {
                  icon: Eye,
                  label: event.type,
                  color: "text-[#2B2B2B]/72",
                  bgColor: "bg-[#2B2B2B]/6",
                };
                const Icon = config.icon;
                const eventValue = getEventValue(event);

                return (
                  <motion.div
                    key={`${event.createdAt}-${index}`}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3, delay: index * 0.03 }}
                    className="group flex items-start gap-3 px-4 py-4 transition-colors hover:bg-white/58"
                  >
                    <div
                      className={cn(
                        "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl",
                        config.bgColor
                      )}
                    >
                      <Icon className={cn("h-5 w-5", config.color)} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[#2B2B2B]">{config.label}</span>
                        {eventValue ? (
                          <span className="truncate text-sm text-[#2B2B2B]/58">{eventValue}</span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[#2B2B2B]/40">
                        {formatPageUrl(event.pageUrl)}
                      </p>
                    </div>

                    <span className="flex-shrink-0 text-xs font-medium text-[#2B2B2B]/38">
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
        <div className="border-t border-[#2B2B2B]/7 bg-[#F2F1F8]/55 px-4 py-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#2B2B2B]/52">
              Son <span className="font-medium text-[#2B2B2B]">{events.length}</span> etkinlik
            </span>
            <div className="flex items-center gap-1.5 text-[#2B2B2B]/52">
              <Filter className="h-3 w-3 text-[#FE6100]" />
              <span>Otomatik güncelleniyor</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
