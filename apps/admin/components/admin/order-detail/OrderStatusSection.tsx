"use client";

import { useState } from "react";
import { ORDER_STATUS_CONFIG, ORDER_TIMELINE_STEPS } from "@/types/order";
import type { OrderStatus } from "@/types/order";
import { Clock, CheckCircle, Package, Truck, Mail, MessageSquare, FileText, RefreshCw, Printer, Download } from "lucide-react";
import { OrderStatusChanger } from "./OrderStatusChanger";

interface OrderStatusSectionProps {
  currentStatus: OrderStatus;
  orderId: string;
  orderNumber: string;
  customerEmail?: string;
  customerPhone?: string;
  onStatusChange: (newStatus: OrderStatus) => void;
  className?: string;
}

const stepIcons = {
  pending: Clock,
  confirmed: CheckCircle,
  preparing: Package,
  shipped: Truck,
  delivered: CheckCircle,
};

interface QuickAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
}

export function OrderStatusSection({
  currentStatus,
  orderId,
  orderNumber,
  customerEmail,
  customerPhone,
  onStatusChange,
  className = "",
}: OrderStatusSectionProps) {
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

  const currentIndex = ORDER_STATUS_CONFIG[currentStatus]?.stepIndex ?? -1;

  const handleAction = async (actionId: string, action: () => void | Promise<void>) => {
    if (isActionLoading) return;
    setIsActionLoading(actionId);
    try {
      await action();
    } catch (error) {
      console.error("Action error:", error);
    } finally {
      setIsActionLoading(null);
    }
  };

  const quickActions: QuickAction[] = [
    {
      id: "email",
      label: "E-posta",
      icon: Mail,
      color: "bg-blue-50 text-blue-600 hover:bg-blue-100",
      onClick: () => handleAction("email", () => {
        window.open(`mailto:${customerEmail}?subject=Sipariş ${orderNumber} Hakkında`, "_blank");
      }),
      disabled: !customerEmail,
    },
    {
      id: "sms",
      label: "SMS",
      icon: MessageSquare,
      color: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100",
      onClick: () => handleAction("sms", () => {
        alert("SMS gönderme modalı yakında eklenecek!");
      }),
    },
    {
      id: "note",
      label: "Not",
      icon: FileText,
      color: "bg-amber-50 text-amber-600 hover:bg-amber-100",
      onClick: () => handleAction("note", () => {
        document.dispatchEvent(new CustomEvent("open-note-modal"));
      }),
    },
    {
      id: "refund",
      label: "İade",
      icon: RefreshCw,
      color: "bg-red-50 text-red-600 hover:bg-red-100",
      onClick: () => handleAction("refund", () => {
        const confirmed = confirm("Bu sipariş için iade başlatmak istediğinizden emin misiniz?");
        if (confirmed) {
          alert("İade süreci başlatılıyor...");
        }
      }),
    },
    {
      id: "print",
      label: "Yazdır",
      icon: Printer,
      color: "bg-gray-50 text-gray-600 hover:bg-gray-100",
      onClick: () => handleAction("print", () => {
        window.open(`/admin/siparisler/${orderId}/yazdir`, "_blank");
      }),
    },
    {
      id: "invoice",
      label: "Fatura",
      icon: Download,
      color: "bg-gray-50 text-gray-600 hover:bg-gray-100",
      onClick: () => handleAction("invoice", () => {
        alert("Fatura PDF indiriliyor...");
      }),
    },
  ];

  // Eğer iptal veya iade durumundaysa, özel mesaj göster
  if (currentStatus === "cancelled" || currentStatus === "refunded") {
    return (
      <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
        <div className="p-5">
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
            <div className="flex-1">
              <p className="font-bold text-gray-900 text-lg">
                {currentStatus === "cancelled" ? "Sipariş İptal Edildi" : "Sipariş İade Edildi"}
              </p>
              <p className="text-sm text-gray-500">
                {currentStatus === "cancelled"
                  ? "Bu sipariş müşteri veya admin tarafından iptal edildi."
                  : "Bu sipariş iade edildi."}
              </p>
            </div>
            
            {/* Status Changer - Still visible for cancelled/refunded */}
            <OrderStatusChanger
              currentStatus={currentStatus}
              onStatusChange={onStatusChange}
            />
          </div>
        </div>

        {/* Quick Actions Row */}
        <div className="px-5 pb-5">
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              const isLoading = isActionLoading === action.id;

              return (
                <button
                  key={action.id}
                  onClick={() => handleAction(action.id, action.onClick)}
                  disabled={action.disabled || isLoading}
                  className={`
                    flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold
                    transition-all duration-200
                    ${action.color}
                    ${action.disabled || isLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                  `}
                  title={action.label}
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">{action.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
      {/* Compact Timeline Row */}
      <div className="p-5 pb-4">
        <div className="relative">
          {/* Progress Line */}
          <div className="absolute top-4 left-0 right-0 h-1.5 bg-gray-100 rounded-full">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(0, (currentIndex / (ORDER_TIMELINE_STEPS.length - 1)) * 100)}%`,
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
                <div key={step.status} className="flex flex-col items-center">
                  {/* Step Circle */}
                  <div
                    className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
                      isCompleted
                        ? "bg-emerald-500 text-white shadow-md"
                        : isCurrent
                          ? "bg-primary text-white shadow-lg ring-4 ring-red-50 scale-110"
                          : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <StepIcon className="w-4 h-4" />
                    )}
                  </div>

                  {/* Step Label */}
                  <span
                    className={`text-[10px] font-bold mt-1.5 ${
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
      </div>

      {/* Status & Actions Row */}
      <div className="px-5 pb-5 pt-2 border-t border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Current Status */}
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
              <p className="text-xs text-gray-500">
                {ORDER_STATUS_CONFIG[currentStatus]?.description || ""}
              </p>
            </div>
          </div>

          {/* Status Changer - More Prominent */}
          <OrderStatusChanger
            currentStatus={currentStatus}
            onStatusChange={onStatusChange}
          />
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2 mt-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            const isLoading = isActionLoading === action.id;

            return (
              <button
                key={action.id}
                onClick={() => handleAction(action.id, action.onClick)}
                disabled={action.disabled || isLoading}
                className={`
                  flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold
                  transition-all duration-200
                  ${action.color}
                  ${action.disabled || isLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                `}
                title={action.label}
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
