import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CalendarDays,
  ClipboardList,
  Coins,
  PackageCheck,
  PackagePlus,
  Search,
  ShieldCheck,
  Truck,
  Warehouse,
} from "lucide-react";

import { AdminEmptyState, AdminPageHeader, AdminPageShell } from "@/components/admin/AdminPageShell";
import { STORE_RUNTIME } from "@/lib/store-runtime";

export const metadata: Metadata = {
  title: `Satın Alma | ${STORE_RUNTIME.name} Admin`,
  description: "Tedarikçi siparişleri ve gelen stok akışını izleme alanı.",
};

const purchaseMetrics = [
  { label: "Taslak", value: "0", detail: "satın alma", icon: ClipboardList },
  { label: "Bekleyen", value: "0", detail: "kabul", icon: PackageCheck },
  { label: "Tutar", value: "₺0", detail: "planlanan", icon: Coins },
  { label: "Stok", value: "Hazır", detail: "kontrollü", icon: ShieldCheck },
];

const workflowItems = [
  {
    title: "Tedarikçi siparişi",
    detail: "Tedarikçi, referans ve beklenen sevk bilgisi",
    status: "Hazırlık",
    icon: Truck,
  },
  {
    title: "Ürün kabulü",
    detail: "Gelen ürünleri kalem ve miktar bazında karşılama",
    status: "Sırada",
    icon: Warehouse,
  },
  {
    title: "Maliyet kontrolü",
    detail: "Satın alma maliyetini ürün maliyetiyle eşleştirme",
    status: "Planlandı",
    icon: Coins,
  },
  {
    title: "Stok hareketi",
    detail: "Kabul tamamlanmadan canlı stoka yazılmaz",
    status: "Korumalı",
    icon: Boxes,
  },
];

const tableColumns = ["Tedarikçi", "Referans", "Beklenen tarih", "Kalem", "Tutar", "Durum"];

export default function ProductPurchasingPage() {
  return (
    <main role="main" className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
      <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
        <AdminPageShell>
          <AdminPageHeader
            sectionLabel="Ürünler"
            title="Satın Alma"
            description="Tedarik ve gelen stok akışını yönetin."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/admin/urunler"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8]"
                >
                  Ürünlere Git
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="Satın alma kaydı sistem bağlantısı tamamlanınca açılacak"
                  className="inline-flex h-10 cursor-not-allowed items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white opacity-60 shadow-[0_10px_24px_rgba(255,106,0,0.16)]"
                >
                  <PackagePlus className="h-4 w-4" />
                  Yeni Satın Alma
                </button>
              </div>
            }
            metrics={
              <>
                {purchaseMetrics.map((metric) => {
                  const Icon = metric.icon;

                  return (
                    <div key={metric.label} className="min-h-[92px] bg-white px-4 py-3.5 xl:px-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280]">
                          {metric.label}
                        </p>
                        <Icon className="h-4 w-4 text-[#9CA3AF]" />
                      </div>
                      <div className="mt-3 flex items-end gap-2">
                        <p className="text-3xl font-semibold tracking-[-0.04em] text-[#111827]">{metric.value}</p>
                        <span className="pb-1 text-sm font-medium text-[#6B7280]">{metric.detail}</span>
                      </div>
                    </div>
                  );
                })}
              </>
            }
          />

          <section className="grid gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_380px]">
            <div className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <div className="grid gap-3 border-b border-[#E1E6EF] bg-[#F9F9F9] px-4 py-3 min-[960px]:grid-cols-[minmax(280px,0.7fr)_1fr_auto] min-[960px]:items-center">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B95A5]" />
                  <input
                    disabled
                    aria-label="Satın alma kaydı ara"
                    placeholder="Satın alma kaydı ara"
                    className="h-10 w-full cursor-not-allowed rounded-[8px] border border-[#DCE3EC] bg-white py-2 pl-11 pr-3 text-sm font-medium text-[#6B7280] outline-none"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#6B7280]">
                  <span className="inline-flex h-10 items-center rounded-[8px] border border-[#DCE3EC] bg-white px-3">
                    0 kayıt
                  </span>
                  <span className="inline-flex h-10 items-center rounded-[8px] border border-[#DCE3EC] bg-white px-3">
                    Kabul bekleyen yok
                  </span>
                  <span className="inline-flex h-10 items-center rounded-[8px] border border-[#FFD7BF] bg-[#FFF1E8] px-3 text-[#E85D04]">
                    Altyapı gerekli
                  </span>
                </div>

                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="inline-flex h-10 cursor-not-allowed items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#9CA3AF]"
                >
                  <CalendarDays className="h-4 w-4" />
                  Tarih
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[920px] w-full text-left text-sm">
                  <thead className="bg-[#EEF3F7] text-[#4B5563]">
                    <tr>
                      {tableColumns.map((column) => (
                        <th key={column} className="px-5 py-3 font-semibold">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={tableColumns.length} className="px-5 py-14">
                        <AdminEmptyState
                          icon={<PackagePlus className="h-7 w-7" />}
                          title="Satın alma kaydı bulunmuyor"
                          description="Tedarikçi siparişi altyapısı bağlandığında kayıtlar bu listede görünecek."
                          className="border-[#DCE3EC] bg-[#F9F9F9]"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white">
              <div className="border-b border-[#E1E6EF] bg-[#F9F9F9] px-4 py-3">
                <h2 className="text-base font-semibold tracking-[-0.02em] text-[#111827]">Akış</h2>
                <p className="mt-1 text-sm font-medium text-[#6B7280]">Satın alma modülü için operasyon sırası.</p>
              </div>

              <div className="divide-y divide-[#E1E6EF]">
                {workflowItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div key={item.title} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-[#F9F9F9] text-[#FF6A00]">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-[#111827]">{item.title}</h3>
                        <p className="mt-1 line-clamp-1 text-xs font-medium text-[#6B7280]">{item.detail}</p>
                      </div>
                      <span className="text-xs font-semibold text-[#E85D04]">{item.status}</span>
                    </div>
                  );
                })}
              </div>
            </aside>
          </section>

          <section className="border-y border-[#E1E6EF] bg-[#F9F9F9] px-1 py-3 text-sm font-medium leading-6 text-[#6B7280]">
            Canlı stok, ödeme, sipariş veya tedarikçi verisine yazma yapılmaz. Satın alma kayıtları sistem bağlantısı tamamlanana kadar bu ekran izleme ve hazırlık yüzeyi olarak kalır.
          </section>
        </AdminPageShell>
      </div>
    </main>
  );
}
