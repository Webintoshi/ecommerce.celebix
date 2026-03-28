"use client";

import { useState } from "react";
import { CreditCard, ChevronDown, Check } from "lucide-react";

type PaymentStatus = "pending" | "processing" | "completed" | "failed" | "refunded";

interface PaymentStatusCardProps {
  currentStatus: PaymentStatus;
  paymentMethod?: string;
  onStatusChange: (newStatus: PaymentStatus) => void;
  className?: string;
}

const STATUS_CONFIG: Record<PaymentStatus, { label: string; color: string; icon: string }> = {
  pending: { label: "Beklemede", color: "bg-yellow-50 text-yellow-700 border-yellow-200", icon: "⏳" },
  processing: { label: "İşleniyor", color: "bg-blue-50 text-blue-700 border-blue-200", icon: "🔄" },
  completed: { label: "Tamamlandı", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "✅" },
  failed: { label: "Başarısız", color: "bg-red-50 text-red-700 border-red-200", icon: "❌" },
  refunded: { label: "İade Edildi", color: "bg-orange-50 text-orange-700 border-orange-200", icon: "↩️" },
};

const STATUS_OPTIONS: PaymentStatus[] = ["pending", "processing", "completed", "failed", "refunded"];

export function PaymentStatusCard({
  currentStatus,
  paymentMethod,
  onStatusChange,
  className = "",
}: PaymentStatusCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const currentConfig = STATUS_CONFIG[currentStatus];

  const handleStatusChange = async (newStatus: PaymentStatus) => {
    if (newStatus === currentStatus || isUpdating) return;

    // Critical operations için confirmation
    if (newStatus === "failed" || newStatus === "refunded") {
      const confirmed = confirm(
        `Ödeme durumunu "${STATUS_CONFIG[newStatus].label}" olarak değiştirmek istediğinizden emin misiniz?`
      );
      if (!confirmed) return;
    }

    setIsUpdating(true);
    setIsOpen(false);

    try {
      await onStatusChange(newStatus);
    } catch (error) {
      console.error("Ödeme durumu güncellenirken hata:", error);
      alert("Ödeme durumu güncellenirken bir hata oluştu.");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className={`bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/30">
        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-gray-400" />
          Ödeme Bilgileri
        </h3>
      </div>

      <div className="p-6 space-y-4">
        {/* Payment Method */}
        {paymentMethod && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Ödeme Yöntemi</span>
            <span className="font-bold text-gray-900">{paymentMethod}</span>
          </div>
        )}

        {/* Payment Status */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            Ödeme Durumu
          </p>
          <div className="relative">
            <button
              onClick={() => setIsOpen(!isOpen)}
              disabled={isUpdating}
              className={`
                w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl
                font-bold text-sm transition-all
                ${currentConfig.color}
                ${isUpdating ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:opacity-80"}
              `}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{currentConfig.icon}</span>
                <span>{currentConfig.label}</span>
              </div>
              {!isUpdating && (
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              )}
            </button>

            {isOpen && !isUpdating && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsOpen(false)}
                />

                {/* Dropdown */}
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  {STATUS_OPTIONS.map((status) => {
                    const config = STATUS_CONFIG[status];
                    const isSelected = status === currentStatus;

                    return (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(status)}
                        className={`
                          w-full flex items-center gap-3 px-4 py-3 text-left
                          transition-colors duration-150
                          ${isSelected
                            ? "bg-gray-50"
                            : "text-gray-700 hover:bg-gray-50"
                          }
                        `}
                      >
                        <span className="text-base">{config.icon}</span>
                        <span className="flex-1 font-bold text-sm">{config.label}</span>
                        {isSelected && (
                          <Check className="w-4 h-4 text-emerald-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
