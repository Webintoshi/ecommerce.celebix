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
  TicketPercent,
  CalendarClock,
  Layers3,
  BarChart3,
  PencilLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  scheduled: "Planlandi",
  expired: "Suresi Doldu",
  draft: "Taslak",
};

const STATUS_CLASS: Record<DiscountStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  scheduled: "border-amber-200 bg-amber-50 text-amber-700",
  expired: "border-rose-200 bg-rose-50 text-rose-700",
  draft: "border-stone-200 bg-stone-100 text-stone-700",
};

const INPUT_CLASS =
  "w-full rounded-2xl border border-[#eadccd] bg-white px-4 py-3 text-sm text-[#2f241d] shadow-sm outline-none transition placeholder:text-[#a08e82] focus:border-[#FE6100]/40 focus:ring-4 focus:ring-[#FE6100]/15";

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
        throw new Error(result?.error || "Indirimler alinamadi.");
      }

      setDiscounts((result.discounts || []) as AdminDiscount[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Indirimler yuklenemedi.");
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
      window.alert(result?.error || "Indirim silinemedi.");
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
      window.alert(result?.error || "Toplu silme basarisiz.");
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
      window.alert(result?.error || "Durum guncellenemedi.");
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
      window.alert(result?.error || "Kopyalama basarisiz.");
      return;
    }

    await loadDiscounts();
  };

  return (
    <div className="min-h-screen bg-[#f6efe7] px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[32px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdf9] to-[#f8efe6] p-6 shadow-[0_24px_80px_rgba(120,74,32,0.10)] md:p-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="inline-flex w-fit items-center rounded-full border border-[#FE6100]/18 bg-gradient-to-r from-[#FE6100]/10 to-[#FFB067]/10 px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#C54E00]">
              Indirimler
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={loadDiscounts}
                className="inline-flex items-center gap-2 rounded-2xl border border-[#eadccd] bg-white px-4 py-3 text-sm font-medium text-[#7b6656] shadow-sm transition-all hover:border-[#FE6100]/25 hover:bg-[#fff8f1] hover:text-[#C54E00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                Yenile
              </button>
              <Link
                href="/admin/indirimler/sans-carki"
                className="inline-flex items-center gap-2 rounded-2xl border border-[#eadccd] bg-white px-4 py-3 text-sm font-medium text-[#7b6656] shadow-sm transition-all hover:border-[#FE6100]/25 hover:bg-[#fff8f1] hover:text-[#C54E00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
              >
                <TicketPercent className="h-4 w-4" />
                Sans Carki
              </Link>
              <Link
                href="/admin/indirimler/yeni"
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E45700] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.22)] transition hover:translate-y-[-1px] hover:from-[#f15c00] hover:to-[#d84f00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/18"
              >
                <Plus className="h-4 w-4" />
                Yeni Indirim
              </Link>
            </div>
          </div>
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#FE6100]/10 blur-3xl" />
        </section>

        {error && <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <StatCard title="Toplam" value={stats.total} icon={Layers3} tone="from-[#fff2e8] to-white text-[#FE6100] border-[#FE6100]/12" />
          <StatCard title="Aktif" value={stats.active} icon={CheckCircle2} tone="from-[#ecfdf3] to-white text-emerald-600 border-emerald-200" />
          <StatCard title="Planli" value={stats.scheduled} icon={CalendarClock} tone="from-[#fff7eb] to-white text-amber-600 border-amber-200" />
          <StatCard title="Suresi Dolan" value={stats.expired} icon={XCircle} tone="from-[#fff1f2] to-white text-rose-600 border-rose-200" />
          <StatCard title="Taslak" value={stats.draft} icon={PencilLine} tone="from-[#f7f1eb] to-white text-stone-600 border-stone-200" />
          <StatCard title="Toplam Kullanim" value={stats.totalUsage} icon={BarChart3} tone="from-[#fff4ed] to-white text-[#c96a2b] border-[#f0cfb2]" />
        </div>

        <section className="rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfa] to-[#faf4ed] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.08)] md:p-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a08e82]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Isim, kod veya aciklama ara..."
                className={cn(INPUT_CLASS, "pl-11")}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as DiscountStatus | "all")}
              className={INPUT_CLASS}
            >
              <option value="all">Tum Durumlar</option>
              <option value="active">Aktif</option>
              <option value="scheduled">Planlandi</option>
              <option value="expired">Suresi Doldu</option>
              <option value="draft">Taslak</option>
            </select>

            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as DiscountType | "all")}
              className={INPUT_CLASS}
            >
              <option value="all">Tum Tipler</option>
              <option value="percentage">Yuzde</option>
              <option value="fixed">Sabit</option>
            </select>
          </div>

          {selectedIds.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <span className="text-sm font-medium text-rose-700">{selectedIds.length} indirim secildi</span>
              <button
                onClick={removeBulk}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
              >
                <Trash2 className="h-4 w-4" />
                Toplu Sil
              </button>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfa] to-[#faf4ed] shadow-[0_24px_80px_rgba(254,97,0,0.10)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-[#FE6100]/8 bg-[#fff8f3]/85 text-left">
                <tr>
                  <th className="px-4 py-4 w-10">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selectedIds.length === filtered.length}
                      onChange={(event) => setSelectedIds(event.target.checked ? filtered.map((discount) => discount.id) : [])}
                      className="h-4 w-4 rounded border-[#d8c3b1] text-[#FE6100] focus:ring-[#FE6100]"
                    />
                  </th>
                  <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Indirim</th>
                  <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Deger</th>
                  <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Durum</th>
                  <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Kullanim</th>
                  <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Tarih</th>
                  <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Islem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2e7dc]">
                {filtered.map((discount) => (
                  <tr key={discount.id} className="bg-white/65 transition-colors hover:bg-[#fffaf5]">
                    <td className="px-4 py-4 align-top">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(discount.id)}
                        onChange={(event) => toggleSelected(discount.id, event.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-[#d8c3b1] text-[#FE6100] focus:ring-[#FE6100]"
                      />
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="font-semibold text-[#2f241d]">{discount.name}</div>
                      <div className="mt-1 inline-flex rounded-full border border-[#ecdccd] bg-[#f9f2eb] px-3 py-1 text-[11px] font-medium tracking-[0.12em] text-[#8a5b3c]">{discount.code}</div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="font-semibold text-[#2f241d]">
                        {discount.type === "percentage" ? `%${discount.value}` : formatCurrency(discount.value)}
                      </div>
                      <div className="mt-1 text-xs text-[#8c7564]">{discount.type === "percentage" ? "Yuzde" : "Sabit"}</div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <span className={cn("inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold", STATUS_CLASS[discount.status])}>
                        {STATUS_LABEL[discount.status]}
                      </span>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="font-semibold text-[#2f241d]">{discount.usedCount}</div>
                      <div className="mt-1 text-xs text-[#8c7564]">Limit: {discount.maxUses ?? "∞"}</div>
                    </td>
                    <td className="px-4 py-4 align-top text-xs text-[#6e5b4e]">
                      <div>Baslangic: {toInputDate(discount.startsAt) || "-"}</div>
                      <div className="mt-1">Bitis: {toInputDate(discount.expiresAt) || "-"}</div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          onClick={() => toggleActive(discount)}
                          className={cn(
                            "inline-flex h-11 w-11 items-center justify-center rounded-2xl border shadow-sm transition-all focus-visible:outline-none focus-visible:ring-4",
                            discount.isActive
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 focus-visible:ring-emerald-100"
                              : "border-[#eadccd] bg-white text-[#6e5b4e] hover:border-[#FE6100]/20 hover:bg-[#fff7f1] hover:text-[#C54E00] focus-visible:ring-[#FE6100]/16"
                          )}
                          title={discount.isActive ? "Pasife al" : "Aktif et"}
                        >
                          {discount.isActive ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => duplicateDiscount(discount)}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#eadccd] bg-white text-[#6e5b4e] shadow-sm transition-all hover:border-[#FE6100]/20 hover:bg-[#fff7f1] hover:text-[#C54E00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
                          title="Kopyala"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <Link
                          href={`/admin/indirimler/${discount.id}/duzenle`}
                          className="inline-flex items-center justify-center rounded-2xl border border-[#eadccd] bg-white px-4 py-3 text-xs font-semibold text-[#6e5b4e] shadow-sm transition-all hover:border-[#FE6100]/20 hover:bg-[#fff7f1] hover:text-[#C54E00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
                        >
                          Duzenle
                        </Link>
                        <button
                          onClick={() => removeSingle(discount.id, discount.name)}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 shadow-sm transition-all hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
                          title="Sil"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && filtered.length === 0 && (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#fff2e8] to-white text-[#FE6100] shadow-sm">
                <Search className="h-6 w-6" />
              </div>
              <p className="mt-4 text-sm font-medium text-[#6e5b4e]">Filtreye uygun indirim bulunamadi.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  tone,
}: {
  title: string;
  value: number;
  icon: typeof Layers3;
  tone: string;
}) {
  return (
    <div className="rounded-[28px] border border-[#eadccd] bg-white/92 p-5 shadow-[0_18px_40px_rgba(99,67,37,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9a7c67]">{title}</div>
          <div className="mt-2 text-3xl font-bold tracking-[-0.03em] text-[#2f241d]">{value}</div>
        </div>
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-[18px] border bg-gradient-to-br shadow-sm", tone)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
