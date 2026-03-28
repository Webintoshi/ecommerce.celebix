"use client";

import { Trash2, Edit3 } from "lucide-react";
import type { OrderStatus } from "@/types/order";

interface OrderBulkActionsProps {
  selectedCount: number;
  totalCount: number;
  onBulkDelete?: () => void;
  onBulkStatusChange?: (status: OrderStatus) => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  isAllSelected?: boolean;
}

const STATUS_OPTIONS: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Beklemede",
  confirmed: "Onaylandı",
  preparing: "Hazırlanıyor",
  shipped: "Kargolandı",
  delivered: "Teslim Edildi",
  cancelled: "İptal",
  refunded: "İade",
};

export function OrderBulkActions({
  selectedCount,
  totalCount,
  onBulkDelete,
  onBulkStatusChange,
  onSelectAll,
  onClearSelection,
  isAllSelected = false,
}: OrderBulkActionsProps) {
  if (selectedCount === 0) {
    return (
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isAllSelected}
            onChange={onSelectAll}
            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <span className="text-sm text-gray-600">Tümünü Seç ({totalCount})</span>
        </label>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isAllSelected}
            onChange={onSelectAll}
            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <span className="text-sm font-medium text-blue-900">
            {selectedCount} seçildi
          </span>
        </label>
        <button
          onClick={onClearSelection}
          className="text-sm text-blue-600 hover:text-blue-800 underline"
        >
          Seçimi Temizle
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* Bulk Status Change */}
        {onBulkStatusChange && (
          <div className="flex items-center gap-2">
            <select
              onChange={(e) => {
                const status = e.target.value as OrderStatus;
                if (status && confirm(`Seçili ${selectedCount} siparişin durumunu "${STATUS_LABELS[status]}" olarak değiştirmek istediğinizden emin misiniz?`)) {
                  onBulkStatusChange(status);
                }
                e.target.value = "";
              }}
              className="text-sm border border-blue-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              defaultValue=""
            >
              <option value="" disabled>
                Durumu Değiştir...
              </option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Bulk Delete */}
        {onBulkDelete && (
          <button
            onClick={onBulkDelete}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Seçilenleri Sil
          </button>
        )}
      </div>
    </div>
  );
}
