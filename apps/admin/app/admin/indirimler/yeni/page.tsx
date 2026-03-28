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
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/indirimler" className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Yeni İndirim Oluştur</h1>
            <p className="text-sm text-gray-500 mt-1">Kupon kodunu ve kampanya kurallarını belirleyin.</p>
          </div>
        </div>

        <DiscountForm submitLabel="İndirimi Oluştur" submitting={submitting} onSubmit={createDiscount} />
      </div>
    </div>
  );
}

