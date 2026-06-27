"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  XCircle,
  TicketPercent,
  PencilLine,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageShell";
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
  scheduled: "Planlandı",
  expired: "Süresi doldu",
  draft: "Taslak",
};

const STATUS_DOT_CLASS: Record<DiscountStatus, string> = {
  active: "bg-emerald-500",
  scheduled: "bg-amber-500",
  expired: "bg-rose-500",
  draft: "bg-[#9CA3AF]",
};

const INPUT_CLASS =
  "h-10 w-full rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition placeholder:text-[#7B8794] focus:border-[#FFD1B5] focus:ring-4 focus:ring-[#FFF1E8]";

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

    return {
      total: discounts.length,
      active,
      scheduled,
      expired,
      draft,
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

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((discount) => selectedIds.includes(discount.id));

  return (
    <main role="main" aria-busy={loading} className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
      <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
        <AdminPageHeader
          sectionLabel="Pazarlama"
          title="İndirimler"
          description="Kupon ve kampanya akışını yönetin."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={loadDiscounts}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8]"
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                Yenile
              </button>
              <Link
                href="/admin/indirimler/sans-carki"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8]"
              >
                <TicketPercent className="h-4 w-4" />
                Şans Çarkı
              </Link>
              <Link
                href="/admin/indirimler/yeni"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.18)] transition hover:bg-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]"
              >
                <Plus className="h-4 w-4" />
                Yeni İndirim
              </Link>
            </div>
          }
        />

        {error ? (
          <div aria-live="assertive" className="border-y border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : null}

        <section className="border-y border-[#E1E6EF] bg-[#F9F9F9]">
          <div className="flex flex-col gap-3 px-0 py-3 min-[1080px]:flex-row min-[1080px]:items-center min-[1080px]:justify-between">
            <div className="grid flex-1 grid-cols-1 gap-2 min-[1080px]:max-w-[920px] min-[1080px]:grid-cols-[minmax(320px,1fr)_180px_160px]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--admin-text-muted)]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tabloda arama yapın"
                  aria-label="İndirim tablosunda ara"
                  className={cn(INPUT_CLASS, "pl-11")}
                />
              </label>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as DiscountStatus | "all")}
                aria-label="Duruma göre filtrele"
                className={INPUT_CLASS}
              >
                <option value="all">Tüm durumlar</option>
                <option value="active">Aktif</option>
                <option value="scheduled">Planlandı</option>
                <option value="expired">Süresi doldu</option>
                <option value="draft">Taslak</option>
              </select>

              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as DiscountType | "all")}
                aria-label="İndirim tipine göre filtrele"
                className={INPUT_CLASS}
              >
                <option value="all">Tüm tipler</option>
                <option value="percentage">Yüzde</option>
                <option value="fixed">Sabit</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-[#6B7280] min-[1080px]:justify-end">
              <span>
                <span className="text-[#111827]">{filtered.length.toLocaleString("tr-TR")}</span> sonuç
              </span>
              <span>
                <span className="text-[#111827]">{stats.total.toLocaleString("tr-TR")}</span> toplam
              </span>
              <span>
                <span className="text-emerald-600">{stats.active.toLocaleString("tr-TR")}</span> aktif
              </span>
              <span>
                <span className="text-amber-600">{stats.scheduled.toLocaleString("tr-TR")}</span> planlı
              </span>
              <span>
                <span className="text-[#E85D04]">{stats.draft.toLocaleString("tr-TR")}</span> taslak
              </span>
              <span>
                <span className="text-rose-600">{stats.expired.toLocaleString("tr-TR")}</span> süresi dolan
              </span>
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-rose-200 bg-rose-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <span className="text-sm font-semibold text-rose-700">{selectedIds.length} indirim seçildi</span>
              <button
                onClick={removeBulk}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
              >
                <Trash2 className="h-4 w-4" />
                Toplu Sil
              </button>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full table-fixed text-left text-sm">
              <thead className="bg-[#EEF3F7] text-[#4B5563]">
                <tr>
                  <th className="w-[56px] px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={(event) => setSelectedIds(event.target.checked ? filtered.map((discount) => discount.id) : [])}
                      aria-label="Tüm indirimleri seç"
                      className="h-4 w-4 rounded border-[#C9D3DF] text-[#FF6A00] focus:ring-[#FF6A00]"
                    />
                  </th>
                  <th className="w-[29%] px-4 py-3 font-semibold">İndirim</th>
                  <th className="w-[12%] px-4 py-3 font-semibold">Değer</th>
                  <th className="w-[14%] px-4 py-3 font-semibold">Durum</th>
                  <th className="w-[12%] px-4 py-3 font-semibold">Kullanım</th>
                  <th className="w-[18%] px-4 py-3 font-semibold">Tarih</th>
                  <th className="w-[15%] px-4 py-3 text-right font-semibold">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center">
                      <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#6B7280]">
                        <Loader2 className="h-4 w-4 animate-spin text-[#FF6A00]" />
                        İndirimler yükleniyor
                      </div>
                    </td>
                  </tr>
                ) : null}

                {filtered.map((discount) => (
                  <tr key={discount.id} className="border-t border-[#E7EAF0] align-top transition hover:bg-[#FFF8F3]">
                    <td className="px-4 py-4 align-top">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(discount.id)}
                        onChange={(event) => toggleSelected(discount.id, event.target.checked)}
                        aria-label={`${discount.name} indirimini seç`}
                        className="mt-1 h-4 w-4 rounded border-[#C9D3DF] text-[#FF6A00] focus:ring-[#FF6A00]"
                      />
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="truncate text-base font-semibold tracking-[-0.02em] text-[#111827]" title={discount.name}>
                        {discount.name}
                      </div>
                      <div className="mt-1 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[#E85D04]">
                        {discount.code}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="text-base font-semibold tracking-[-0.02em] text-[#111827]">
                        {discount.type === "percentage" ? `%${discount.value}` : formatCurrency(discount.value)}
                      </div>
                      <div className="mt-1 text-xs font-medium text-[#6B7280]">{discount.type === "percentage" ? "Yüzde" : "Sabit"}</div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#374151]">
                        <span className={cn("h-2 w-2 rounded-full", STATUS_DOT_CLASS[discount.status])} />
                        {STATUS_LABEL[discount.status]}
                      </span>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="text-base font-semibold text-[#111827]">{discount.usedCount.toLocaleString("tr-TR")}</div>
                      <div className="mt-1 text-xs font-medium text-[#6B7280]">Limit {discount.maxUses ?? "∞"}</div>
                    </td>
                    <td className="px-4 py-4 align-top text-sm font-medium text-[#4B5563]">
                      <div>Başlangıç: {toInputDate(discount.startsAt) || "-"}</div>
                      <div className="mt-1 text-[#6B7280]">Bitiş: {toInputDate(discount.expiresAt) || "-"}</div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => toggleActive(discount)}
                          className={cn(
                            "inline-flex h-10 w-10 items-center justify-center rounded-[8px] border transition focus-visible:outline-none focus-visible:ring-4",
                            discount.isActive
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 focus-visible:ring-emerald-100"
                              : "border-[#DCE3EC] bg-white text-[#6B7280] hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:ring-[#FFF1E8]"
                          )}
                          aria-label={discount.isActive ? "Pasife al" : "Aktif et"}
                        >
                          {discount.isActive ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicateDiscount(discount)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white text-[#6B7280] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8]"
                          aria-label="Kopyala"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <Link
                          href={`/admin/indirimler/${discount.id}/duzenle`}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white text-[#111827] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8]"
                          aria-label="Düzenle"
                        >
                          <PencilLine className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => removeSingle(discount.id, discount.name)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
                          aria-label="Sil"
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
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[12px] bg-[#FFF1E8] text-[#FF6A00]">
                <Search className="h-6 w-6" />
              </div>
              <p className="mt-4 text-lg font-semibold tracking-[-0.02em] text-[#111827]">İndirim bulunamadı</p>
              <p className="mt-1 text-sm font-medium text-[#6B7280]">Arama veya filtreyi değiştirerek tekrar deneyin.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
