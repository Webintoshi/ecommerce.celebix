"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Edit, Eye, Plus, Search, Trash2, X } from "lucide-react";

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

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Müşteri Segmentleri</h1>
          <p className="text-sm text-gray-500">Çalışan segment yönetimi: oluştur, düzenle, sil, müşteri listesini görüntüle.</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium">
          <Plus className="w-4 h-4" /> Yeni Segment
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Segment ara..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg bg-white text-sm" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((segment) => (
          <div key={segment.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{segment.name}</h3>
                <p className="text-xs text-gray-500">{segment.description || "Açıklama yok"}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setViewSegmentId(segment.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600"><Eye className="w-4 h-4" /></button>
                <button onClick={() => openEdit(segment)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600"><Edit className="w-4 h-4" /></button>
                <button onClick={() => removeSegment(segment.id, segment.name)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="mt-3 text-sm text-gray-700">{segment.members.length} müşteri eşleşti</div>
          </div>
        ))}
      </div>

      {loading && <div className="text-sm text-gray-500">Yükleniyor...</div>}

      {openForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">{editingId ? "Segment Düzenle" : "Yeni Segment"}</h2>
              <button onClick={() => setOpenForm(false)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <form onSubmit={saveSegment} className="space-y-3">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Segment adı" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Açıklama" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <select value={form.logic} onChange={(e) => setForm({ ...form, logic: e.target.value === "any" ? "any" : "all" })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="all">Tüm koşullar sağlansın (AND)</option>
                <option value="any">Koşullardan biri sağlansın (OR)</option>
              </select>

              {form.conditions.map((c, i) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <select value={c.field} onChange={(e) => {
                    const field = e.target.value as SegmentField;
                    const next = [...form.conditions];
                    next[i] = { field, operator: FIELD_TYPES[field] === "number" ? ">=" : "=", value: field === "status" ? "active" : "0" };
                    setForm({ ...form, conditions: next });
                  }} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
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
                  }} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
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
                    }} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <option value="active">Aktif</option>
                      <option value="inactive">Pasif</option>
                      <option value="blocked">Engelli</option>
                    </select>
                  ) : (
                    <input type="number" value={c.value} onChange={(e) => {
                      const next = [...form.conditions];
                      next[i] = { ...next[i], value: e.target.value };
                      setForm({ ...form, conditions: next });
                    }} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  )}
                  <button type="button" onClick={() => setForm({ ...form, conditions: form.conditions.length > 1 ? form.conditions.filter((_, idx) => idx !== i) : form.conditions })} className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-red-600">Sil</button>
                </div>
              ))}

              <button type="button" onClick={() => setForm({ ...form, conditions: [...form.conditions, { field: "totalSpent", operator: ">=", value: "0" }] })} className="text-sm text-blue-600">+ Kriter Ekle</button>
              <button type="submit" className="w-full py-2 bg-gray-900 text-white rounded-lg text-sm font-medium">{editingId ? "Güncelle" : "Oluştur"}</button>
            </form>
          </div>
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">{viewing.name} - {viewing.members.length} müşteri</h2>
              <button onClick={() => setViewSegmentId(null)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="space-y-2">
              {viewing.members.map((c) => (
                <div key={c.id} className="border border-gray-200 rounded-lg px-3 py-2 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm text-gray-900">{c.firstName} {c.lastName}</div>
                    <div className="text-xs text-gray-500">{c.email}</div>
                  </div>
                  <Link href={`/admin/musteriler/${c.id}`} className="text-blue-600 text-sm">Aç</Link>
                </div>
              ))}
              {viewing.members.length === 0 && <div className="text-sm text-gray-500">Bu segmentte müşteri yok.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
