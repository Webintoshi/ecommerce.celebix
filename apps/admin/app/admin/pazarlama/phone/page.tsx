"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Download, Filter, Phone, RefreshCw, Users, X } from "lucide-react";
import { getCustomers } from "@/lib/customers";
import { Customer } from "@/types/customer";

export default function PhoneMarketingPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [callNote, setCallNote] = useState("");

  useEffect(() => {
    setCustomers(getCustomers());
  }, []);

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (customer.phone && customer.phone.includes(searchQuery));

    const matchesFilter =
      filter === "all" ||
      (filter === "phone" && customer.phone) ||
      (filter === "new" && customer.tags?.includes("Yeni")) ||
      (filter === "vip" && customer.tags?.includes("VIP"));

    return matchesSearch && matchesFilter;
  });

  const selectedPhoneCustomers = useMemo(
    () => customers.filter((customer) => customer.phone && selectedCustomers.includes(customer.id)),
    [customers, selectedCustomers],
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCustomers(filteredCustomers.map((customer) => customer.id));
    } else {
      setSelectedCustomers([]);
    }
  };

  const handleSelectCustomer = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedCustomers((prev) => [...prev, id]);
    } else {
      setSelectedCustomers((prev) => prev.filter((customerId) => customerId !== id));
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.14),_transparent_32%),linear-gradient(180deg,_#fffaf3_0%,_#f6ede0_100%)] px-4 py-4 md:px-6 md:py-6 xl:px-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="rounded-[32px] border border-[#eadfcd] bg-white/88 p-5 shadow-[0_24px_80px_-42px_rgba(109,76,44,0.45)] backdrop-blur md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <span className="inline-flex w-fit items-center rounded-full border border-[#e7d2b4] bg-[#fff4e2] px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9a6a2f]">
                Telefon Pazarlama
              </span>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[#352312] md:text-[2.5rem]">
                  Arama akışını daha net, hızlı ve kontrollü yönetin.
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-[#7a6654] md:text-[15px]">
                  Müşteri seçimini tek ekranda yönetin, telefon listelerini düzenli görün ve arama notlarını ekibinizle uyumlu şekilde hazırlayın.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/admin/pazarlama"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#e7d9c8] bg-white px-4 py-3 text-sm font-semibold text-[#6f5843] transition hover:border-[#d7c0a4] hover:bg-[#fff8ee] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c58a38] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffaf3]"
              >
                <X className="h-4 w-4" />
                Geri
              </Link>
              <button
                onClick={() => setCustomers(getCustomers())}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d9b78d] bg-[#a66a2d] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_-22px_rgba(166,106,45,0.8)] transition hover:bg-[#915b26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c58a38] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffaf3]"
              >
                <RefreshCw className="h-4 w-4" />
                Yenile
              </button>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
          <section className="rounded-[30px] border border-[#eadfcd] bg-white/92 shadow-[0_28px_90px_-48px_rgba(89,59,27,0.4)] backdrop-blur">
            <div className="border-b border-[#f1e4d1] px-5 py-5 md:px-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[#3f2a17]">Müşteri listesi</h2>
                  <p className="mt-1 text-sm text-[#826c57]">
                    {selectedCustomers.length} seçili müşteri, {filteredCustomers.length} görünür kayıt.
                  </p>
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="relative min-w-0 md:min-w-[280px]">
                    <Filter className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b2916f]" />
                    <input
                      type="text"
                      placeholder="Müşteri veya telefon ara"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-2xl border border-[#eadcca] bg-[#fffaf3] py-3 pl-11 pr-4 text-sm text-[#3d2917] placeholder:text-[#b69a7d] transition focus:border-[#c58a38] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#e8bf84]/30"
                    />
                  </div>

                  <div className="relative md:min-w-[220px]">
                    <Filter className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b2916f]" />
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      className="w-full appearance-none rounded-2xl border border-[#eadcca] bg-[#fffaf3] py-3 pl-11 pr-10 text-sm text-[#3d2917] transition focus:border-[#c58a38] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#e8bf84]/30"
                    >
                      <option value="all">Tüm müşteriler</option>
                      <option value="phone">Telefon numarası olanlar</option>
                      <option value="new">Yeni müşteriler</option>
                      <option value="vip">VIP müşteriler</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-3 pb-3 pt-3 md:px-4 md:pb-4">
              <div className="hidden overflow-hidden rounded-[28px] border border-[#eee1cf] md:block">
                <div className="max-h-[620px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[linear-gradient(180deg,_#fff7ec_0%,_#fffdf9_100%)] text-[#755b43]">
                      <tr>
                        <th className="px-5 py-4 text-left">
                          <input
                            type="checkbox"
                            checked={selectedCustomers.length === filteredCustomers.length && filteredCustomers.length > 0}
                            onChange={(e) => handleSelectAll(e.target.checked)}
                            className="h-4 w-4 cursor-pointer rounded border-[#ceb292] text-[#a66a2d] focus:ring-[#c58a38]"
                          />
                        </th>
                        <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.2em]">Müşteri</th>
                        <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.2em]">Telefon</th>
                        <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.2em]">Durum</th>
                        <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.2em]">İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomers.map((customer) => {
                        const isSelected = selectedCustomers.includes(customer.id);

                        return (
                          <tr
                            key={customer.id}
                            className={`border-t border-[#f4e8d7] transition ${
                              isSelected ? "bg-[#fff4df]" : "bg-white hover:bg-[#fffaf3]"
                            }`}
                          >
                            <td className="px-5 py-4 align-top">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => handleSelectCustomer(customer.id, e.target.checked)}
                                className="h-4 w-4 cursor-pointer rounded border-[#ceb292] text-[#a66a2d] focus:ring-[#c58a38]"
                              />
                            </td>
                            <td className="px-5 py-4 align-top">
                              <div className="space-y-1">
                                <div className="font-semibold text-[#322113]">{customer.firstName} {customer.lastName}</div>
                                <div className="flex flex-wrap gap-2">
                                  {(customer.tags || []).map((tag) => (
                                    <span
                                      key={tag}
                                      className="inline-flex rounded-full border border-[#ead4b3] bg-[#fff8eb] px-2.5 py-1 text-[11px] font-medium text-[#8b6234]"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4 align-top">
                              <span className="inline-flex rounded-xl bg-[#f7efe5] px-3 py-2 font-mono text-[#73563a]">
                                {customer.phone || "-"}
                              </span>
                            </td>
                            <td className="px-5 py-4 align-top">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  customer.phone
                                    ? "bg-[#ebf7ee] text-[#2d7a49]"
                                    : "bg-[#f7eee7] text-[#9d6e43]"
                                }`}
                              >
                                {customer.phone ? "Aramaya hazır" : "Numara eksik"}
                              </span>
                            </td>
                            <td className="px-5 py-4 align-top">
                              {customer.phone ? (
                                <a
                                  href={`tel:${customer.phone}`}
                                  className="inline-flex items-center gap-2 rounded-2xl border border-[#dcb78f] bg-[#fff8ee] px-4 py-2.5 font-semibold text-[#8a5824] transition hover:border-[#c58a38] hover:bg-[#fef1db] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c58a38] focus-visible:ring-offset-2"
                                >
                                  <Phone className="h-4 w-4" />
                                  Ara
                                </a>
                              ) : (
                                <span className="text-sm text-[#b79b7e]">Telefon yok</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-3 md:hidden">
                {filteredCustomers.map((customer) => {
                  const isSelected = selectedCustomers.includes(customer.id);

                  return (
                    <article
                      key={customer.id}
                      className={`rounded-[26px] border p-4 transition ${
                        isSelected ? "border-[#dba85f] bg-[#fff4df]" : "border-[#eee2d1] bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSelectCustomer(customer.id, e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-[#ceb292] text-[#a66a2d] focus:ring-[#c58a38]"
                        />
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-[#322113]">{customer.firstName} {customer.lastName}</div>
                              <div className="mt-1 font-mono text-sm text-[#7a6654]">{customer.phone || "Telefon yok"}</div>
                            </div>
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                customer.phone ? "bg-[#ebf7ee] text-[#2d7a49]" : "bg-[#f7eee7] text-[#9d6e43]"
                              }`}
                            >
                              {customer.phone ? "Hazır" : "Eksik"}
                            </span>
                          </div>

                          {(customer.tags || []).length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {(customer.tags || []).map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex rounded-full border border-[#ead4b3] bg-[#fff8eb] px-2.5 py-1 text-[11px] font-medium text-[#8b6234]"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}

                          {customer.phone && (
                            <a
                              href={`tel:${customer.phone}`}
                              className="inline-flex items-center gap-2 rounded-2xl border border-[#dcb78f] bg-[#fff8ee] px-4 py-2.5 text-sm font-semibold text-[#8a5824] transition hover:border-[#c58a38] hover:bg-[#fef1db]"
                            >
                              <Phone className="h-4 w-4" />
                              Ara
                            </a>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {filteredCustomers.length === 0 && (
                <div className="rounded-[28px] border border-dashed border-[#e6d4bd] bg-[#fffaf3] px-6 py-14 text-center">
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#f4e3cc] text-[#a4743a]">
                    <Users className="h-7 w-7" />
                  </div>
                  <h3 className="text-lg font-semibold text-[#3f2a17]">Müşteri bulunamadı</h3>
                  <p className="mt-2 text-sm text-[#8b7259]">Arama veya filtre kriterlerinize uygun kayıt bulunmuyor.</p>
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-[30px] border border-[#eadfcd] bg-white/92 p-5 shadow-[0_28px_90px_-48px_rgba(89,59,27,0.4)] backdrop-blur md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="inline-flex rounded-full border border-[#ead4b3] bg-[#fff6e6] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#976731]">
                    Seçili numaralar
                  </span>
                  <h3 className="mt-3 text-lg font-semibold text-[#3f2a17]">Arama listesi</h3>
                  <p className="mt-1 text-sm text-[#826c57]">Telefonu olan seçili müşteriler bu alanda toplanır.</p>
                </div>
                <div className="rounded-2xl bg-[#fff3df] px-3 py-2 text-right">
                  <div className="text-xs uppercase tracking-[0.2em] text-[#a27b4d]">Toplam</div>
                  <div className="text-lg font-semibold text-[#6b441d]">{selectedPhoneCustomers.length}</div>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {selectedPhoneCustomers.length > 0 ? (
                  selectedPhoneCustomers.map((customer) => (
                    <div
                      key={customer.id}
                      className="flex items-center justify-between gap-3 rounded-[24px] border border-[#efe1cf] bg-[#fffdf9] px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-[#322113]">{customer.firstName} {customer.lastName}</div>
                        <div className="truncate font-mono text-sm text-[#7b6753]">{customer.phone}</div>
                      </div>
                      <a
                        href={`tel:${customer.phone}`}
                        className="inline-flex items-center gap-2 rounded-2xl bg-[#2f8f59] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#267549] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f8f59] focus-visible:ring-offset-2"
                      >
                        <Phone className="h-4 w-4" />
                        Ara
                      </a>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[24px] border border-dashed border-[#e8d8c1] bg-[#fff9f1] px-4 py-8 text-center text-sm text-[#8a725a]">
                    Henüz seçili müşteri yok.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[30px] border border-[#eadfcd] bg-white/92 p-5 shadow-[0_28px_90px_-48px_rgba(89,59,27,0.4)] backdrop-blur md:p-6">
              <span className="inline-flex rounded-full border border-[#ead4b3] bg-[#fff6e6] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#976731]">
                Arama notu
              </span>
              <h3 className="mt-3 text-lg font-semibold text-[#3f2a17]">Ekibinize hazır kısa metin</h3>
              <p className="mt-1 text-sm text-[#826c57]">Arama sırasında kullanılacak konuşma akışını veya notları burada hazırlayın.</p>

              <textarea
                value={callNote}
                onChange={(e) => setCallNote(e.target.value)}
                placeholder="Merhaba, kampanyamızla ilgili kısa bir bilgilendirme yapmak istiyorum..."
                rows={7}
                className="mt-5 w-full rounded-[26px] border border-[#eadcca] bg-[#fffaf3] px-4 py-4 text-sm leading-6 text-[#3d2917] placeholder:text-[#b69a7d] transition focus:border-[#c58a38] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#e8bf84]/30"
              />

              <button
                onClick={() => {
                  if (callNote.trim()) {
                    navigator.clipboard.writeText(callNote);
                    alert("Not kopyalandı.");
                  }
                }}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#d6b28a] bg-[#fff4e2] px-4 py-3 font-semibold text-[#8a5824] transition hover:bg-[#feecd0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c58a38] focus-visible:ring-offset-2"
              >
                <Copy className="h-4 w-4" />
                Notu kopyala
              </button>
            </section>

            <section className="rounded-[30px] border border-[#eadfcd] bg-white/92 p-5 shadow-[0_28px_90px_-48px_rgba(89,59,27,0.4)] backdrop-blur md:p-6">
              <span className="inline-flex rounded-full border border-[#ead4b3] bg-[#fff6e6] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#976731]">
                Dışa aktar
              </span>
              <h3 className="mt-3 text-lg font-semibold text-[#3f2a17]">Telefon listesini paylaşın</h3>
              <p className="mt-1 text-sm text-[#826c57]">Seçili telefon numaralarını hızlıca kopyalayın veya düz metin olarak indirin.</p>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  onClick={() => {
                    const phones = selectedPhoneCustomers.map((customer) => customer.phone).join("\n");
                    if (phones) {
                      navigator.clipboard.writeText(phones);
                      alert("Telefon numaraları kopyalandı.");
                    }
                  }}
                  disabled={selectedCustomers.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#e6d5bf] bg-[#faf4eb] px-4 py-3 font-semibold text-[#6f5843] transition hover:bg-[#f3ebdf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c58a38] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Copy className="h-4 w-4" />
                  Kopyala
                </button>
                <button
                  onClick={() => {
                    const phones = selectedPhoneCustomers.map((customer) => customer.phone).join("\n");
                    if (phones) {
                      const blob = new Blob([phones], { type: "text/plain" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "phone-list.txt";
                      a.click();
                    }
                  }}
                  disabled={selectedCustomers.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d9b78d] bg-[#a66a2d] px-4 py-3 font-semibold text-white transition hover:bg-[#915b26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c58a38] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  TXT indir
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
