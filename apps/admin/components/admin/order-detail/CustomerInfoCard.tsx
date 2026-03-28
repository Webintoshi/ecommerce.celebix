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
    <div className={`bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/30">
        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <User className="w-4 h-4 text-gray-400" />
          Müşteri Bilgileri
        </h3>
      </div>

      <div className="p-6 space-y-5">
        {/* Customer Name */}
        <div>
          <div className="flex items-center justify-between">
            <p className="font-bold text-gray-900 text-base">{customerName}</p>
            {customer.id && (
              <Link
                href={`/admin/musteriler/${customer.id}`}
                className="text-xs text-primary hover:text-red-700 font-medium flex items-center gap-1"
              >
                Profili Gör
                <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </div>
        </div>

        {/* Email */}
        {customer.email && (
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-gray-400" />
            <p className="text-gray-700 text-sm flex-1 truncate">{customer.email}</p>
            <button
              onClick={() => copyToClipboard(customer.email!, "E-posta")}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              title="Kopyala"
            >
              <Copy className="w-3.5 h-3.5 text-gray-400" />
            </button>
            <a
              href={`mailto:${customer.email}`}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              title="E-posta Gönder"
            >
              <Mail className="w-3.5 h-3.5 text-gray-400" />
            </a>
          </div>
        )}

        {/* Phone */}
        {customer.phone && (
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-gray-400" />
            <p className="text-gray-700 text-sm">{customer.phone}</p>
            <button
              onClick={() => copyToClipboard(customer.phone!, "Telefon")}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              title="Kopyala"
            >
              <Copy className="w-3.5 h-3.5 text-gray-400" />
            </button>
            <a
              href={`tel:${customer.phone}`}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              title="Ara"
            >
              <Phone className="w-3.5 h-3.5 text-gray-400" />
            </a>
          </div>
        )}

        {/* Stats */}
        {(customer.totalOrders !== undefined || customer.totalSpent !== undefined) && (
          <div className="pt-4 border-t border-gray-100">
            <div className="grid grid-cols-2 gap-3">
              {customer.totalOrders !== undefined && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <ShoppingCart className="w-3.5 h-3.5 text-gray-400" />
                    <p className="text-xs font-bold text-gray-400">Sipariş</p>
                  </div>
                  <p className="text-lg font-black text-gray-900">{customer.totalOrders}</p>
                </div>
              )}
              {customer.totalSpent !== undefined && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs font-bold text-gray-400 mb-0.5">Harcama</p>
                  <p className="text-lg font-black text-primary">
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
          <div className="pt-6 border-t border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Diğer Siparişler
              </p>
              {customer.id && (
                <Link
                  href={`/admin/musteriler/${customer.id}?tab=orders`}
                  className="text-xs font-bold text-primary hover:text-red-700"
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
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors group"
                >
                  <div>
                    <p className="font-bold text-gray-900 text-sm group-hover:text-primary transition-colors">
                      #{order.orderNumber}
                    </p>
                    <p className="text-xs text-gray-500">
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
                    <p className="font-bold text-gray-900 text-sm">
                      {new Intl.NumberFormat("tr-TR", {
                        style: "currency",
                        currency: "TRY",
                        minimumFractionDigits: 2,
                      }).format(order.total)}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">{order.status}</p>
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
