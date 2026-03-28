"use client";

import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import type { Order } from "@/types/order";

interface OrderExportProps {
  orders: Order[];
}

export function OrderExport({ orders }: OrderExportProps) {
  const [isExporting, setIsExporting] = useState(false);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
    }).format(price);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("tr-TR").format(new Date(date));
  };

  const exportToCSV = () => {
    if (orders.length === 0) {
      alert("Dışa aktarılacak sipariş bulunamadı.");
      return;
    }

    setIsExporting(true);

    try {
      // CSV Header
      const headers = [
        "Sipariş No",
        "Tarih",
        "Müşteri",
        "Şehir",
        "Ürün Adedi",
        "Ara Toplam",
        "Kargo",
        "İndirim",
        "Genel Toplam",
        "Durum",
        "Ödeme Durumu",
      ];

      // CSV Rows
      const rows = orders.map((order) => [
        order.orderNumber,
        formatDate(order.createdAt),
        `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`,
        order.shippingAddress.city,
        order.items.length.toString(),
        formatPrice(order.subtotal),
        formatPrice(order.shipping),
        order.discount !== 0 ? formatPrice(order.discount) : "0",
        formatPrice(order.total),
        order.status,
        order.paymentStatus,
      ]);

      // Combine header and rows
      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
      ].join("\n");

      // Add BOM for Turkish character support
      const BOM = "\uFEFF";
      const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `siparisler_${new Date().toISOString().split("T")[0]}.csv`);
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("CSV export error:", error);
      alert("CSV dışa aktarılırken bir hata oluştu.");
    } finally {
      setIsExporting(false);
    }
  };

  const exportToExcel = () => {
    if (orders.length === 0) {
      alert("Dışa aktarılacak sipariş bulunamadı.");
      return;
    }

    setIsExporting(true);

    try {
      // Create HTML table for Excel
      let table = `
        <table>
          <thead>
            <tr>
              <th>Sipariş No</th>
              <th>Tarih</th>
              <th>Müşteri</th>
              <th>Şehir</th>
              <th>Ürün Adedi</th>
              <th>Ara Toplam</th>
              <th>Kargo</th>
              <th>İndirim</th>
              <th>Genel Toplam</th>
              <th>Durum</th>
              <th>Ödeme Durumu</th>
            </tr>
          </thead>
          <tbody>
      `;

      orders.forEach((order) => {
        table += `
          <tr>
            <td>${order.orderNumber}</td>
            <td>${formatDate(order.createdAt)}</td>
            <td>${order.shippingAddress.firstName} ${order.shippingAddress.lastName}</td>
            <td>${order.shippingAddress.city}</td>
            <td>${order.items.length}</td>
            <td>${formatPrice(order.subtotal)}</td>
            <td>${formatPrice(order.shipping)}</td>
            <td>${order.discount !== 0 ? formatPrice(order.discount) : "-"}</td>
            <td><strong>${formatPrice(order.total)}</strong></td>
            <td>${order.status}</td>
            <td>${order.paymentStatus}</td>
          </tr>
        `;
      });

      table += `
          </tbody>
        </table>
      `;

      // Create blob and download
      const blob = new Blob([table], { type: "application/vnd.ms-excel" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `siparisler_${new Date().toISOString().split("T")[0]}.xls`);
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Excel export error:", error);
      alert("Excel dışa aktarılırken bir hata oluştu.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={exportToExcel}
        disabled={isExporting || orders.length === 0}
        className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg font-bold text-sm hover:bg-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isExporting ? (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <FileSpreadsheet className="w-4 h-4" />
        )}
        <span className="hidden sm:inline">Excel</span>
      </button>
      <button
        onClick={exportToCSV}
        disabled={isExporting || orders.length === 0}
        className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg font-bold text-sm hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isExporting ? (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        <span className="hidden sm:inline">CSV</span>
      </button>
    </div>
  );
}
