"use client";

import { useEffect, useState } from "react";
import { Activity, Globe, Monitor, Smartphone, Tablet, Wifi } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { LiveAnalyticsSnapshot } from "@/lib/admin-data-types";
import { cn } from "@/lib/utils";

function AnimatedNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 500;
    const steps = 20;
    const increment = value / steps;
    let current = 0;
    let step = 0;

    const timer = window.setInterval(() => {
      step += 1;
      current = Math.min(Math.round(increment * step), value);
      setDisplayValue(current);
      if (step >= steps) {
        window.clearInterval(timer);
      }
    }, duration / steps);

    return () => window.clearInterval(timer);
  }, [value]);

  return <span>{displayValue}</span>;
}

function formatLastUpdated(date: Date) {
  return date.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTopPageLabel(url: string) {
  if (!url || url === "/") return "Ana Sayfa";
  return url.length > 24 ? `${url.slice(0, 24)}...` : url;
}

export default function LiveVisitors({ data }: { data: LiveAnalyticsSnapshot }) {
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    setLastUpdate(new Date());
  }, [data]);

  const totalDevices =
    (data.devices?.mobile || 0) +
    (data.devices?.desktop || 0) +
    (data.devices?.tablet || 0);

  const pageViewCount = (data.topPages || []).reduce((total, page) => total + page.count, 0);

  const deviceStats = [
    {
      icon: Smartphone,
      label: "Mobil",
      value: data.devices?.mobile || 0,
      tone: "from-white to-white border-[var(--admin-accent-border)] text-[var(--admin-accent)]",
      bar: "bg-[var(--admin-accent)]",
    },
    {
      icon: Monitor,
      label: "Masaüstü",
      value: data.devices?.desktop || 0,
      tone: "from-slate-50 to-white border-slate-200 text-slate-700",
      bar: "bg-slate-600",
    },
    {
      icon: Tablet,
      label: "Tablet",
      value: data.devices?.tablet || 0,
      tone: "from-emerald-50 to-white border-emerald-200/60 text-emerald-700",
      bar: "bg-emerald-500",
    },
  ];

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
              Canlı Trafik
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-gray-950">
              Anlık Ziyaretçiler
            </h3>
          </div>
          <div
            aria-live="polite"
            className="inline-flex items-center gap-2 rounded-full border border-emerald-200/50 bg-gradient-to-r from-emerald-50 to-teal-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            {lastUpdate ? formatLastUpdated(lastUpdate) : "--:--"}
          </div>
        </div>
      </div>

      <div className="space-y-6 p-6">
        <div className="rounded-[12px] border border-[var(--admin-border)] bg-[var(--admin-accent-soft)] p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[var(--admin-accent)]/70">Çevrim içi kullanıcı</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-5xl font-semibold tracking-[-0.06em] text-[var(--admin-accent)]">
                  <AnimatedNumber value={data.liveVisitors || 0} />
                </span>
                <span className="pb-1 text-sm text-[var(--admin-accent)]/60">aktif</span>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--admin-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--admin-accent)] shadow-sm">
              <Wifi className="h-3.5 w-3.5" />
              Canlı veri açık
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {deviceStats.map((device) => {
            const ratio = totalDevices > 0 ? (device.value / totalDevices) * 100 : 0;
            const Icon = device.icon;

            return (
              <div
                key={device.label}
                className={cn("rounded-[12px] border bg-gradient-to-br p-4", device.tone)}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-white shadow-sm">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-lg font-semibold tracking-[-0.03em] text-gray-950">
                  {device.value}
                </p>
                <p className="text-xs font-medium opacity-70">{device.label}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10">
                  <div className={cn("h-full rounded-full", device.bar)} style={{ width: `${ratio}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-[12px] border border-amber-200/60 bg-gradient-to-br from-amber-50 to-white p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-white text-amber-600 shadow-sm">
              <Activity className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-medium text-gray-600">Toplam görüntüleme</p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-gray-950">
              {pageViewCount.toLocaleString("tr-TR")}
            </p>
          </div>

          <div className="rounded-[12px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-white text-slate-600 shadow-sm">
              <Globe className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-medium text-gray-600">Aktif sayfa</p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-gray-950">
              {(data.topPages?.length || 0).toLocaleString("tr-TR")}
            </p>
          </div>
        </div>

        <div className="rounded-[12px] border border-[var(--admin-border)] bg-gradient-to-b from-[#fff8f3] to-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--admin-accent)]">Öne Çıkan Sayfalar</p>
            <p className="text-xs font-medium text-[var(--admin-accent)]/50">Top 3</p>
          </div>

          {data.topPages && data.topPages.length > 0 ? (
            <div className="space-y-2">
              <AnimatePresence>
                {data.topPages.slice(0, 3).map((page, index) => (
                  <motion.div
                    key={page.url}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.04 }}
                    className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--admin-border)] bg-white px-3 py-3 shadow-sm"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--admin-accent-soft)] text-xs font-semibold text-[var(--admin-accent)]">
                        {index + 1}
                      </div>
                      <span title={page.url} className="truncate text-sm font-medium text-gray-700">
                        {formatTopPageLabel(page.url)}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-[var(--admin-accent)]">{page.count}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="rounded-[8px] border border-dashed border-[var(--admin-accent-border)] bg-white/70 px-4 py-5 text-center text-sm text-gray-500">
              Canlı sayfa verisi şu anda görüntülenemiyor.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
