import type { Customer } from "@/types/customer";

export type ImportedCustomerAddress = {
  company?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
};

export type ImportedCustomerRow = {
  externalCustomerId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  acceptsEmailMarketing?: boolean;
  acceptsSmsMarketing?: boolean;
  totalSpent?: number;
  totalOrders?: number;
  notes?: string;
  taxExempt?: boolean;
  tags?: string[];
  status?: Customer["status"];
  address?: ImportedCustomerAddress;
  lineNumber: number;
};

export const SHOPIFY_CUSTOMER_HEADERS = [
  "Customer ID",
  "First Name",
  "Last Name",
  "Email",
  "Accepts Email Marketing",
  "Default Address Company",
  "Default Address Address1",
  "Default Address Address2",
  "Default Address City",
  "Default Address Province Code",
  "Default Address Country Code",
  "Default Address Zip",
  "Default Address Phone",
  "Phone",
  "Accepts SMS Marketing",
  "Total Spent",
  "Total Orders",
  "Note",
  "Tax Exempt",
  "Tags",
] as const;

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

function findHeaderIndex(headerMap: string[], aliases: string[]) {
  return headerMap.findIndex((value) => aliases.includes(value));
}

function parseBooleanValue(value: string): boolean | undefined {
  const normalized = normalizeText(value).replace(/\s+/g, "");

  if (!normalized) {
    return undefined;
  }

  if (
    [
      "true",
      "1",
      "yes",
      "y",
      "evet",
      "subscribed",
      "accepted",
      "optedin",
      "optin",
    ].includes(normalized)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
      "n",
      "hayir",
      "unsubscribed",
      "rejected",
      "optedout",
      "optout",
    ].includes(normalized)
  ) {
    return false;
  }

  return undefined;
}

function parseNumberValue(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  let normalized = trimmed.replace(/\s+/g, "");
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    normalized = normalized.replace(",", ".");
  }

  normalized = normalized.replace(/[^0-9.-]/g, "");

  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseTags(value: string) {
  if (!value.trim()) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

export function parseImportedCustomers(text: string): {
  rows: ImportedCustomerRow[];
  skippedCount: number;
  skippedDetails: string[];
} {
  const parsedRows = parseCsv(text);

  if (parsedRows.length < 2) {
    return {
      rows: [],
      skippedCount: 0,
      skippedDetails: ["CSV dosyasinda veri satiri bulunamadi."],
    };
  }

  const headerMap = parsedRows[0].map((header) => normalizeHeader(header));

  const firstNameIndex = findHeaderIndex(headerMap, ["firstname", "ad", "isim"]);
  const lastNameIndex = findHeaderIndex(headerMap, ["lastname", "soyad"]);
  const emailIndex = findHeaderIndex(headerMap, ["email", "eposta", "mail"]);
  const phoneIndex = findHeaderIndex(headerMap, ["phone", "telefon", "gsm", "ceptelefonu"]);
  const statusIndex = findHeaderIndex(headerMap, ["status", "durum"]);
  const notesIndex = findHeaderIndex(headerMap, ["note", "notes", "not", "aciklama"]);
  const externalCustomerIdIndex = findHeaderIndex(headerMap, ["customerid", "musteriid", "id"]);
  const acceptsEmailMarketingIndex = findHeaderIndex(headerMap, [
    "acceptsemailmarketing",
    "emailmarketing",
    "emailmarketingonayi",
  ]);
  const acceptsSmsMarketingIndex = findHeaderIndex(headerMap, [
    "acceptssmsmarketing",
    "smsmarketing",
    "smsmarketingonayi",
  ]);
  const totalSpentIndex = findHeaderIndex(headerMap, ["totalspent", "toplamharcama"]);
  const totalOrdersIndex = findHeaderIndex(headerMap, ["totalorders", "toplamsiparis", "siparissayisi"]);
  const taxExemptIndex = findHeaderIndex(headerMap, ["taxexempt", "vergiafiyeti"]);
  const tagsIndex = findHeaderIndex(headerMap, ["tags", "etiket", "etiketler"]);
  const addressCompanyIndex = findHeaderIndex(headerMap, ["defaultaddresscompany"]);
  const address1Index = findHeaderIndex(headerMap, ["defaultaddressaddress1"]);
  const address2Index = findHeaderIndex(headerMap, ["defaultaddressaddress2"]);
  const addressCityIndex = findHeaderIndex(headerMap, ["defaultaddresscity"]);
  const addressStateIndex = findHeaderIndex(headerMap, [
    "defaultaddressprovincecode",
    "defaultaddressprovince",
    "defaultaddressstate",
  ]);
  const addressCountryIndex = findHeaderIndex(headerMap, [
    "defaultaddresscountrycode",
    "defaultaddresscountry",
  ]);
  const addressZipIndex = findHeaderIndex(headerMap, ["defaultaddresszip", "defaultaddresspostalcode"]);
  const addressPhoneIndex = findHeaderIndex(headerMap, ["defaultaddressphone"]);

  if (emailIndex === -1) {
    return {
      rows: [],
      skippedCount: parsedRows.length - 1,
      skippedDetails: ["CSV basliklarinda 'Email' veya 'E-posta' alani bulunamadi."],
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
      skippedDetails.push(`${lineNumber}. satir atlandi: e-posta bos.`);
      continue;
    }

    if (!email.includes("@")) {
      skippedDetails.push(`${lineNumber}. satir atlandi: gecerli e-posta bulunamadi.`);
      continue;
    }

    if (seenEmails.has(email)) {
      skippedDetails.push(`${lineNumber}. satir atlandi: dosya icinde yinelenen e-posta.`);
      continue;
    }

    seenEmails.add(email);

    const address: ImportedCustomerAddress = {
      company: addressCompanyIndex >= 0 ? row[addressCompanyIndex]?.trim() || "" : "",
      addressLine1: address1Index >= 0 ? row[address1Index]?.trim() || "" : "",
      addressLine2: address2Index >= 0 ? row[address2Index]?.trim() || "" : "",
      city: addressCityIndex >= 0 ? row[addressCityIndex]?.trim() || "" : "",
      state: addressStateIndex >= 0 ? row[addressStateIndex]?.trim() || "" : "",
      postalCode: addressZipIndex >= 0 ? row[addressZipIndex]?.trim() || "" : "",
      country: addressCountryIndex >= 0 ? row[addressCountryIndex]?.trim() || "" : "",
      phone: addressPhoneIndex >= 0 ? row[addressPhoneIndex]?.trim() || "" : "",
    };

    rows.push({
      externalCustomerId:
        externalCustomerIdIndex >= 0 ? row[externalCustomerIdIndex]?.trim() || "" : "",
      firstName: firstNameIndex >= 0 ? row[firstNameIndex]?.trim() || "" : "",
      lastName: lastNameIndex >= 0 ? row[lastNameIndex]?.trim() || "" : "",
      email,
      phone: phoneIndex >= 0 ? row[phoneIndex]?.trim() || "" : "",
      acceptsEmailMarketing:
        acceptsEmailMarketingIndex >= 0
          ? parseBooleanValue(row[acceptsEmailMarketingIndex] || "")
          : undefined,
      acceptsSmsMarketing:
        acceptsSmsMarketingIndex >= 0
          ? parseBooleanValue(row[acceptsSmsMarketingIndex] || "")
          : undefined,
      totalSpent: totalSpentIndex >= 0 ? parseNumberValue(row[totalSpentIndex] || "") : undefined,
      totalOrders: totalOrdersIndex >= 0 ? parseNumberValue(row[totalOrdersIndex] || "") : undefined,
      notes: notesIndex >= 0 ? row[notesIndex]?.trim() || "" : "",
      taxExempt: taxExemptIndex >= 0 ? parseBooleanValue(row[taxExemptIndex] || "") : undefined,
      tags: tagsIndex >= 0 ? parseTags(row[tagsIndex] || "") : [],
      status: statusIndex >= 0 ? normalizeStatus(row[statusIndex] || "") : undefined,
      address,
      lineNumber,
    });
  }

  return {
    rows,
    skippedCount: skippedDetails.length,
    skippedDetails,
  };
}

function escapeCsvValue(value: string | number | boolean | undefined, delimiter = ";") {
  const text = String(value ?? "");
  if (text.includes("\"") || text.includes("\n") || text.includes(delimiter)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

export function exportCustomersToCSV(customers: Customer[]) {
  const delimiter = ";";

  const rows = customers.map((customer) => {
    const defaultAddress = customer.addresses.find((address) => address.isDefault) || customer.addresses[0];

    return [
      customer.externalCustomerId || customer.id,
      customer.firstName,
      customer.lastName,
      customer.email,
      customer.acceptsEmailMarketing ? "TRUE" : "FALSE",
      defaultAddress?.company || "",
      defaultAddress?.addressLine || "",
      defaultAddress?.addressLine2 || "",
      defaultAddress?.city || "",
      defaultAddress?.district || "",
      defaultAddress?.country || "",
      defaultAddress?.postalCode || "",
      defaultAddress?.phone || "",
      customer.phone || "",
      customer.acceptsSmsMarketing ? "TRUE" : "FALSE",
      customer.totalSpent,
      customer.totalOrders,
      customer.notes || "",
      customer.taxExempt ? "TRUE" : "FALSE",
      customer.tags?.join(", ") || "",
    ]
      .map((value) => escapeCsvValue(value, delimiter))
      .join(delimiter);
  });

  return [SHOPIFY_CUSTOMER_HEADERS.join(delimiter), ...rows].join("\n");
}

export function buildImportTemplateCsv() {
  const delimiter = ";";

  const sampleRows = [
    [
      "shopify-customer-1001",
      "Ayse",
      "Yilmaz",
      "ayse@example.com",
      "TRUE",
      "Celebix",
      "Bagdat Caddesi No:10",
      "Daire 4",
      "Istanbul",
      "34",
      "TR",
      "34740",
      "+90 555 111 22 33",
      "+90 555 111 22 33",
      "FALSE",
      "2499.90",
      "5",
      "Instagram kampanyasindan geldi",
      "FALSE",
      "VIP, Yeni",
    ],
    [
      "shopify-customer-1002",
      "Mehmet",
      "Demir",
      "mehmet@example.com",
      "FALSE",
      "",
      "Ataturk Bulvari No:55",
      "",
      "Ankara",
      "06",
      "TR",
      "06420",
      "+90 555 444 55 66",
      "+90 555 444 55 66",
      "TRUE",
      "799.50",
      "2",
      "Eski bayi musteri",
      "TRUE",
      "B2B",
    ],
  ];

  return [
    SHOPIFY_CUSTOMER_HEADERS.join(delimiter),
    ...sampleRows.map((row) => row.map((value) => escapeCsvValue(value, delimiter)).join(delimiter)),
  ].join("\n");
}
