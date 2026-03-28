"use client";

import { useState } from "react";
import { Trash2, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";

interface OrderDangerZoneProps {
  orderId: string;
  orderNumber: string;
  className?: string;
}

export function OrderDangerZone({
  orderId,
  orderNumber,
  className = "",
}: OrderDangerZoneProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDelete = async () => {
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        router.push("/admin/siparisler");
      } else {
        const error = await response.json();
        alert(error.error || "Sipariş silinirken bir hata oluştu.");
        setShowConfirm(false);
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("Sipariş silinirken bir hata oluştu.");
      setShowConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={`bg-red-50 rounded-3xl border-2 border-red-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-red-200">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <h3 className="text-base font-bold text-red-900">
            Tehlikeli Bölüm
          </h3>
        </div>
        <p className="text-sm text-red-700 mt-1">
          Bu işlemler geri alınamaz
        </p>
      </div>

      {/* Delete Section */}
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="font-bold text-red-900">Siparişi Sil</p>
            <p className="text-sm text-red-700 mt-1">
              Bu siparişi kalıcı olarak silmek istediğinizden emin misiniz?
              Bu işlem geri alınamaz ve tüm sipariş verileri kaybolacaktır.
            </p>
          </div>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className={`
              px-4 py-2 rounded-xl font-bold text-sm transition-all
              flex items-center gap-2 shrink-0
              ${showConfirm
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-white text-red-600 border-2 border-red-300 hover:bg-red-100"
              }
              ${isDeleting ? "opacity-50 cursor-not-allowed" : ""}
            `}
          >
            {isDeleting ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Siliniyor...
              </>
            ) : showConfirm ? (
              <>
                <Trash2 className="w-4 h-4" />
                Onayla ve Sil
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Siparişi Sil
              </>
            )}
          </button>
        </div>

        {showConfirm && (
          <button
            onClick={() => setShowConfirm(false)}
            disabled={isDeleting}
            className="mt-3 text-sm text-red-700 hover:text-red-900 font-medium"
          >
            İptal
          </button>
        )}
      </div>
    </div>
  );
}
