"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CircleAlert, Download, Eye, Hash, Loader2, Mail, Search, Tag, UserRound, Users, X } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageShell";
import { fetchAdminJson } from "@/lib/admin-client-fetch";

type CustomerStatus = "active" | "inactive" | "blocked";

type CustomerRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: CustomerStatus;
  totalOrders: number;
  totalSpent: number;
  tags: string[];
  acceptsEmailMarketing: boolean;
  acceptsSmsMarketing: boolean;
  createdAt: Date;
};

type TagSummary = {
  name: string;
  normalized: string;
  customers: CustomerRecord[];
  activeCount: number;
  emailReach: number;
  smsReach: number;
  totalOrders: number;
  totalSpent: number;
  lastCustomerAt: Date | null;
};

type SortKey = "count-desc" | "name-asc" | "spent-desc" | "recent-desc";

const statusLabels: Record<CustomerStatus, string> = {
  active: "Aktif",
  inactive: "Pasif",
  blocked: "Engelli",
};

function transformCustomer(row: Record<string, unknown>): CustomerRecord {
  return {
    id: String(row.id || ""),
    firstName: String(row.first_name || ""),
    lastName: String(row.last_name || ""),
    email: String(row.email || ""),
    phone: String(row.phone || ""),
    status: (row.status as CustomerStatus) || "active",
    totalOrders: Number(row.total_orders) || 0,
    totalSpent: Number(row.total_spent) || 0,
    tags: Array.isArray(row.tags) ? row.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
    acceptsEmailMarketing: Boolean(row.accepts_email_marketing),
    acceptsSmsMarketing: Boolean(row.accepts_sms_marketing),
    createdAt: new Date(String(row.created_at || new Date().toISOString())),
  };
}

function normalizeTag(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    currency: "TRY",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatDate(value: Date | null) {
  if (!value || Number.isNaN(value.getTime())) return "Tarih yok";

  return value.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getCustomerName(customer: CustomerRecord) {
  const fullName = `${customer.firstName} ${customer.lastName}`.trim();
  return fullName || customer.email || "İsimsiz müşteri";
}

function getInitials(customer: CustomerRecord) {
  const name = getCustomerName(customer);
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("tr-TR") || "M";
}

function buildTagSummaries(customers: CustomerRecord[]) {
  const map = new Map<string, { name: string; customers: CustomerRecord[] }>();

  customers.forEach((customer) => {
    const seenForCustomer = new Set<string>();

    customer.tags.forEach((tag) => {
      const normalized = normalizeTag(tag);
      if (!normalized || seenForCustomer.has(normalized)) return;

      seenForCustomer.add(normalized);
      const current = map.get(normalized);

      if (current) {
        current.customers.push(customer);
        return;
      }

      map.set(normalized, {
        name: tag.trim().replace(/\s+/g, " "),
        customers: [customer],
      });
    });
  });

  return Array.from(map.entries()).map(([normalized, entry]) => {
    const customersForTag = entry.customers;

    return {
      activeCount: customersForTag.filter((customer) => customer.status === "active").length,
      customers: customersForTag,
      emailReach: customersForTag.filter((customer) => customer.acceptsEmailMarketing && customer.email).length,
      lastCustomerAt: customersForTag.reduce<Date | null>((latest, customer) => {
        if (!latest || customer.createdAt.getTime() > latest.getTime()) return customer.createdAt;
        return latest;
      }, null),
      name: entry.name,
      normalized,
      smsReach: customersForTag.filter((customer) => customer.acceptsSmsMarketing && customer.phone).length,
      totalOrders: customersForTag.reduce((sum, customer) => sum + customer.totalOrders, 0),
      totalSpent: customersForTag.reduce((sum, customer) => sum + customer.totalSpent, 0),
    } satisfies TagSummary;
  });
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((value) => `"${value.replace(/"/g, "\"\"")}"`).join(";"))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

export default function CustomerTagsPage() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("count-desc");
  const [selectedTag, setSelectedTag] = useState<TagSummary | null>(null);

  const loadCustomers = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetchAdminJson<{
        success: boolean;
        customers: Record<string, unknown>[];
        error?: string;
      }>("/api/customers", { timeoutMs: 12000 });

      if (!response.success) {
        throw new Error(response.error || "Müşteri etiketleri yüklenemedi.");
      }

      setCustomers((response.customers || []).map(transformCustomer));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Müşteri etiketleri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCustomers();
  }, []);

  const summaries = useMemo(() => buildTagSummaries(customers), [customers]);
  const filteredSummaries = useMemo(() => {
    const query = normalizeTag(search);
    const filtered = summaries.filter((summary) => {
      if (!query) return true;
      return (
        summary.normalized.includes(query) ||
        summary.customers.some((customer) => normalizeTag(`${getCustomerName(customer)} ${customer.email}`).includes(query))
      );
    });

    return filtered.sort((first, second) => {
      if (sort === "name-asc") return first.name.localeCompare(second.name, "tr");
      if (sort === "spent-desc") return second.totalSpent - first.totalSpent;
      if (sort === "recent-desc") return (second.lastCustomerAt?.getTime() || 0) - (first.lastCustomerAt?.getTime() || 0);
      return second.customers.length - first.customers.length;
    });
  }, [search, sort, summaries]);

  const taggedCustomers = useMemo(
    () => customers.filter((customer) => customer.tags.length > 0).length,
    [customers],
  );
  const totalAssignments = useMemo(
    () => summaries.reduce((sum, summary) => sum + summary.customers.length, 0),
    [summaries],
  );
  const marketingReach = useMemo(
    () => summaries.reduce((sum, summary) => sum + Math.max(summary.emailReach, summary.smsReach), 0),
    [summaries],
  );

  const handleExport = () => {
    downloadCsv("musteri-etiketleri.csv", [
      ["Etiket", "Müşteri Sayısı", "Aktif Müşteri", "Toplam Sipariş", "Toplam Harcama", "E-posta İzni", "SMS İzni", "Son Müşteri"],
      ...filteredSummaries.map((summary) => [
        summary.name,
        String(summary.customers.length),
        String(summary.activeCount),
        String(summary.totalOrders),
        formatCurrency(summary.totalSpent),
        String(summary.emailReach),
        String(summary.smsReach),
        formatDate(summary.lastCustomerAt),
      ]),
    ]);
  };

  const activeSearch = search.trim().length > 0;

  return (
    <main role="main" aria-busy={loading} className="min-h-screen bg-[#F9F9F9]">
      <div className="w-full px-0 py-3 md:py-5">
        <div className="space-y-4">
          <AdminPageHeader
            sectionLabel="Müşteri"
            title="Etiketler"
            description="Müşteri etiketlerini ve erişim kümelerini izleyin."
            actions={
              <button
                type="button"
                onClick={handleExport}
                disabled={filteredSummaries.length === 0}
                className="inline-flex h-11 items-center gap-2 rounded-[7px] border border-[#E1E6EF] bg-white px-4 text-sm font-semibold text-[#374151] shadow-none transition hover:border-[#FFD7BF] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)] disabled:cursor-not-allowed disabled:opacity-55"
              >
                <Download className="h-4 w-4" />
                Dışa Aktar
              </button>
            }
          />

          {error ? (
            <div
              aria-live="assertive"
              className="flex items-center gap-3 border-y border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-700"
            >
              <CircleAlert className="h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : null}

          <section className="border-y border-[#E1E6EF] bg-[#F9F9F9]">
            <div className="grid grid-cols-2 border-b border-[#E1E6EF] min-[1180px]:grid-cols-4">
              <MetricStripItem label="Toplam etiket" value={summaries.length.toLocaleString("tr-TR")} icon={Tag} active />
              <MetricStripItem label="Etiketli müşteri" value={taggedCustomers.toLocaleString("tr-TR")} icon={Users} />
              <MetricStripItem label="Toplam atama" value={totalAssignments.toLocaleString("tr-TR")} icon={Hash} />
              <MetricStripItem label="Pazarlama erişimi" value={marketingReach.toLocaleString("tr-TR")} icon={Mail} />
            </div>

            <div className="flex flex-col gap-3 px-4 py-4 md:px-6 min-[1025px]:flex-row min-[1025px]:items-center min-[1025px]:justify-between">
              <div className="grid flex-1 grid-cols-1 gap-3 min-[1025px]:max-w-[800px] min-[1025px]:grid-cols-[minmax(0,1fr)_220px]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7B8794]" />
                  <input
                    type="text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Etiket veya müşteri ara"
                    aria-label="Müşteri etiketi ara"
                    className="h-11 w-full rounded-[7px] border border-[#E1E6EF] bg-white pl-11 pr-4 text-sm font-medium text-[#111827] outline-none transition placeholder:text-[#7B8794] focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]"
                  />
                </label>

                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortKey)}
                  aria-label="Etiket sıralama"
                  className="h-11 cursor-pointer rounded-[7px] border border-[#E1E6EF] bg-white px-4 text-sm font-semibold text-[#374151] outline-none transition focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]"
                >
                  <option value="count-desc">En çok kullanılan</option>
                  <option value="name-asc">Ada göre</option>
                  <option value="spent-desc">Harcama yüksek</option>
                  <option value="recent-desc">Son eklenen müşteri</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-[#6B7280] min-[1025px]:justify-end">
                <span>
                  <span className="text-[#111827]">{filteredSummaries.length.toLocaleString("tr-TR")}</span> etiket
                </span>
                <span className="text-[#E85D04]">
                  <span>{taggedCustomers.toLocaleString("tr-TR")}</span> müşteri
                </span>
              </div>
            </div>

            {loading ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center border-t border-[#E1E6EF] px-6 py-16 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[12px] border border-[#FFD7BF] bg-[#FFF1E8] text-[#FF6A00]">
                  <Loader2 className="h-7 w-7 animate-spin" />
                </div>
                <p className="mt-5 text-lg font-semibold tracking-[-0.03em] text-[#111827]">Etiketler hazırlanıyor...</p>
                <p className="mt-2 max-w-md text-sm leading-6 text-[#6B7280]">
                  Müşteri kayıtlarındaki etiketler okunuyor.
                </p>
              </div>
            ) : filteredSummaries.length > 0 ? (
              <>
                <div className="space-y-3 border-t border-[#E1E6EF] p-3.5 sm:p-5 min-[1025px]:hidden">
                  {filteredSummaries.map((summary) => (
                    <article key={summary.normalized} className="rounded-[7px] border border-[#E1E6EF] bg-white p-4 shadow-none">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <TagPill label={summary.name} />
                          <h2 className="mt-3 text-base font-semibold tracking-[-0.02em] text-[#111827]">
                            {summary.customers.length.toLocaleString("tr-TR")} müşteri
                          </h2>
                          <p className="mt-1 text-sm leading-6 text-[#6B7280]">
                            {summary.activeCount.toLocaleString("tr-TR")} aktif müşteri · {formatCurrency(summary.totalSpent)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedTag(summary)}
                          aria-label={`${summary.name} etiketindeki müşterileri görüntüle`}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] border border-[#E1E6EF] bg-white text-[#6B7280] transition hover:border-[#FFD7BF] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <MobileInfo label="Sipariş" value={summary.totalOrders.toLocaleString("tr-TR")} />
                        <MobileInfo label="E-posta" value={summary.emailReach.toLocaleString("tr-TR")} />
                        <MobileInfo label="SMS" value={summary.smsReach.toLocaleString("tr-TR")} />
                        <MobileInfo label="Son kayıt" value={formatDate(summary.lastCustomerAt)} />
                      </div>
                    </article>
                  ))}
                </div>

                <div className="hidden overflow-x-auto border-t border-[#E1E6EF] min-[1025px]:block">
                  <table className="w-full min-w-[1040px] text-left text-sm">
                    <thead className="bg-[#EEF2F6]">
                      <tr>
                        <th className="px-4 py-3 text-[13px] font-semibold text-[#4B5563]">Etiket</th>
                        <th className="px-4 py-3 text-[13px] font-semibold text-[#4B5563]">Müşteri</th>
                        <th className="px-4 py-3 text-[13px] font-semibold text-[#4B5563]">Sipariş</th>
                        <th className="px-4 py-3 text-[13px] font-semibold text-[#4B5563]">Harcama</th>
                        <th className="px-4 py-3 text-[13px] font-semibold text-[#4B5563]">Erişim</th>
                        <th className="px-4 py-3 text-[13px] font-semibold text-[#4B5563]">Son kayıt</th>
                        <th className="px-4 py-3 text-right text-[13px] font-semibold text-[#4B5563]">İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSummaries.map((summary) => (
                        <tr key={summary.normalized} className="group border-b border-[#E1E6EF] last:border-b-0 hover:bg-white">
                          <td className="px-4 py-4 align-top">
                            <TagPill label={summary.name} />
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="font-semibold text-[#111827]">
                              {summary.customers.length.toLocaleString("tr-TR")} müşteri
                            </div>
                            <p className="mt-1 text-sm text-[#6B7280]">
                              {summary.activeCount.toLocaleString("tr-TR")} aktif
                            </p>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="font-semibold text-[#111827]">{summary.totalOrders.toLocaleString("tr-TR")}</div>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="font-semibold text-[#111827]">{formatCurrency(summary.totalSpent)}</div>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="text-sm font-medium leading-5 text-[#374151]">
                              {summary.emailReach.toLocaleString("tr-TR")} e-posta
                            </div>
                            <div className="text-sm font-medium leading-5 text-[#6B7280]">
                              {summary.smsReach.toLocaleString("tr-TR")} SMS
                            </div>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="text-sm font-medium text-[#374151]">{formatDate(summary.lastCustomerAt)}</div>
                          </td>
                          <td className="px-4 py-4 text-right align-top">
                            <button
                              type="button"
                              onClick={() => setSelectedTag(summary)}
                              className="inline-flex h-9 items-center gap-2 rounded-[7px] border border-[#E1E6EF] bg-white px-3 text-sm font-semibold text-[#374151] transition hover:border-[#FFD7BF] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
                            >
                              <Eye className="h-4 w-4" />
                              Gör
                            </button>
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
                  <Tag className="h-7 w-7" />
                </div>
                <p className="mt-5 text-lg font-semibold tracking-[-0.03em] text-[#111827]" aria-live="polite">
                  {summaries.length === 0 ? "Henüz müşteri etiketi yok" : "Sonuç bulunamadı"}
                </p>
                <p className="mt-2 max-w-md text-sm leading-6 text-[#6B7280]">
                  {summaries.length === 0
                    ? "Müşteri kayıtlarına etiket eklendiğinde bu sayfa otomatik olarak dolacak."
                    : "Arama kriterini değiştirerek tekrar deneyin."}
                </p>
                {activeSearch ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="mt-5 inline-flex h-11 items-center gap-2 rounded-[7px] border border-[#FFD7BF] bg-white px-4 text-sm font-semibold text-[#E85D04] transition hover:bg-[#FFF8F3] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
                  >
                    Aramayı Temizle
                  </button>
                ) : null}
              </div>
            )}

            <div className="border-t border-[#E1E6EF] bg-[#F9F9F9] px-4 py-3 md:px-6">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <p aria-live="polite" className="text-sm font-medium text-[#6B7280]">
                  <span className="font-semibold text-[#111827]">{filteredSummaries.length.toLocaleString("tr-TR")}</span> etiket gösteriliyor
                  {activeSearch ? " · arama aktif" : ""}
                </p>
                <div className="text-sm font-medium text-[#6B7280]">
                  {totalAssignments.toLocaleString("tr-TR")} toplam etiket ataması
                </div>
              </div>
            </div>
          </section>

          {selectedTag ? (
            <TagCustomersModal summary={selectedTag} onClose={() => setSelectedTag(null)} />
          ) : null}
        </div>
      </div>
    </main>
  );
}

function MetricStripItem({
  active,
  icon: Icon,
  label,
  value,
}: {
  active?: boolean;
  icon: typeof Tag;
  label: string;
  value: string;
}) {
  return (
    <div className="relative min-h-[118px] border-r border-[#E1E6EF] bg-[#F9F9F9] px-4 py-5 last:border-r-0 md:px-6">
      {active ? <span className="absolute inset-x-0 bottom-0 h-[3px] bg-[#FF6A00]" /> : null}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#6B7280]">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[#111827]">{value}</p>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-[7px] border border-[#FFD7BF] bg-[#FFF1E8] text-[#FF6A00]">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function TagPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-[7px] border border-[#FFD7BF] bg-[#FFF1E8] px-3 py-1.5 text-sm font-semibold text-[#E85D04]">
      <Tag className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function MobileInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[7px] border border-[#E1E6EF] bg-[#F9F9F9] px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[#111827]">{value}</p>
    </div>
  );
}

function TagCustomersModal({
  onClose,
  summary,
}: {
  onClose: () => void;
  summary: TagSummary;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/35 p-3 backdrop-blur-sm md:p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[12px] border border-[#E1E6EF] bg-[#F9F9F9] shadow-[0_24px_80px_rgba(17,24,39,0.18)]">
        <div className="sticky top-0 z-10 border-b border-[#E1E6EF] bg-[#F9F9F9]/95 px-5 py-4 backdrop-blur md:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">Etiket müşterileri</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <TagPill label={summary.name} />
                <span className="rounded-[7px] border border-[#E1E6EF] bg-white px-3 py-1.5 text-sm font-semibold text-[#6B7280]">
                  {summary.customers.length.toLocaleString("tr-TR")} müşteri
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Etiket müşteri listesini kapat"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[7px] border border-[#E1E6EF] bg-white text-[#6B7280] transition hover:border-[#FFD7BF] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-5 md:p-6">
          <div className="overflow-x-auto border-y border-[#E1E6EF]">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-[#EEF2F6]">
                <tr>
                  <th className="px-5 py-4 text-[13px] font-semibold text-[#4B5563]">Müşteri</th>
                  <th className="px-5 py-4 text-[13px] font-semibold text-[#4B5563]">İletişim</th>
                  <th className="px-5 py-4 text-[13px] font-semibold text-[#4B5563]">Durum</th>
                  <th className="px-5 py-4 text-[13px] font-semibold text-[#4B5563]">Harcama</th>
                  <th className="px-5 py-4 text-right text-[13px] font-semibold text-[#4B5563]">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {summary.customers.map((customer) => (
                  <tr key={customer.id} className="border-b border-[#E1E6EF] last:border-b-0">
                    <td className="px-5 py-4 align-top">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] border border-[#E1E6EF] bg-white text-xs font-semibold text-[#6B7280]">
                          {getInitials(customer)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-[#111827]">{getCustomerName(customer)}</div>
                          <div className="mt-0.5 text-xs font-medium text-[#9CA3AF]">{customer.totalOrders.toLocaleString("tr-TR")} sipariş</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <div className="font-medium text-[#374151]">{customer.email || "E-posta yok"}</div>
                      <div className="mt-0.5 text-sm text-[#6B7280]">{customer.phone || "Telefon yok"}</div>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <span className="inline-flex rounded-[7px] border border-[#E1E6EF] bg-white px-2.5 py-1 text-xs font-semibold text-[#6B7280]">
                        {statusLabels[customer.status]}
                      </span>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <div className="font-semibold text-[#111827]">{formatCurrency(customer.totalSpent)}</div>
                    </td>
                    <td className="px-5 py-4 text-right align-top">
                      <Link
                        href={`/admin/musteriler/${customer.id}`}
                        className="inline-flex h-9 items-center gap-2 rounded-[7px] border border-[#E1E6EF] bg-white px-3 text-sm font-semibold text-[#374151] transition hover:border-[#FFD7BF] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
                      >
                        <UserRound className="h-4 w-4" />
                        Profil
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
