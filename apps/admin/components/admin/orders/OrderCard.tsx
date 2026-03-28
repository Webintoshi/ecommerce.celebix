"use client";

import { useState } from "react";
import type { Order, OrderStatus } from "@/types/order";
import {
  Eye,
  Trash2,
  MoreVertical,
  Printer,
  Mail,
  Copy,
  MessageSquare,
  Clock,
  CheckCircle,
  Package,
  Truck,
  XCircle,
  ArrowRight,
  MapPin,
  Package as PackageIcon,
} from "lucide-react";
import Link from "next/link";

interface OrderCardProps {
  order: Order;
  isSelected?: boolean;
  onSelect?: (orderId: string) => void;
  onDelete?: (orderId: string) => void;
  onStatusChange?: (orderId: string, status: OrderStatus) => void;
  statusOptions: Array<{ value: string; label: string; color: string }>;
}

export function OrderCard({
  order,
  isSelected = false,
  onSelect,
  onDelete,
  onStatusChange,
  statusOptions,
}: OrderCardProps) {
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const getStatusIcon = (status: OrderStatus) => {
    switch (status) {
      case "pending":
        return <Clock className="w-3.5 h-3.5" />;
      case "confirmed":
        return <CheckCircle className="w-3.5 h-3.5" />;
      case "preparing":
        return <Package className="w-3.5 h-3.5" />;
      case "shipped":
        return <Truck className="w-3.5 h-3.5" />;
      case "delivered":
        return <CheckCircle className="w-3.5 h-3.5" />;
      case "cancelled":
        return <XCircle className="w-3.5 h-3.5" />;
      case "refunded":
        return <ArrowRight className="w-3.5 h-3.5" />;
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
    }).format(price);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  };

  const handleDelete = async () => {
    if (isDeleting) return;

    const confirmed = confirm(
      `"${order.orderNumber}" siparişini silmek istediğinizden emin misiniz?\n\nBu işlem geri alınamaz.`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await onDelete?.(order.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyOrderNumber = () => {
    navigator.clipboard.writeText(order.orderNumber);
    setIsQuickActionsOpen(false);
  };

  const handleSendEmail = () => {
    window.open(
      `mailto:${order.customerEmail}?subject=Sipariş ${order.orderNumber} Hakkında`,
      "_blank"
    );
    setIsQuickActionsOpen(false);
  };

  const handlePrint = () => {
    window.open(`/admin/siparisler/${order.id}/yazdir`, "_blank");
    setIsQuickActionsOpen(false);
  };

  const quickActions = [
    {
      id: "print",
      label: "Yazdır",
      icon: Printer,
      onClick: handlePrint,
      show: true,
    },
    {
      id: "email",
      label: "E-posta",
      icon: Mail,
      onClick: handleSendEmail,
      show: !!order.customerEmail,
    },
    {
      id: "copy",
      label: "Sipariş No Kopyala",
      icon: Copy,
      onClick: handleCopyOrderNumber,
      show: true,
    },
    {
      id: "sms",
      label: "SMS",
      icon: MessageSquare,
      onClick: () => {
        alert("SMS gönderme özelliği yakında eklenecek!");
        setIsQuickActionsOpen(false);
      },
      show: true,
    },
  ];

  const statusConfig = statusOptions.find((s) => s.value === order.status);

  return (
    <div
      className={`relative bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-all duration-200 ${
        isSelected ? "ring-2 ring-primary ring-offset-2" : ""
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Checkbox */}
        {onSelect && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(order.id)}
            className="mt-1 w-5 h-5 rounded-lg border-gray-300 text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
          />
        )}

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Header Row: Order No | Date | Status | Price */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            {/* Left: Order No + Date */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="font-bold text-gray-900 truncate">
                {order.orderNumber}
              </span>
              <span className="text-sm text-gray-400">
                {formatDate(new Date(order.createdAt))}
              </span>
            </div>

            {/* Center: Status Badge */}
            <div className="shrink-0">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                  statusConfig?.color || "bg-gray-100 text-gray-700"
                }`}
              >
                {getStatusIcon(order.status)}
                <span>{statusConfig?.label || order.status}</span>
              </span>
            </div>

            {/* Right: Price */}
            <div className="shrink-0 text-right">
              <span className="text-lg font-black text-gray-900">
                {formatPrice(order.total)}
              </span>
            </div>
          </div>

          {/* Customer Info Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-gray-800">
                {order.shippingAddress.firstName} {order.shippingAddress.lastName}
              </span>
              <span className="text-gray-400">•</span>
              <div className="flex items-center gap-1 text-gray-500">
                <MapPin className="w-3.5 h-3.5" />
                <span>{order.shippingAddress.city}</span>
              </div>
            </div>

            {/* Item Count */}
            <div className="flex items-center gap-1.5 text-sm text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
              <PackageIcon className="w-3.5 h-3.5" />
              <span>{order.items.length} ürün</span>
            </div>
          </div>

          {/* Notes if any */}
          {order.notes && (
            <div className="mb-3 p-2.5 bg-amber-50 border border-amber-100 rounded-xl">
              <p className="text-xs text-amber-800">
                <span className="font-semibold">Not:</span> {order.notes}
              </p>
            </div>
          )}

          {/* Actions Row */}
          <div className="flex items-center justify-between gap-2">
            {/* Status Change Dropdown */}
            {onStatusChange && (
              <select
                value={order.status}
                onChange={(e) =>
                  onStatusChange(order.id, e.target.value as OrderStatus)
                }
                className="text-xs sm:text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white cursor-pointer hover:bg-gray-50 transition-colors"
              >
                {statusOptions
                  .filter((s) => s.value !== "all")
                  .map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
              </select>
            )}

            {/* Right Actions */}
            <div className="flex items-center gap-1">
              {/* Detail Link */}
              <Link
                href={`/admin/siparisler/${order.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors shadow-sm"
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Detay</span>
              </Link>

              {/* Quick Actions Menu */}
              <div className="relative">
                <button
                  onClick={() => setIsQuickActionsOpen(!isQuickActionsOpen)}
                  className="p-2 text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {isQuickActionsOpen && (
                  <>
                    {/* Backdrop */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsQuickActionsOpen(false)}
                    />

                    {/* Dropdown */}
                    <div className="absolute top-full right-0 mt-1 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                      {quickActions.map((action) => {
                        const Icon = action.icon;
                        return (
                          <button
                            key={action.id}
                            onClick={action.onClick}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Icon className="w-4 h-4" />
                            {action.label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Delete Button */}
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
                title="Sil"
              >
                {isDeleting ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
