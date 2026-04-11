"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Activity,
  Bot,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { LiveAnalyticsSnapshot } from "@/lib/admin-data-types";
import { cn } from "@/lib/utils";

function AnimatedNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 600;
    const steps = 20;
    const increment = value / steps;
    let current = 0;
    let step = 0;

    const timer = window.setInterval(() => {
      step++;
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

export default function LiveVisitors({ data }: { data: LiveAnalyticsSnapshot }) {
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    setLastUpdate(new Date());
  }, [data]);

  const totalDevices =
    (data.devices?.mobile || 0) +
    (data.devices?.desktop || 0) +
    (data.devices?.tablet || 0);

  const deviceStats = [
    {
      icon: Smartphone,
      label: "Mobil",
      value: data.devices?.mobile || 0,
      tone: "bg-[#FE6100]/10 text-[#FE6100]",
      bar: "bg-[#FE6100]",
    },
    {
      icon: Monitor,
      label: "Desktop",
      value: data.devices?.desktop || 0,
      tone: "bg-[#2B2B2B]/8 text-[#2B2B2B]",
      bar: "bg-[#2B2B2B]",
    },
    {
      icon: Tablet,
      label: "Tablet",
      value: data.devices?.tablet || 0,
      tone: "bg-emerald-50 text-emerald-700",
      bar: "bg-emerald-500",
    },
  ];

  return (
    <div className="overflow-hidden rounded-[26px] border border-[#2B2B2B]/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(255,255,255,0.82))] shadow-[0_18px_50px_rgba(43,43,43,0.06)] backdrop-blur">
      <div className="flex items-center justify-between border-b border-[#2B2B2B]/7 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#FE6100]/10 text-[#FE6100]">
            <Globe className="h-[18px] w-[18px]" />
          </div>
          <h3 className="font-semibold text-[#2B2B2B]">Anlık Ziyaretçiler</h3>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#FE6100]/12 bg-[#FE6100]/8 px-3 py-1 text-xs font-medium text-[#C74C00]">
          <span className="h-2 w-2 rounded-full bg-[#FE6100]" />
          Canlı
        </div>
      </div>

      <div className="space-y-6 p-6">
        <div className="rounded-[24px] border border-[#2B2B2B]/6 bg-[linear-gradient(135deg,rgba(242,241,248,0.9),rgba(255,255,255,0.75))] p-5">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-semibold tracking-[-0.06em] text-[#2B2B2B]">
                  <AnimatedNumber value={data.liveVisitors || 0} />
                </span>
                <span className="text-lg font-medium text-[#2B2B2B]/54">kişi</span>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-[#2B2B2B]/42">
                <Bot className="h-3 w-3" />
                Bot'lar filtrelendi
              </p>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-[#2B2B2B]/62 ring-1 ring-[#2B2B2B]/8">
              <Activity className="h-3.5 w-3.5 text-[#FE6100]" />
              {lastUpdate.toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {deviceStats.map((stat) => (
              <div key={stat.label} className="rounded-[20px] bg-white/72 p-3 ring-1 ring-[#2B2B2B]/6">
                <div className="flex flex-col items-center gap-2">
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-2xl", stat.tone)}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-[#2B2B2B]">{stat.value}</div>
                    <div className="text-xs font-medium text-[#2B2B2B]/54">{stat.label}</div>
                  </div>
                </div>

                {totalDevices > 0 ? (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#2B2B2B]/8">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(stat.value / totalDevices) * 100}%` }}
                      transition={{ duration: 0.45, delay: 0.15 }}
                      className={cn("h-full rounded-full", stat.bar)}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {data.topPages && data.topPages.length > 0 ? (
          <div className="border-t border-[#2B2B2B]/7 pt-4">
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#2B2B2B]/48">
              <Activity className="h-3.5 w-3.5 text-[#FE6100]" />
              Aktif Sayfalar
            </h4>
            <div className="space-y-2">
              <AnimatePresence>
                {data.topPages.slice(0, 4).map((page, index) => (
                  <motion.div
                    key={page.url}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className="flex items-center justify-between rounded-[18px] bg-white/65 px-3 py-2.5 ring-1 ring-[#2B2B2B]/6"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-[#F2F1F8] text-xs font-medium text-[#2B2B2B]/62">
                        {index + 1}
                      </div>
                      <span className="truncate text-sm font-medium text-[#2B2B2B]/78">
                        {page.url === "/" ? "Ana Sayfa" : page.url}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#FE6100]/10">
                        <Users className="h-2.5 w-2.5 text-[#FE6100]" />
                      </div>
                      <span className="text-sm font-semibold text-[#2B2B2B]">{page.count}</span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
