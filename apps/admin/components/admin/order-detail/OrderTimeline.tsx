"use client";

import { ORDER_STATUS_CONFIG, ORDER_TIMELINE_STEPS } from "@/types/order";
import type { OrderStatus } from "@/types/order";
import { Clock, CheckCircle, Package, Truck, ChevronRight } from "lucide-react";

interface OrderTimelineProps {
  currentStatus: OrderStatus;
  className?: string;
}

const stepIcons = {
  pending: Clock,
  confirmed: CheckCircle,
  preparing: Package,
  shipped: Truck,
  delivered: CheckCircle,
};

const stepLabels = {
  pending: "Beklemede",
  confirmed: "Onaylandı",
  preparing: "Hazırlanıyor",
  shipped: "Kargolandı",
  delivered: "Teslim Edildi",
};

export function OrderTimeline({ currentStatus, className = "" }: OrderTimelineProps) {
  const currentIndex = ORDER_STATUS_CONFIG[currentStatus]?.stepIndex ?? -1;

  // Eğer iptal veya iade durumundaysa, timeline'ı gösterme
  if (currentStatus === "cancelled" || currentStatus === "refunded") {
    return (
      <div className={`bg-white rounded-3xl shadow-sm border border-gray-100 p-8 ${className}`}>
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
            currentStatus === "cancelled"
              ? "bg-red-50 text-red-600"
              : "bg-orange-50 text-orange-600"
          }`}>
            {currentStatus === "cancelled" ? (
              <Clock className="w-6 h-6" />
            ) : (
              <Package className="w-6 h-6" />
            )}
          </div>
          <div>
            <p className="font-bold text-gray-900 text-lg">
              {currentStatus === "cancelled" ? "Sipariş İptal Edildi" : "Sipariş İade Edildi"}
            </p>
            <p className="text-sm text-gray-500">
              {currentStatus === "cancelled"
                ? "Bu sipariş müşteri veya admin tarafından iptal edildi."
                : "Bu sipariş iade edildi."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-3xl shadow-sm border border-gray-100 p-8 ${className}`}>
      <h3 className="text-lg font-bold text-gray-900 mb-6">Sipariş Durumu</h3>

      <div className="relative">
        {/* Progress Line */}
        <div className="absolute top-5 left-0 right-0 h-1 bg-gray-100 rounded-full">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-500"
            style={{
              width: `${(currentIndex / (ORDER_TIMELINE_STEPS.length - 1)) * 100}%`,
            }}
          />
        </div>

        {/* Steps */}
        <div className="relative flex justify-between">
          {ORDER_TIMELINE_STEPS.map((step, index) => {
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;
            const StepIcon = stepIcons[step.status as keyof typeof stepIcons];

            return (
              <div key={step.status} className="flex flex-col items-center gap-3">
                {/* Step Circle */}
                <div
                  className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isCompleted
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200"
                      : isCurrent
                        ? "bg-primary text-white shadow-lg shadow-red-200 ring-4 ring-red-50 scale-110"
                        : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <StepIcon className="w-5 h-5" />
                  )}
                </div>

                {/* Step Label */}
                <span
                  className={`text-xs font-bold whitespace-nowrap ${
                    isCompleted || isCurrent
                      ? "text-gray-900"
                      : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Current Status Description */}
      <div className="mt-6 pt-6 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            currentIndex >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-gray-50 text-gray-400"
          }`}>
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-gray-900">
              {ORDER_STATUS_CONFIG[currentStatus]?.label || "Bilinmiyor"}
            </p>
            <p className="text-sm text-gray-500">
              {ORDER_STATUS_CONFIG[currentStatus]?.description || ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
