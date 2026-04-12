"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  DollarSign,
  ShoppingCart,
  Target,
  TrendingUp,
  Users,
  Zap,
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
      step += 1;
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
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_24px_80px_rgba(254,97,0,0.1)]"
    >
      <div className="border-b border-[#FE6100]/8 px-6 py-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FE6100]">
              Sepet Performansı
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-gray-950">
              Yarım Kalan Sepetler
            </h3>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FE6100]/12 bg-gradient-to-r from-[#fff4ea] to-white px-3 py-1.5 text-xs font-semibold text-[#FE6100]">
            <ShoppingCart className="h-3.5 w-3.5" />
            Son 24 saat
          </div>
        </div>
      </div>

      <div className="space-y-5 p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-[24px] border border-rose-200/60 bg-gradient-to-br from-rose-50 via-pink-50/70 to-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
              Terk Edilen Sepet
            </p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-gray-950">
              <AnimatedNumber value={abandoned.count} />
            </p>
            <p className="mt-1 text-sm text-gray-600">Geri kazanım bekleyen sepet</p>
          </div>

          <div className="rounded-[24px] border border-[#FE6100]/15 bg-gradient-to-br from-[#fff3e9] via-[#fffaf6] to-white p-4">
            <div className="flex items-center gap-2 text-[#FE6100]">
              <DollarSign className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">Kayıp Gelir</p>
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-gray-950">
              ₺<AnimatedNumber value={abandoned.total} />
            </p>
            <p className="mt-1 text-sm text-gray-600">Potansiyel geri kazanım hacmi</p>
          </div>
        </div>

        <div className="rounded-[24px] border border-[#FE6100]/10 bg-gradient-to-b from-[#fff7f1] to-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[#FE6100]/70">Bugünkü dönüşüm</p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[#FE6100]">
                %{conversionRate}
              </p>
            </div>
            <div
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold",
                conversionRate >= 30
                  ? "border-emerald-200 bg-gradient-to-r from-emerald-100 to-teal-50 text-emerald-700"
                  : conversionRate >= 15
                    ? "border-amber-200 bg-gradient-to-r from-amber-100 to-orange-50 text-amber-700"
                    : "border-rose-200 bg-gradient-to-r from-rose-100 to-pink-50 text-rose-700"
              )}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              %{conversionRate} oran
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-medium text-gray-600">
                  <Zap className="h-3.5 w-3.5 text-[#FE6100]" />
                  Sepete ekleme
                </span>
                <span className="font-semibold text-[#FE6100]">{today.addToCart.toLocaleString("tr-TR")}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-gray-200">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-[#FE6100]"
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-medium text-gray-600">
                  <Users className="h-3.5 w-3.5 text-emerald-600" />
                  Satın alma
                </span>
                <span className="font-semibold text-emerald-700">
                  {today.purchases.toLocaleString("tr-TR")}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-gray-200">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(6, conversionRate)}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-gray-700">
            <Target className="h-4 w-4 text-[#FE6100]" />
            <p className="text-sm font-semibold">Önerilen aksiyon</p>
          </div>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            Sepeti terk eden kullanıcıları geri kazanmak için son 24 saatteki davranışları takip edin ve
            hızlı aksiyon alın.
          </p>

          {abandoned.count > 0 ? (
            <Link
              href="/admin/siparisler/sepet-terk"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[22px] bg-gradient-to-r from-[#FE6100] to-[#E85A00] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(254,97,0,0.22)] transition-all hover:from-[#E85A00] hover:to-[#D94F00]"
            >
              Sepetleri İncele
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
