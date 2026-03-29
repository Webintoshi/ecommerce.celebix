"use client";

import { useState, useEffect } from "react";
import {
  Users,
  Monitor,
  Smartphone,
  Tablet,
  AlertCircle,
  RefreshCw,
  Bot,
  Globe,
  Activity,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface LiveData {
  liveVisitors: number;
  devices: {
    mobile: number;
    desktop: number;
    tablet: number;
  };
  topPages: Array<{ url: string; count: number }>;
}

const BOT_USER_AGENTS = [
  "bot",
  "spider",
  "crawler",
  "googlebot",
  "bingbot",
  "yandex",
  "duckduckbot",
  "facebookexternalhit",
  "twitterbot",
  "linkedinbot",
  "slackbot",
  "telegrambot",
  "applebot",
  "semrush",
  "ahrefs",
  "mj12bot",
  "dotbot",
  "rogerbot",
  "screaming frog",
];

function isBot(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some((bot) => ua.includes(bot));
}

function AnimatedNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 600;
    const steps = 20;
    const increment = value / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current = Math.min(Math.round(increment * step), value);
      setDisplayValue(current);
      if (step >= steps) clearInterval(timer);
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  return <span>{displayValue}</span>;
}

export default function LiveVisitors() {
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchLiveData = async () => {
    try {
      const res = await fetch("/api/analytics/live");
      const json = await res.json();

      if (json.success && json.data) {
        const rawData = json.data;

        const filteredData = {
          liveVisitors: rawData.liveVisitors || 0,
          devices: rawData.devices || { mobile: 0, desktop: 0, tablet: 0 },
          topPages: rawData.topPages || [],
        };

        setData(filteredData);
        setLastUpdate(new Date());
        setError(null);
      } else {
        setError(json.error || "Veri alınamadı");
      }
    } catch (err) {
      console.error("Failed to fetch live data:", err);
      setError("Bağlantı hatası");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveData();
    const interval = setInterval(fetchLiveData, 20000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200/60">
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-gray-200 animate-pulse" />
            <div className="h-5 w-32 rounded bg-gray-200 animate-pulse" />
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="h-12 w-24 rounded bg-gray-200 animate-pulse" />
            <div className="h-6 w-16 rounded-full bg-gray-200 animate-pulse" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-2 text-center">
                <div className="mx-auto h-8 w-8 rounded bg-gray-200 animate-pulse" />
                <div className="mx-auto h-6 w-8 rounded bg-gray-200 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200/60">
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-gray-400" />
            <h3 className="font-semibold text-gray-900">Anlık Ziyaretçiler</h3>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center p-8 gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-50">
            <AlertCircle className="h-8 w-8 text-rose-500" />
          </div>
          <span className="text-gray-500">{error}</span>
          <button
            onClick={() => {
              setLoading(true);
              fetchLiveData();
            }}
            className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-95"
          >
            <RefreshCw className="h-4 w-4" />
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  const totalDevices =
    (data?.devices?.mobile || 0) +
    (data?.devices?.desktop || 0) +
    (data?.devices?.tablet || 0);

  const deviceStats = [
    {
      icon: Smartphone,
      label: "Mobil",
      value: data?.devices?.mobile || 0,
      color: "text-violet-500",
      bgColor: "bg-violet-50",
    },
    {
      icon: Monitor,
      label: "Desktop",
      value: data?.devices?.desktop || 0,
      color: "text-blue-500",
      bgColor: "bg-blue-50",
    },
    {
      icon: Tablet,
      label: "Tablet",
      value: data?.devices?.tablet || 0,
      color: "text-amber-500",
      bgColor: "bg-amber-50",
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200/60">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 text-white">
            <Globe className="h-4 w-4" />
          </div>
          <h3 className="font-semibold text-gray-900">Anlık Ziyaretçiler</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-medium text-emerald-600">Canlı</span>
        </div>
      </div>

      <div className="p-6">
        {/* Main Counter */}
        <div className="mb-6 flex items-end justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold tracking-tight text-gray-900">
                <AnimatedNumber value={data?.liveVisitors || 0} />
              </span>
              <span className="text-lg font-medium text-gray-500">kişi</span>
            </div>
            <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
              <Bot className="h-3 w-3" />
              Bot'lar filtrelendi
            </p>
          </div>
          
          {/* Activity Indicator */}
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5">
            <Activity className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-xs font-medium text-emerald-700">
              {lastUpdate.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>

        {/* Device Breakdown */}
        <div className="grid grid-cols-3 gap-3">
          {deviceStats.map((stat) => (
            <div
              key={stat.label}
              className="group relative overflow-hidden rounded-xl bg-gray-50 p-3 transition-all duration-200 hover:bg-gray-100"
            >
              <div className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110",
                    stat.bgColor
                  )}
                >
                  <stat.icon className={cn("h-5 w-5", stat.color)} />
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-900">{stat.value}</div>
                  <div className="text-xs font-medium text-gray-500">{stat.label}</div>
                </div>
              </div>
              
              {/* Progress bar */}
              {totalDevices > 0 && (
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-200">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(stat.value / totalDevices) * 100}%` }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className={cn("h-full rounded-full", stat.color.replace("text-", "bg-"))}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Top Pages */}
        {data?.topPages && data.topPages.length > 0 && (
          <div className="mt-6 border-t border-gray-100 pt-4">
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <Activity className="h-3.5 w-3.5" />
              Aktif Sayfalar
            </h4>
            <div className="space-y-2">
              <AnimatePresence>
                {data.topPages.slice(0, 4).map((page, i) => (
                  <motion.div
                    key={page.url}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                    className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-gray-100 text-xs font-medium text-gray-600">
                        {i + 1}
                      </div>
                      <span className="truncate text-sm font-medium text-gray-700">
                        {page.url === "/" ? "Ana Sayfa" : page.url}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50">
                        <Users className="h-2.5 w-2.5 text-emerald-600" />
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{page.count}</span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
