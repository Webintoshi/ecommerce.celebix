"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Download,
  Edit,
  Eye,
  FileSpreadsheet,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import type { Customer } from "@/types/customer";
import {
  buildImportTemplateCsv as buildCustomerImportTemplateCsv,
  exportCustomersToCSV as exportCustomerRecordsToCSV,
  parseImportedCustomers as parseCustomerImportRows,
} from "@/lib/customer-csv";
import { AdminPageHeader, AdminStatusBadge } from "@/components/admin/AdminPageShell";
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
    <main role="main" aria-busy={loading} className="min-h-screen bg-[#F9F9F9]">
      <div className="w-full px-0 py-3 md:py-5">
        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleImport}
          />

          <AdminPageHeader
            sectionLabel="Müşteri"
            title="Müşteriler"
            actions={
              <>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex h-11 items-center gap-2 rounded-[7px] border border-[#E1E6EF] bg-white px-4 text-sm font-semibold text-[#374151] shadow-none transition hover:border-[#FFD7BF] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Şablon
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="inline-flex h-11 items-center gap-2 rounded-[7px] border border-[#E1E6EF] bg-white px-4 text-sm font-semibold text-[#374151] shadow-none transition hover:border-[#FFD7BF] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Upload className="h-4 w-4" />
                  {importing ? "İçe Aktarılıyor" : "İçe Aktar"}
                </button>
                <button
                  type="button"
                  onClick={handleExport}
                  className="inline-flex h-11 items-center gap-2 rounded-[7px] border border-[#E1E6EF] bg-white px-4 text-sm font-semibold text-[#374151] shadow-none transition hover:border-[#FFD7BF] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
                >
                  <Download className="h-4 w-4" />
                  Dışa Aktar
                </button>
                <Link
                  href="/admin/musteriler/yeni"
                  className="inline-flex h-11 items-center gap-2 rounded-[7px] bg-[#FF6A00] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.18)] transition hover:bg-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]"
                >
                  <Plus className="h-4 w-4" />
                  Müşteri Ekle
                </Link>
              </>
            }
          />

          {errorMessage ? (
            <div
              aria-live="assertive"
              className="border-y border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-700"
            >
              {errorMessage}
            </div>
          ) : null}
          <section className="border-y border-[#E1E6EF] bg-[#F9F9F9]">
            <div className="flex flex-col gap-3 px-4 py-4 md:px-6 min-[1025px]:flex-row min-[1025px]:items-center min-[1025px]:justify-between">
              <div className="grid flex-1 grid-cols-1 gap-3 min-[1025px]:max-w-[760px] min-[1025px]:grid-cols-[minmax(0,1fr)_190px]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7B8794]" />
                  <input
                    type="text"
                    placeholder="Tabloda arama yapın"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    aria-label="Tabloda müşteri ara"
                    className="h-11 w-full rounded-[7px] border border-[#E1E6EF] bg-white pl-11 pr-4 text-sm font-medium text-[#111827] outline-none transition placeholder:text-[#7B8794] focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]"
                  />
                </label>

                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  aria-label="Müşteri durumuna göre filtrele"
                  className="h-11 cursor-pointer rounded-[7px] border border-[#E1E6EF] bg-white px-4 text-sm font-semibold text-[#374151] outline-none transition focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]"
                >
                  <option value="all">Tüm durumlar</option>
                  <option value="active">Aktif</option>
                  <option value="inactive">Pasif</option>
                  <option value="blocked">Engelli</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2 min-[1025px]:justify-end">
                <span aria-live="polite" className="rounded-[7px] border border-[#E1E6EF] bg-white px-3 py-2 text-sm font-semibold text-[#6B7280]">
                  {loading
                    ? "Hazırlanıyor"
                    : `${filteredCustomers.length.toLocaleString("tr-TR")} kayıt`}
                </span>
                {selectedCustomers.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="inline-flex h-11 items-center gap-2 rounded-[7px] border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
                  >
                    <Trash2 className="h-4 w-4" />
                    Seçilenleri Sil ({selectedCustomers.length})
                  </button>
                ) : null}
              </div>
            </div>

            {filteredCustomers.length > 0 ? (
              <>
                <div className="border-t border-[#E1E6EF] bg-[#F9F9F9] px-4 py-3 min-[1025px]:hidden">
                  <label className="inline-flex items-center gap-3 text-sm font-semibold text-[#374151]">
                    <input
                      type="checkbox"
                      aria-label="Tüm görünen müşterileri seç"
                      className="h-4 w-4 rounded border-[#CBD5E1] text-[#FF6A00] focus:ring-[#FF6A00]"
                      checked={allVisibleSelected}
                      onChange={(event) => handleSelectAll(event.target.checked)}
                    />
                    Tüm görünen müşterileri seç
                  </label>
                </div>

                <div className="space-y-3 p-3.5 sm:p-5 min-[1025px]:hidden">
                  {filteredCustomers.map((customer) => {
                    const initials = `${customer.firstName.charAt(0) || "?"}${customer.lastName.charAt(0) || ""}`;
                    const hasContactPermission = customer.acceptsEmailMarketing || customer.acceptsSmsMarketing;

                    return (
                      <article
                        key={customer.id}
                        className="rounded-[8px] border border-[#E1E6EF] bg-white p-4 shadow-none transition hover:border-[#FFD7BF] sm:p-5"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex min-w-0 items-start gap-3">
                            <input
                              type="checkbox"
                              aria-label={`${customer.firstName || "Adsız"} ${customer.lastName} müşterisini seç`}
                              className="mt-2 h-4 w-4 rounded border-[#CBD5E1] text-[#FF6A00] focus:ring-[#FF6A00]"
                              checked={selectedCustomers.includes(customer.id)}
                              onChange={(event) => {
                                if (event.target.checked) {
                                  setSelectedCustomers((current) => [...current, customer.id]);
                                  return;
                                }

                                setSelectedCustomers((current) => current.filter((id) => id !== customer.id));
                              }}
                            />
                            <div className="flex h-10 w-10 items-center justify-center rounded-[7px] border border-[#FFD7BF] bg-[#FFF1E8] text-sm font-semibold text-[#E85D04]">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <Link
                                href={`/admin/musteriler/${customer.id}`}
                                className="text-base font-semibold tracking-[-0.02em] text-gray-950 transition-colors hover:text-[var(--admin-accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]"
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
                          <MobileInfoCard label="İletişim izni" value={hasContactPermission ? "İzinli" : "İzni Yok"} />
                          <MobileInfoCard label="Toplam sipariş" value={`${formatPrice(customer.totalSpent)} · ${customer.totalOrders} sipariş`} />
                          <MobileInfoCard
                            label="Oluşturulma"
                            value={
                              `${format(new Date(customer.registeredAt), "d MMM", { locale: tr })} ${format(
                                new Date(customer.registeredAt),
                                "HH:mm",
                              )}`
                            }
                          />
                          <MobileInfoCard label="Hesap durumu" value={statusText(customer.status)} />
                        </div>

                        <div className="mt-4 flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/musteriler/${customer.id}`}
                            aria-label={`${customer.firstName || "Adsız"} ${customer.lastName} müşteri detayını görüntüle`}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-[7px] border border-[#E1E6EF] bg-white text-[#6B7280] transition hover:border-[#FFD7BF] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <Link
                            href={`/admin/musteriler/${customer.id}/duzenle`}
                            aria-label={`${customer.firstName || "Adsız"} ${customer.lastName} müşterisini düzenle`}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-[7px] border border-[#E1E6EF] bg-white text-[#6B7280] transition hover:border-[#FFD7BF] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
                          >
                            <Edit className="h-4 w-4" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDelete(customer.id, `${customer.firstName} ${customer.lastName}`.trim())}
                            aria-label={`${customer.firstName || "Adsız"} ${customer.lastName} müşterisini sil`}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-[7px] border border-rose-100 bg-white text-[#6B7280] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto border-t border-[#E1E6EF] min-[1025px]:block">
                  <table className="w-full min-w-[1120px] text-left text-sm">
                    <thead className="bg-[#EEF2F6]">
                      <tr>
                        <th className="w-14 px-5 py-4">
                          <input
                            type="checkbox"
                            aria-label="Tüm görünen müşterileri seç"
                            className="h-4 w-4 rounded border-[#CBD5E1] text-[#FF6A00] focus:ring-[#FF6A00]"
                            checked={allVisibleSelected}
                            onChange={(event) => handleSelectAll(event.target.checked)}
                          />
                        </th>
                        <th className="px-5 py-4 text-[13px] font-semibold text-[#4B5563]">Müşteri</th>
                        <th className="px-5 py-4 text-[13px] font-semibold text-[#4B5563]">İletişim Bilgileri</th>
                        <th className="px-5 py-4 text-[13px] font-semibold text-[#4B5563]">Oluşturulma Tarihi</th>
                        <th className="px-5 py-4 text-[13px] font-semibold text-[#4B5563]">İletişim İzni</th>
                        <th className="px-5 py-4 text-[13px] font-semibold text-[#4B5563]">Toplam Sipariş</th>
                        <th className="px-5 py-4 text-[13px] font-semibold text-[#4B5563]">Hesap Durumu</th>
                        <th className="px-5 py-4 text-right text-[13px] font-semibold text-[#4B5563]">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomers.map((customer) => {
                        const initials = `${customer.firstName.charAt(0) || "?"}${customer.lastName.charAt(0) || ""}`;
                        const hasContactPermission = customer.acceptsEmailMarketing || customer.acceptsSmsMarketing;

                        return (
                          <tr
                            key={customer.id}
                            className="group border-b border-[#E1E6EF] last:border-b-0 hover:bg-white"
                          >
                            <td className="px-5 py-5 align-top">
                              <input
                                type="checkbox"
                                aria-label={`${customer.firstName || "Adsız"} ${customer.lastName} müşterisini seç`}
                                className="mt-1 h-4 w-4 rounded border-[#CBD5E1] text-[#FF6A00] focus:ring-[#FF6A00]"
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
                            <td className="px-5 py-5 align-top">
                              <div className="flex items-start gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-[7px] border border-[#FFD7BF] bg-[#FFF1E8] text-xs font-semibold text-[#E85D04]">
                                  {initials}
                                </div>
                                <div className="min-w-0">
                                  <Link
                                    href={`/admin/musteriler/${customer.id}`}
                                    className="font-semibold text-[#111827] transition-colors hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
                                  >
                                    {customer.firstName || "Adsız"} {customer.lastName}
                                  </Link>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-5 align-top">
                              <div className="text-[#111827]">{customer.email || "E-posta yok"}</div>
                              <div className="mt-1 text-sm text-[#6B7280]">{customer.phone || "Telefon bilgisi yok"}</div>
                            </td>
                            <td className="px-5 py-5 align-top">
                              <div className="font-medium text-[#111827]">
                                {format(new Date(customer.registeredAt), "d MMM yyyy", { locale: tr })}
                              </div>
                              <div className="mt-1 text-sm text-[#6B7280]">
                                {format(new Date(customer.registeredAt), "HH:mm")}
                              </div>
                            </td>
                            <td className="px-5 py-5 align-top">
                              <span className="inline-flex rounded-[5px] border border-[#E1E6EF] bg-white px-2.5 py-1 text-xs font-semibold text-[#6B7280]">
                                {hasContactPermission ? "İzinli" : "İzni Yok"}
                              </span>
                            </td>
                            <td className="px-5 py-5 align-top">
                              <div className="font-semibold text-[#111827]">{formatPrice(customer.totalSpent)}</div>
                              <div className="mt-1 text-sm text-[#6B7280]">{customer.totalOrders} sipariş</div>
                            </td>
                            <td className="px-5 py-5 align-top">
                              <StatusBadge status={customer.status} />
                            </td>
                            <td className="px-5 py-5 text-right align-top">
                              <div className="flex items-center justify-end gap-1.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                                <Link
                                  href={`/admin/musteriler/${customer.id}`}
                                  aria-label={`${customer.firstName || "Adsız"} ${customer.lastName} müşteri detayını görüntüle`}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-[7px] border border-[#E1E6EF] bg-white text-[#6B7280] transition hover:border-[#FFD7BF] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
                                >
                                  <Eye className="h-4 w-4" />
                                </Link>
                                <Link
                                  href={`/admin/musteriler/${customer.id}/duzenle`}
                                  aria-label={`${customer.firstName || "Adsız"} ${customer.lastName} müşterisini düzenle`}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-[7px] border border-[#E1E6EF] bg-white text-[#6B7280] transition hover:border-[#FFD7BF] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
                                >
                                  <Edit className="h-4 w-4" />
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(customer.id, `${customer.firstName} ${customer.lastName}`.trim())}
                                  aria-label={`${customer.firstName || "Adsız"} ${customer.lastName} müşterisini sil`}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-[7px] border border-rose-100 bg-white text-[#6B7280] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
                                >
                                  <Trash2 className="h-4 w-4" />
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
              <div className="flex min-h-[460px] flex-col items-center justify-center border-t border-[#E1E6EF] px-6 py-16 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[12px] border border-[#FFD7BF] bg-[#FFF1E8] text-[#FF6A00]">
                  <Search className="h-7 w-7" />
                </div>
                <p className="mt-5 text-lg font-semibold tracking-[-0.03em] text-[#111827]" aria-live="polite">
                  {loading ? "Müşteriler yükleniyor..." : hasActiveFilters ? "Sonuç bulunamadı" : "Henüz müşteri bulunmuyor"}
                </p>
                <p className="mt-2 max-w-md text-sm leading-6 text-[#6B7280]">
                  {loading
                    ? "Liste hazırlanırken görünüm otomatik olarak güncellenecek."
                    : hasActiveFilters
                      ? "Arama veya filtre kriterlerini değiştirerek tekrar deneyin."
                      : "Yeni müşteri eklediğinizde veya içe aktarma tamamlandığında bu alan otomatik güncellenecek."}
                </p>
              </div>
            )}

            <div className="border-t border-[#E1E6EF] bg-[#F9F9F9] px-4 py-4 md:px-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p aria-live="polite" className="text-sm font-medium text-[#6B7280]">
                  <span className="font-semibold text-[#111827]">{filteredCustomers.length.toLocaleString("tr-TR")}</span> kayıt gösteriliyor
                  {selectedCustomers.length > 0 ? ` • ${selectedCustomers.length} kayıt seçili` : ""}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled
                    aria-label="Önceki sayfa kullanılamıyor"
                    className="cursor-not-allowed rounded-[7px] border border-[#E1E6EF] bg-white px-4 py-2 text-sm font-semibold text-[#9CA3AF]"
                  >
                    Önceki
                  </button>
                  <button
                    type="button"
                    disabled
                    aria-label="Sonraki sayfa kullanılamıyor"
                    className="cursor-not-allowed rounded-[7px] border border-[#E1E6EF] bg-white px-4 py-2 text-sm font-semibold text-[#9CA3AF]"
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

function MobileInfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[7px] border border-[#E1E6EF] bg-[#F9F9F9] px-3 py-3 text-left">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#111827]">{value}</p>
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
  const labels = {
    active: "Aktif",
    inactive: "Pasif",
    blocked: "Engelli",
  };
  const tones = {
    active: "success",
    inactive: "neutral",
    blocked: "danger",
  } as const;

  return (
    <AdminStatusBadge tone={tones[status]}>
      {labels[status]}
    </AdminStatusBadge>
  );
}
