"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Calendar,
  Download,
  Edit,
  Eye,
  FileSpreadsheet,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import type { Customer } from "@/types/customer";
import {
  buildImportTemplateCsv as buildCustomerImportTemplateCsv,
  exportCustomersToCSV as exportCustomerRecordsToCSV,
  parseImportedCustomers as parseCustomerImportRows,
} from "@/lib/customer-csv";
import { fetchAdminJson } from "@/lib/admin-client-fetch";

type ImportedCustomerRow = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  status?: Customer["status"];
  notes?: string;
  lineNumber: number;
};

function transformCustomer(dbCustomer: Record<string, unknown>): Customer {
  const totalOrders = Number(dbCustomer.total_orders) || 0;
  const totalSpent = Number(dbCustomer.total_spent) || 0;
  const rawAddresses = Array.isArray(dbCustomer.addresses)
    ? (dbCustomer.addresses as Record<string, unknown>[])
    : [];

  return {
    id: dbCustomer.id as string,
    firstName: (dbCustomer.first_name as string) || "",
    lastName: (dbCustomer.last_name as string) || "",
    email: (dbCustomer.email as string) || "",
    phone: (dbCustomer.phone as string) || "",
    status: (dbCustomer.status as Customer["status"]) || "active",
    totalOrders,
    totalSpent,
    lastOrderDate: dbCustomer.last_order_at ? new Date(dbCustomer.last_order_at as string) : undefined,
    averageOrderValue: totalOrders > 0 ? totalSpent / totalOrders : 0,
    registeredAt: new Date(dbCustomer.created_at as string),
    addresses: rawAddresses.map((address) => ({
      id: (address.id as string) || "",
      title: ((address.type as string) || "shipping") === "billing" ? "Fatura" : "Teslimat",
      company: (address.company as string) || "",
      firstName: (address.first_name as string) || "",
      lastName: (address.last_name as string) || "",
      phone: (address.phone as string) || "",
      city: (address.city as string) || "",
      district: (address.state as string) || "",
      addressLine: (address.address_line1 as string) || "",
      addressLine2: (address.address_line2 as string) || "",
      postalCode: (address.postal_code as string) || "",
      country: (address.country as string) || "TR",
      isDefault: Boolean(address.is_default),
    })),
    notes: (dbCustomer.notes as string) || "",
    tags: Array.isArray(dbCustomer.tags) ? (dbCustomer.tags as string[]) : [],
    externalCustomerId: (dbCustomer.external_customer_id as string) || "",
    acceptsEmailMarketing: Boolean(dbCustomer.accepts_email_marketing),
    acceptsSmsMarketing: Boolean(dbCustomer.accepts_sms_marketing),
    taxExempt: Boolean(dbCustomer.tax_exempt),
  };
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ş/g, "s")
    .replace(/Ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/Ğ/g, "g")
    .replace(/ö/g, "o")
    .replace(/Ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/Ü/g, "u");
}

function normalizeHeader(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "");
}

function normalizeStatus(value: string): Customer["status"] | undefined {
  const normalized = normalizeText(value);

  if (["active", "aktif"].includes(normalized)) {
    return "active";
  }

  if (["inactive", "pasif"].includes(normalized)) {
    return "inactive";
  }

  if (["blocked", "engelli", "bloke"].includes(normalized)) {
    return "blocked";
  }

  return undefined;
}

function detectDelimiter(text: string): "," | ";" {
  const headerLine = text.split(/\r?\n/, 1)[0] || "";
  const semicolonCount = (headerLine.match(/;/g) || []).length;
  const commaCount = (headerLine.match(/,/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (inQuotes) {
      if (char === "\"") {
        if (nextChar === "\"") {
          currentField += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      currentRow.push(currentField.trim());
      currentField = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    if (char === "\n") {
      currentRow.push(currentField.trim());
      currentField = "";

      if (currentRow.some((value) => value.length > 0)) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((value) => value.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function parseImportedCustomers(text: string): {
  rows: ImportedCustomerRow[];
  skippedCount: number;
  skippedDetails: string[];
} {
  const parsedRows = parseCsv(text);

  if (parsedRows.length < 2) {
    return {
      rows: [],
      skippedCount: 0,
      skippedDetails: ["CSV dosyasında veri satırı bulunamadı."],
    };
  }

  const headerMap = parsedRows[0].map((header) => normalizeHeader(header));
  const firstNameIndex = headerMap.findIndex((value) => ["ad", "isim", "firstname"].includes(value));
  const lastNameIndex = headerMap.findIndex((value) => ["soyad", "lastname"].includes(value));
  const emailIndex = headerMap.findIndex((value) => ["eposta", "email", "mail"].includes(value));
  const phoneIndex = headerMap.findIndex((value) => ["telefon", "phone", "gsm", "ceptelefonu"].includes(value));
  const statusIndex = headerMap.findIndex((value) => ["durum", "status"].includes(value));
  const notesIndex = headerMap.findIndex((value) => ["not", "notes", "aciklama"].includes(value));

  if (emailIndex === -1) {
    return {
      rows: [],
      skippedCount: parsedRows.length - 1,
      skippedDetails: ["CSV başlıklarında 'E-posta' veya 'Email' alanı bulunamadı."],
    };
  }

  const rows: ImportedCustomerRow[] = [];
  const skippedDetails: string[] = [];
  const seenEmails = new Set<string>();

  for (let rowIndex = 1; rowIndex < parsedRows.length; rowIndex += 1) {
    const row = parsedRows[rowIndex];
    const lineNumber = rowIndex + 1;
    const email = row[emailIndex]?.trim().toLowerCase();

    if (!email) {
      skippedDetails.push(`${lineNumber}. satır atlandı: e-posta boş.`);
      continue;
    }

    if (!email.includes("@")) {
      skippedDetails.push(`${lineNumber}. satır atlandı: geçerli e-posta bulunamadı.`);
      continue;
    }

    if (seenEmails.has(email)) {
      skippedDetails.push(`${lineNumber}. satır atlandı: dosya içinde yinelenen e-posta.`);
      continue;
    }

    seenEmails.add(email);

    rows.push({
      firstName: firstNameIndex >= 0 ? row[firstNameIndex]?.trim() || "" : "",
      lastName: lastNameIndex >= 0 ? row[lastNameIndex]?.trim() || "" : "",
      email,
      phone: phoneIndex >= 0 ? row[phoneIndex]?.trim() || "" : "",
      status: statusIndex >= 0 ? normalizeStatus(row[statusIndex] || "") : undefined,
      notes: notesIndex >= 0 ? row[notesIndex]?.trim() || "" : "",
      lineNumber,
    });
  }

  return {
    rows,
    skippedCount: skippedDetails.length,
    skippedDetails,
  };
}

function escapeCsvValue(value: string | number | undefined, delimiter = ";"): string {
  const text = String(value ?? "");
  if (text.includes("\"") || text.includes("\n") || text.includes(delimiter)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function exportCustomersToCSV(customers: Customer[]): string {
  const delimiter = ";";
  const headers = ["Ad", "Soyad", "E-posta", "Telefon", "Durum", "Not"];
  const rows = customers.map((customer) =>
    [
      customer.firstName,
      customer.lastName,
      customer.email,
      customer.phone || "",
      customer.status,
      customer.notes || "",
    ]
      .map((value) => escapeCsvValue(value, delimiter))
      .join(delimiter)
  );

  return [headers.join(delimiter), ...rows].join("\n");
}

function buildImportTemplateCsv(): string {
  return [
    "Ad;Soyad;E-posta;Telefon;Durum;Not",
    "Ayse;Yilmaz;ayse@example.com;+90 555 111 22 33;active;Instagram kampanyasindan geldi",
    "Mehmet;Demir;mehmet@example.com;+90 555 444 55 66;inactive;Eski bayi müşteri",
  ].join("\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

type CustomersPageClientProps = {
  initialCustomers?: Customer[];
  initialError?: string;
};

export default function CustomersPage({
  initialCustomers = [],
  initialError = "",
}: CustomersPageClientProps) {
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [loading, setLoading] = useState(initialCustomers.length === 0);
  const [importing, setImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(initialError);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadCustomers = async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await fetchAdminJson<{
        success: boolean;
        customers: Record<string, unknown>[];
      }>("/api/customers", { timeoutMs: 12000 });
      const data = response as { error?: string };

      if (!response.success) {
        throw new Error(data.error || "Müşteriler yüklenemedi.");
      }

      setCustomers((response.customers || []).map(transformCustomer));
    } catch (error) {
      console.error("Failed to load customers:", error);
      const message = error instanceof Error ? error.message : "Müşteriler yüklenemedi.";
      setErrorMessage(message);
      toast.error(error instanceof Error ? error.message : "Müşteriler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialCustomers.length === 0) {
      void loadCustomers();
    }
  }, [initialCustomers.length]);

  const metrics = useMemo(
    () => ({
      total: customers.length,
      active: customers.filter((customer) => customer.status === "active").length,
      inactive: customers.filter((customer) => customer.status === "inactive").length,
      blocked: customers.filter((customer) => customer.status === "blocked").length,
      totalRevenue: customers.reduce((total, customer) => total + customer.totalSpent, 0),
    }),
    [customers]
  );

  const filteredCustomers = useMemo(
    () =>
      customers.filter((customer) => {
        const query = searchQuery.trim().toLowerCase();
        const matchesSearch =
          query.length === 0 ||
          customer.firstName.toLowerCase().includes(query) ||
          customer.lastName.toLowerCase().includes(query) ||
          customer.email.toLowerCase().includes(query) ||
          (customer.phone || "").includes(query);

        const matchesStatus = statusFilter === "all" || customer.status === statusFilter;
        return matchesSearch && matchesStatus;
      }),
    [customers, searchQuery, statusFilter]
  );

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`"${name}" müşterisini silmek istediğinizden emin misiniz?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/customers?id=${id}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Müşteri silinemedi.");
      }

      toast.success("Müşteri silindi.");
      await loadCustomers();
    } catch (error) {
      console.error("Failed to delete customer:", error);
      toast.error(error instanceof Error ? error.message : "Müşteri silinemedi.");
    }
  };

  const handleBulkDelete = async () => {
    if (
      selectedCustomers.length === 0 ||
      !window.confirm(`${selectedCustomers.length} müşteriyi silmek istediğinizden emin misiniz?`)
    ) {
      return;
    }

    try {
      await Promise.all(
        selectedCustomers.map(async (id) => {
          const response = await fetch(`/api/customers?id=${id}`, { method: "DELETE" });
          const data = await response.json().catch(() => null);

          if (!response.ok || !data?.success) {
            throw new Error(data?.error || "Müşteriler silinemedi.");
          }
        })
      );

      setSelectedCustomers([]);
      toast.success("Seçilen müşteriler silindi.");
      await loadCustomers();
    } catch (error) {
      console.error("Failed to delete customers:", error);
      toast.error(error instanceof Error ? error.message : "Toplu silme başarısız.");
    }
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedCustomers(checked ? filteredCustomers.map((customer) => customer.id) : []);
  };

  const handleExport = () => {
    const customersToExport =
      selectedCustomers.length > 0
        ? customers.filter((customer) => selectedCustomers.includes(customer.id))
        : filteredCustomers;

    if (customersToExport.length === 0) {
      toast.error("Dışa aktarılacak müşteri bulunamadı.");
      return;
    }

    downloadCsv(
      `musteriler_${new Date().toISOString().split("T")[0]}.csv`,
      exportCustomerRecordsToCSV(customersToExport),
    );
    toast.success(`${customersToExport.length} müşteri dışa aktarıldı.`);
  };

  const handleDownloadTemplate = () => {
    downloadCsv("musteri-ice-aktarma-sablonu.csv", buildCustomerImportTemplateCsv());
    toast.success("İçe aktarma şablonu indirildi.");
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      setImporting(true);

      const text = await file.text();
      const { rows, skippedCount, skippedDetails } = parseCustomerImportRows(text);

      if (rows.length === 0) {
        throw new Error(skippedDetails[0] || "İçe aktarılacak geçerli satır bulunamadı.");
      }

      const knownEmails = new Set(customers.map((customer) => customer.email.trim().toLowerCase()));
      let createdCount = 0;
      let updatedCount = 0;
      let failedCount = 0;
      const failedDetails: string[] = [];

      for (const row of rows) {
        try {
          const hasAddressData = Boolean(
            row.address &&
              Object.values(row.address).some((value) => typeof value === "string" && value.trim().length > 0),
          );

          const createResponse = await fetch("/api/customers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              externalCustomerId: row.externalCustomerId,
              firstName: row.firstName,
              lastName: row.lastName,
              email: row.email,
              phone: row.phone,
              status: row.status,
              notes: row.notes,
              totalOrders: row.totalOrders,
              totalSpent: row.totalSpent,
              tags: row.tags,
              acceptsEmailMarketing: row.acceptsEmailMarketing,
              acceptsSmsMarketing: row.acceptsSmsMarketing,
              taxExempt: row.taxExempt,
              ...(hasAddressData
                ? {
                    addresses: [
                      {
                        type: "shipping",
                        company: row.address?.company,
                        firstName: row.firstName,
                        lastName: row.lastName,
                        addressLine1: row.address?.addressLine1,
                        addressLine2: row.address?.addressLine2,
                        city: row.address?.city,
                        state: row.address?.state,
                        postalCode: row.address?.postalCode,
                        country: row.address?.country,
                        phone: row.address?.phone || row.phone,
                        isDefault: true,
                      },
                    ],
                  }
                : {}),
            }),
          });

          const createData = await createResponse.json().catch(() => null);

          const customerId = createData?.customer?.id as string;
          const followUpUpdates: Record<string, string> = {};

          if (!createResponse.ok || !createData?.success || !createData.customer?.id) {
            throw new Error(createData?.error || "Müşteri kaydı oluşturulamadı.");
          }

          if (false) {
            const updateResponse = await fetch("/api/customers", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: customerId,
                ...followUpUpdates,
              }),
            });

            const updateData = await updateResponse.json().catch(() => null);

            if (!updateResponse.ok || !updateData?.success) {
              throw new Error(updateData?.error || "Müşteri detayları güncellenemedi.");
            }
          }

          if (knownEmails.has(row.email)) {
            updatedCount += 1;
          } else {
            createdCount += 1;
            knownEmails.add(row.email);
          }
        } catch (error) {
          failedCount += 1;
          failedDetails.push(
            `${row.lineNumber}. satır: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`
          );
        }
      }

      await loadCustomers();

      if (createdCount + updatedCount > 0) {
        toast.success(`${createdCount + updatedCount} müşteri işlendi.`, {
          description: [
            createdCount > 0 ? `${createdCount} yeni kayıt` : null,
            updatedCount > 0 ? `${updatedCount} mevcut kayıt güncellendi` : null,
            skippedCount > 0 ? `${skippedCount} satır atlandı` : null,
          ]
            .filter(Boolean)
            .join(" • "),
        });
      }

      if (failedCount > 0) {
        toast.error(`${failedCount} satır içe aktarılamadı.`, {
          description: failedDetails.slice(0, 3).join(" • "),
        });
      } else if (skippedCount > 0) {
        toast.error(`${skippedCount} satır atlandı.`, {
          description: skippedDetails.slice(0, 3).join(" • "),
        });
      }
    } catch (error) {
      console.error("Failed to import customers:", error);
      toast.error(error instanceof Error ? error.message : "İçe aktarma sırasında hata oluştu.");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);

  const hasActiveFilters = Boolean(searchQuery.trim()) || statusFilter !== "all";
  const allVisibleSelected =
    filteredCustomers.length > 0 && selectedCustomers.length === filteredCustomers.length;

  return (
    <main
      role="main"
      aria-busy={loading}
      className="min-h-screen bg-gradient-to-br from-[#faf8f5] via-[#f5f0eb] to-[#efe5dc]"
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-28 right-[-6rem] h-[24rem] w-[24rem] rounded-full bg-gradient-to-br from-[#FE6100]/12 via-[#FFB067]/8 to-transparent blur-3xl" />
        <div className="absolute left-[-5rem] top-1/3 h-72 w-72 rounded-full bg-gradient-to-tr from-amber-200/20 via-orange-100/10 to-transparent blur-3xl" />
        <div className="absolute bottom-[-8rem] right-1/4 h-80 w-80 rounded-full bg-gradient-to-tl from-rose-100/20 via-[#FE6100]/8 to-transparent blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1600px] px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <div className="space-y-8">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleImport}
      />

          <section className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_24px_80px_rgba(254,97,0,0.12)]">
            <div className="border-b border-[#FE6100]/8 px-6 py-6 md:px-8 md:py-7">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="inline-flex w-fit items-center rounded-full border border-[#FE6100]/20 bg-gradient-to-r from-[#FE6100]/10 to-[#FF8B3D]/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#FE6100]">
                    Müşteriler
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="inline-flex items-center gap-2 rounded-2xl border border-[#FE6100]/15 bg-white px-4 py-2.5 text-sm font-medium text-[#8a4b22] shadow-sm transition-all hover:border-[#FE6100]/30 hover:bg-[#fff7f1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Şablon İndir
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                    className="inline-flex items-center gap-2 rounded-2xl border border-[#FE6100]/15 bg-white px-4 py-2.5 text-sm font-medium text-[#8a4b22] shadow-sm transition-all hover:border-[#FE6100]/30 hover:bg-[#fff7f1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Upload className="h-4 w-4" />
                    {importing ? "İçe Aktarılıyor..." : "İçe Aktar"}
                  </button>
                  <button
                    type="button"
                    onClick={handleExport}
                    className="inline-flex items-center gap-2 rounded-2xl border border-[#FE6100]/15 bg-white px-4 py-2.5 text-sm font-medium text-[#8a4b22] shadow-sm transition-all hover:border-[#FE6100]/30 hover:bg-[#fff7f1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                  >
                    <Download className="h-4 w-4" />
                    Dışa Aktar
                  </button>
                  <Link
                    href="/admin/musteriler/yeni"
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E45700] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.24)] transition hover:translate-y-[-1px] hover:from-[#f05c00] hover:to-[#d84f00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                  >
                    <Plus className="h-4 w-4" />
                    Yeni Müşteri
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-px bg-gradient-to-r from-[#FE6100]/10 via-[#FF8B3D]/5 to-[#FE6100]/10 md:grid-cols-2 xl:grid-cols-4">
              <HeroMetric label="Toplam müşteri" value={metrics.total.toLocaleString("tr-TR")} hint="Kayıtlı müşteri havuzu" />
              <HeroMetric label="Aktif müşteri" value={metrics.active.toLocaleString("tr-TR")} hint="İletişime açık ve aktif kayıtlar" />
              <HeroMetric label="Pasif müşteri" value={metrics.inactive.toLocaleString("tr-TR")} hint="Son dönemde pasif kalan hesaplar" />
              <HeroMetric label="Toplam harcama" value={formatPrice(metrics.totalRevenue)} hint="Müşteri kaynaklı toplam gelir" />
            </div>
          </section>

          {errorMessage ? (
            <div
              aria-live="assertive"
              className="rounded-[24px] border border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 px-5 py-4 text-sm font-medium text-rose-700 shadow-sm"
            >
              {errorMessage}
            </div>
          ) : null}

      {false && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-amber-950">CSV ile müşteri içe aktar</h2>
            <p className="mt-1 text-sm text-amber-800">
              Desteklenen sütunlar: <span className="font-medium">Ad</span>, <span className="font-medium">Soyad</span>,{" "}
              <span className="font-medium">E-posta</span>, <span className="font-medium">Telefon</span>,{" "}
              <span className="font-medium">Durum</span>, <span className="font-medium">Not</span>. E-posta alanı zorunludur.
            </p>
          </div>
          <div className="text-xs text-amber-900">
            Aynı e-posta ile gelen kayıtlar yeni müşteri oluşturmaz; mevcut müşteriyle eşleştirilir.
          </div>
        </div>
      </div>}

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Görünen kayıt"
              value={filteredCustomers.length.toLocaleString("tr-TR")}
              detail="Mevcut arama ve filtre sonucunda listelenen müşteri"
              icon={Search}
              tone="border-[#FE6100]/15 from-[#fff2e8] to-white text-[#FE6100]"
            />
            <StatCard
              title="Seçili müşteri"
              value={selectedCustomers.length.toLocaleString("tr-TR")}
              detail="Toplu işlem için işaretlenen kayıt"
              icon={UserCheck}
              tone="border-amber-200/70 from-amber-50 to-white text-amber-700"
            />
            <StatCard
              title="Engellenen"
              value={metrics.blocked.toLocaleString("tr-TR")}
              detail="İşlem ve iletişim kısıtlı müşteri hesabı"
              icon={ShieldAlert}
              tone="border-rose-200/70 from-rose-50 to-white text-rose-700"
            />
            <StatCard
              title="Ort. sipariş değeri"
              value={metrics.total > 0 ? formatPrice(metrics.totalRevenue / Math.max(metrics.total, 1)) : formatPrice(0)}
              detail="Toplam harcamanın müşteri bazında ortalaması"
              icon={Calendar}
              tone="border-stone-200 from-stone-50 to-white text-stone-700"
            />
          </section>

          <section className="rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.08)] md:p-6">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FE6100]">
                    Filtreler ve işlemler
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-gray-950">
                    Müşteri listesini daraltın ve yönetin
                  </h2>
                </div>
                <div
                  aria-live="polite"
                  className="inline-flex items-center gap-2 rounded-full border border-[#FE6100]/12 bg-white px-3 py-2 text-sm font-medium text-gray-600"
                >
                  <UserCheck className="h-4 w-4 text-[#FE6100]" />
                  {loading ? "Kayıtlar hazırlanıyor" : `${filteredCustomers.length.toLocaleString("tr-TR")} kayıt bulundu`}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_220px_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="İsim, e-posta veya telefon ile ara"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    aria-label="İsim, e-posta veya telefon ile müşteri ara"
                    className="w-full rounded-2xl border border-[#FE6100]/12 bg-white/85 py-3 pl-11 pr-4 text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-[#FE6100] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#FE6100]/15"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  aria-label="Müşteri durumuna göre filtrele"
                  className="cursor-pointer rounded-2xl border border-[#FE6100]/12 bg-white/85 px-4 py-3 text-sm text-gray-700 shadow-sm transition-all focus:border-[#FE6100] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#FE6100]/15"
                >
                  <option value="all">Tüm durumlar</option>
                  <option value="active">Aktif</option>
                  <option value="inactive">Pasif</option>
                  <option value="blocked">Engelli</option>
                </select>

                <div className="flex flex-wrap items-center justify-start gap-3 xl:justify-end">
                  {selectedCustomers.length > 0 ? (
                    <button
                      type="button"
                      onClick={handleBulkDelete}
                      className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow-sm transition-all hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
                    >
                      <Trash2 className="h-4 w-4" />
                      Seçilenleri Sil ({selectedCustomers.length})
                    </button>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[#e8d7c7] bg-white/70 px-4 py-3 text-sm text-[#8b7768]">
                      Toplu silme için kayıt seçin
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_24px_80px_rgba(254,97,0,0.1)]">
            <div className="border-b border-[#FE6100]/8 px-5 py-5 md:px-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FE6100]">
                    Müşteri tablosu
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-gray-950">
                    Müşteri listesi
                  </h2>
                </div>
                <div aria-live="polite" className="text-sm text-gray-500">
                  {loading
                    ? "Müşteriler hazırlanıyor"
                    : `${filteredCustomers.length.toLocaleString("tr-TR")} müşteri gösteriliyor`}
                </div>
              </div>
            </div>

            {filteredCustomers.length > 0 ? (
              <>
                <div className="border-b border-[#FE6100]/8 bg-[#fff8f3]/80 px-5 py-4 md:hidden">
                  <label className="inline-flex items-center gap-3 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      aria-label="Tüm görünen müşterileri seç"
                      className="h-4 w-4 rounded border-[#d8c3b1] text-[#FE6100] focus:ring-[#FE6100]"
                      checked={allVisibleSelected}
                      onChange={(event) => handleSelectAll(event.target.checked)}
                    />
                    Tüm görünen müşterileri seç
                  </label>
                </div>

                <div className="space-y-3 p-5 md:hidden">
                  {filteredCustomers.map((customer) => {
                    const initials = `${customer.firstName.charAt(0) || "?"}${customer.lastName.charAt(0) || ""}`;

                    return (
                      <article
                        key={customer.id}
                        className="rounded-[26px] border border-white/70 bg-white/85 p-5 shadow-sm transition-all hover:border-[#FE6100]/12 hover:bg-white hover:shadow-[0_18px_35px_rgba(254,97,0,0.08)]"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              aria-label={`${customer.firstName || "Adsız"} ${customer.lastName} müşterisini seç`}
                              className="mt-2 h-4 w-4 rounded border-[#d8c3b1] text-[#FE6100] focus:ring-[#FE6100]"
                              checked={selectedCustomers.includes(customer.id)}
                              onChange={(event) => {
                                if (event.target.checked) {
                                  setSelectedCustomers((current) => [...current, customer.id]);
                                  return;
                                }

                                setSelectedCustomers((current) => current.filter((id) => id !== customer.id));
                              }}
                            />
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#FE6100]/12 bg-gradient-to-br from-[#fff1e7] to-white text-sm font-semibold text-[#FE6100] shadow-sm">
                              {initials}
                            </div>
                            <div>
                              <Link
                                href={`/admin/musteriler/${customer.id}`}
                                className="text-base font-semibold tracking-[-0.02em] text-gray-950 transition-colors hover:text-[#FE6100] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                              >
                                {customer.firstName || "Adsız"} {customer.lastName}
                              </Link>
                              <p className="mt-1 break-all text-sm text-gray-500">{customer.email}</p>
                              <p className="mt-1 text-sm text-gray-500">{customer.phone || "Telefon bilgisi yok"}</p>
                            </div>
                          </div>
                          <StatusBadge status={customer.status} />
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <MobileInfoCard label="Toplam harcama" value={formatPrice(customer.totalSpent)} />
                          <MobileInfoCard label="Sipariş" value={`${customer.totalOrders} sipariş`} />
                          <MobileInfoCard
                            label="Son sipariş"
                            value={
                              customer.lastOrderDate
                                ? format(new Date(customer.lastOrderDate), "d MMM yyyy", { locale: tr })
                                : "Henüz yok"
                            }
                          />
                          <MobileInfoCard label="Durum" value={statusText(customer.status)} />
                        </div>

                        <div className="mt-4 flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/musteriler/${customer.id}`}
                            aria-label={`${customer.firstName || "Adsız"} ${customer.lastName} müşteri detayını görüntüle`}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#FE6100]/10 bg-white text-gray-500 shadow-sm transition-all hover:border-[#FE6100]/20 hover:text-[#FE6100] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                          >
                            <Eye className="h-5 w-5" />
                          </Link>
                          <Link
                            href={`/admin/musteriler/${customer.id}/duzenle`}
                            aria-label={`${customer.firstName || "Adsız"} ${customer.lastName} müşterisini düzenle`}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#FE6100]/10 bg-white text-gray-500 shadow-sm transition-all hover:border-[#FE6100]/20 hover:text-[#FE6100] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                          >
                            <Edit className="h-5 w-5" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDelete(customer.id, `${customer.firstName} ${customer.lastName}`.trim())}
                            aria-label={`${customer.firstName || "Adsız"} ${customer.lastName} müşterisini sil`}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-100 bg-white text-gray-500 shadow-sm transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-[#FE6100]/8 bg-[#fff8f3]/80">
                      <tr>
                        <th className="w-14 px-6 py-4">
                          <input
                            type="checkbox"
                            aria-label="Tüm görünen müşterileri seç"
                            className="h-4 w-4 rounded border-[#d8c3b1] text-[#FE6100] focus:ring-[#FE6100]"
                            checked={allVisibleSelected}
                            onChange={(event) => handleSelectAll(event.target.checked)}
                          />
                        </th>
                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Müşteri</th>
                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Durum</th>
                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Toplam harcama</th>
                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Son sipariş</th>
                        <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomers.map((customer) => {
                        const initials = `${customer.firstName.charAt(0) || "?"}${customer.lastName.charAt(0) || ""}`;

                        return (
                          <tr
                            key={customer.id}
                            className="group border-b border-[#f1e6dc] last:border-b-0 hover:bg-[#fffaf6]"
                          >
                            <td className="px-6 py-5 align-top">
                              <input
                                type="checkbox"
                                aria-label={`${customer.firstName || "Adsız"} ${customer.lastName} müşterisini seç`}
                                className="mt-1 h-4 w-4 rounded border-[#d8c3b1] text-[#FE6100] focus:ring-[#FE6100]"
                                checked={selectedCustomers.includes(customer.id)}
                                onChange={(event) => {
                                  if (event.target.checked) {
                                    setSelectedCustomers((current) => [...current, customer.id]);
                                    return;
                                  }

                                  setSelectedCustomers((current) => current.filter((id) => id !== customer.id));
                                }}
                              />
                            </td>
                            <td className="px-6 py-5 align-top">
                              <div className="flex items-start gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#FE6100]/12 bg-gradient-to-br from-[#fff1e7] to-white text-sm font-semibold text-[#FE6100] shadow-sm">
                                  {initials}
                                </div>
                                <div>
                                  <Link
                                    href={`/admin/musteriler/${customer.id}`}
                                    className="font-semibold text-gray-950 transition-colors hover:text-[#FE6100] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                                  >
                                    {customer.firstName || "Adsız"} {customer.lastName}
                                  </Link>
                                  <div className="mt-1 text-sm text-gray-500">{customer.email}</div>
                                  <div className="mt-1 text-xs text-gray-400">{customer.phone || "Telefon bilgisi yok"}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-5 align-top">
                              <StatusBadge status={customer.status} />
                            </td>
                            <td className="px-6 py-5 align-top">
                              <div className="font-semibold text-gray-950">{formatPrice(customer.totalSpent)}</div>
                              <div className="mt-1 text-xs text-gray-500">{customer.totalOrders} sipariş</div>
                            </td>
                            <td className="px-6 py-5 align-top text-gray-500">
                              {customer.lastOrderDate ? (
                                <div className="inline-flex items-center gap-1.5 rounded-full border border-[#ecdccd] bg-white px-3 py-1.5 text-xs font-medium text-gray-600">
                                  <Calendar className="h-3.5 w-3.5 text-[#FE6100]" />
                                  {format(new Date(customer.lastOrderDate), "d MMM yyyy", { locale: tr })}
                                </div>
                              ) : (
                                <span className="text-sm text-gray-400">Henüz sipariş yok</span>
                              )}
                            </td>
                            <td className="px-6 py-5 text-right align-top">
                              <div className="flex items-center justify-end gap-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                                <Link
                                  href={`/admin/musteriler/${customer.id}`}
                                  aria-label={`${customer.firstName || "Adsız"} ${customer.lastName} müşteri detayını görüntüle`}
                                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#FE6100]/10 bg-white text-gray-500 shadow-sm transition-all hover:border-[#FE6100]/20 hover:text-[#FE6100] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                                >
                                  <Eye className="h-5 w-5" />
                                </Link>
                                <Link
                                  href={`/admin/musteriler/${customer.id}/duzenle`}
                                  aria-label={`${customer.firstName || "Adsız"} ${customer.lastName} müşterisini düzenle`}
                                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#FE6100]/10 bg-white text-gray-500 shadow-sm transition-all hover:border-[#FE6100]/20 hover:text-[#FE6100] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                                >
                                  <Edit className="h-5 w-5" />
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(customer.id, `${customer.firstName} ${customer.lastName}`.trim())}
                                  aria-label={`${customer.firstName || "Adsız"} ${customer.lastName} müşterisini sil`}
                                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-100 bg-white text-gray-500 shadow-sm transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
                                >
                                  <Trash2 className="h-5 w-5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#fff3e9] to-white text-[#FE6100] shadow-sm">
                  <Search className="h-9 w-9" />
                </div>
                <p className="mt-5 text-lg font-semibold text-gray-950" aria-live="polite">
                  {loading ? "Müşteriler yükleniyor..." : hasActiveFilters ? "Sonuç bulunamadı" : "Henüz müşteri bulunmuyor"}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  {loading
                    ? "Liste hazırlanırken görünüm otomatik olarak güncellenecek."
                    : hasActiveFilters
                      ? "Arama veya filtre kriterlerini değiştirerek tekrar deneyin."
                      : "Yeni müşteri eklediğinizde veya içe aktarma tamamlandığında bu alan otomatik güncellenecek."}
                </p>
              </div>
            )}

            <div className="border-t border-[#FE6100]/8 bg-[#fff8f3]/80 px-5 py-4 md:px-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p aria-live="polite" className="text-sm text-gray-500">
                  <span className="font-semibold text-gray-900">{filteredCustomers.length.toLocaleString("tr-TR")}</span> kayıt gösteriliyor
                  {selectedCustomers.length > 0 ? ` • ${selectedCustomers.length} kayıt seçili` : ""}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled
                    aria-label="Önceki sayfa kullanılamıyor"
                    className="cursor-not-allowed rounded-2xl border border-[#e7d9cc] bg-white px-4 py-2 text-sm font-medium text-gray-400"
                  >
                    Önceki
                  </button>
                  <button
                    type="button"
                    disabled
                    aria-label="Sonraki sayfa kullanılamıyor"
                    className="cursor-not-allowed rounded-2xl border border-[#e7d9cc] bg-white px-4 py-2 text-sm font-medium text-gray-400"
                  >
                    Sonraki
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {loading
              ? "Müşteriler yükleniyor"
              : `${filteredCustomers.length} müşteri listelendi. ${selectedCustomers.length} müşteri seçili.`}
          </div>
        </div>
      </div>
    </main>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  detail: string;
  tone: string;
}

function HeroMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="border border-white/70 bg-white/70 px-5 py-5 backdrop-blur-sm md:px-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">{label}</p>
        <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-gray-950 md:text-[30px]">{value}</p>
        <p className="mt-1 text-sm text-gray-600">{hint}</p>
      </div>
    </div>
  );
}

function StatCard({ title, value, detail, icon: Icon, tone }: StatCardProps) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_18px_55px_rgba(0,0,0,0.08)]">
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="mt-2 text-[30px] font-semibold tracking-[-0.05em] text-gray-950">{value}</p>
            <p className="mt-2 text-sm text-gray-500">{detail}</p>
          </div>
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border bg-gradient-to-br shadow-sm ${tone}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileInfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-[#ecdccd] bg-[#fffaf6] px-3 py-3 text-left">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

function statusText(status: Customer["status"]) {
  return {
    active: "Aktif",
    inactive: "Pasif",
    blocked: "Engelli",
  }[status];
}

function StatusBadge({ status }: { status: Customer["status"] }) {
  const styles = {
    active: "border-emerald-200 bg-emerald-100/90 text-emerald-700",
    inactive: "border-stone-200 bg-stone-100 text-stone-700",
    blocked: "border-rose-200 bg-rose-100/90 text-rose-700",
  };

  const labels = {
    active: "Aktif",
    inactive: "Pasif",
    blocked: "Engelli",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
