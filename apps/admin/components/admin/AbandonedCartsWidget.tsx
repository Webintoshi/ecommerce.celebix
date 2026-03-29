"use client";

import { useState, useEffect } from "react";
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
import { cn } from "@/lib/utils";

interface AbandonedData {
  count: number;
  total: number;
}

interface TodayStats {
  addToCart: number;
  purchases: number;
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

  return <span>{displayValue.toLocaleString("tr-TR")}</span>;
}

export default function AbandonedCartsWidget() {
  const [abandoned, setAbandoned] = useState<AbandonedData>({ count: 0, total: 0 });
  const [today, setToday] = useState<TodayStats>({ addToCart: 0, purchases: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/analytics/live");
        const json = await res.json();
        if (json.success) {
          setAbandoned(json.data.abandonedCarts);
          setToday(json.data.today);
        }
      } catch (error) {
        console.error("Failed to fetch abandoned carts:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const conversionRate = today.addToCart > 0 ? Math.round((today.purchases / today.addToCart) * 100) : 0;
  const recoveryRate = 100 - conversionRate;

  if (loading) {
    return (
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200/60">
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-gray-200 animate-pulse" />
            <div className="h-5 w-32 rounded bg-gray-200 animate-pulse" />
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
          <div className="h-16 rounded-xl bg-gray-100 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200/60">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-white">
            <ShoppingCart className="h-4 w-4" />
          </div>
          <h3 className="font-semibold text-gray-900">Yarım Kalan Sepetler</h3>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1">
          <Clock className="h-3 w-3 text-gray-500" />
          <span className="text-xs font-medium text-gray-600">24s</span>
        </div>
      </div>

      <div className="p-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Abandoned Count */}
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

          {/* Lost Value */}
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
                <span className="text-xs font-semibold uppercase tracking-wider">Kayıp Değer</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                ₺<AnimatedNumber value={abandoned.total} />
              </div>
              <div className="mt-1 text-xs text-gray-500">potansiyel satış</div>
            </div>
          </motion.div>
        </div>

        {/* Conversion Funnel */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-4 rounded-xl bg-gray-50 p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Target className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Bugünkü Dönüşüm</span>
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

          {/* Progress Bars */}
          <div className="space-y-3">
            {/* Add to Cart */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-gray-600 flex items-center gap-1">
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

            {/* Purchases */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-gray-600 flex items-center gap-1">
                  <Users className="h-3 w-3 text-emerald-500" />
                  Satın Alma
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

          {/* Recovery CTA */}
          {abandoned.count > 0 && (
            <Link
              href="/admin/siparisler/sepet-terk"
              className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-95"
            >
              Sepetleri Kurtar
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </motion.div>
      </div>
    </div>
  );
}
