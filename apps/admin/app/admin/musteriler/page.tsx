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
    "Mehmet;Demir;mehmet@example.com;+90 555 444 55 66;inactive;Eski bayi musteri",
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
      const message = error instanceof Error ? error.message : "Musteriler yuklenemedi.";
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

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-8">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleImport}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Müşteriler</h1>
          <p className="mt-1 text-sm text-gray-500">Müşteri tabanınızı yönetin, dışa aktarın ve CSV ile içe alın.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Şablon İndir
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            {importing ? "İçe Aktarılıyor..." : "İçe Aktar"}
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Dışa Aktar
          </button>
          <Link
            href="/admin/musteriler/yeni"
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" />
            Yeni Müşteri
          </Link>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Toplam Müşteri" value={metrics.total} icon={UserCheck} />
        <StatCard
          title="Aktif Müşteriler"
          value={metrics.active}
          icon={UserCheck}
          color="text-green-600"
          bg="bg-green-50"
        />
        <StatCard
          title="Engellenenler"
          value={metrics.blocked}
          icon={ShieldAlert}
          color="text-red-600"
          bg="bg-red-50"
        />
        <StatCard title="Toplam Harcama" value={formatPrice(metrics.totalRevenue)} icon={UserCheck} />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col items-stretch justify-between gap-4 border-b border-gray-200 bg-gray-50/50 p-4 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="İsim, e-posta veya telefon ile ara..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="all">Tüm Durumlar</option>
              <option value="active">Aktif</option>
              <option value="inactive">Pasif</option>
              <option value="blocked">Engelli</option>
            </select>

            {selectedCustomers.length > 0 && (
              <button
                onClick={handleBulkDelete}
                className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
              >
                <Trash2 className="h-4 w-4" />
                Seçilenleri Sil ({selectedCustomers.length})
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="w-10 px-6 py-3">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                    checked={selectedCustomers.length === filteredCustomers.length && filteredCustomers.length > 0}
                    onChange={(event) => handleSelectAll(event.target.checked)}
                  />
                </th>
                <th className="px-6 py-3 font-medium text-gray-500">Müşteri</th>
                <th className="px-6 py-3 font-medium text-gray-500">Durum</th>
                <th className="px-6 py-3 font-medium text-gray-500">Toplam Harcama</th>
                <th className="px-6 py-3 font-medium text-gray-500">Son Sipariş</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map((customer) => {
                  const initials = `${customer.firstName.charAt(0) || "?"}${customer.lastName.charAt(0) || ""}`;

                  return (
                    <tr key={customer.id} className="group transition-colors hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
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
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-sm font-semibold text-gray-600">
                            {initials}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">
                              {customer.firstName || "Adsız"} {customer.lastName}
                            </div>
                            <div className="text-xs text-gray-500">{customer.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={customer.status} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{formatPrice(customer.totalSpent)}</div>
                        <div className="text-xs text-gray-500">{customer.totalOrders} sipariş</div>
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {customer.lastOrderDate ? (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(customer.lastOrderDate), "d MMM yyyy", { locale: tr })}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <Link
                            href={`/admin/musteriler/${customer.id}`}
                            className="rounded-lg border border-transparent p-2 text-gray-400 transition-all hover:border-gray-200 hover:bg-white hover:text-gray-900"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <Link
                            href={`/admin/musteriler/${customer.id}/duzenle`}
                            className="rounded-lg border border-transparent p-2 text-gray-400 transition-all hover:border-gray-200 hover:bg-white hover:text-gray-900"
                          >
                            <Edit className="h-4 w-4" />
                          </Link>
                          <button
                            onClick={() => handleDelete(customer.id, `${customer.firstName} ${customer.lastName}`.trim())}
                            className="rounded-lg p-2 text-gray-400 transition-all hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-gray-500">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                        <Search className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="font-medium">{loading ? "Müşteriler yükleniyor..." : "Müşteri bulunamadı"}</p>
                      <p className="text-sm">Arama kriterlerinizi değiştirin veya yeni müşteri ekleyin.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50/50 px-6 py-4 text-sm text-gray-500">
          <div>Toplam {filteredCustomers.length} kayıt gösteriliyor</div>
          <div className="flex gap-2">
            <button
              disabled
              className="cursor-not-allowed rounded border border-gray-200 bg-white px-3 py-1 text-gray-400"
            >
              Önceki
            </button>
            <button
              disabled
              className="cursor-not-allowed rounded border border-gray-200 bg-white px-3 py-1 text-gray-400"
            >
              Sonraki
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
  bg?: string;
}

function StatCard({
  title,
  value,
  icon: Icon,
  color = "text-gray-900",
  bg = "bg-gray-100",
}: StatCardProps) {
  return (
    <div className="flex items-start justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{title}</p>
        <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      </div>
      <div className={`rounded-lg p-2 ${bg}`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Customer["status"] }) {
  const styles = {
    active: "border-green-200 bg-green-100 text-green-700",
    inactive: "border-gray-200 bg-gray-100 text-gray-700",
    blocked: "border-red-200 bg-red-100 text-red-700",
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
