"use client";

import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageShell";
import { DiscountForm } from "@/components/admin/discount-form";
import { AdminDiscountPayload } from "@/types/discount";
import { useState } from "react";

const FORM_ID = "new-discount-form";

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
    <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
      <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
        <AdminPageHeader
          sectionLabel="Pazarlama"
          title="Yeni İndirim"
          actions={
            <button
              type="submit"
              form={FORM_ID}
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.18)] transition hover:bg-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {submitting ? "Kaydediliyor" : "İndirimi Kaydet"}
            </button>
          }
        />

        <DiscountForm
          formId={FORM_ID}
          submitLabel="İndirimi Kaydet"
          submitting={submitting}
          onSubmit={createDiscount}
          hideFooterActions
        />
      </div>
    </main>
  );
}
