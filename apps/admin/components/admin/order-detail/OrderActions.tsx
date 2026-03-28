"use client";

import { useState } from "react";
import {
  Copy,
  Mail,
  Phone,
  MapPin,
  Hash,
  MessageSquare,
  RotateCcw,
  MoreVertical,
} from "lucide-react";

interface OrderActionsProps {
  orderNumber: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  trackingNumber?: string;
  onDuplicateOrder?: () => void;
  onSendSms?: () => void;
  className?: string;
}

export function OrderActions({
  orderNumber,
  customerEmail,
  customerPhone,
  customerAddress,
  trackingNumber,
  onDuplicateOrder,
  onSendSms,
  className = "",
}: OrderActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(label);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  const formatAddress = () => {
    if (!customerAddress) return "";
    try {
      const addr = typeof customerAddress === "string"
        ? JSON.parse(customerAddress)
        : customerAddress;
      const parts = [
        addr.firstName,
        addr.lastName,
        addr.address,
        addr.city,
        addr.country,
      ].filter(Boolean);
      return parts.join(", ");
    } catch {
      return String(customerAddress);
    }
  };

  const actions = [
    {
      id: "copy-order",
      label: "Sipariş No Kopyala",
      icon: Hash,
      onClick: () => copyToClipboard(orderNumber, "Sipariş No"),
      show: true,
    },
    {
      id: "copy-email",
      label: "E-posta Kopyala",
      icon: Mail,
      onClick: () => customerEmail && copyToClipboard(customerEmail, "E-posta"),
      show: !!customerEmail,
    },
    {
      id: "copy-phone",
      label: "Telefon Kopyala",
      icon: Phone,
      onClick: () => customerPhone && copyToClipboard(customerPhone, "Telefon"),
      show: !!customerPhone,
    },
    {
      id: "copy-address",
      label: "Adres Kopyala",
      icon: MapPin,
      onClick: () => {
        const address = formatAddress();
        if (address) copyToClipboard(address, "Adres");
      },
      show: !!customerAddress,
    },
    {
      id: "email-customer",
      label: "E-posta Gönder",
      icon: Mail,
      onClick: () => {
        window.open(`mailto:${customerEmail}?subject=Sipariş ${orderNumber} Hakkında`, "_blank");
      },
      show: !!customerEmail,
    },
    {
      id: "sms-tracking",
      label: "Kargo SMS Gönder",
      icon: MessageSquare,
      onClick: onSendSms,
      show: !!trackingNumber && !!onSendSms,
    },
    {
      id: "duplicate-order",
      label: "Siparişi Çoğalt",
      icon: RotateCcw,
      onClick: onDuplicateOrder,
      show: !!onDuplicateOrder,
    },
  ].filter((a) => a.show);

  if (actions.length === 0) return null;

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-50 transition-all flex items-center gap-2"
      >
        Hızlı Aksiyonlar
        <MoreVertical className="w-4 h-4" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Hızlı Aksiyonlar
              </p>
            </div>

            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => {
                    action.onClick?.();
                    if (action.id.startsWith("copy")) {
                      // Keep open for copy actions to show feedback
                    } else {
                      setIsOpen(false);
                    }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Icon className="w-4 h-4 text-gray-400" />
                  <span className="flex-1 text-sm font-bold">{action.label}</span>
                  {copiedItem === action.label.split(" ")[0] && (
                    <span className="text-xs text-emerald-600">Kopyalandı!</span>
                  )}
                </button>
              );
            })}

            {copiedItem && (
              <div className="px-3 py-2 border-t border-gray-100 bg-emerald-50">
                <p className="text-xs font-bold text-emerald-700">
                  {copiedItem} kopyalandı
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
