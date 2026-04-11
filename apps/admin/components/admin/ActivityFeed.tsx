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
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
  remove_from_cart: {
    icon: ShoppingCart,
    label: "Sepetten çıkarıldı",
    color: "text-red-600",
    bgColor: "bg-red-100",
  },
  view_product: {
    icon: Eye,
    label: "Görüntülendi",
    color: "text-gray-600",
    bgColor: "bg-gray-100",
  },
  checkout_start: {
    icon: CreditCard,
    label: "Ödeme başladı",
    color: "text-purple-600",
    bgColor: "bg-purple-100",
  },
  purchase: {
    icon: CheckCircle,
    label: "Satın alma",
    color: "text-green-600",
    bgColor: "bg-green-100",
  },
  search: {
    icon: Search,
    label: "Arama",
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
  },
  click: {
    icon: MousePointer,
    label: "Tıklama",
    color: "text-gray-500",
    bgColor: "bg-gray-100",
  },
  wishlist_add: {
    icon: Heart,
    label: "Favori",
    color: "text-pink-600",
    bgColor: "bg-pink-100",
  },
  share: {
    icon: Share2,
    label: "Paylaşım",
    color: "text-cyan-600",
    bgColor: "bg-cyan-100",
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
  if (url.length > 20) return url.slice(0, 20) + "...";
  return url;
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
    <div className="rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] border border-gray-200/60 overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100/80 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <Zap className="h-5 w-5 text-gray-400" />
          <h3 className="font-semibold text-gray-900">Aktivite</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-medium text-gray-500">Canlı</span>
        </div>
      </div>

      {eventTypes.length > 0 && (
        <div className="border-b border-gray-100/80 px-5 py-3">
          <div className="flex items-center gap-2 overflow-x-auto">
            <button
              onClick={() => setFilter(null)}
              className={cn(
                "flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                filter === null
                  ? "bg-gray-900 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              Tümü
            </button>
            {eventTypes.slice(0, 5).map((type) => {
              const config = EVENT_CONFIGS[type];
              if (!config) return null;
              const Icon = config.icon;

              return (
                <button
                  key={type}
                  onClick={() => setFilter(filter === type ? null : type)}
                  className={cn(
                    "flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                    filter === type
                      ? "bg-gray-900 text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {config.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="max-h-[320px] overflow-y-auto">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <TrendingUp className="h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-500">Henüz aktivite yok</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100/80">
            <AnimatePresence mode="popLayout">
              {filteredEvents.slice(0, 6).map((event, index) => {
                const config = EVENT_CONFIGS[event.type] || {
                  icon: Eye,
                  label: event.type,
                  color: "text-gray-500",
                  bgColor: "bg-gray-100",
                };
                const Icon = config.icon;

                return (
                  <motion.div
                    key={`${event.createdAt}-${index}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2, delay: index * 0.02 }}
                    className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-gray-50/80 transition-colors"
                  >
                    <div
                      className={cn(
                        "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl",
                        config.bgColor
                      )}
                    >
                      <Icon className={cn("h-4 w-4", config.color)} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">{config.label}</p>
                      <p className="text-xs text-gray-500 font-medium">{formatPageUrl(event.pageUrl)}</p>
                    </div>

                    <span className="text-xs font-medium text-gray-400">{formatTimeAgo(event.createdAt)}</span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {events.length > 0 && (
        <div className="flex items-center justify-between border-t border-gray-100/80 bg-gray-50/50 px-5 py-3 text-xs font-medium text-gray-500">
          <span>
            Son <span className="font-semibold text-gray-700">{Math.min(events.length, 6)}</span> etkinlik
          </span>
          <span className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5" />
            Güncel
          </span>
        </div>
      )}
    </div>
  );
}
