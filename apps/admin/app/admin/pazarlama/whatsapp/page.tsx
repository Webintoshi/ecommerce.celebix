"use client";

import { AdminEmptyState, AdminPageHeader, AdminPageShell } from "@/components/admin/AdminPageShell";
import { getCustomers } from "@/lib/customers";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { cn } from "@/lib/utils";
import type { Customer } from "@/types/customer";
import {
  CheckCircle2,
  Copy,
  Eye,
  Filter,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
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

const WHATSAPP_TEMPLATES = [
  {
    id: 1,
    name: "Kampanya",
    content: `Merhaba {firstName}!\n\n${STORE_RUNTIME.name} mağazasında sizin için özel bir kampanya aktif. Hemen göz atın!`,
  },
  {
    id: 2,
    name: "Sipariş bildirimi",
    content: "Siparişiniz hazırlanıyor.\n\nSipariş numarası: {orderNumber}",
  },
  {
    id: 3,
    name: "Teşekkür",
    content: "Siparişiniz için teşekkür ederiz.\n\nBizi tercih ettiğiniz için mutluyuz.",
  },
];

function customerName(customer: Customer) {
  return `${customer.firstName} ${customer.lastName}`.trim() || "İsimsiz müşteri";
}

export default function WhatsAppMarketingPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [previewMode, setPreviewMode] = useState(true);
  const [sending, setSending] = useState(false);

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

  const selectedRecipients = useMemo(
    () => customers.filter((customer) => customer.phone && selectedCustomers.includes(customer.id)),
    [customers, selectedCustomers],
  );

  const phoneCount = useMemo(() => customers.filter((customer) => customer.phone).length, [customers]);
  const templateCount = WHATSAPP_TEMPLATES.length;

  const handleSelectAll = (checked: boolean) => {
    setSelectedCustomers(checked ? filteredCustomers.map((customer) => customer.id) : []);
  };

  const handleSelectCustomer = (id: string, checked: boolean) => {
    setSelectedCustomers((current) => (checked ? [...current, id] : current.filter((customerId) => customerId !== id)));
  };

  const handleSendWhatsApp = async () => {
    if (selectedRecipients.length === 0 || !messageTemplate.trim()) return;

    setSending(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setSending(false);
    setSelectedCustomers([]);
    setMessageTemplate("");
  };

  const generateWhatsAppLink = (phone: string, message: string) => {
    const formattedPhone = phone.replace(/\D/g, "");
    const encodedMessage = encodeURIComponent(message);
    return `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
  };

  const getPreviewContent = () => {
    let content = messageTemplate;
    if (selectedCustomers.length === 1) {
      const customer = customers.find((customerItem) => customerItem.id === selectedCustomers[0]);
      if (customer) {
        content = content.replace(/{firstName}/g, customer.firstName).replace(/{lastName}/g, customer.lastName);
      }
    }
    return content;
  };

  const copyMessage = async () => {
    const content = getPreviewContent();
    if (!content.trim()) return;
    await navigator.clipboard.writeText(content);
  };

  const allVisibleSelected = filteredCustomers.length > 0 && selectedCustomers.length === filteredCustomers.length;
  const previewContent = getPreviewContent();

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F9F9F9] pb-8 text-[#111827]">
      <div className="mx-auto w-full max-w-none min-w-0 space-y-4 px-4 sm:px-5 xl:px-6">
        <AdminPageShell>
          <AdminPageHeader
            sectionLabel="Pazarlama"
            title="WhatsApp"
            description="Alıcı ve mesaj hazırlığını yönetin."
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
                <MetricCell label="Telefon" value={phoneCount} detail="uygun" icon={MessageCircle} tone="accent" />
                <MetricCell label="Seçili" value={selectedRecipients.length} detail="alıcı" icon={UserCheck} />
                <MetricCell label="Şablon" value={templateCount} detail="hazır" icon={CheckCircle2} />
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

          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="min-w-0 overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 xl:px-5">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">Alıcı listesi</h2>
                  <p className="mt-1 text-xs font-medium text-[#6B7280]">Telefonu olan müşteriler WhatsApp için uygundur.</p>
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
                          "grid min-w-0 gap-3 px-4 py-3.5 transition hover:bg-[#FFF8F3] min-[960px]:grid-cols-[28px_minmax(190px,1fr)_150px_116px_74px] min-[960px]:items-center xl:px-5",
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
                        <FieldValue label="Durum" value={hasPhone ? "Mesaja uygun" : "Numara eksik"} tone={hasPhone ? "success" : "muted"} />
                        {hasPhone ? (
                          <a
                            href={generateWhatsAppLink(customer.phone || "", previewContent)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
                          >
                            <MessageCircle className="h-4 w-4" />
                            Aç
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

            <aside className="min-w-0 space-y-4">
              <section className="min-w-0 rounded-[12px] border border-[#DCE3EC] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-[#182232]">Mesaj</h2>
                    <p className="mt-1 text-xs font-medium text-[#6B7280]">Şablon seçin veya metin yazın.</p>
                  </div>
                  <span className="rounded-[8px] border border-[#DCE3EC] bg-[#F9F9F9] px-2.5 py-1 text-xs font-semibold text-[#667085]">
                    {messageTemplate.length} karakter
                  </span>
                </div>

                <div className="mt-4 grid gap-2">
                  {WHATSAPP_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setMessageTemplate(template.content)}
                      className={cn(
                        "rounded-[8px] border px-3 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]",
                        messageTemplate === template.content
                          ? "border-[#FFD1B5] bg-[#FFF4EC] text-[#C24D00]"
                          : "border-[#DCE3EC] bg-white text-[#4B5563] hover:border-[#FFD1B5] hover:bg-[#FFF8F3]",
                      )}
                    >
                      <span className="block font-semibold">{template.name}</span>
                      <span className="mt-1 block truncate text-xs text-[#667085]">{template.content}</span>
                    </button>
                  ))}
                </div>

                <textarea
                  value={messageTemplate}
                  onChange={(event) => setMessageTemplate(event.target.value)}
                  placeholder="Mesajınızı yazın. {firstName} ve {lastName} kullanılabilir."
                  rows={7}
                  className="mt-4 w-full rounded-[8px] border border-[#DCE3EC] bg-[#F9F9F9] px-3 py-3 text-sm leading-6 text-[#182232] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#FFD1B5] focus:bg-white focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]"
                />

                <div className="mt-3 grid min-w-0 grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewMode((current) => !current)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
                  >
                    <Eye className="h-4 w-4" />
                    Önizleme
                  </button>
                  <button
                    type="button"
                    onClick={copyMessage}
                    disabled={!previewContent.trim()}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Copy className="h-4 w-4" />
                    Kopyala
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  disabled={selectedRecipients.length === 0 || sending || !messageTemplate.trim()}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white transition hover:bg-[#E85D04] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {selectedRecipients.length} alıcıya hazırla
                </button>
              </section>

              {previewMode ? (
                <section className="min-w-0 rounded-[12px] border border-[#DCE3EC] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-[#182232]">Önizleme</h2>
                    <span className="rounded-[8px] border border-[#FFD1B5] bg-[#FFF4EC] px-2.5 py-1 text-xs font-semibold text-[#C24D00]">
                      {selectedRecipients.length} alıcı
                    </span>
                  </div>
                  <div className="mt-3 rounded-[10px] border border-[#E1E7EF] bg-[#F9F9F9] p-3">
                    <pre className="max-h-[220px] whitespace-pre-wrap font-sans text-sm leading-6 text-[#182232]">
                      {previewContent || "Mesaj metni burada görünecek."}
                    </pre>
                  </div>

                  <div className="mt-4 max-h-[220px] space-y-2 overflow-y-auto">
                    {selectedRecipients.length > 0 ? (
                      selectedRecipients.map((customer) => (
                        <div key={customer.id} className="flex items-center justify-between gap-3 border-t border-[#EEF2F6] py-2 first:border-t-0">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#182232]">{customerName(customer)}</p>
                            <p className="truncate text-xs font-medium text-[#667085]">{customer.phone}</p>
                          </div>
                          <a
                            href={generateWhatsAppLink(customer.phone || "", previewContent)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold text-[#FF6A00]"
                          >
                            Aç
                          </a>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-[8px] border border-dashed border-[#DCE3EC] bg-white px-3 py-5 text-center text-sm text-[#667085]">
                        Alıcı seçildiğinde burada görünür.
                      </p>
                    )}
                  </div>
                </section>
              ) : null}
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
