"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Edit, Eye, Loader2, Plus, Search, Trash2, Users, X } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageShell";

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

const FIELD_LABELS: Record<SegmentField, string> = {
  totalSpent: "Toplam Harcama",
  totalOrders: "Toplam Sipariş",
  averageOrderValue: "Ortalama Sepet",
  lastOrderDays: "Son Sipariş Günü",
  registeredDays: "Kayıt Yaşı",
  status: "Durum",
};

const OPERATOR_LABELS: Record<SegmentOperator, string> = {
  ">": ">",
  "<": "<",
  ">=": ">=",
  "<=": "<=",
  "=": "=",
  contains: "içerir",
  not_contains: "içermez",
};

const STATUS_LABELS: Record<Customer["status"], string> = {
  active: "Aktif",
  inactive: "Pasif",
  blocked: "Engelli",
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

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tarih yok";
  return date.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function conditionText(condition: SegmentCondition) {
  const value = condition.field === "status"
    ? STATUS_LABELS[String(condition.value) as Customer["status"]] || String(condition.value)
    : String(condition.value);

  return `${FIELD_LABELS[condition.field]} ${OPERATOR_LABELS[condition.operator]} ${value}`;
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
    <main role="main" aria-busy={loading} className="min-h-screen bg-[#F9F9F9]">
      <div className="w-full px-0 py-3 md:py-5">
        <div className="space-y-4">
          <AdminPageHeader
            sectionLabel="Müşteri"
            title="Segmentler"
            actions={
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex h-11 items-center gap-2 rounded-[7px] bg-[#FF6A00] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.18)] transition hover:bg-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]"
              >
                <Plus className="h-4 w-4" />
                Segment Oluştur
              </button>
            }
          />

          {error ? (
            <div
              aria-live="assertive"
              className="border-y border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-700"
            >
              {error}
            </div>
          ) : null}

          <section className="border-y border-[#E1E6EF] bg-[#F9F9F9]">
            <div className="flex flex-col gap-3 px-4 py-4 md:px-6 min-[1025px]:flex-row min-[1025px]:items-center min-[1025px]:justify-between">
              <div className="grid flex-1 grid-cols-1 gap-3 min-[1025px]:max-w-[820px] min-[1025px]:grid-cols-[minmax(0,1fr)_auto]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7B8794]" />
                  <input
                    type="text"
                    placeholder="Tabloda arama yapın"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    aria-label="Tabloda segment ara"
                    className="h-11 w-full rounded-[7px] border border-[#E1E6EF] bg-white pl-11 pr-4 text-sm font-medium text-[#111827] outline-none transition placeholder:text-[#7B8794] focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]"
                  />
                </label>

                <span
                  aria-live="polite"
                  className="inline-flex h-11 items-center rounded-[7px] border border-[#E1E6EF] bg-white px-3 text-sm font-semibold text-[#6B7280]"
                >
                  {loading
                    ? "Hazırlanıyor"
                    : `${filtered.length.toLocaleString("tr-TR")} segment`}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 min-[1025px]:justify-end">
                <span className="rounded-[7px] border border-[#E1E6EF] bg-white px-3 py-2 text-sm font-semibold text-[#6B7280]">
                  Toplam {segmentCount.toLocaleString("tr-TR")}
                </span>
                <span className="rounded-[7px] border border-[#FFD7BF] bg-[#FFF1E8] px-3 py-2 text-sm font-semibold text-[#E85D04]">
                  {matchedCustomers.toLocaleString("tr-TR")} eşleşme
                </span>
              </div>
            </div>

            {loading ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center border-t border-[#E1E6EF] px-6 py-16 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[12px] border border-[#FFD7BF] bg-[#FFF1E8] text-[#FF6A00]">
                  <Loader2 className="h-7 w-7 animate-spin" />
                </div>
                <p className="mt-5 text-lg font-semibold tracking-[-0.03em] text-[#111827]">Segmentler yükleniyor...</p>
                <p className="mt-2 max-w-md text-sm leading-6 text-[#6B7280]">
                  Liste hazırlanırken görünüm otomatik olarak güncellenecek.
                </p>
              </div>
            ) : filtered.length > 0 ? (
              <>
                <div className="space-y-3 border-t border-[#E1E6EF] p-3.5 sm:p-5 min-[1025px]:hidden">
                  {filtered.map((segment) => (
                    <article
                      key={segment.id}
                      className="rounded-[8px] border border-[#E1E6EF] bg-white p-4 shadow-none transition hover:border-[#FFD7BF] sm:p-5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <LogicBadge logic={segment.logic} />
                          <h2 className="mt-3 text-base font-semibold tracking-[-0.02em] text-[#111827]">
                            {segment.name}
                          </h2>
                          <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#6B7280]">
                            {segment.description || "Bu segment için açıklama eklenmemiş."}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-[7px] border border-[#E1E6EF] bg-[#F9F9F9] px-2.5 py-1 text-xs font-semibold text-[#6B7280]">
                          {segment.members.length.toLocaleString("tr-TR")} müşteri
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <MobileInfoCard label="Koşul" value={segment.conditions.length.toLocaleString("tr-TR")} />
                        <MobileInfoCard label="Güncelleme" value={formatDate(segment.updatedAt)} />
                      </div>

                      <div className="mt-4 rounded-[7px] border border-[#E1E6EF] bg-[#F9F9F9] px-3 py-2 text-sm text-[#6B7280]">
                        {segment.conditions.slice(0, 2).map(conditionText).join(" · ")}
                        {segment.conditions.length > 2 ? ` · +${segment.conditions.length - 2} kural` : ""}
                      </div>

                      <div className="mt-4 flex items-center justify-end gap-2">
                        <ActionButton label={`${segment.name} segmentini görüntüle`} onClick={() => setViewSegmentId(segment.id)}>
                          <Eye className="h-4 w-4" />
                        </ActionButton>
                        <ActionButton label={`${segment.name} segmentini düzenle`} onClick={() => openEdit(segment)}>
                          <Edit className="h-4 w-4" />
                        </ActionButton>
                        <button
                          type="button"
                          onClick={() => removeSegment(segment.id, segment.name)}
                          aria-label={`${segment.name} segmentini sil`}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-[7px] border border-rose-100 bg-white text-[#6B7280] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="hidden overflow-x-auto border-t border-[#E1E6EF] min-[1025px]:block">
                  <table className="w-full min-w-[1040px] text-left text-sm">
                    <thead className="bg-[#EEF2F6]">
                      <tr>
                        <th className="px-5 py-4 text-[13px] font-semibold text-[#4B5563]">Segment</th>
                        <th className="px-5 py-4 text-[13px] font-semibold text-[#4B5563]">Kural Mantığı</th>
                        <th className="px-5 py-4 text-[13px] font-semibold text-[#4B5563]">Koşullar</th>
                        <th className="px-5 py-4 text-[13px] font-semibold text-[#4B5563]">Eşleşen Müşteri</th>
                        <th className="px-5 py-4 text-[13px] font-semibold text-[#4B5563]">Son Güncelleme</th>
                        <th className="px-5 py-4 text-right text-[13px] font-semibold text-[#4B5563]">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((segment) => (
                        <tr key={segment.id} className="group border-b border-[#E1E6EF] last:border-b-0 hover:bg-white">
                          <td className="max-w-[340px] px-5 py-5 align-top">
                            <div className="font-semibold text-[#111827]">{segment.name}</div>
                            <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#6B7280]">
                              {segment.description || "Bu segment için açıklama eklenmemiş."}
                            </p>
                          </td>
                          <td className="px-5 py-5 align-top">
                            <LogicBadge logic={segment.logic} />
                          </td>
                          <td className="max-w-[360px] px-5 py-5 align-top">
                            <div className="space-y-1.5">
                              {segment.conditions.slice(0, 2).map((condition, index) => (
                                <div key={`${segment.id}-${index}`} className="text-sm font-medium text-[#374151]">
                                  {conditionText(condition)}
                                </div>
                              ))}
                              {segment.conditions.length > 2 ? (
                                <div className="text-sm font-semibold text-[#E85D04]">
                                  +{segment.conditions.length - 2} kural
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-5 py-5 align-top">
                            <div className="font-semibold text-[#111827]">{segment.members.length.toLocaleString("tr-TR")}</div>
                            <div className="mt-1 text-sm text-[#6B7280]">müşteri</div>
                          </td>
                          <td className="px-5 py-5 align-top">
                            <div className="font-medium text-[#111827]">{formatDate(segment.updatedAt)}</div>
                          </td>
                          <td className="px-5 py-5 text-right align-top">
                            <div className="flex items-center justify-end gap-1.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                              <ActionButton label={`${segment.name} segmentini görüntüle`} onClick={() => setViewSegmentId(segment.id)}>
                                <Eye className="h-4 w-4" />
                              </ActionButton>
                              <ActionButton label={`${segment.name} segmentini düzenle`} onClick={() => openEdit(segment)}>
                                <Edit className="h-4 w-4" />
                              </ActionButton>
                              <button
                                type="button"
                                onClick={() => removeSegment(segment.id, segment.name)}
                                aria-label={`${segment.name} segmentini sil`}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-[7px] border border-rose-100 bg-white text-[#6B7280] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
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
              </>
            ) : (
              <div className="flex min-h-[460px] flex-col items-center justify-center border-t border-[#E1E6EF] px-6 py-16 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[12px] border border-[#FFD7BF] bg-[#FFF1E8] text-[#FF6A00]">
                  <Users className="h-7 w-7" />
                </div>
                <p className="mt-5 text-lg font-semibold tracking-[-0.03em] text-[#111827]" aria-live="polite">
                  {segmentCount === 0 ? "Henüz segment oluşturulmamış" : "Sonuç bulunamadı"}
                </p>
                <p className="mt-2 max-w-md text-sm leading-6 text-[#6B7280]">
                  {segmentCount === 0
                    ? "Yeni segment oluşturduğunuzda müşteri grupları bu alanda yönetilecek."
                    : "Arama kriterini değiştirerek tekrar deneyin."}
                </p>
                <button
                  type="button"
                  onClick={segmentCount === 0 ? openCreate : () => setSearch("")}
                  className="mt-5 inline-flex h-11 items-center gap-2 rounded-[7px] border border-[#FFD7BF] bg-white px-4 text-sm font-semibold text-[#E85D04] transition hover:bg-[#FFF8F3] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
                >
                  <Plus className="h-4 w-4" />
                  {segmentCount === 0 ? "Segment Oluştur" : "Aramayı Temizle"}
                </button>
              </div>
            )}

            <div className="border-t border-[#E1E6EF] bg-[#F9F9F9] px-4 py-4 md:px-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p aria-live="polite" className="text-sm font-medium text-[#6B7280]">
                  <span className="font-semibold text-[#111827]">{filtered.length.toLocaleString("tr-TR")}</span> segment gösteriliyor
                  {activeSearch ? " · arama aktif" : ""}
                </p>
                <div className="text-sm font-medium text-[#6B7280]">
                  {matchedCustomers.toLocaleString("tr-TR")} toplam eşleşme
                </div>
              </div>
            </div>
          </section>

          {openForm ? (
            <SegmentFormModal
              editingId={editingId}
              form={form}
              onClose={() => setOpenForm(false)}
              onSubmit={saveSegment}
              onChange={setForm}
            />
          ) : null}

          {viewing ? (
            <SegmentMembersModal segment={viewing} onClose={() => setViewSegmentId(null)} />
          ) : null}
        </div>
      </div>
    </main>
  );
}

function SegmentFormModal({
  editingId,
  form,
  onClose,
  onSubmit,
  onChange,
}: {
  editingId: string | null;
  form: FormState;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onChange: (form: FormState) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/35 p-3 backdrop-blur-sm md:p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[12px] border border-[#E1E6EF] bg-[#F9F9F9] shadow-[0_24px_80px_rgba(17,24,39,0.18)]">
        <div className="sticky top-0 z-10 border-b border-[#E1E6EF] bg-[#F9F9F9]/95 px-5 py-4 backdrop-blur md:px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">
                {editingId ? "Segment düzenle" : "Yeni segment"}
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#111827]">Segment kuralları</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[7px] border border-[#E1E6EF] bg-white text-[#6B7280] transition hover:border-[#FFD7BF] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 p-5 md:p-6">
          <section className="border-y border-[#E1E6EF] bg-[#F9F9F9] py-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FieldBlock label="Segment adı">
                <input
                  required
                  value={form.name}
                  onChange={(event) => onChange({ ...form, name: event.target.value })}
                  placeholder="Örn: VIP alışveriş kulübü"
                  className="h-11 w-full rounded-[7px] border border-[#E1E6EF] bg-white px-4 text-sm font-medium text-[#111827] outline-none transition placeholder:text-[#7B8794] focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]"
                />
              </FieldBlock>
              <FieldBlock label="Kural mantığı">
                <select
                  value={form.logic}
                  onChange={(event) => onChange({ ...form, logic: event.target.value === "any" ? "any" : "all" })}
                  className="h-11 w-full cursor-pointer rounded-[7px] border border-[#E1E6EF] bg-white px-4 text-sm font-semibold text-[#374151] outline-none transition focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]"
                >
                  <option value="all">Tüm koşullar sağlansın</option>
                  <option value="any">Koşullardan biri sağlansın</option>
                </select>
              </FieldBlock>
            </div>

            <FieldBlock label="Açıklama" className="mt-4">
              <input
                value={form.description}
                onChange={(event) => onChange({ ...form, description: event.target.value })}
                placeholder="Segmentin amacı ve kullanım notu"
                className="h-11 w-full rounded-[7px] border border-[#E1E6EF] bg-white px-4 text-sm font-medium text-[#111827] outline-none transition placeholder:text-[#7B8794] focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]"
              />
            </FieldBlock>
          </section>

          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#111827]">Koşullar</p>
                <p className="mt-1 text-sm text-[#6B7280]">Müşteriler bu kriterlere göre segmente dahil edilir.</p>
              </div>
              <button
                type="button"
                onClick={() => onChange({ ...form, conditions: [...form.conditions, { field: "totalSpent", operator: ">=", value: "0" }] })}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[7px] border border-[#FFD7BF] bg-white px-4 text-sm font-semibold text-[#E85D04] transition hover:bg-[#FFF8F3] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
              >
                <Plus className="h-4 w-4" />
                Kriter Ekle
              </button>
            </div>

            <div className="space-y-3">
              {form.conditions.map((condition, index) => (
                <ConditionEditor
                  key={index}
                  condition={condition}
                  index={index}
                  form={form}
                  onChange={onChange}
                />
              ))}
            </div>
          </section>

          <button
            type="submit"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[7px] bg-[#FF6A00] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.18)] transition hover:bg-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]"
          >
            {editingId ? "Segmenti Güncelle" : "Segmenti Oluştur"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ConditionEditor({
  condition,
  index,
  form,
  onChange,
}: {
  condition: FormState["conditions"][number];
  index: number;
  form: FormState;
  onChange: (form: FormState) => void;
}) {
  return (
    <div className="rounded-[8px] border border-[#E1E6EF] bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">Kural {index + 1}</div>
        <button
          type="button"
          onClick={() => onChange({ ...form, conditions: form.conditions.length > 1 ? form.conditions.filter((_, conditionIndex) => conditionIndex !== index) : form.conditions })}
          className="inline-flex h-9 items-center justify-center rounded-[7px] border border-rose-100 bg-white px-3 text-sm font-semibold text-rose-600 transition hover:border-rose-200 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
        >
          Sil
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)_190px]">
        <select
          value={condition.field}
          onChange={(event) => {
            const field = event.target.value as SegmentField;
            const next = [...form.conditions];
            next[index] = { field, operator: FIELD_TYPES[field] === "number" ? ">=" : "=", value: field === "status" ? "active" : "0" };
            onChange({ ...form, conditions: next });
          }}
          className="h-11 rounded-[7px] border border-[#E1E6EF] bg-white px-4 text-sm font-semibold text-[#374151] outline-none transition focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]"
        >
          <option value="totalSpent">Toplam Harcama</option>
          <option value="totalOrders">Toplam Sipariş</option>
          <option value="averageOrderValue">Ortalama Sepet</option>
          <option value="lastOrderDays">Son Sipariş Günü</option>
          <option value="registeredDays">Kayıt Yaşı (gün)</option>
          <option value="status">Durum</option>
        </select>

        <select
          value={condition.operator}
          onChange={(event) => {
            const next = [...form.conditions];
            next[index] = { ...next[index], operator: event.target.value as SegmentOperator };
            onChange({ ...form, conditions: next });
          }}
          className="h-11 rounded-[7px] border border-[#E1E6EF] bg-white px-4 text-sm font-semibold text-[#374151] outline-none transition focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]"
        >
          {FIELD_TYPES[condition.field] === "number" ? (
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

        {condition.field === "status" ? (
          <select
            value={condition.value}
            onChange={(event) => {
              const next = [...form.conditions];
              next[index] = { ...next[index], value: event.target.value };
              onChange({ ...form, conditions: next });
            }}
            className="h-11 rounded-[7px] border border-[#E1E6EF] bg-white px-4 text-sm font-semibold text-[#374151] outline-none transition focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]"
          >
            <option value="active">Aktif</option>
            <option value="inactive">Pasif</option>
            <option value="blocked">Engelli</option>
          </select>
        ) : (
          <input
            type="number"
            value={condition.value}
            onChange={(event) => {
              const next = [...form.conditions];
              next[index] = { ...next[index], value: event.target.value };
              onChange({ ...form, conditions: next });
            }}
            className="h-11 rounded-[7px] border border-[#E1E6EF] bg-white px-4 text-sm font-medium text-[#111827] outline-none transition focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]"
          />
        )}

        <div className="flex h-11 items-center rounded-[7px] border border-[#E1E6EF] bg-[#F9F9F9] px-3 text-sm font-medium text-[#6B7280]">
          {FIELD_TYPES[condition.field] === "number" ? "Sayısal eşik" : "Durum karşılaştırması"}
        </div>
      </div>
    </div>
  );
}

function SegmentMembersModal({
  segment,
  onClose,
}: {
  segment: Segment & { members: Customer[] };
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/35 p-3 backdrop-blur-sm md:p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[12px] border border-[#E1E6EF] bg-[#F9F9F9] shadow-[0_24px_80px_rgba(17,24,39,0.18)]">
        <div className="sticky top-0 z-10 border-b border-[#E1E6EF] bg-[#F9F9F9]/95 px-5 py-4 backdrop-blur md:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">Segment üyeleri</p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#111827]">{segment.name}</h2>
              <p className="mt-1 text-sm text-[#6B7280]">{segment.members.length.toLocaleString("tr-TR")} müşteri bu segmentle eşleşiyor.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[7px] border border-[#E1E6EF] bg-white text-[#6B7280] transition hover:border-[#FFD7BF] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-5 md:p-6">
          {segment.members.length > 0 ? (
            <div className="overflow-x-auto border-y border-[#E1E6EF]">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-[#EEF2F6]">
                  <tr>
                    <th className="px-5 py-4 text-[13px] font-semibold text-[#4B5563]">Müşteri</th>
                    <th className="px-5 py-4 text-[13px] font-semibold text-[#4B5563]">E-posta</th>
                    <th className="px-5 py-4 text-[13px] font-semibold text-[#4B5563]">Sipariş</th>
                    <th className="px-5 py-4 text-right text-[13px] font-semibold text-[#4B5563]">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {segment.members.map((customer) => (
                    <tr key={customer.id} className="border-b border-[#E1E6EF] last:border-b-0 hover:bg-white">
                      <td className="px-5 py-4 font-semibold text-[#111827]">
                        {customer.firstName || "Adsız"} {customer.lastName}
                      </td>
                      <td className="px-5 py-4 text-[#6B7280]">{customer.email}</td>
                      <td className="px-5 py-4 text-[#374151]">{customer.totalOrders.toLocaleString("tr-TR")} sipariş</td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/admin/musteriler/${customer.id}`}
                          className="inline-flex h-9 items-center justify-center rounded-[7px] border border-[#E1E6EF] bg-white px-3 text-sm font-semibold text-[#374151] transition hover:border-[#FFD7BF] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
                        >
                          Aç
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex min-h-[280px] flex-col items-center justify-center border-y border-[#E1E6EF] px-6 py-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[12px] border border-[#FFD7BF] bg-[#FFF1E8] text-[#FF6A00]">
                <Users className="h-6 w-6" />
              </div>
              <p className="mt-4 text-base font-semibold text-[#111827]">Bu segmentte henüz müşteri yok.</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-[#6B7280]">
                Kural koşullarıyla eşleşen müşteri geldiğinde bu alan otomatik güncellenecek.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LogicBadge({ logic }: { logic: Segment["logic"] }) {
  return (
    <span className="inline-flex rounded-[5px] border border-[#FFD7BF] bg-[#FFF1E8] px-2.5 py-1 text-xs font-semibold text-[#E85D04]">
      {logic === "all" ? "Tüm koşullar" : "Herhangi bir koşul"}
    </span>
  );
}

function ActionButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-[7px] border border-[#E1E6EF] bg-white text-[#6B7280] transition hover:border-[#FFD7BF] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
    >
      {children}
    </button>
  );
}

function FieldBlock({
  children,
  label,
  className,
}: {
  children: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-2 block text-sm font-semibold text-[#374151]">{label}</span>
      {children}
    </label>
  );
}

function MobileInfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[7px] border border-[#E1E6EF] bg-[#F9F9F9] px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#111827]">{value}</p>
    </div>
  );
}
