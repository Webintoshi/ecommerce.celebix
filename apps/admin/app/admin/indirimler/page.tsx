"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Copy,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { AdminDiscount, DiscountStatus, DiscountType } from "@/types/discount";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function toInputDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function createDuplicateCode(code: string) {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${code.slice(0, 30)}-${suffix}`;
}

const STATUS_LABEL: Record<DiscountStatus, string> = {
  active: "Aktif",
  scheduled: "Planlandı",
  expired: "Süresi Doldu",
  draft: "Taslak",
};

const STATUS_CLASS: Record<DiscountStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  expired: "bg-rose-50 text-rose-700 border-rose-200",
  draft: "bg-gray-100 text-gray-700 border-gray-200",
};

export default function DiscountsPage() {
  const [discounts, setDiscounts] = useState<AdminDiscount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DiscountStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<DiscountType | "all">("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const loadDiscounts = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/discounts", { cache: "no-store" });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result?.error || "İndirimler alınamadı.");
      }

      setDiscounts((result.discounts || []) as AdminDiscount[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "İndirimler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiscounts();
  }, []);

  const filtered = useMemo(() => {
    return discounts.filter((discount) => {
      const matchesSearch =
        discount.name.toLowerCase().includes(search.toLowerCase()) ||
        discount.code.toLowerCase().includes(search.toLowerCase()) ||
        (discount.description || "").toLowerCase().includes(search.toLowerCase());

      const matchesStatus = statusFilter === "all" || discount.status === statusFilter;
      const matchesType = typeFilter === "all" || discount.type === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [discounts, search, statusFilter, typeFilter]);

  const stats = useMemo(() => {
    const active = discounts.filter((discount) => discount.status === "active").length;
    const scheduled = discounts.filter((discount) => discount.status === "scheduled").length;
    const expired = discounts.filter((discount) => discount.status === "expired").length;
    const draft = discounts.filter((discount) => discount.status === "draft").length;
    const totalUsage = discounts.reduce((sum, discount) => sum + discount.usedCount, 0);

    return {
      total: discounts.length,
      active,
      scheduled,
      expired,
      draft,
      totalUsage,
    };
  }, [discounts]);

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) return Array.from(new Set([...prev, id]));
      return prev.filter((item) => item !== id);
    });
  };

  const removeSingle = async (id: string, name: string) => {
    if (!window.confirm(`"${name}" indirimi silinsin mi?`)) return;

    const response = await fetch(`/api/admin/discounts/${id}`, { method: "DELETE" });
    const result = await response.json();

    if (!response.ok || !result.success) {
      window.alert(result?.error || "İndirim silinemedi.");
      return;
    }

    setSelectedIds((prev) => prev.filter((item) => item !== id));
    await loadDiscounts();
  };

  const removeBulk = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`${selectedIds.length} indirim silinsin mi?`)) return;

    const response = await fetch("/api/admin/discounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      window.alert(result?.error || "Toplu silme başarısız.");
      return;
    }

    setSelectedIds([]);
    await loadDiscounts();
  };

  const toggleActive = async (discount: AdminDiscount) => {
    const response = await fetch(`/api/admin/discounts/${discount.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        discount: {
          code: discount.code,
          type: discount.type,
          value: discount.value,
          minOrder: discount.minOrder,
          maxUses: discount.maxUses,
          startsAt: discount.startsAt,
          expiresAt: discount.expiresAt,
          isActive: !discount.isActive,
          metadata: {
            name: discount.name,
            description: discount.description || "",
            scope: discount.scope,
            visibility: discount.visibility,
            password: discount.password || "",
            limitType: discount.limitType,
            tags: discount.tags || [],
            notes: discount.notes || "",
          },
        },
      }),
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      window.alert(result?.error || "Durum güncellenemedi.");
      return;
    }

    await loadDiscounts();
  };

  const duplicateDiscount = async (discount: AdminDiscount) => {
    const payload = {
      code: createDuplicateCode(discount.code),
      type: discount.type,
      value: discount.value,
      minOrder: discount.minOrder,
      maxUses: discount.maxUses,
      startsAt: discount.startsAt,
      expiresAt: discount.expiresAt,
      isActive: false,
      metadata: {
        name: `${discount.name} (Kopya)`,
        description: discount.description || "",
        scope: discount.scope,
        visibility: discount.visibility,
        password: discount.password || "",
        limitType: discount.limitType,
        tags: discount.tags || [],
        notes: discount.notes || "",
      },
    };

    const response = await fetch("/api/admin/discounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discount: payload }),
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      window.alert(result?.error || "Kopyalama başarısız.");
      return;
    }

    await loadDiscounts();
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">İndirimler</h1>
          <p className="text-sm text-gray-500 mt-1">Kupon ve indirim kampanyalarını canlı verilerle yönetin.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadDiscounts}
            className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Yenile
          </button>
          <Link
            href="/admin/indirimler/sans-carki"
            className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            Şans Çarkı
          </Link>
          <Link
            href="/admin/indirimler/yeni"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
          >
            <Plus className="w-4 h-4" />
            Yeni İndirim
          </Link>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard title="Toplam" value={stats.total} />
        <StatCard title="Aktif" value={stats.active} />
        <StatCard title="Planlı" value={stats.scheduled} />
        <StatCard title="Süresi Dolan" value={stats.expired} />
        <StatCard title="Taslak" value={stats.draft} />
        <StatCard title="Toplam Kullanım" value={stats.totalUsage} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="İsim / kod ara..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as DiscountStatus | "all")}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            <option value="all">Tüm Durumlar</option>
            <option value="active">Aktif</option>
            <option value="scheduled">Planlandı</option>
            <option value="expired">Süresi Doldu</option>
            <option value="draft">Taslak</option>
          </select>

          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as DiscountType | "all")}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            <option value="all">Tüm Tipler</option>
            <option value="percentage">Yüzde</option>
            <option value="fixed">Sabit</option>
          </select>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
            <span className="text-sm text-rose-700">{selectedIds.length} indirim seçildi</span>
            <button
              onClick={removeBulk}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Toplu Sil
            </button>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.length === filtered.length}
                    onChange={(event) =>
                      setSelectedIds(event.target.checked ? filtered.map((discount) => discount.id) : [])
                    }
                  />
                </th>
                <th className="px-4 py-3 text-left text-gray-500 font-semibold">İndirim</th>
                <th className="px-4 py-3 text-left text-gray-500 font-semibold">Değer</th>
                <th className="px-4 py-3 text-left text-gray-500 font-semibold">Durum</th>
                <th className="px-4 py-3 text-left text-gray-500 font-semibold">Kullanım</th>
                <th className="px-4 py-3 text-left text-gray-500 font-semibold">Tarih</th>
                <th className="px-4 py-3 text-right text-gray-500 font-semibold">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((discount) => (
                <tr key={discount.id}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(discount.id)}
                      onChange={(event) => toggleSelected(discount.id, event.target.checked)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900">{discount.name}</div>
                    <div className="text-xs text-gray-500 font-mono">{discount.code}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900">
                      {discount.type === "percentage" ? `%${discount.value}` : formatCurrency(discount.value)}
                    </div>
                    <div className="text-xs text-gray-500">{discount.type === "percentage" ? "Yüzde" : "Sabit"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${STATUS_CLASS[discount.status]}`}>
                      {STATUS_LABEL[discount.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900">{discount.usedCount}</div>
                    <div className="text-xs text-gray-500">Limit: {discount.maxUses ?? "∞"}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    <div>Başlangıç: {toInputDate(discount.startsAt) || "-"}</div>
                    <div>Bitiş: {toInputDate(discount.expiresAt) || "-"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => toggleActive(discount)}
                        className={`p-2 rounded-lg border ${discount.isActive ? "text-emerald-700 border-emerald-200 bg-emerald-50" : "text-gray-600 border-gray-200 bg-white"}`}
                        title={discount.isActive ? "Pasife al" : "Aktif et"}
                      >
                        {discount.isActive ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => duplicateDiscount(discount)}
                        className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                        title="Kopyala"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <Link
                        href={`/admin/indirimler/${discount.id}/duzenle`}
                        className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 text-xs font-semibold"
                      >
                        Düzenle
                      </Link>
                      <button
                        onClick={() => removeSingle(discount.id, discount.name)}
                        className="p-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length === 0 && (
          <div className="p-10 text-center text-sm text-gray-500">Filtreye uygun indirim bulunamadı.</div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold">{title}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  );
}
