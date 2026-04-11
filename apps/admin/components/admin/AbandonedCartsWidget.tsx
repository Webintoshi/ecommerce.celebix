"use client";

import { useEffect, useState } from "react";
import {
  ShoppingCart,
  TrendingUp,
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

  return <span>{displayValue.toLocaleString("tr-TR")}</span>;
}

export default function AbandonedCartsWidget({ data }: { data: LiveAnalyticsSnapshot }) {
  const abandoned = data.abandonedCarts || { count: 0, total: 0 };
  const today = data.today || { addToCart: 0, purchases: 0 };
  const conversionRate =
    today.addToCart > 0 ? Math.round((today.purchases / today.addToCart) * 100) : 0;

  return (
    <div className="rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] border border-gray-200/60 overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100/80 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <ShoppingCart className="h-5 w-5 text-gray-400" />
          <h3 className="font-semibold text-gray-900">Sepetler</h3>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
          <Clock className="h-3 w-3" />
          <span>24s</span>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-red-50/80 border border-red-100/50 p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>Terk Edilen</span>
            </div>
            <div className="mt-2 text-2xl font-semibold text-gray-900 tracking-tight">
              <AnimatedNumber value={abandoned.count} />
            </div>
            <div className="text-xs font-medium text-gray-500 mt-0.5">sepet</div>
          </div>

          <div className="rounded-xl bg-orange-50/80 border border-orange-100/50 p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-600">
              <DollarSign className="h-3.5 w-3.5" />
              <span>Kayıp</span>
            </div>
            <div className="mt-2 text-2xl font-semibold text-gray-900 tracking-tight">
              ₺<AnimatedNumber value={abandoned.total} />
            </div>
            <div className="text-xs font-medium text-gray-500 mt-0.5">potansiyel</div>
          </div>
        </div>

        <div className="mt-5 rounded-xl bg-gray-50/80 border border-gray-100 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Target className="h-4 w-4 text-gray-400" />
              <span>Dönüşüm</span>
            </div>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-semibold",
                conversionRate >= 30
                  ? "bg-green-100 text-green-700"
                  : conversionRate >= 15
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-red-100 text-red-700"
              )}
            >
              <TrendingUp className="mr-1 inline h-3 w-3" />
              %{conversionRate}
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-gray-600">
                <span className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5" />
                  Sepete Ekleme
                </span>
                <span className="text-gray-900 font-semibold">{today.addToCart}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200/70 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  className="h-full rounded-full bg-gray-400"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-gray-600">
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Satın Alma
                </span>
                <span className="text-gray-900 font-semibold">{today.purchases}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200/70 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${conversionRate}%` }}
                  className="h-full rounded-full bg-green-500"
                />
              </div>
            </div>
          </div>
        </div>

        {abandoned.count > 0 && (
          <Link
            href="/admin/siparisler/sepet-terk"
            className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white transition-all hover:bg-gray-800 hover:shadow-md"
          >
            Sepetleri Kurtar
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
