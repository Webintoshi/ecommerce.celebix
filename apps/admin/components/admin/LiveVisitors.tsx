"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Activity,
} from "lucide-react";
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
    { icon: Smartphone, label: "Mobil", value: data.devices?.mobile || 0 },
    { icon: Monitor, label: "Desktop", value: data.devices?.desktop || 0 },
    { icon: Tablet, label: "Tablet", value: data.devices?.tablet || 0 },
  ];

  return (
    <div className="rounded-xl bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-gray-400" />
          <h3 className="font-medium text-gray-900">Canlı Ziyaretçiler</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-xs text-gray-500">Canlı</span>
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-end gap-2">
          <span className="text-4xl font-semibold text-gray-900">
            <AnimatedNumber value={data.liveVisitors || 0} />
          </span>
          <span className="mb-1 text-sm text-gray-500">kişi</span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {deviceStats.map((stat) => (
            <div key={stat.label} className="rounded-lg bg-gray-50 p-3 text-center">
              <stat.icon className="mx-auto h-4 w-4 text-gray-400" />
              <div className="mt-1 text-lg font-medium text-gray-900">{stat.value}</div>
              <div className="text-xs text-gray-500">{stat.label}</div>
            </div>
          ))}
        </div>

        {totalDevices > 0 && (
          <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-gray-100">
            {deviceStats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ width: 0 }}
                animate={{ width: `${(stat.value / totalDevices) * 100}%` }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.05 }}
                className={cn(
                  "h-full",
                  i === 0 ? "bg-gray-400" : i === 1 ? "bg-gray-600" : "bg-gray-300"
                )}
              />
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
          <span>Son güncelleme: {lastUpdate.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>

        {data.topPages && data.topPages.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <h4 className="mb-2 text-xs font-medium text-gray-500">Popüler Sayfalar</h4>
            <div className="space-y-1">
              <AnimatePresence>
                {data.topPages.slice(0, 3).map((page, index) => (
                  <motion.div
                    key={page.url}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-gray-50"
                  >
                    <span className="truncate text-gray-600">
                      {page.url === "/" ? "Ana Sayfa" : page.url}
                    </span>
                    <span className="text-gray-900">{page.count}</span>
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
