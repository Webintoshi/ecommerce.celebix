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
      color: "border border-[#d9e7f6] bg-white text-[#6f5a49] hover:border-[#b9d7f4] hover:bg-[#f7fbff] hover:text-[#235d8b]",
      onClick: () => handleAction("email", () => {
        window.open(`mailto:${customerEmail}?subject=Sipariş ${orderNumber} Hakkında`, "_blank");
      }),
      disabled: !customerEmail,
    },
    {
      id: "sms",
      label: "SMS",
      icon: MessageSquare,
      color: "border border-[#dbe9df] bg-white text-[#6f5a49] hover:border-[#bfd9c6] hover:bg-[#f7fcf8] hover:text-[#2f7a4e]",
      onClick: () => handleAction("sms", () => {
        alert("SMS gönderme modalı yakında eklenecek!");
      }),
    },
    {
      id: "note",
      label: "Not",
      icon: FileText,
      color: "border border-[#f0dfc9] bg-white text-[#6f5a49] hover:border-[#ebc999] hover:bg-[#fff9f2] hover:text-[#b55a12]",
      onClick: () => handleAction("note", () => {
        document.dispatchEvent(new CustomEvent("open-note-modal"));
      }),
    },
    {
      id: "refund",
      label: "İade",
      icon: RefreshCw,
      color: "border border-[#f2d6d6] bg-white text-[#6f5a49] hover:border-[#eab6b6] hover:bg-[#fff6f6] hover:text-[#b14949]",
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
      color: "border border-[#eadccd] bg-white text-[#6f5a49] hover:border-[#dcc5b1] hover:bg-[#fffaf5] hover:text-[#8a4b22]",
      onClick: () => handleAction("print", () => {
        window.open(`/admin/siparisler/${orderId}/yazdir`, "_blank");
      }),
    },
    {
      id: "invoice",
      label: "Fatura",
      icon: Download,
      color: "border border-[#eadccd] bg-white text-[#6f5a49] hover:border-[#dcc5b1] hover:bg-[#fffaf5] hover:text-[#8a4b22]",
      onClick: () => handleAction("invoice", () => {
        alert("Fatura PDF indiriliyor...");
      }),
    },
  ];

  // Eğer iptal veya iade durumundaysa, özel mesaj göster
  if (currentStatus === "cancelled" || currentStatus === "refunded") {
    return (
      <div className={`overflow-hidden rounded-[28px] border border-[#eadccd] bg-white/85 shadow-[0_18px_50px_rgba(148,101,63,0.08)] backdrop-blur ${className}`}>
        <div className="border-b border-[#f1e6dc] bg-gradient-to-r from-[#fffaf5] to-white p-5 md:p-6">
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${
              currentStatus === "cancelled"
                ? "border-rose-100 bg-rose-50 text-rose-600"
                : "border-orange-100 bg-orange-50 text-orange-600"
            }`}>
              {currentStatus === "cancelled" ? (
                <Clock className="w-6 h-6" />
              ) : (
                <Package className="w-6 h-6" />
              )}
            </div>
            <div className="flex-1">
              <div className="mb-1 inline-flex rounded-full border border-[#ecdccd] bg-[#f9f2eb] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a5b3c]">
                Sipariş Akışı
              </div>
              <p className="text-lg font-semibold tracking-[-0.02em] text-stone-950">
                {currentStatus === "cancelled" ? "Sipariş İptal Edildi" : "Sipariş İade Edildi"}
              </p>
              <p className="text-sm text-stone-500">
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
        <div className="px-5 pb-5 pt-4 md:px-6 md:pb-6">
          <div className="flex flex-wrap gap-2.5">
            {quickActions.map((action) => {
              const Icon = action.icon;
              const isLoading = isActionLoading === action.id;

              return (
                <button
                  key={action.id}
                  onClick={() => handleAction(action.id, action.onClick)}
                  disabled={action.disabled || isLoading}
                  className={`
                    inline-flex min-h-11 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium
                    shadow-sm transition-all duration-200
                    ${action.color}
                    ${action.disabled || isLoading ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
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
    <div className={`overflow-hidden rounded-[28px] border border-[#eadccd] bg-white/85 shadow-[0_18px_50px_rgba(148,101,63,0.08)] backdrop-blur ${className}`}>
      {/* Compact Timeline Row */}
      <div className="border-b border-[#f1e6dc] bg-gradient-to-br from-[#fffaf5] via-white to-[#fdf6ef] p-5 pb-4 md:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <div className="inline-flex rounded-full border border-[#ecdccd] bg-[#f9f2eb] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a5b3c]">
              Sipariş Akışı
            </div>
            <p className="mt-3 text-sm font-semibold text-stone-900">
              {ORDER_STATUS_CONFIG[currentStatus]?.label || "Bilinmiyor"}
            </p>
            <p className="text-xs text-stone-500">
              {ORDER_STATUS_CONFIG[currentStatus]?.description || ""}
            </p>
          </div>

          <OrderStatusChanger
            currentStatus={currentStatus}
            onStatusChange={onStatusChange}
          />
        </div>

        <div className="relative">
          {/* Progress Line */}
          <div className="absolute left-0 right-0 top-4 h-1.5 rounded-full bg-[#efe1d3]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#FE6100] via-[#f18b2b] to-[#d56d16] transition-all duration-500"
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
                <div key={step.status} className="flex min-w-0 flex-col items-center px-1 text-center">
                  {/* Step Circle */}
                  <div
                    className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-300 ${
                      isCompleted
                        ? "border-[#FE6100] bg-[#FE6100] text-white shadow-[0_10px_22px_rgba(254,97,0,0.25)]"
                        : isCurrent
                          ? "scale-110 border-[#FE6100]/30 bg-white text-[#FE6100] shadow-[0_12px_26px_rgba(254,97,0,0.15)] ring-4 ring-[#fff3e8]"
                          : "border-[#e6d9cd] bg-[#f8f1ea] text-[#b8a08c]"
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
                    className={`mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                      isCompleted || isCurrent
                        ? "text-stone-800"
                        : "text-stone-400"
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
      <div className="px-5 pb-5 pt-4 md:px-6 md:pb-6">
        <div className="rounded-[24px] border border-[#f0e3d6] bg-[#fcf8f4] p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Current Status */}
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${
              currentIndex >= 0 ? "border-[#ffd8b4] bg-[#fff1e4] text-[#FE6100]" : "border-[#e6d9cd] bg-white text-stone-400"
            }`}>
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-stone-900">
                {ORDER_STATUS_CONFIG[currentStatus]?.label || "Bilinmiyor"}
              </p>
              <p className="text-xs text-stone-500">
                {ORDER_STATUS_CONFIG[currentStatus]?.description || ""}
              </p>
            </div>
          </div>

            <div className="hidden sm:block">
              <span className="rounded-full border border-[#ecdccd] bg-white px-3 py-1.5 text-xs font-medium text-[#8a5b3c] shadow-sm">
                Hızlı işlemler aşağıda yer alır
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-4 flex flex-wrap gap-2.5">
          {quickActions.map((action) => {
            const Icon = action.icon;
            const isLoading = isActionLoading === action.id;

            return (
              <button
                key={action.id}
                onClick={() => handleAction(action.id, action.onClick)}
                disabled={action.disabled || isLoading}
                className={`
                  inline-flex min-h-11 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium
                  shadow-sm transition-all duration-200
                  ${action.color}
                  ${action.disabled || isLoading ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
                `}
                title={action.label}
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
                <span>{action.label}</span>
              </button>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}
