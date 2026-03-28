"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { Customer } from "@/types/customer";
import {
  Plus,
  Edit,
  Trash2,
  Search,
  Filter,
  Download,
  Upload,
  Eye,
  Mail,
  Phone,
  MoreHorizontal,
  ArrowUpDown,
  UserCheck,
  UserX,
  ShieldAlert,
  Calendar
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

// Transform database customer to frontend format
function transformCustomer(dbCustomer: Record<string, unknown>): Customer {
  return {
    id: dbCustomer.id as string,
    firstName: (dbCustomer.first_name as string) || "",
    lastName: (dbCustomer.last_name as string) || "",
    email: dbCustomer.email as string,
    phone: (dbCustomer.phone as string) || "",
    status: (dbCustomer.status as Customer["status"]) || "active",
    totalOrders: Number(dbCustomer.total_orders) || 0,
    totalSpent: Number(dbCustomer.total_spent) || 0,
    lastOrderDate: dbCustomer.last_order_at ? new Date(dbCustomer.last_order_at as string) : undefined,
    averageOrderValue: Number(dbCustomer.total_spent) / Number(dbCustomer.total_orders) || 0,
    registeredAt: new Date(dbCustomer.created_at as string),
    addresses: [],
    notes: (dbCustomer.notes as string) || "",
    tags: [],
  };
}

// Simple CSV export function
function exportCustomersToCSV(customers: Customer[]): string {
  const headers = "Ad,Soyad,E-posta,Telefon,Toplam Sipariş,Toplam Harcama";
  const rows = customers.map(c =>
    `${c.firstName},${c.lastName},${c.email},${c.phone || ""},${c.totalOrders},${c.totalSpent}`
  );
  return [headers, ...rows].join("\n");
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/customers");
      const data = await res.json();
      if (data.success && data.customers) {
        setCustomers(data.customers.map(transformCustomer));
      }
    } catch (error) {
      console.error("Failed to load customers:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  // Metrics Calculation
  const metrics = useMemo(() => {
    return {
      total: customers.length,
      active: customers.filter(c => c.status === 'active').length,
      inactive: customers.filter(c => c.status === 'inactive').length,
      blocked: customers.filter(c => c.status === 'blocked').length,
      totalRevenue: customers.reduce((acc, curr) => acc + curr.totalSpent, 0)
    };
  }, [customers]);

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.phone?.includes(searchQuery);
    const matchesStatus = statusFilter === "all" || customer.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`"${name}" müşterisini silmek istediğinizden emin misiniz?`)) {
      try {
        await fetch(`/api/customers?id=${id}`, { method: "DELETE" });
        await loadCustomers();
      } catch (error) {
        console.error("Failed to delete customer:", error);
      }
    }
  };

  const handleBulkDelete = async () => {
    if (confirm(`${selectedCustomers.length} müşteriyi silmek istediğinizden emin misiniz?`)) {
      try {
        for (const id of selectedCustomers) {
          await fetch(`/api/customers?id=${id}`, { method: "DELETE" });
        }
        await loadCustomers();
        setSelectedCustomers([]);
      } catch (error) {
        console.error("Failed to delete customers:", error);
      }
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCustomers(filteredCustomers.map((c) => c.id));
    } else {
      setSelectedCustomers([]);
    }
  };

  const handleExport = () => {
    const customersToExport = selectedCustomers.length > 0
      ? customers.filter((c) => selectedCustomers.includes(c.id))
      : filteredCustomers;
    const csv = exportCustomersToCSV(customersToExport);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `musteriler_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const csvContent = event.target?.result as string;
      const lines = csvContent.split("\n").slice(1); // Skip header
      let imported = 0;
      for (const line of lines) {
        const [firstName, lastName, email, phone] = line.split(",");
        if (email) {
          try {
            await fetch("/api/customers", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ firstName, lastName, email, phone })
            });
            imported++;
          } catch (err) {
            console.error("Failed to import customer:", err);
          }
        }
      }
      await loadCustomers();
      alert(`${imported} müşteri içe aktarıldı.`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Müşteriler</h1>
          <p className="text-sm text-gray-500 mt-1">Müşteri tabanınızı yönetin ve analiz edin.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Dışa Aktar
          </button>
          <Link
            href="/admin/musteriler/yeni"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Yeni Müşteri
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Toplam Müşteri" value={metrics.total} icon={UserCheck} />
        <StatCard title="Aktif Müşteriler" value={metrics.active} icon={UserCheck} color="text-green-600" bg="bg-green-50" />
        <StatCard title="Engellenenler" value={metrics.blocked} icon={ShieldAlert} color="text-red-600" bg="bg-red-50" />
        <StatCard title="Toplam Harcama" value={formatPrice(metrics.totalRevenue)} icon={UserCheck} formatter={null} />
      </div>

      {/* Main Content Card */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {/* Filters Bar */}
        <div className="p-4 border-b border-gray-200 bg-gray-50/50 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="İsim, e-posta veya telefon ile ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 cursor-pointer"
            >
              <option value="all">Tüm Durumlar</option>
              <option value="active">Aktif</option>
              <option value="inactive">Pasif</option>
              <option value="blocked">Engelli</option>
            </select>

            {selectedCustomers.length > 0 && (
              <button
                onClick={handleBulkDelete}
                className="px-3 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-lg hover:bg-red-100 transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Seçilenleri Sil ({selectedCustomers.length})
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 w-10">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                    checked={selectedCustomers.length === filteredCustomers.length && filteredCustomers.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </th>
                <th className="px-6 py-3 font-medium text-gray-500">Müşteri</th>
                <th className="px-6 py-3 font-medium text-gray-500">Durum</th>
                <th className="px-6 py-3 font-medium text-gray-500">Toplam Harcama</th>
                <th className="px-6 py-3 font-medium text-gray-500">Son Sipariş</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="group hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                        checked={selectedCustomers.includes(customer.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedCustomers([...selectedCustomers, customer.id]);
                          else setSelectedCustomers(selectedCustomers.filter(id => id !== customer.id));
                        }}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-semibold text-sm border border-gray-200">
                          {customer.firstName[0]}{customer.lastName[0]}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{customer.firstName} {customer.lastName}</div>
                          <div className="text-gray-500 text-xs">{customer.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={customer.status} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{formatPrice(customer.totalSpent)}</div>
                      <div className="text-xs text-gray-500">{customer.totalOrders} sipariş</div>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {customer.lastOrderDate ? (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {format(new Date(customer.lastOrderDate), 'd MMM yyyy', { locale: tr })}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/admin/musteriler/${customer.id}`} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition-all">
                          <Eye className="w-4 h-4" />
                        </Link>
                        <Link href={`/admin/musteriler/${customer.id}/duzenle`} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition-all">
                          <Edit className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(customer.id, `${customer.firstName} ${customer.lastName}`)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-gray-500">
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                        <Search className="w-6 h-6 text-gray-400" />
                      </div>
                      <p className="font-medium">Müşteri bulunamadı</p>
                      <p className="text-sm">Arama kriterlerinizi değiştirin veya yeni müşteri ekleyin.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination (Static for now) */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between text-sm text-gray-500 bg-gray-50/50">
          <div>Toplam {filteredCustomers.length} kayıt gösteriliyor</div>
          <div className="flex gap-2">
            <button disabled className="px-3 py-1 border border-gray-200 rounded bg-white text-gray-400 cursor-not-allowed">Önceki</button>
            <button disabled className="px-3 py-1 border border-gray-200 rounded bg-white text-gray-400 cursor-not-allowed">Sonraki</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color = "text-gray-900", bg = "bg-gray-100", formatter }: any) {
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-start justify-between">
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{title}</p>
        <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      </div>
      <div className={`p-2 rounded-lg ${bg}`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    active: "bg-green-100 text-green-700 border-green-200",
    inactive: "bg-gray-100 text-gray-700 border-gray-200",
    blocked: "bg-red-100 text-red-700 border-red-200"
  };

  const labels = {
    active: "Aktif",
    inactive: "Pasif",
    blocked: "Engelli"
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status as keyof typeof styles]}`}>
      {labels[status as keyof typeof labels]}
    </span>
  );
}
