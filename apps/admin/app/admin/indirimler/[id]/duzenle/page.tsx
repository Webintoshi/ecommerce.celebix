"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { DiscountForm } from "@/components/admin/discount-form";
import { AdminDiscount, AdminDiscountPayload } from "@/types/discount";

export default function EditDiscountPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id || "");

  const [discount, setDiscount] = useState<AdminDiscount | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDiscount = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/discounts/${id}`, { cache: "no-store" });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result?.error || "İndirim bulunamadı.");
      }

      setDiscount(result.discount as AdminDiscount);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "İndirim yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    loadDiscount();
  }, [id]);

  const saveDiscount = async (payload: AdminDiscountPayload) => {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/discounts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discount: payload }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result?.error || "İndirim güncellenemedi.");
      }

      router.push("/admin/indirimler");
    } catch (saveError) {
      window.alert(saveError instanceof Error ? saveError.message : "İndirim güncellenemedi.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !discount) {
    return (
      <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
        <div className="max-w-4xl mx-auto space-y-4">
          <Link href="/admin/indirimler" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4" />
            İndirim listesine dön
          </Link>
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error || "İndirim bulunamadı."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/indirimler" className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">İndirimi Düzenle</h1>
            <p className="text-sm text-gray-500 mt-1">Kod: {discount.code}</p>
          </div>
        </div>

        <DiscountForm initial={discount} submitLabel="Değişiklikleri Kaydet" submitting={submitting} onSubmit={saveDiscount} />
      </div>
    </div>
  );
}

