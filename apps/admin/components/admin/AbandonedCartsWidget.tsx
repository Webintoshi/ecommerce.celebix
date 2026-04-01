"use client";

import { useEffect, useState } from "react";
import {
  ShoppingCart,
  TrendingUp,
  AlertTriangle,
  Clock,
  DollarSign,
  ArrowRight,
  Users,
  Zap,
  Target,
} from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
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

  return <span>{displayValue.toLocaleString("tr-TR")}</span>;
}

export default function AbandonedCartsWidget({ data }: { data: LiveAnalyticsSnapshot }) {
  const abandoned = data.abandonedCarts || { count: 0, total: 0 };
  const today = data.today || { addToCart: 0, purchases: 0 };
  const conversionRate =
    today.addToCart > 0 ? Math.round((today.purchases / today.addToCart) * 100) : 0;

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200/60">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-white">
            <ShoppingCart className="h-4 w-4" />
          </div>
          <h3 className="font-semibold text-gray-900">Yarim Kalan Sepetler</h3>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1">
          <Clock className="h-3 w-3 text-gray-500" />
          <span className="text-xs font-medium text-gray-600">24s</span>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-2 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 p-4 transition-all duration-200 hover:shadow-md"
          >
            <div className="absolute -right-2 -top-2 h-16 w-16 rounded-full bg-orange-200/30 blur-2xl" />

            <div className="relative">
              <div className="mb-2 flex items-center gap-1.5 text-amber-700">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Terk Edilen</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                <AnimatedNumber value={abandoned.count} />
              </div>
              <div className="mt-1 text-xs text-gray-500">sepet</div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-rose-50 to-pink-50 p-4 transition-all duration-200 hover:shadow-md"
          >
            <div className="absolute -right-2 -top-2 h-16 w-16 rounded-full bg-rose-200/30 blur-2xl" />

            <div className="relative">
              <div className="mb-2 flex items-center gap-1.5 text-rose-700">
                <DollarSign className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Kayip Deger</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                ₺<AnimatedNumber value={abandoned.total} />
              </div>
              <div className="mt-1 text-xs text-gray-500">potansiyel satis</div>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-4 rounded-xl bg-gray-50 p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Target className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Bugunku Donusum</span>
            </div>
            <div
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                conversionRate >= 30
                  ? "bg-emerald-100 text-emerald-700"
                  : conversionRate >= 15
                    ? "bg-amber-100 text-amber-700"
                    : "bg-rose-100 text-rose-700"
              )}
            >
              <TrendingUp className="h-3 w-3" />
              %{conversionRate}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 font-medium text-gray-600">
                  <Zap className="h-3 w-3 text-amber-500" />
                  Sepete Ekleme
                </span>
                <span className="font-semibold text-gray-900">{today.addToCart}</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 font-medium text-gray-600">
                  <Users className="h-3 w-3 text-emerald-500" />
                  Satin Alma
                </span>
                <span className="font-semibold text-gray-900">{today.purchases}</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${conversionRate}%` }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
                />
              </div>
            </div>
          </div>

          {abandoned.count > 0 ? (
            <Link
              href="/admin/siparisler/sepet-terk"
              className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-95"
            >
              Sepetleri Kurtar
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
        </motion.div>
      </div>
    </div>
  );
}
