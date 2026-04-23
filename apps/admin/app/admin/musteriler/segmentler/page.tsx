"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Edit, Eye, Loader2, Plus, Search, Trash2, Users, X } from "lucide-react";

type SegmentField = "totalSpent" | "totalOrders" | "averageOrderValue" | "lastOrderDays" | "registeredDays" | "status";
type SegmentOperator = ">" | "<" | ">=" | "<=" | "=" | "contains" | "not_contains";

type SegmentCondition = {
  field: SegmentField;
  operator: SegmentOperator;
  value: string | number;
};

type Segment = {
  id: string;
  name: string;
  description: string;
  logic: "all" | "any";
  conditions: SegmentCondition[];
  createdAt: string;
  updatedAt: string;
};

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: "active" | "inactive" | "blocked";
  totalOrders: number;
  totalSpent: number;
  averageOrderValue: number;
  lastOrderAt: Date | null;
  createdAt: Date;
};

type FormState = {
  name: string;
  description: string;
  logic: "all" | "any";
  conditions: Array<{ field: SegmentField; operator: SegmentOperator; value: string }>;
};

const FIELD_TYPES: Record<SegmentField, "number" | "text"> = {
  totalSpent: "number",
  totalOrders: "number",
  averageOrderValue: "number",
  lastOrderDays: "number",
  registeredDays: "number",
  status: "text",
};

function transformCustomer(row: Record<string, unknown>): Customer {
  const totalOrders = Number(row.total_orders) || 0;
  const totalSpent = Number(row.total_spent) || 0;
  return {
    id: String(row.id || ""),
    firstName: String(row.first_name || ""),
    lastName: String(row.last_name || ""),
    email: String(row.email || ""),
    status: (row.status as Customer["status"]) || "active",
    totalOrders,
    totalSpent,
    averageOrderValue: totalOrders > 0 ? totalSpent / totalOrders : 0,
    lastOrderAt: row.last_order_at ? new Date(String(row.last_order_at)) : null,
    createdAt: new Date(String(row.created_at || new Date().toISOString())),
  };
}

function daysSince(date: Date) {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function getValue(customer: Customer, field: SegmentField): string | number {
  if (field === "totalSpent") return customer.totalSpent;
  if (field === "totalOrders") return customer.totalOrders;
  if (field === "averageOrderValue") return customer.averageOrderValue;
  if (field === "registeredDays") return daysSince(customer.createdAt);
  if (field === "lastOrderDays") return customer.lastOrderAt ? daysSince(customer.lastOrderAt) : Number.POSITIVE_INFINITY;
  return customer.status;
}

function compare(left: string | number, operator: SegmentOperator, right: string | number) {
  if (typeof left === "number" && typeof right === "number") {
    if (operator === ">") return left > right;
    if (operator === "<") return left < right;
    if (operator === ">=") return left >= right;
    if (operator === "<=") return left <= right;
    if (operator === "=") return left === right;
    return false;
  }
  const a = String(left).toLowerCase();
  const b = String(right).toLowerCase();
  if (operator === "=") return a === b;
  if (operator === "contains") return a.includes(b);
  if (operator === "not_contains") return !a.includes(b);
  return false;
}

function matchSegment(segment: Segment, customer: Customer) {
  const checks = segment.conditions.map((c) => {
    const left = getValue(customer, c.field);
    const right = FIELD_TYPES[c.field] === "number" ? Number(c.value) || 0 : String(c.value);
    return compare(left, c.operator, right);
  });
  return segment.logic === "any" ? checks.some(Boolean) : checks.every(Boolean);
}

function defaultForm(): FormState {
  return {
    name: "",
    description: "",
    logic: "all",
    conditions: [{ field: "totalSpent", operator: ">=", value: "5000" }],
  };
}

export default function SegmentsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [viewSegmentId, setViewSegmentId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [customerRes, segmentRes] = await Promise.all([
        fetch("/api/customers", { cache: "no-store" }),
        fetch("/api/admin/customers/segments", { cache: "no-store" }),
      ]);
      const customerJson = await customerRes.json();
      const segmentJson = await segmentRes.json();
      if (!customerRes.ok || !customerJson.success) throw new Error(customerJson?.error || "Müşteriler alınamadı.");
      if (!segmentRes.ok || !segmentJson.success) throw new Error(segmentJson?.error || "Segmentler alınamadı.");
      setCustomers((customerJson.customers || []).map(transformCustomer));
      setSegments(segmentJson.segments || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const enriched = useMemo(() => segments.map((s) => ({ ...s, members: customers.filter((c) => matchSegment(s, c)) })), [segments, customers]);
  const filtered = useMemo(() => enriched.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase())), [enriched, search]);
  const viewing = enriched.find((s) => s.id === viewSegmentId) || null;

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm());
    setOpenForm(true);
  };

  const openEdit = (segment: Segment) => {
    setEditingId(segment.id);
    setForm({
      name: segment.name,
      description: segment.description,
      logic: segment.logic,
      conditions: segment.conditions.map((c) => ({ field: c.field, operator: c.operator, value: String(c.value) })),
    });
    setOpenForm(true);
  };

  const saveSegment = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      logic: form.logic,
      conditions: form.conditions.map((c) => ({ ...c, value: FIELD_TYPES[c.field] === "number" ? Number(c.value) || 0 : c.value })),
    };

    const response = await fetch("/api/admin/customers/segments", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { id: editingId, segment: payload } : { segment: payload }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      window.alert(result?.error || "Segment kaydedilemedi.");
      return;
    }
    setSegments(result.segments || []);
    setOpenForm(false);
  };

  const removeSegment = async (id: string, name: string) => {
    if (!window.confirm(`"${name}" segmentini silmek istiyor musunuz?`)) return;
    const response = await fetch(`/api/admin/customers/segments?id=${id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok || !result.success) {
      window.alert(result?.error || "Segment silinemedi.");
      return;
    }
    setSegments(result.segments || []);
  };

  const segmentCount = enriched.length;
  const matchedCustomers = enriched.reduce((total, segment) => total + segment.members.length, 0);
  const activeSearch = search.trim().length > 0;

  return (
    <main className="admin-page-root">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="hidden" />
        <div className="hidden" />
        <div className="hidden" />
      </div>

      <div className="relative mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <section className="overflow-hidden rounded-[30px] border border-[var(--admin-border)] bg-white shadow-[var(--shadow-md)]">
          <div className="flex flex-col gap-6 border-b border-[var(--admin-border)] px-6 py-6 md:px-8 md:py-7 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-4">
              <div className="inline-flex w-fit items-center rounded-full border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--admin-accent)]">
                Müşteri segmentleri
              </div>
            </div>

            <button
              onClick={openCreate}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--admin-accent)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-md)] transition hover:translate-y-[-1px] hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]"
            >
              <Plus className="h-4 w-4" />
              Yeni Segment
            </button>
          </div>

          <div className="grid grid-cols-1 gap-px bg-[#EEF1F4] md:grid-cols-3">
            <HeroStat label="Toplam segment" value={segmentCount.toLocaleString("tr-TR")} />
            <HeroStat label="Eşleşen müşteri" value={matchedCustomers.toLocaleString("tr-TR")} />
            <HeroStat label="Aktif görünüm" value={loading ? "Hazırlanıyor" : `${filtered.length.toLocaleString("tr-TR")} segment`} />
          </div>
        </section>

        {error ? <div className="rounded-[24px] border border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 px-5 py-4 text-sm font-medium text-rose-700 shadow-sm">{error}</div> : null}

        <section className="rounded-[30px] border border-[var(--admin-border)] bg-white p-5 shadow-[var(--shadow-md)] md:p-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-gray-950">Filtreler</h2>
              </div>
              <div aria-live="polite" className="inline-flex items-center gap-2 rounded-full border border-[var(--admin-border)] bg-white px-3 py-2 text-sm font-medium text-gray-600">
                <Users className="h-4 w-4 text-[var(--admin-accent)]" />
                {loading ? "Segmentler hazırlanıyor" : `${filtered.length.toLocaleString("tr-TR")} segment gösteriliyor`}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Segment adı veya açıklaması ile ara..."
                  className="w-full rounded-2xl border border-[var(--admin-border)] bg-white/85 py-3 pl-11 pr-4 text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-[var(--admin-accent)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--admin-accent)]/15"
                />
              </div>
              <div className="rounded-2xl border border-dashed border-[#e8d7c7] bg-white/70 px-4 py-3 text-sm text-[#8b7768]">
                {activeSearch ? "Arama filtresi aktif" : "Arama ile segmentleri hızlıca bulun"}
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="rounded-[30px] border border-[var(--admin-border)] bg-white p-10 shadow-[var(--shadow-md)]">
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-[var(--admin-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent)] shadow-sm">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
              <div>
                <p className="text-base font-semibold text-[var(--admin-heading)]">Segmentler hazırlanıyor</p>
              </div>
            </div>
          </section>
        ) : filtered.length === 0 ? (
          <section className="rounded-[30px] border border-[var(--admin-border)] bg-white p-8 shadow-[var(--shadow-md)] md:p-10">
            <div className="mx-auto flex max-w-lg flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-[24px] border border-[var(--admin-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent)] shadow-sm">
                <Users className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xl font-semibold tracking-[-0.03em] text-[var(--admin-heading)]">
                  {segmentCount === 0 ? "Henüz segment oluşturulmamış" : "Aramanızla eşleşen segment bulunamadı"}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#7d6959]">
                  {segmentCount === 0
                    ? "Yeni bir segment oluşturarak müşteri gruplarını harcama, sipariş ve durum kriterleriyle ayırabilirsiniz."
                    : "Farklı bir anahtar kelime deneyin veya mevcut segmentlerin tamamını görmek için aramayı temizleyin."}
                </p>
              </div>
              <button
                onClick={segmentCount === 0 ? openCreate : () => setSearch("")}
                className="inline-flex items-center gap-2 rounded-2xl border border-[var(--admin-accent-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--admin-accent-hover)] shadow-sm transition-all hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]"
              >
                <Plus className="h-4 w-4" />
                {segmentCount === 0 ? "İlk Segmenti Oluştur" : "Aramayı Temizle"}
              </button>
            </div>
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((segment) => (
              <article
                key={segment.id}
                className="group rounded-[28px] border border-[var(--admin-border)] bg-white/92 p-5 shadow-[var(--shadow-md)] transition-all hover:-translate-y-1 hover:border-[var(--admin-accent-border)] hover:bg-white hover:shadow-[var(--shadow-md)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="inline-flex rounded-full border border-[var(--admin-border)] bg-[#f9f2eb] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-text-secondary)]">
                      {segment.logic === "all" ? "Tüm koşullar" : "Herhangi bir koşul"}
                    </div>
                    <h3 className="mt-3 text-lg font-semibold tracking-[-0.03em] text-[var(--admin-heading)]">{segment.name}</h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#7d6959]">{segment.description || "Bu segment için açıklama eklenmemiş."}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => setViewSegmentId(segment.id)} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--admin-border)] bg-white text-[var(--admin-text-secondary)] shadow-sm transition-all hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] hover:text-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"><Eye className="h-4 w-4" /></button>
                    <button onClick={() => openEdit(segment)} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--admin-border)] bg-white text-[var(--admin-text-secondary)] shadow-sm transition-all hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] hover:text-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"><Edit className="h-4 w-4" /></button>
                    <button onClick={() => removeSegment(segment.id, segment.name)} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600 shadow-sm transition-all hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <MiniStat label="Koşul" value={segment.conditions.length.toLocaleString("tr-TR")} />
                  <MiniStat label="Eşleşen" value={segment.members.length.toLocaleString("tr-TR")} />
                </div>

                <div className="mt-5 rounded-[22px] border border-[var(--admin-border)] bg-[#FCFDFE] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Son güncelleme</p>
                  <p className="mt-1 text-sm font-medium text-[var(--admin-heading)]">{new Date(segment.updatedAt).toLocaleString("tr-TR")}</p>
                </div>
              </article>
            ))}
          </section>
        )}

        {openForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2f241d]/45 p-3 backdrop-blur-sm md:p-4">
            <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[32px] border border-[var(--admin-border)] bg-white shadow-[var(--shadow-md)]">
              <div className="sticky top-0 z-10 border-b border-[var(--admin-border)] bg-white/95 px-5 py-5 backdrop-blur md:px-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex rounded-full border border-[var(--admin-border)] bg-[var(--admin-accent-soft)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--admin-accent)]">
                      {editingId ? "Segment düzenle" : "Yeni segment"}
                    </div>
                    <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[var(--admin-heading)]">Segment kural akışı</h2>
                  </div>
                  <button onClick={() => setOpenForm(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--admin-border)] bg-white text-[var(--admin-text-secondary)] shadow-sm transition-all hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] hover:text-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"><X className="h-5 w-5" /></button>
                </div>
              </div>

              <form onSubmit={saveSegment} className="space-y-6 p-5 md:p-6">
                <section className="rounded-[28px] border border-[var(--admin-border)] bg-white p-5 shadow-[var(--shadow-md)]">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[var(--admin-text-secondary)]">Segment adı</label>
                      <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Örn: VIP alışveriş kulübü" className="w-full rounded-2xl border border-[var(--admin-border)] bg-white/85 px-4 py-3 text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-[var(--admin-accent)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--admin-accent)]/15" />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[var(--admin-text-secondary)]">Kural mantığı</label>
                      <select value={form.logic} onChange={(e) => setForm({ ...form, logic: e.target.value === "any" ? "any" : "all" })} className="w-full rounded-2xl border border-[var(--admin-border)] bg-white/85 px-4 py-3 text-sm text-gray-700 shadow-sm transition-all focus:border-[var(--admin-accent)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--admin-accent)]/15">
                        <option value="all">Tüm koşullar sağlansın (AND)</option>
                        <option value="any">Koşullardan biri sağlansın (OR)</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-medium text-[var(--admin-text-secondary)]">Açıklama</label>
                    <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Segmentin amacı ve kullanım notu" className="w-full rounded-2xl border border-[var(--admin-border)] bg-white/85 px-4 py-3 text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-[var(--admin-accent)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--admin-accent)]/15" />
                  </div>
                </section>

                <section className="rounded-[28px] border border-[var(--admin-border)] bg-white/92 p-5 shadow-[var(--shadow-md)]">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Koşullar</p>
                      <h3 className="mt-1 text-lg font-semibold text-[var(--admin-heading)]">Segment kriterleri</h3>
                    </div>
                    <button type="button" onClick={() => setForm({ ...form, conditions: [...form.conditions, { field: "totalSpent", operator: ">=", value: "0" }] })} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--admin-accent-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--admin-accent-hover)] shadow-sm transition-all hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]">
                      <Plus className="h-4 w-4" />
                      Kriter Ekle
                    </button>
                  </div>

                  <div className="space-y-3">
                    {form.conditions.map((c, i) => (
                      <div key={i} className="rounded-[24px] border border-[var(--admin-border)] bg-[#FCFDFE] p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Kural {i + 1}</div>
                          <button type="button" onClick={() => setForm({ ...form, conditions: form.conditions.length > 1 ? form.conditions.filter((_, idx) => idx !== i) : form.conditions })} className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition-all hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200">Sil</button>
                        </div>
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
                          <select value={c.field} onChange={(e) => {
                            const field = e.target.value as SegmentField;
                            const next = [...form.conditions];
                            next[i] = { field, operator: FIELD_TYPES[field] === "number" ? ">=" : "=", value: field === "status" ? "active" : "0" };
                            setForm({ ...form, conditions: next });
                          }} className="rounded-2xl border border-[var(--admin-border)] bg-white/85 px-4 py-3 text-sm text-gray-700 shadow-sm transition-all focus:border-[var(--admin-accent)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--admin-accent)]/15">
                            <option value="totalSpent">Toplam Harcama</option>
                            <option value="totalOrders">Toplam Sipariş</option>
                            <option value="averageOrderValue">Ortalama Sepet</option>
                            <option value="lastOrderDays">Son Sipariş Günü</option>
                            <option value="registeredDays">Kayıt Yaşı (gün)</option>
                            <option value="status">Durum</option>
                          </select>
                          <select value={c.operator} onChange={(e) => {
                            const next = [...form.conditions];
                            next[i] = { ...next[i], operator: e.target.value as SegmentOperator };
                            setForm({ ...form, conditions: next });
                          }} className="rounded-2xl border border-[var(--admin-border)] bg-white/85 px-4 py-3 text-sm text-gray-700 shadow-sm transition-all focus:border-[var(--admin-accent)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--admin-accent)]/15">
                            {FIELD_TYPES[c.field] === "number" ? (
                              <>
                                <option value=">=">{">="}</option>
                                <option value=">">{">"}</option>
                                <option value="<=">{"<="}</option>
                                <option value="<">{"<"}</option>
                                <option value="=">{"="}</option>
                              </>
                            ) : (
                              <option value="=">{"="}</option>
                            )}
                          </select>
                          {c.field === "status" ? (
                            <select value={c.value} onChange={(e) => {
                              const next = [...form.conditions];
                              next[i] = { ...next[i], value: e.target.value };
                              setForm({ ...form, conditions: next });
                            }} className="rounded-2xl border border-[var(--admin-border)] bg-white/85 px-4 py-3 text-sm text-gray-700 shadow-sm transition-all focus:border-[var(--admin-accent)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--admin-accent)]/15">
                              <option value="active">Aktif</option>
                              <option value="inactive">Pasif</option>
                              <option value="blocked">Engelli</option>
                            </select>
                          ) : (
                            <input type="number" value={c.value} onChange={(e) => {
                              const next = [...form.conditions];
                              next[i] = { ...next[i], value: e.target.value };
                              setForm({ ...form, conditions: next });
                            }} className="rounded-2xl border border-[var(--admin-border)] bg-white/85 px-4 py-3 text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-[var(--admin-accent)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--admin-accent)]/15" />
                          )}
                          <div className="flex items-center rounded-2xl border border-dashed border-[#e8d7c7] bg-white/70 px-4 py-3 text-sm text-[#8b7768]">
                            {FIELD_TYPES[c.field] === "number" ? "Sayısal eşik ile filtrelenir" : "Durum alanı ile karşılaştırılır"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--admin-accent)] px-5 py-3.5 text-sm font-semibold text-white shadow-[var(--shadow-md)] transition hover:translate-y-[-1px] hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]">{editingId ? "Segmenti Güncelle" : "Segmenti Oluştur"}</button>
              </form>
            </div>
          </div>
        )}

        {viewing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2f241d]/45 p-3 backdrop-blur-sm md:p-4">
            <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[32px] border border-[var(--admin-border)] bg-white shadow-[var(--shadow-md)]">
              <div className="sticky top-0 z-10 border-b border-[var(--admin-border)] bg-white/95 px-5 py-5 backdrop-blur md:px-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex rounded-full border border-[var(--admin-border)] bg-[var(--admin-accent-soft)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--admin-accent)]">Segment üyeleri</div>
                    <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[var(--admin-heading)]">{viewing.name}</h2>
                    <p className="mt-1 text-sm text-[#7d6959]">{viewing.members.length} müşteri bu segmentle eşleşiyor.</p>
                  </div>
                  <button onClick={() => setViewSegmentId(null)} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--admin-border)] bg-white text-[var(--admin-text-secondary)] shadow-sm transition-all hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] hover:text-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"><X className="h-5 w-5" /></button>
                </div>
              </div>

              <div className="space-y-5 p-5 md:p-6">
                <section className="rounded-[28px] border border-[var(--admin-border)] bg-white p-5 shadow-[var(--shadow-md)]">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <MiniStat label="Koşul sayısı" value={viewing.conditions.length.toLocaleString("tr-TR")} />
                    <MiniStat label="Mantık" value={viewing.logic === "all" ? "AND" : "OR"} />
                    <MiniStat label="Eşleşme" value={viewing.members.length.toLocaleString("tr-TR")} />
                  </div>
                </section>

                <section className="rounded-[28px] border border-[var(--admin-border)] bg-white/92 p-5 shadow-[var(--shadow-md)]">
                  <div className="mb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Müşteri listesi</p>
                    <h3 className="mt-1 text-lg font-semibold text-[var(--admin-heading)]">Eşleşen müşteriler</h3>
                  </div>

                  <div className="space-y-3">
                    {viewing.members.map((c) => (
                      <div key={c.id} className="flex flex-col gap-3 rounded-[22px] border border-[var(--admin-border)] bg-[#FCFDFE] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-medium text-[var(--admin-heading)]">{c.firstName} {c.lastName}</div>
                          <div className="mt-1 text-sm text-[#7d6959]">{c.email}</div>
                        </div>
                        <Link href={`/admin/musteriler/${c.id}`} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--admin-accent-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--admin-accent-hover)] shadow-sm transition-all hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]">Aç</Link>
                      </div>
                    ))}
                    {viewing.members.length === 0 && <div className="rounded-[22px] border border-dashed border-[#e8d7c7] bg-white/70 px-4 py-8 text-center text-sm text-[#8b7768]">Bu segmentte henüz müşteri yok.</div>}
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/70 bg-white/80 px-5 py-5 backdrop-blur-sm md:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--admin-heading)]">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-[var(--admin-border)] bg-[#FCFDFE] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--admin-heading)]">{value}</p>
    </div>
  );
}
