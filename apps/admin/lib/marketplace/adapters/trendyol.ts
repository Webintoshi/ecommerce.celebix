import type {
  MarketplaceInventorySyncResultItem,
  MarketplaceProviderAdapter,
  MarketplacePulledOrder,
  TrendyolCredentials,
} from "@/types/marketplace";
import {
  buildPulledOrder,
  buildSuccessResult,
  createDeterministicExternalId,
  encodeBasicAuth,
  mapInternalStatusToMarketplace,
  normalizeProviderError,
  resolveUnitPrice,
  toOrderItems,
  verifyBasicAuthHeader,
  verifyHexSignature,
  normalizeWebhookHmacHex,
} from "@/lib/marketplace/adapter-utils";
import {
  parseNumber,
  sendProviderRequest,
  toRecord,
} from "@/lib/marketplace/runtime";
import { STORE_RUNTIME } from "@/lib/store-runtime";

type TrendyolOrderLine = {
  sku: string | null;
  barcode: string | null;
  quantity: number;
  unitPrice: number;
  name: string;
  externalListingId: string | null;
};

const DEFAULT_TRENDYOL_BASE_URL = "https://api.trendyol.com/sapigw";

function getCredentialValue(credentials: Record<string, string>, key: keyof TrendyolCredentials) {
  return (credentials[key] || "").trim();
}

function getBaseUrl(settings?: Record<string, unknown>) {
  const fromSettings =
    typeof settings?.baseUrl === "string" && settings.baseUrl.trim() ? settings.baseUrl.trim() : "";
  const fromEnv = (process.env.MARKETPLACE_TRENDYOL_BASE_URL || "").trim();
  return (fromSettings || fromEnv || DEFAULT_TRENDYOL_BASE_URL).replace(/\/$/, "");
}

function buildHeaders(credentials: Record<string, string>, settings?: Record<string, unknown>) {
  const sellerId = getCredentialValue(credentials, "sellerId");
  const apiKey = getCredentialValue(credentials, "apiKey");
  const apiSecret = getCredentialValue(credentials, "apiSecret");
  const integrationName =
    (typeof settings?.integrationName === "string" && settings.integrationName.trim()) ||
    process.env.MARKETPLACE_INTEGRATION_NAME ||
    STORE_RUNTIME.marketplaceIntegrationName;

  return {
    authorization: encodeBasicAuth(apiKey, apiSecret),
    "user-agent": `${sellerId} - ${integrationName}`,
    accept: "application/json",
  };
}

function mapOrderLines(orderPayload: Record<string, unknown>) {
  const linesRaw =
    toOrderItems(orderPayload.lines) ||
    toOrderItems(orderPayload.items) ||
    toOrderItems(orderPayload.orderLines) ||
    [];

  const lines: TrendyolOrderLine[] = [];
  for (const line of linesRaw) {
    const sku = typeof line.stockCode === "string" ? line.stockCode : typeof line.sku === "string" ? line.sku : null;
    const barcode = typeof line.barcode === "string" ? line.barcode : null;
    const quantity = parseNumber(line.quantity, 1);
    const unitPrice = resolveUnitPrice(line);
    const name = typeof line.productName === "string" ? line.productName : "Pazaryeri urunu";
    const externalListingId =
      (typeof line.productCode === "string" && line.productCode) ||
      (typeof line.productId === "string" && line.productId) ||
      null;

    lines.push({
      sku,
      barcode,
      quantity,
      unitPrice,
      name,
      externalListingId,
    });
  }

  return lines;
}

function mapPulledOrders(payload: unknown): MarketplacePulledOrder[] {
  const payloadRecord = toRecord(payload);
  const content = Array.isArray(payloadRecord.content)
    ? payloadRecord.content
    : Array.isArray(payloadRecord.shipmentPackages)
      ? payloadRecord.shipmentPackages
      : Array.isArray(payload)
        ? payload
        : [];

  return content
    .map((item) => toRecord(item))
    .map((orderPayload) => {
      const packageId =
        (typeof orderPayload.id === "number" && String(orderPayload.id)) ||
        (typeof orderPayload.id === "string" && orderPayload.id) ||
        (typeof orderPayload.shipmentPackageId === "string" && orderPayload.shipmentPackageId) ||
        null;
      if (!packageId) return null;

      const customer = toRecord(orderPayload.customer || {});
      const address = toRecord(orderPayload.shipmentAddress || orderPayload.address || {});
      const createdAt =
        (typeof orderPayload.orderDate === "string" && orderPayload.orderDate) ||
        (typeof orderPayload.createdDate === "string" && orderPayload.createdDate) ||
        new Date().toISOString();

      const lineItems = mapOrderLines(orderPayload).map((line) => ({
        externalListingId: line.externalListingId,
        sku: line.sku,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        totalPrice: Number((line.unitPrice * line.quantity).toFixed(2)),
      }));

      return buildPulledOrder({
        externalOrderId: packageId,
        orderNumber:
          (typeof orderPayload.orderNumber === "string" && orderPayload.orderNumber) ||
          `trendyol-${packageId}`,
        status:
          (typeof orderPayload.status === "string" && orderPayload.status) ||
          (typeof orderPayload.shipmentPackageStatus === "string" && orderPayload.shipmentPackageStatus) ||
          "Created",
        paymentStatus:
          (typeof orderPayload.paymentStatus === "string" && orderPayload.paymentStatus) ||
          "Paid",
        createdAt,
        customer: {
          firstName: typeof customer.firstName === "string" ? customer.firstName : null,
          lastName: typeof customer.lastName === "string" ? customer.lastName : null,
          email: typeof customer.email === "string" ? customer.email : null,
          phone: typeof customer.phone === "string" ? customer.phone : null,
        },
        shippingAddress: address,
        items: lineItems,
        raw: orderPayload,
      });
    })
    .filter(Boolean) as MarketplacePulledOrder[];
}

export function createTrendyolAdapter(): MarketplaceProviderAdapter {
  return {
    async connect({ credentials, settings }) {
      const result = await this.testConnection({ credentials, settings });
      return result;
    },

    async testConnection({ credentials, settings }) {
      const sellerId = getCredentialValue(credentials, "sellerId");
      const baseUrl = getBaseUrl(settings);
      const response = await sendProviderRequest<Record<string, unknown>>({
        method: "GET",
        url: `${baseUrl}/suppliers/${sellerId}/products?page=0&size=1`,
        headers: buildHeaders(credentials, settings),
        timeoutMs: 18_000,
        maxRetries: 1,
      });

      return {
        success: true,
        message: "Trendyol baglanti testi basarili.",
        latencyMs: response.metadata.latencyMs,
        providerStatusCode: response.metadata.status,
        raw: {
          correlationId: response.metadata.correlationId,
          requestId: response.metadata.requestId,
        },
      };
    },

    async upsertListings({ credentials, settings, listings, existingMappings }) {
      const sellerId = getCredentialValue(credentials, "sellerId");
      const baseUrl = getBaseUrl(settings);
      const headers = buildHeaders(credentials, settings);
      const existingByVariant = new Map(
        existingMappings.map((mapping) => [mapping.variantId, mapping] as const),
      );

      const items = listings
        .map((listing) => ({
          barcode: listing.barcode || listing.sku,
          quantity: Math.max(0, Math.floor(listing.stock)),
          salePrice: Number(listing.price.toFixed(2)),
          listPrice: Number(listing.price.toFixed(2)),
        }))
        .filter((item) => item.barcode);

      if (items.length > 0) {
        await sendProviderRequest<Record<string, unknown>>({
          method: "POST",
          url: `${baseUrl}/suppliers/${sellerId}/products/price-and-inventory`,
          headers,
          body: {
            items,
          },
          timeoutMs: 22_000,
          maxRetries: 2,
        });
      }

      return listings.map((listing) => {
        const existing = existingByVariant.get(listing.variantId);
        const externalListingId =
          existing?.externalListingId ||
          listing.barcode ||
          listing.sku ||
          createDeterministicExternalId(["trendyol", listing.productId, listing.variantId]);
        return {
          variantId: listing.variantId,
          externalListingId,
          externalSku: existing?.externalSku || listing.sku || null,
          status: listing.isActive ? "active" : "inactive",
          raw: {
            providerStatusCode: 200,
          },
        };
      });
    },

    async updateInventory({ credentials, settings, inventory }) {
      const sellerId = getCredentialValue(credentials, "sellerId");
      const baseUrl = getBaseUrl(settings);
      const headers = buildHeaders(credentials, settings);
      const items = inventory
        .map((item) => ({
          barcode: item.externalListingId || item.sku,
          quantity: Math.max(0, Math.floor(item.stock)),
          salePrice: Number(item.price.toFixed(2)),
          listPrice: Number(item.price.toFixed(2)),
        }))
        .filter((item) => item.barcode);

      if (items.length > 0) {
        const response = await sendProviderRequest<Record<string, unknown>>({
          method: "POST",
          url: `${baseUrl}/suppliers/${sellerId}/products/price-and-inventory`,
          headers,
          body: { items },
          timeoutMs: 22_000,
          maxRetries: 2,
        });

        return inventory.map<MarketplaceInventorySyncResultItem>((item) => ({
          variantId: item.variantId,
          externalListingId: item.externalListingId,
          raw: {
            providerStatusCode: response.metadata.status,
            correlationId: response.metadata.correlationId,
            requestId: response.metadata.requestId,
          },
        }));
      }

      return inventory.map<MarketplaceInventorySyncResultItem>((item) => ({
        variantId: item.variantId,
        externalListingId: item.externalListingId,
        raw: { skipped: true, reason: "barcode_or_sku_missing" },
      }));
    },

    async pullOrders({ credentials, settings, since }) {
      const sellerId = getCredentialValue(credentials, "sellerId");
      const baseUrl = getBaseUrl(settings);
      const headers = buildHeaders(credentials, settings);
      const sinceIso = since || new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
      const url = `${baseUrl}/suppliers/${sellerId}/shipment-packages?size=200&page=0&startDate=${encodeURIComponent(
        sinceIso,
      )}&orderByField=PackageLastModifiedDate&orderByDirection=DESC`;

      const response = await sendProviderRequest<Record<string, unknown>>({
        method: "GET",
        url,
        headers,
        timeoutMs: 24_000,
        maxRetries: 2,
      });

      return mapPulledOrders(response.data);
    },

    async acknowledgeOrder({ externalOrderId }) {
      return buildSuccessResult("Trendyol siparis ack gerektirmiyor.", {
        externalOrderId,
      });
    },

    async updateOrderStatus({ credentials, settings, update }) {
      const sellerId = getCredentialValue(credentials, "sellerId");
      const baseUrl = getBaseUrl(settings);
      const headers = buildHeaders(credentials, settings);

      const status = update.status.trim().toLowerCase();
      if (!["shipped", "delivered", "cancelled"].includes(status)) {
        return buildSuccessResult("Trendyol status writeback atlandi (durum gonderimi gerekmiyor).", {
          externalOrderId: update.externalOrderId,
          skipped: true,
        });
      }

      const response = await sendProviderRequest<Record<string, unknown>>({
        method: "PUT",
        url: `${baseUrl}/suppliers/${sellerId}/shipment-packages/${encodeURIComponent(update.externalOrderId)}`,
        headers,
        body: {
          status: mapInternalStatusToMarketplace(update.status),
          trackingNumber: update.trackingNumber || null,
          cargoTrackingNumber: update.trackingNumber || null,
          cargoProviderName: update.shippingCarrier || null,
        },
        timeoutMs: 20_000,
        maxRetries: 1,
      });

      return buildSuccessResult("Trendyol siparis durumu guncellendi.", {
        providerStatusCode: response.metadata.status,
        correlationId: response.metadata.correlationId,
      });
    },

    async verifyWebhookSignature({ credentials, rawBody, headers }) {
      const normalizedHeaders = Object.fromEntries(
        Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
      );

      const webhookApiKey = getCredentialValue(credentials, "webhookApiKey");
      if (webhookApiKey) {
        const incoming = normalizedHeaders["x-api-key"] || normalizedHeaders["api-key"] || "";
        if (incoming && incoming === webhookApiKey) {
          return { success: true };
        }
        return {
          success: false,
          statusCode: 403,
          message: "Webhook api key dogrulanamadi.",
        };
      }

      const webhookSecret = getCredentialValue(credentials, "webhookSecret");
      if (webhookSecret) {
        const signature =
          normalizedHeaders["x-trendyol-signature"] ||
          normalizedHeaders["x-signature"] ||
          normalizedHeaders["signature"] ||
          "";
        if (!signature) {
          return {
            success: false,
            statusCode: 401,
            message: "Webhook signature header eksik.",
          };
        }

        const expected = normalizeWebhookHmacHex(rawBody, webhookSecret);
        if (verifyHexSignature(signature, expected)) {
          return { success: true };
        }

        return {
          success: false,
          statusCode: 403,
          message: "Webhook signature dogrulanamadi.",
        };
      }

      const webhookUsername = getCredentialValue(credentials, "webhookUsername");
      const webhookPassword = getCredentialValue(credentials, "webhookPassword");
      if (webhookUsername && webhookPassword) {
        const valid = verifyBasicAuthHeader({
          authorizationHeader: normalizedHeaders.authorization,
          expectedUsername: webhookUsername,
          expectedPassword: webhookPassword,
        });
        if (valid) return { success: true };
        return {
          success: false,
          statusCode: 403,
          message: "Webhook basic auth dogrulanamadi.",
        };
      }

      return {
        success: false,
        statusCode: 403,
        message: "Webhook dogrulama gizlisi tanimli degil.",
      };
    },

    normalizeError(error) {
      return normalizeProviderError(error);
    },
  };
}
