"use client";

import { useState } from "react";
import type { OrderActivityAction, OrderActivityLog } from "@/types/order";
import { History, ChevronDown, Filter, X } from "lucide-react";

interface OrderActivityLogComponentProps {
  activities: OrderActivityLog[];
  className?: string;
}

const ACTION_LABELS: Record<OrderActivityAction, string> = {
  order_created: "Sipariş oluşturuldu",
  status_changed: "Durum değişti",
  payment_status_changed: "Ödeme durumu değişti",
  shipping_updated: "Kargo güncellendi",
  note_added: "Not eklendi",
  note_updated: "Not güncellendi",
  note_deleted: "Not silindi",
  customer_notified: "Bildirim gönderildi",
};

const ACTION_ICONS: Record<OrderActivityAction, { icon: string; color: string; bg: string }> = {
  order_created: { icon: "🟢", color: "text-emerald-600", bg: "bg-emerald-50" },
  status_changed: { icon: "🔄", color: "text-blue-600", bg: "bg-blue-50" },
  payment_status_changed: { icon: "💳", color: "text-orange-600", bg: "bg-orange-50" },
  shipping_updated: { icon: "📦", color: "text-indigo-600", bg: "bg-indigo-50" },
  note_added: { icon: "📝", color: "text-amber-600", bg: "bg-amber-50" },
  note_updated: { icon: "✏️", color: "text-amber-600", bg: "bg-amber-50" },
  note_deleted: { icon: "🗑️", color: "text-red-600", bg: "bg-red-50" },
  customer_notified: { icon: "📧", color: "text-cyan-600", bg: "bg-cyan-50" },
};

type FilterType = "all" | OrderActivityAction;

function formatTime(dateString: string | Date): string {
  const date = typeof dateString === "string" ? new Date(dateString) : dateString;
  if (isNaN(date.getTime())) return "Bilinmiyor";
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Az önce";
  if (diffMins < 60) return `${diffMins} dk`;
  if (diffHours < 24) return `${diffHours} sa`;
  if (diffDays < 7) return `${diffDays} gün`;

  return date.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
  });
}

export function OrderActivityLogComponent({ activities, className = "" }: OrderActivityLogComponentProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [isExpanded, setIsExpanded] = useState(true);

  const filteredActivities = filter === "all"
    ? activities
    : activities.filter(a => a.action === filter);

  const uniqueActions = Array.from(
    new Set(activities.map(a => a.action))
  ) as OrderActivityAction[];

  // Status translations
  const statusLabels: Record<string, string> = {
    pending: "Beklemede",
    confirmed: "Onaylandı",
    preparing: "Hazırlanıyor",
    shipped: "Kargolandı",
    delivered: "Teslim Edildi",
    cancelled: "İptal",
    refunded: "İade Edildi",
  };

  const paymentStatusLabels: Record<string, string> = {
    pending: "Beklemede",
    processing: "İşleniyor",
    completed: "Tamamlandı",
    failed: "Başarısız",
    refunded: "İade Edildi",
  };

  const formatActivityDescription = (activity: OrderActivityLog): string => {
    const oldVal = activity.oldValue as string;
    const newVal = activity.newValue as string;
    
    switch (activity.action) {
      case "status_changed":
        return `"${statusLabels[oldVal] || oldVal}" → "${statusLabels[newVal] || newVal}"`;
      case "payment_status_changed":
        return `"${paymentStatusLabels[oldVal] || oldVal}" → "${paymentStatusLabels[newVal] || newVal}"`;
      case "shipping_updated":
        const newValueObj = activity.newValue as { trackingNumber?: string } | null;
        return newValueObj?.trackingNumber
          ? `${newValueObj.trackingNumber}`
          : "Kargo bilgisi güncellendi";
      case "note_added":
      case "note_updated":
        const noteValue = activity.newValue as { text?: string } | null;
        return noteValue?.text || "";
      case "customer_notified":
        const notifyValue = activity.newValue as { type?: string } | null;
        return notifyValue?.type === "email"
          ? "E-posta gönderildi"
          : "SMS gönderildi";
      default:
        return "";
    }
  };

  return (
    <div className={`overflow-hidden rounded-[12px] border border-[var(--admin-border)] bg-white shadow-[0_18px_50px_rgba(148,101,63,0.08)] backdrop-blur ${className}`}>
      {/* Compact Header */}
      <div className="flex items-center justify-between border-b border-[var(--admin-border)] bg-gradient-to-r from-[#fffaf5] to-white px-5 py-4">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-[var(--admin-text-secondary)]" />
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-stone-950">Sipariş Geçmişi</h3>
            <span className="text-xs text-stone-400">({activities.length})</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter */}
          {uniqueActions.length > 1 && (
            <div className="flex items-center gap-1 rounded-full border border-[var(--admin-border)] bg-white px-2 py-1 shadow-sm">
              <Filter className="w-3 h-3 text-stone-400" />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as FilterType)}
                className="cursor-pointer border-0 bg-transparent py-0 text-xs font-semibold text-stone-600 focus:ring-0"
              >
                <option value="all">Tümü</option>
                {uniqueActions.map(action => (
                  <option key={action} value={action}>{ACTION_LABELS[action]}</option>
                ))}
              </select>
              {filter !== "all" && (
                <button
                  onClick={() => setFilter("all")}
                  className="rounded p-0.5 hover:bg-[#f5ede6]"
                >
                  <X className="w-3 h-3 text-stone-400" />
                </button>
              )}
            </div>
          )}
          
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="rounded-[8px] p-1.5 transition-colors hover:bg-white"
          >
            <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-5">
          {/* Activity List - Compact */}
          <div className="custom-scrollbar max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {filteredActivities.length === 0 ? (
              <div className="py-6 text-center text-stone-400">
                <p className="text-xs">Kayıt bulunmuyor.</p>
              </div>
            ) : (
              filteredActivities.map((activity) => {
                const actionConfig = ACTION_ICONS[activity.action];
                const description = formatActivityDescription(activity);

                return (
                  <div key={activity.id} className="flex items-start gap-3 rounded-[12px] border border-[#f0e3d6] bg-[#fcf8f4] p-3 transition-colors hover:bg-[#FCFDFE]">
                    {/* Icon */}
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-white text-xs shadow-sm ${actionConfig.bg} ${actionConfig.color}`}>
                      {actionConfig.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-stone-900">
                          {ACTION_LABELS[activity.action]}
                        </p>
                        <span className="whitespace-nowrap text-[10px] uppercase tracking-[0.14em] text-stone-400">
                          {formatTime(activity.createdAt)}
                        </span>
                      </div>
                      
                      {description && (
                        <p className="mt-1 break-words text-xs text-stone-500">
                          {description}
                        </p>
                      )}
                      
                      {activity.adminName && (
                        <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-stone-400">
                          {activity.adminName}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { OrderActivityLogComponent as OrderActivityLog };
