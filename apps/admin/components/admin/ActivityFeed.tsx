"use client";

import { useMemo, useState } from "react";
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
  icon: React.ElementType;
  label: string;
  color: string;
  bgColor: string;
}

const EVENT_CONFIGS: Record<string, EventConfig> = {
  add_to_cart: {
    icon: ShoppingCart,
    label: "Sepete eklendi",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  remove_from_cart: {
    icon: ShoppingCart,
    label: "Sepetten cikarildi",
    color: "text-rose-600",
    bgColor: "bg-rose-50",
  },
  view_product: {
    icon: Eye,
    label: "Urun goruntulendi",
    color: "text-gray-600",
    bgColor: "bg-gray-100",
  },
  checkout_start: {
    icon: CreditCard,
    label: "Odeme basladi",
    color: "text-violet-600",
    bgColor: "bg-violet-50",
  },
  checkout_step: {
    icon: CreditCard,
    label: "Odeme adimi",
    color: "text-violet-500",
    bgColor: "bg-violet-50",
  },
  purchase: {
    icon: CheckCircle,
    label: "Satin alma",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
  },
  search: {
    icon: Search,
    label: "Arama yapildi",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
  },
  click: {
    icon: MousePointer,
    label: "Tiklama",
    color: "text-gray-500",
    bgColor: "bg-gray-50",
  },
  wishlist_add: {
    icon: Heart,
    label: "Favorilere eklendi",
    color: "text-rose-600",
    bgColor: "bg-rose-50",
  },
  share: {
    icon: Share2,
    label: "Paylasildi",
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
  },
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60) return "simdi";
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
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200/60">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-yellow-400 to-amber-500 text-white">
            <Zap className="h-4 w-4" />
          </div>
          <h3 className="font-semibold text-gray-900">Anlik Aktivite</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </span>
          <span className="text-xs font-medium text-amber-600">Canli</span>
        </div>
      </div>

      {eventTypes.length > 0 ? (
        <div className="border-b border-gray-100 px-4 py-3">
          <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setFilter(null)}
              className={cn(
                "flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                filter === null
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              Tumu
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
                    "flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                    filter === type
                      ? cn(config.bgColor.replace("bg-", "bg-opacity-100 bg-"), config.color)
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <TrendingUp className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-gray-500">Henuz aktivite yok</p>
            <p className="mt-1 text-xs text-gray-400">Kisa sure icinde burada gorunecek</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            <AnimatePresence mode="popLayout">
              {filteredEvents.map((event, index) => {
                const config = EVENT_CONFIGS[event.type] || {
                  icon: Eye,
                  label: event.type,
                  color: "text-gray-500",
                  bgColor: "bg-gray-100",
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
                    className="group flex items-start gap-3 p-4 transition-colors hover:bg-gray-50"
                  >
                    <div
                      className={cn(
                        "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110",
                        config.bgColor
                      )}
                    >
                      <Icon className={cn("h-5 w-5", config.color)} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{config.label}</span>
                        {eventValue ? (
                          <span className="truncate text-sm text-gray-600">{eventValue}</span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-gray-400">
                        {formatPageUrl(event.pageUrl)}
                      </p>
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
        <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">
              Son <span className="font-medium text-gray-700">{events.length}</span> etkinlik
            </span>
            <div className="flex items-center gap-1.5 text-gray-500">
              <Filter className="h-3 w-3" />
              <span>Otomatik guncelleniyor</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
