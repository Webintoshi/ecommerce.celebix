"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DiscountForm } from "@/components/admin/discount-form";
import { AdminDiscountPayload } from "@/types/discount";
import { useState } from "react";

export default function NewDiscountPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const createDiscount = async (payload: AdminDiscountPayload) => {
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discount: payload }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result?.error || "İndirim oluşturulamadı.");
      }

      router.push("/admin/indirimler");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "İndirim oluşturulamadı.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f6efe7] px-4 py-6 md:px-8 md:py-8">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 right-[-5rem] h-80 w-80 rounded-full bg-[#FE6100]/10 blur-3xl" />
        <div className="absolute left-[-4rem] top-1/3 h-72 w-72 rounded-full bg-amber-200/20 blur-3xl" />
        <div className="absolute bottom-[-6rem] right-1/4 h-72 w-72 rounded-full bg-rose-100/20 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl space-y-6">
        <section className="relative overflow-hidden rounded-[32px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdf9] to-[#f8efe6] p-6 shadow-[0_24px_80px_rgba(120,74,32,0.10)] md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-4">
              <div className="inline-flex w-fit items-center rounded-full border border-[#FE6100]/18 bg-gradient-to-r from-[#FE6100]/10 to-[#FFB067]/10 px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#C54E00]">
                Yeni indirim
              </div>
              <div>
                <p className="max-w-2xl text-sm leading-6 text-[#7d6959] md:text-base">
                  Kupon kodunu, kampanya kurallarını ve erişim detaylarını aynı akışta tanımlayın.
                </p>
              </div>
            </div>

            <Link
              href="/admin/indirimler"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#eadccd] bg-white px-4 py-3 text-sm font-medium text-[#7b6656] shadow-sm transition-all hover:border-[#FE6100]/25 hover:bg-[#fff8f1] hover:text-[#C54E00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
            >
              <ArrowLeft className="h-4 w-4" />
              İndirimlere Dön
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-[24px] border border-white/70 bg-gradient-to-r from-[#FE6100]/10 via-[#FFB067]/10 to-[#eadccd] shadow-inner md:grid-cols-3">
            <div className="bg-white/80 px-5 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Akış</p>
              <p className="mt-1 text-sm font-semibold text-[#2f241d]">4 adımlı kurulum</p>
            </div>
            <div className="bg-white/80 px-5 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Tema</p>
              <p className="mt-1 text-sm font-semibold text-[#2f241d]">Warm premium admin</p>
            </div>
            <div className="bg-white/80 px-5 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Durum</p>
              <p className="mt-1 text-sm font-semibold text-[#2f241d]">{submitting ? "Kaydediliyor" : "Taslak hazırlanıyor"}</p>
            </div>
          </div>

          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#FE6100]/10 blur-3xl" />
        </section>

        <DiscountForm submitLabel="İndirimi Oluştur" submitting={submitting} onSubmit={createDiscount} />
      </div>
    </main>
  );
}
