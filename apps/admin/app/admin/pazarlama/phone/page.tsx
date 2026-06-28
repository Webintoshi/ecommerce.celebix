"use client";

import { AdminEmptyState, AdminPageHeader, AdminPageShell } from "@/components/admin/AdminPageShell";
import { getCustomers } from "@/lib/customers";
import { cn } from "@/lib/utils";
import type { Customer } from "@/types/customer";
import {
  CheckCircle2,
  Copy,
  Download,
  Filter,
  Phone,
  RefreshCw,
  Search,
  UserCheck,
  Users,
} from "lucide-react";
import { type ElementType, useEffect, useMemo, useState } from "react";

type FilterKey = "all" | "phone" | "new" | "vip";

const FILTER_OPTIONS: Array<{ value: FilterKey; label: string }> = [
  { value: "all", label: "Tüm müşteriler" },
  { value: "phone", label: "Telefonu olanlar" },
  { value: "new", label: "Yeni müşteriler" },
  { value: "vip", label: "VIP müşteriler" },
];

function customerName(customer: Customer) {
  return `${customer.firstName} ${customer.lastName}`.trim() || "İsimsiz müşteri";
}

export default function PhoneMarketingPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [callNote, setCallNote] = useState("");

  useEffect(() => {
    setCustomers(getCustomers());
  }, []);

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("tr");

    return customers.filter((customer) => {
      const matchesSearch =
        !query ||
        customer.firstName.toLocaleLowerCase("tr").includes(query) ||
        customer.lastName.toLocaleLowerCase("tr").includes(query) ||
        customer.phone?.includes(query);

      const matchesFilter =
        filter === "all" ||
        (filter === "phone" && Boolean(customer.phone)) ||
        (filter === "new" && customer.tags?.includes("Yeni")) ||
        (filter === "vip" && customer.tags?.includes("VIP"));

      return matchesSearch && matchesFilter;
    });
  }, [customers, filter, searchQuery]);

  const selectedPhoneCustomers = useMemo(
    () => customers.filter((customer) => customer.phone && selectedCustomers.includes(customer.id)),
    [customers, selectedCustomers],
  );

  const phoneCount = useMemo(() => customers.filter((customer) => customer.phone).length, [customers]);
  const vipCount = useMemo(() => customers.filter((customer) => customer.tags?.includes("VIP")).length, [customers]);

  const handleSelectAll = (checked: boolean) => {
    setSelectedCustomers(checked ? filteredCustomers.map((customer) => customer.id) : []);
  };

  const handleSelectCustomer = (id: string, checked: boolean) => {
    setSelectedCustomers((current) => (checked ? [...current, id] : current.filter((customerId) => customerId !== id)));
  };

  const copyCallNote = async () => {
    if (!callNote.trim()) return;
    await navigator.clipboard.writeText(callNote);
    alert("Not kopyalandı.");
  };

  const copyPhones = async () => {
    const phones = selectedPhoneCustomers.map((customer) => customer.phone).join("\n");
    if (!phones) return;
    await navigator.clipboard.writeText(phones);
    alert("Telefon numaraları kopyalandı.");
  };

  const downloadPhones = () => {
    const phones = selectedPhoneCustomers.map((customer) => customer.phone).join("\n");
    if (!phones) return;

    const blob = new Blob([phones], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "telefon-listesi.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const allVisibleSelected = filteredCustomers.length > 0 && selectedCustomers.length === filteredCustomers.length;

  return (
    <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
      <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
        <AdminPageShell>
          <AdminPageHeader
            sectionLabel="Pazarlama"
            title="Telefon"
            description="Arama listesi ve telefon notlarını yönetin."
            actions={
              <button
                type="button"
                onClick={() => setCustomers(getCustomers())}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8]"
              >
                <RefreshCw className="h-4 w-4" />
                Yenile
              </button>
            }
            metrics={
              <>
                <MetricCell label="Toplam" value={customers.length} detail="müşteri" icon={Users} />
                <MetricCell label="Telefon" value={phoneCount} detail="erişilebilir" icon={Phone} tone="accent" />
                <MetricCell label="Seçili" value={selectedPhoneCustomers.length} detail="numara" icon={UserCheck} />
                <MetricCell label="VIP" value={vipCount} detail="hedef" icon={CheckCircle2} />
              </>
            }
          />

          <section className="grid gap-3 border-b border-[#E1E7EF] bg-[#F9F9F9] pb-4 min-[920px]:grid-cols-[minmax(0,1fr)_220px_auto] min-[920px]:items-center">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B95A5]" />
              <input
                type="text"
                placeholder="Müşteri veya telefon ara"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-10 w-full rounded-[8px] border border-[#DCE3EC] bg-white py-2 pl-11 pr-3 text-sm font-medium text-[#111827] outline-none transition placeholder:text-[#8B95A5] focus:border-[#FFD1B5] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]"
              />
            </label>

            <label className="flex h-10 items-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563]">
              <Filter className="h-4 w-4 text-[#8B95A5]" />
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as FilterKey)}
                className="w-full bg-transparent text-sm font-semibold text-[#4B5563] outline-none"
              >
                {FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex h-10 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#6B7280]">
              {filteredCustomers.length} kayıt
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 xl:px-5">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">Arama listesi</h2>
                  <p className="mt-1 text-xs font-medium text-[#6B7280]">Müşteri, telefon ve durum tek satırda.</p>
                </div>
                <label className="flex items-center gap-2 rounded-[8px] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280]">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(event) => handleSelectAll(event.target.checked)}
                    className="h-4 w-4 rounded border-[#C8D1DC] accent-[#FF6A00]"
                  />
                  Tümünü seç
                </label>
              </div>

              {filteredCustomers.length === 0 ? (
                <div className="p-5">
                  <AdminEmptyState
                    icon={<Users className="h-7 w-7" />}
                    title="Müşteri bulunamadı"
                    description="Arama veya filtre kriterlerine uygun kayıt yok."
                    className="border-[#DCE3EC] bg-[#F9F9F9]"
                  />
                </div>
              ) : (
                <div className="divide-y divide-[#E1E7EF]">
                  {filteredCustomers.map((customer) => {
                    const isSelected = selectedCustomers.includes(customer.id);
                    const hasPhone = Boolean(customer.phone);

                    return (
                      <article
                        key={customer.id}
                        className={cn(
                          "grid gap-3 px-4 py-3.5 transition hover:bg-[#FFF8F3] min-[960px]:grid-cols-[32px_minmax(210px,1fr)_170px_130px_82px] min-[960px]:items-center xl:px-5",
                          isSelected && "bg-[#FFF8F3]",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(event) => handleSelectCustomer(customer.id, event.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-[#C8D1DC] accent-[#FF6A00] min-[960px]:mt-0"
                        />
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-[#182232]">{customerName(customer)}</h3>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {(customer.tags || []).slice(0, 2).map((tag) => (
                              <span key={tag} className="text-xs font-semibold text-[#E85D04]">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <FieldValue label="Telefon" value={customer.phone || "-"} mono />
                        <FieldValue label="Durum" value={hasPhone ? "Aramaya hazır" : "Numara eksik"} tone={hasPhone ? "success" : "muted"} />
                        {hasPhone ? (
                          <a
                            href={`tel:${customer.phone}`}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-3 text-sm font-semibold text-white transition hover:bg-[#E85D04]"
                          >
                            <Phone className="h-4 w-4" />
                            Ara
                          </a>
                        ) : (
                          <span className="text-sm font-medium text-[#9CA3AF]">-</span>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <aside className="space-y-4">
              <section className="rounded-[12px] border border-[#DCE3EC] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-[#182232]">Seçili numaralar</h2>
                    <p className="mt-1 text-xs font-medium text-[#6B7280]">Aranacak kişiler.</p>
                  </div>
                  <span className="rounded-[8px] border border-[#FFD1B5] bg-[#FFF4EC] px-2.5 py-1 text-xs font-semibold text-[#C24D00]">
                    {selectedPhoneCustomers.length}
                  </span>
                </div>

                <div className="mt-4 max-h-[260px] space-y-2 overflow-y-auto">
                  {selectedPhoneCustomers.length > 0 ? (
                    selectedPhoneCustomers.map((customer) => (
                      <div key={customer.id} className="flex items-center justify-between gap-3 border-t border-[#EEF2F6] py-2 first:border-t-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#182232]">{customerName(customer)}</p>
                          <p className="truncate text-xs font-medium text-[#667085]">{customer.phone}</p>
                        </div>
                        <a href={`tel:${customer.phone}`} className="text-sm font-semibold text-[#FF6A00]">
                          Ara
                        </a>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-[8px] border border-dashed border-[#DCE3EC] bg-[#F9F9F9] px-3 py-5 text-center text-sm text-[#667085]">
                      Henüz seçim yok.
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-[12px] border border-[#DCE3EC] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                <h2 className="text-sm font-semibold text-[#182232]">Arama notu</h2>
                <textarea
                  value={callNote}
                  onChange={(event) => setCallNote(event.target.value)}
                  placeholder="Kısa konuşma notu..."
                  rows={6}
                  className="mt-3 w-full rounded-[8px] border border-[#DCE3EC] bg-[#F9F9F9] px-3 py-3 text-sm leading-6 text-[#182232] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#FFD1B5] focus:bg-white focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]"
                />
                <button
                  type="button"
                  onClick={copyCallNote}
                  disabled={!callNote.trim()}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Copy className="h-4 w-4" />
                  Notu kopyala
                </button>
              </section>

              <section className="rounded-[12px] border border-[#DCE3EC] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                <h2 className="text-sm font-semibold text-[#182232]">Dışa aktar</h2>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={copyPhones}
                    disabled={selectedPhoneCustomers.length === 0}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Copy className="h-4 w-4" />
                    Kopyala
                  </button>
                  <button
                    type="button"
                    onClick={downloadPhones}
                    disabled={selectedPhoneCustomers.length === 0}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-3 text-sm font-semibold text-white transition hover:bg-[#E85D04] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    TXT
                  </button>
                </div>
              </section>
            </aside>
          </div>
        </AdminPageShell>
      </div>
    </main>
  );
}

function MetricCell({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ElementType;
  tone?: "neutral" | "accent";
}) {
  return (
    <div className="min-h-[92px] bg-white px-4 py-3.5 xl:px-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280]">{label}</p>
        <Icon className={cn("h-4 w-4 text-[#9CA3AF]", tone === "accent" && "text-[#FF6A00]")} />
      </div>
      <div className="mt-3 flex items-end gap-2">
        <p className="truncate text-3xl font-semibold tracking-[-0.04em] text-[#111827]">{value}</p>
        <span className="pb-1 text-sm font-medium text-[#6B7280]">{detail}</span>
      </div>
    </div>
  );
}

function FieldValue({
  label,
  value,
  mono = false,
  tone = "default",
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "default" | "success" | "muted";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-sm font-semibold text-[#182232]",
          mono && "font-mono",
          tone === "success" && "text-[#159947]",
          tone === "muted" && "text-[#9CA3AF]",
        )}
      >
        {value}
      </p>
    </div>
  );
}
