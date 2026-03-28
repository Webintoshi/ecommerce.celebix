import type {
  AccountingPaymentPullResult,
  AccountingProvider,
  AccountingProviderAdapterResult,
  AccountingProviderDefinition,
} from "@/types/accounting";
import { STORE_RUNTIME } from "@/lib/store-runtime";

export interface AccountingProviderAdapter {
  connect(input: {
    credentials: Record<string, string>;
  }): Promise<AccountingProviderAdapterResult>;
  testConnection(input: {
    credentials: Record<string, string>;
  }): Promise<AccountingProviderAdapterResult>;
  upsertCustomer(input: {
    credentials: Record<string, string>;
    customer: Record<string, unknown>;
  }): Promise<AccountingProviderAdapterResult>;
  createInvoice(input: {
    credentials: Record<string, string>;
    payload: Record<string, unknown>;
  }): Promise<AccountingProviderAdapterResult>;
  getInvoiceStatus(input: {
    credentials: Record<string, string>;
    externalInvoiceId: string;
  }): Promise<AccountingProviderAdapterResult>;
  pullPayments(input: {
    credentials: Record<string, string>;
    since?: string;
  }): Promise<AccountingPaymentPullResult[]>;
  normalizeError(error: unknown): string;
}

export const ACCOUNTING_PROVIDER_DEFINITIONS: AccountingProviderDefinition[] = [
  {
    id: "parasut",
    name: "Paraşüt",
    description: "Türkiye odaklı ön muhasebe ve e-fatura yönetim platformu.",
    websiteUrl: "https://www.parasut.com",
    docsUrl: "https://apidocs.parasut.com",
    supportsWebhook: true,
    credentialFields: [
      { key: "clientId", label: "Client ID", required: true },
      { key: "clientSecret", label: "Client Secret", required: true, type: "password" },
      { key: "companyId", label: "Şirket ID", required: true },
    ],
    mappingFields: [
      { key: "salesInvoiceAccount", label: "Satış Hesabı Kodu" },
      { key: "defaultTaxCode", label: "Varsayılan KDV Kodu" },
    ],
  },
  {
    id: "bizimhesap",
    name: "BizimHesap",
    description: "KOBİ odaklı bulut muhasebe, stok ve fatura yönetim platformu.",
    websiteUrl: "https://bizimhesap.com",
    docsUrl: "https://bizimhesap.com",
    supportsWebhook: false,
    credentialFields: [
      { key: "apiKey", label: "API Key", required: true, type: "password" },
      { key: "companyCode", label: "Şirket Kodu", required: true },
    ],
    mappingFields: [
      { key: "defaultWarehouse", label: "Varsayılan Depo" },
      { key: "defaultTaxCode", label: "Varsayılan KDV Kodu" },
    ],
  },
  {
    id: "mikro",
    name: "Mikro",
    description: "Mikro yazılım ekosistemi için finans ve e-belge entegrasyonu.",
    websiteUrl: "https://www.mikro.com.tr",
    docsUrl: "https://apidocs.mikro.com.tr",
    supportsWebhook: true,
    credentialFields: [
      { key: "username", label: "Kullanıcı Adı", required: true },
      { key: "password", label: "Şifre", required: true, type: "password" },
      { key: "tenantId", label: "Tenant ID", required: true },
    ],
    mappingFields: [
      { key: "salesSeries", label: "Fatura Seri Kodu" },
      { key: "defaultTaxCode", label: "Varsayılan KDV Kodu" },
    ],
  },
  {
    id: "logo_isbasi",
    name: "Logo İşbaşı",
    description: "Logo İşbaşı ile e-fatura/e-arşiv senkron yönetimi.",
    websiteUrl: "https://isbasi.com",
    docsUrl: "https://developers.logo.com.tr",
    supportsWebhook: true,
    credentialFields: [
      { key: "apiToken", label: "API Token", required: true, type: "password" },
      { key: "workspaceId", label: "Çalışma Alanı ID", required: true },
    ],
    mappingFields: [
      { key: "salesSeries", label: "Fatura Seri Kodu" },
      { key: "defaultTaxCode", label: "Varsayılan KDV Kodu" },
    ],
  },
  {
    id: "kolaybi",
    name: "KolayBi",
    description: "E-ticaret odaklı bulut muhasebe ve fatura otomasyon çözümü.",
    websiteUrl: "https://kolaybi.com",
    docsUrl: "https://kolaybi.com",
    supportsWebhook: false,
    credentialFields: [
      { key: "apiKey", label: "API Key", required: true, type: "password" },
      { key: "firmId", label: "Firma ID", required: true },
    ],
    mappingFields: [
      { key: "defaultTaxCode", label: "Varsayılan KDV Kodu" },
      { key: "defaultPaymentMethod", label: "Varsayılan Tahsilat Yöntemi" },
    ],
  },
  {
    id: "mukellef",
    name: "Mükellef",
    description: "Mükellef altyapısı ile e-belge operasyonu ve finans akışı.",
    websiteUrl: "https://mukellef.co",
    docsUrl: "https://mukellef.co",
    supportsWebhook: false,
    credentialFields: [
      { key: "apiKey", label: "API Key", required: true, type: "password" },
      { key: "accountId", label: "Hesap ID", required: true },
    ],
    mappingFields: [
      { key: "defaultTaxCode", label: "Varsayılan KDV Kodu" },
      { key: "invoiceProfile", label: "Belge Profili" },
    ],
  },
];

const providerIdSet = new Set<string>(ACCOUNTING_PROVIDER_DEFINITIONS.map((provider) => provider.id));

export function isAccountingProvider(value: string): value is AccountingProvider {
  return providerIdSet.has(value);
}

export function getAccountingProviderDefinition(provider: AccountingProvider) {
  return ACCOUNTING_PROVIDER_DEFINITIONS.find((item) => item.id === provider) || null;
}

function buildMockAdapter(provider: AccountingProvider): AccountingProviderAdapter {
  return {
    async connect({ credentials }) {
      const hasAnyCredential = Object.values(credentials).some((value) => value?.trim());
      return hasAnyCredential
        ? { success: true, message: `${provider} bağlantı bilgileri kaydedildi.` }
        : { success: false, message: "Bağlantı bilgileri eksik." };
    },
    async testConnection({ credentials }) {
      const hasAnyCredential = Object.values(credentials).some((value) => value?.trim());
      return hasAnyCredential
        ? { success: true, message: `${provider} bağlantı testi başarılı.` }
        : { success: false, message: "Test için bağlantı bilgileri eksik." };
    },
    async upsertCustomer() {
      return { success: true, message: "Müşteri kartı eşitlendi." };
    },
    async createInvoice({ payload }) {
      const orderNumber = String(payload.orderNumber || payload.order_number || STORE_RUNTIME.name.toUpperCase());
      const externalId = `acc_${provider}_${Date.now()}`;
      return {
        success: true,
        message: "Fatura sağlayıcı kuyruğuna iletildi.",
        externalId,
        invoiceNo: `${provider.toUpperCase()}-${orderNumber}`,
        invoiceUrl: `${STORE_RUNTIME.adminUrl}/admin/muhasebe/fatura-entegrasyonu?invoice=${externalId}`,
        raw: { simulated: true, provider },
      };
    },
    async getInvoiceStatus({ externalInvoiceId }) {
      return {
        success: true,
        message: "Fatura durumu alındı.",
        externalId: externalInvoiceId,
        raw: { status: "sent", simulated: true },
      };
    },
    async pullPayments() {
      return [];
    },
    normalizeError(error) {
      return error instanceof Error ? error.message : "Bilinmeyen sağlayıcı hatası.";
    },
  };
}

const ADAPTERS: Record<AccountingProvider, AccountingProviderAdapter> = {
  parasut: buildMockAdapter("parasut"),
  bizimhesap: buildMockAdapter("bizimhesap"),
  mikro: buildMockAdapter("mikro"),
  logo_isbasi: buildMockAdapter("logo_isbasi"),
  kolaybi: buildMockAdapter("kolaybi"),
  mukellef: buildMockAdapter("mukellef"),
};

export function getAccountingProviderAdapter(provider: AccountingProvider) {
  return ADAPTERS[provider];
}
