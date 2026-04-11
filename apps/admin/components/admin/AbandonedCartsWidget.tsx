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
    <div className="overflow-hidden rounded-[26px] border border-[#2B2B2B]/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(255,255,255,0.82))] shadow-[0_18px_50px_rgba(43,43,43,0.06)] backdrop-blur">
      <div className="flex items-center justify-between border-b border-[#2B2B2B]/7 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#FE6100]/10 text-[#FE6100]">
            <ShoppingCart className="h-[18px] w-[18px]" />
          </div>
          <h3 className="font-semibold text-[#2B2B2B]">Yarım Kalan Sepetler</h3>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[#2B2B2B]/5 px-2.5 py-1 text-xs font-medium text-[#2B2B2B]/62">
          <Clock className="h-3 w-3" />
          24s
        </div>
      </div>

      <div className="space-y-4 p-6">
        <div className="grid grid-cols-2 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="rounded-[22px] border border-amber-200/70 bg-[linear-gradient(180deg,rgba(255,247,237,0.96),rgba(255,255,255,0.86))] p-4"
          >
            <div className="mb-2 flex items-center gap-1.5 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.16em]">Terk Edilen</span>
            </div>
            <div className="text-2xl font-semibold tracking-[-0.04em] text-[#2B2B2B]">
              <AnimatedNumber value={abandoned.count} />
            </div>
            <div className="mt-1 text-xs text-[#2B2B2B]/48">sepet</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="rounded-[22px] border border-[#FE6100]/14 bg-[linear-gradient(180deg,rgba(254,97,0,0.10),rgba(255,255,255,0.86))] p-4"
          >
            <div className="mb-2 flex items-center gap-1.5 text-[#C74C00]">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.16em]">Kayıp Değer</span>
            </div>
            <div className="text-2xl font-semibold tracking-[-0.04em] text-[#2B2B2B]">
              ₺<AnimatedNumber value={abandoned.total} />
            </div>
            <div className="mt-1 text-xs text-[#2B2B2B]/48">potansiyel satış</div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="rounded-[24px] border border-[#2B2B2B]/7 bg-[linear-gradient(180deg,rgba(242,241,248,0.9),rgba(255,255,255,0.74))] p-4"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Target className="h-4 w-4 text-[#FE6100]" />
              <span className="text-sm font-medium text-[#2B2B2B]">Bugünkü Dönüşüm</span>
            </div>
            <div
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                conversionRate >= 30
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : conversionRate >= 15
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
              )}
            >
              <TrendingUp className="h-3 w-3" />
              %{conversionRate}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 font-medium text-[#2B2B2B]/66">
                  <Zap className="h-3 w-3 text-[#FE6100]" />
                  Sepete Ekleme
                </span>
                <span className="font-semibold text-[#2B2B2B]">{today.addToCart}</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#2B2B2B]/8">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                  className="h-full rounded-full bg-[#FE6100]"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 font-medium text-[#2B2B2B]/66">
                  <Users className="h-3 w-3 text-emerald-500" />
                  Satın Alma
                </span>
                <span className="font-semibold text-[#2B2B2B]">{today.purchases}</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#2B2B2B]/8">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${conversionRate}%` }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  className="h-full rounded-full bg-emerald-500"
                />
              </div>
            </div>
          </div>

          {abandoned.count > 0 ? (
            <Link
              href="/admin/siparisler/sepet-terk"
              className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-[#2B2B2B] py-3 text-sm font-medium text-white transition-all hover:bg-[#1f1f1f] active:scale-95"
            >
              Sepetleri Kurtar
              <ArrowRight className="h-4 w-4 text-[#FE6100]" />
            </Link>
          ) : null}
        </motion.div>
      </div>
    </div>
  );
}
