"use client";

import { User, Mail, Phone, Copy, ExternalLink, ShoppingCart } from "lucide-react";
import Link from "next/link";

interface CustomerInfo {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  totalOrders?: number;
  totalSpent?: number;
}

interface CustomerInfoCardProps {
  customer: CustomerInfo;
  customerOrders?: Array<{
    id: string;
    orderNumber: string;
    status: string;
    total: number;
    createdAt: string;
  }>;
  className?: string;
}

export function CustomerInfoCard({
  customer,
  customerOrders = [],
  className = "",
}: CustomerInfoCardProps) {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    // Brief feedback could be added here
  };

  const customerName = `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "Bilinmiyor";

  return (
    <div className={`overflow-hidden rounded-[12px] border border-[var(--admin-border)] bg-white shadow-[0_18px_50px_rgba(148,101,63,0.08)] backdrop-blur ${className}`}>
      {/* Header */}
      <div className="border-b border-[var(--admin-border)] bg-gradient-to-r from-[#fffaf5] to-white px-6 py-5">
        <h3 className="flex items-center gap-2 text-base font-semibold tracking-[-0.02em] text-stone-950">
          <User className="h-4 w-4 text-[var(--admin-text-secondary)]" />
          Müşteri Bilgileri
        </h3>
      </div>

      <div className="p-6 space-y-5">
        {/* Customer Name */}
        <div>
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-stone-950">{customerName}</p>
            {customer.id && (
              <Link
                href={`/admin/musteriler/${customer.id}`}
                className="flex items-center gap-1 rounded-full border border-[var(--admin-border)] bg-[#FCFDFE] px-3 py-1.5 text-xs font-medium text-[var(--admin-accent-hover)] transition-all hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent-hover)]"
              >
                Profili Gör
                <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </div>
        </div>

        {/* Email */}
        {customer.email && (
          <div className="rounded-[12px] border border-[#f0e3d6] bg-[#fcf8f4] p-3">
            <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-[#b18563]" />
            <p className="flex-1 truncate text-sm text-stone-700">{customer.email}</p>
            <button
              onClick={() => copyToClipboard(customer.email!, "E-posta")}
              className="rounded-[8px] p-1.5 transition-colors hover:bg-white"
              title="Kopyala"
            >
              <Copy className="w-3.5 h-3.5 text-stone-400" />
            </button>
            <a
              href={`mailto:${customer.email}`}
              className="rounded-[8px] p-1.5 transition-colors hover:bg-white"
              title="E-posta Gönder"
            >
              <Mail className="w-3.5 h-3.5 text-stone-400" />
            </a>
            </div>
          </div>
        )}

        {/* Phone */}
        {customer.phone && (
          <div className="rounded-[12px] border border-[#f0e3d6] bg-[#fcf8f4] p-3">
            <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-[#b18563]" />
            <p className="text-sm text-stone-700">{customer.phone}</p>
            <button
              onClick={() => copyToClipboard(customer.phone!, "Telefon")}
              className="rounded-[8px] p-1.5 transition-colors hover:bg-white"
              title="Kopyala"
            >
              <Copy className="w-3.5 h-3.5 text-stone-400" />
            </button>
            <a
              href={`tel:${customer.phone}`}
              className="rounded-[8px] p-1.5 transition-colors hover:bg-white"
              title="Ara"
            >
              <Phone className="w-3.5 h-3.5 text-stone-400" />
            </a>
            </div>
          </div>
        )}

        {/* Stats */}
        {(customer.totalOrders !== undefined || customer.totalSpent !== undefined) && (
          <div className="border-t border-[var(--admin-border)] pt-4">
            <div className="grid grid-cols-2 gap-3">
              {customer.totalOrders !== undefined && (
                <div className="rounded-[12px] border border-[#f0e3d6] bg-[#fcf8f4] p-4">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <ShoppingCart className="w-3.5 h-3.5 text-[#b18563]" />
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9a7c67]">Sipariş</p>
                  </div>
                  <p className="text-lg font-semibold text-stone-950">{customer.totalOrders}</p>
                </div>
              )}
              {customer.totalSpent !== undefined && (
                <div className="rounded-[12px] border border-[#f0e3d6] bg-[#fcf8f4] p-4">
                  <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9a7c67]">Harcama</p>
                  <p className="text-lg font-semibold text-[var(--admin-accent-hover)]">
                    {new Intl.NumberFormat("tr-TR", {
                      style: "currency",
                      currency: "TRY",
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    }).format(customer.totalSpent)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent Orders */}
        {customerOrders && customerOrders.length > 0 && (
          <div className="border-t border-[var(--admin-border)] pt-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">
                Diğer Siparişler
              </p>
              {customer.id && (
                <Link
                  href={`/admin/musteriler/${customer.id}?tab=orders`}
                  className="text-xs font-semibold text-[var(--admin-accent-hover)] hover:text-[#a84300]"
                >
                  Tümünü Gör
                </Link>
              )}
            </div>

            <div className="space-y-2">
              {customerOrders.slice(0, 3).map((order) => (
                <Link
                  key={order.id}
                  href={`/admin/siparisler/${order.id}`}
                  className="group flex items-center justify-between rounded-[12px] border border-[#f0e3d6] bg-[#fcf8f4] p-3 transition-colors hover:bg-[#FCFDFE]"
                >
                  <div>
                    <p className="text-sm font-semibold text-stone-900 transition-colors group-hover:text-[var(--admin-accent-hover)]">
                      #{order.orderNumber}
                    </p>
                    <p className="text-xs text-stone-500">
                      {(() => {
                        try {
                          const date = typeof order.createdAt === 'string'
                            ? new Date(order.createdAt)
                            : order.createdAt;
                          if (!date || isNaN(new Date(date).getTime())) return "Bilinmiyor";
                          return new Date(date).toLocaleDateString("tr-TR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          });
                        } catch {
                          return "Bilinmiyor";
                        }
                      })()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-stone-900">
                      {new Intl.NumberFormat("tr-TR", {
                        style: "currency",
                        currency: "TRY",
                        minimumFractionDigits: 2,
                      }).format(order.total)}
                    </p>
                    <p className="text-xs capitalize text-stone-500">{order.status}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
