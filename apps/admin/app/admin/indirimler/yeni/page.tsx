"use client";

import { useRouter } from "next/navigation";
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
    <main className="admin-page-root px-4 py-6 md:px-8 md:py-8">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="hidden" />
        <div className="hidden" />
        <div className="hidden" />
      </div>

      <div className="relative mx-auto max-w-6xl space-y-6">
        <section className="relative overflow-hidden rounded-[32px] border border-[var(--admin-border)] bg-white p-6 shadow-[var(--shadow-md)] md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-4">
              <div className="inline-flex w-fit items-center rounded-full border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--admin-accent-hover)]">
                Yeni indirim
              </div>
              <div>
                <p className="max-w-2xl text-sm leading-6 text-[#7d6959] md:text-base">
                  Kupon kodunu, kampanya kurallarını ve erişim detaylarını aynı akışta tanımlayın.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-[24px] border border-white/70 bg-[#EEF1F4] shadow-inner md:grid-cols-3">
            <div className="bg-white/80 px-5 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Akış</p>
              <p className="mt-1 text-sm font-semibold text-[var(--admin-heading)]">4 adımlı kurulum</p>
            </div>
            <div className="bg-white/80 px-5 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Tema</p>
              <p className="mt-1 text-sm font-semibold text-[var(--admin-heading)]">Standart</p>
            </div>
            <div className="bg-white/80 px-5 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Durum</p>
              <p className="mt-1 text-sm font-semibold text-[var(--admin-heading)]">{submitting ? "Kaydediliyor" : "Taslak hazırlanıyor"}</p>
            </div>
          </div>

          <div className="hidden" />
        </section>

        <DiscountForm submitLabel="İndirimi Oluştur" submitting={submitting} onSubmit={createDiscount} />
      </div>
    </main>
  );
}
