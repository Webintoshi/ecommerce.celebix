"use client";

import { useState } from "react";
import {
  Mail,
  MessageSquare,
  FileText,
  RefreshCw,
  Printer,
  Download,
  MoreVertical,
} from "lucide-react";

interface QuickActionsProps {
  orderId: string;
  orderNumber: string;
  customerEmail?: string;
  customerPhone?: string;
  onEmailSent?: () => void;
  onSmsSent?: () => void;
  onPrint?: () => void;
  onInvoice?: () => void;
  onRefund?: () => void;
  className?: string;
}

interface Action {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
}

export function QuickActions({
  orderId,
  orderNumber,
  customerEmail,
  customerPhone,
  onEmailSent,
  onSmsSent,
  onPrint,
  onInvoice,
  onRefund,
  className = "",
}: QuickActionsProps) {
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

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

  const primaryActions: Action[] = [
    {
      id: "email",
      label: "E-posta Gönder",
      icon: Mail,
      color: "bg-blue-50 text-blue-600 hover:bg-blue-100",
      onClick: () => handleAction("email", onEmailSent || (() => {
        window.open(`mailto:${customerEmail}?subject=Sipariş ${orderNumber} Hakkında`, "_blank");
      })),
      disabled: !customerEmail,
    },
    {
      id: "sms",
      label: "SMS Gönder",
      icon: MessageSquare,
      color: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100",
      onClick: () => handleAction("sms", onSmsSent || (() => {
        // SMS gönderme modal açılacak
        alert("SMS gönderme modalı yakında eklenecek!");
      })),
    },
    {
      id: "note",
      label: "Not Ekle",
      icon: FileText,
      color: "bg-amber-50 text-amber-600 hover:bg-amber-100",
      onClick: () => handleAction("note", () => {
        // Not ekleme modal açılacak - parent component handle edecek
        document.dispatchEvent(new CustomEvent("open-note-modal"));
      }),
    },
    {
      id: "refund",
      label: "İade Başlat",
      icon: RefreshCw,
      color: "bg-red-50 text-red-600 hover:bg-red-100",
      onClick: () => handleAction("refund", onRefund || (() => {
        const confirmed = confirm("Bu sipariş için iade başlatmak istediğinizden emin misiniz?");
        if (confirmed) {
          alert("İade süreci başlatılıyor...");
        }
      })),
    },
  ];

  const secondaryActions: Action[] = [
    {
      id: "print",
      label: "Yazdır",
      icon: Printer,
      color: "text-gray-600 hover:bg-gray-100",
      onClick: () => handleAction("print", onPrint || (() => {
        window.print();
      })),
    },
    {
      id: "invoice",
      label: "Fatura",
      icon: Download,
      color: "text-gray-600 hover:bg-gray-100",
      onClick: () => handleAction("invoice", onInvoice || (() => {
        alert("Fatura PDF indiriliyor...");
      })),
    },
  ];

  return (
    <div className={`bg-white rounded-3xl shadow-sm border border-gray-100 p-6 ${className}`}>
      <h3 className="text-lg font-bold text-gray-900 mb-4">Hızlı İşlemler</h3>

      {/* Primary Actions - Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {primaryActions.map((action) => {
          const Icon = action.icon;
          const isLoading = isActionLoading === action.id;

          return (
            <button
              key={action.id}
              onClick={() => handleAction(action.id, action.onClick)}
              disabled={action.disabled || isLoading}
              className={`
                flex flex-col items-center gap-2 p-4 rounded-2xl
                transition-all duration-200
                ${action.color}
                ${action.disabled || isLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Icon className="w-6 h-6" />
              )}
              <span className="text-xs font-bold">{action.label}</span>
            </button>
          );
        })}
      </div>

      {/* Secondary Actions - Row */}
      <div className="flex gap-2 pt-4 border-t border-gray-100">
        {secondaryActions.map((action) => {
          const Icon = action.icon;
          const isLoading = isActionLoading === action.id;

          return (
            <button
              key={action.id}
              onClick={() => handleAction(action.id, action.onClick)}
              disabled={isLoading}
              className={`
                flex-1 flex items-center justify-center gap-2 px-4 py-2.5
                rounded-xl font-bold text-sm transition-all duration-200
                ${action.color}
                ${isLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              `}
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
  );
}
