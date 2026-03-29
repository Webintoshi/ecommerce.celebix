import type {
  HepsiburadaCredentials,
  MarketplaceInventorySyncResultItem,
  MarketplaceProviderAdapter,
  MarketplacePulledOrder,
} from "@/types/marketplace";
import {
  buildPulledOrder,
  buildSuccessResult,
  createDeterministicExternalId,
  encodeBasicAuth,
  mapInternalStatusToMarketplace,
  normalizeProviderError,
  resolveUnitPrice,
  verifyBasicAuthHeader,
} from "@/lib/marketplace/adapter-utils";
import {
  parseNumber,
  sendProviderRequest,
  toRecord,
} from "@/lib/marketplace/runtime";

const DEFAULT_LISTING_BASE_URL = "https://listing-external.hepsiburada.com";
const DEFAULT_ORDER_BASE_URL = "https://oms-external.hepsiburada.com";

function getCredentialValue(credentials: Record<string, string>, key: keyof HepsiburadaCredentials) {
  return (credentials[key] || "").trim();
}

function getBaseUrls(settings?: Record<string, unknown>) {
  const useSandbox = Boolean(settings?.useSandbox) || String(settings?.environment || "").toLowerCase() === "sit";
  const listingBase = (
    (typeof settings?.listingBaseUrl === "string" && settings.listingBaseUrl.trim()) ||
    process.env.MARKETPLACE_HEPSIBURADA_LISTING_BASE_URL ||
    (useSandbox ? "https://listing-external-sit.hepsiburada.com" : DEFAULT_LISTING_BASE_URL)
  ).trim();
  const orderBase = (
    (typeof settings?.orderBaseUrl === "string" && settings.orderBaseUrl.trim()) ||
    process.env.MARKETPLACE_HEPSIBURADA_ORDER_BASE_URL ||
    (useSandbox ? "https://oms-external-sit.hepsiburada.com" : DEFAULT_ORDER_BASE_URL)
  ).trim();

  return {
    listingBase: listingBase.replace(/\/$/, ""),
    orderBase: orderBase.replace(/\/$/, ""),
  };
}

function buildHeaders(credentials: Record<string, string>) {
  const merchantId = getCredentialValue(credentials, "merchantId");
  const serviceKey = getCredentialValue(credentials, "serviceKey");
  const integrationUsername = getCredentialValue(credentials, "integrationUsername");

  return {
    authorization: encodeBasicAuth(merchantId, serviceKey),
    "user-agent": integrationUsername || "Ornek MagazaMarketplace",
    accept: "application/json",
  };
}

function mapPulledOrders(payload: unknown): MarketplacePulledOrder[] {
  const payloadRecord = toRecord(payload);
  const data = Array.isArray(payloadRecord.data)
    ? payloadRecord.data
    : Array.isArray(payloadRecord.items)
      ? payloadRecord.items
      : Array.isArray(payload)
        ? payload
        : [];

  const grouped = new Map<string, MarketplacePulledOrder>();

  for (const rawLine of data.map((item) => toRecord(item))) {
    const externalOrderId =
      (typeof rawLine.packageNumber === "string" && rawLine.packageNumber) ||
      (typeof rawLine.orderId === "string" && rawLine.orderId) ||
      (typeof rawLine.id === "string" && rawLine.id) ||
      null;
    if (!externalOrderId) continue;

    const existing = grouped.get(externalOrderId);
    const customer = toRecord(rawLine.customer || rawLine.buyer || {});
    const address = toRecord(rawLine.shippingAddress || rawLine.address || {});

    const order = existing
      ? existing
      : buildPulledOrder({
          externalOrderId,
          orderNumber:
            (typeof rawLine.orderNumber === "string" && rawLine.orderNumber) || `hb-${externalOrderId}`,
          status: (typeof rawLine.status === "string" && rawLine.status) || "Created",
          paymentStatus:
            (typeof rawLine.paymentStatus === "string" && rawLine.paymentStatus) || "Paid",
          createdAt:
            (typeof rawLine.createdDate === "string" && rawLine.createdDate) ||
            new Date().toISOString(),
          customer: {
            firstName: typeof customer.firstName === "string" ? customer.firstName : null,
            lastName: typeof customer.lastName === "string" ? customer.lastName : null,
            email: typeof customer.email === "string" ? customer.email : null,
            phone: typeof customer.phoneNumber === "string" ? customer.phoneNumber : null,
          },
          shippingAddress: address,
          items: [],
          raw: toRecord(rawLine),
        });

    order.items.push({
      externalListingId:
        (typeof rawLine.listingId === "string" && rawLine.listingId) ||
        (typeof rawLine.hbSku === "string" && rawLine.hbSku) ||
        null,
      sku:
        (typeof rawLine.merchantSku === "string" && rawLine.merchantSku) ||
        (typeof rawLine.sku === "string" && rawLine.sku) ||
        null,
      name:
        (typeof rawLine.productName === "string" && rawLine.productName) ||
        "Pazaryeri urunu",
      quantity: parseNumber(rawLine.quantity, 1),
      unitPrice: resolveUnitPrice(rawLine),
      totalPrice: parseNumber(rawLine.totalPrice, resolveUnitPrice(rawLine)),
    });

    grouped.set(externalOrderId, order);
  }

  return [...grouped.values()];
}

async function pollInventoryUploadStatus(input: {
  listingBase: string;
  merchantId: string;
  uploadId: string;
  headers: Record<string, string>;
}) {
  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await sendProviderRequest<Record<string, unknown>>({
      method: "GET",
      url: `${input.listingBase}/listings/merchantid/${encodeURIComponent(
        input.merchantId,
      )}/inventory-uploads/id/${encodeURIComponent(input.uploadId)}`,
      headers: input.headers,
      timeoutMs: 18_000,
      maxRetries: 1,
    });

    const data = toRecord(response.data);
    const status =
      (typeof data.status === "string" && data.status) ||
      (typeof data.uploadStatus === "string" && data.uploadStatus) ||
      "";
    if (!status || ["DONE", "SUCCESS", "COMPLETED", "FINISHED"].includes(status.toUpperCase())) {
      return;
    }

    if (["FAILED", "ERROR", "REJECTED"].includes(status.toUpperCase())) {
      throw new Error(`Hepsiburada inventory upload failed: ${status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

export function createHepsiburadaAdapter(): MarketplaceProviderAdapter {
  return {
    async connect({ credentials, settings }) {
      const result = await this.testConnection({ credentials, settings });
      return result;
    },

    async testConnection({ credentials, settings }) {
      const merchantId = getCredentialValue(credentials, "merchantId");
      const { listingBase } = getBaseUrls(settings);
      const response = await sendProviderRequest<Record<string, unknown>>({
        method: "GET",
        url: `${listingBase}/listings/merchantid/${encodeURIComponent(merchantId)}?limit=1&offset=0`,
        headers: buildHeaders(credentials),
        timeoutMs: 20_000,
        maxRetries: 1,
      });

      return {
        success: true,
        message: "Hepsiburada baglanti testi basarili.",
        latencyMs: response.metadata.latencyMs,
        providerStatusCode: response.metadata.status,
        raw: {
          correlationId: response.metadata.correlationId,
          requestId: response.metadata.requestId,
        },
      };
    },

    async upsertListings({ credentials, settings, listings, existingMappings }) {
      const merchantId = getCredentialValue(credentials, "merchantId");
      const integrationUsername = getCredentialValue(credentials, "integrationUsername");
      const { listingBase } = getBaseUrls(settings);
      const headers = buildHeaders(credentials);
      const mappingByVariantId = new Map(
        existingMappings.map((mapping) => [mapping.variantId, mapping] as const),
      );

      const items = listings
        .filter((listing) => listing.sku && listing.sku.trim())
        .map((listing) => {
          const existing = mappingByVariantId.get(listing.variantId);
          return {
            merchantSku: listing.sku,
            hbSku: existing?.externalListingId || existing?.externalSku || null,
            availableStock: Math.max(0, Math.floor(listing.stock)),
            price: Number(listing.price.toFixed(2)),
          };
        });

      if (items.length > 0) {
        const uploadResponse = await sendProviderRequest<Record<string, unknown>>({
          method: "POST",
          url: `${listingBase}/listings/merchantid/${encodeURIComponent(merchantId)}/inventory-uploads`,
          headers,
          body: {
            integrator: integrationUsername || "Ornek Magaza",
            items,
          },
          timeoutMs: 30_000,
          maxRetries: 2,
        });

        const uploadPayload = toRecord(uploadResponse.data);
        const uploadId =
          (typeof uploadPayload.id === "string" && uploadPayload.id) ||
          (typeof uploadPayload.uploadId === "string" && uploadPayload.uploadId) ||
          null;

        if (uploadId) {
          await pollInventoryUploadStatus({
            listingBase,
            merchantId,
            uploadId,
            headers,
          });
        }
      }

      return listings.map((listing) => {
        const existing = mappingByVariantId.get(listing.variantId);
        const externalListingId =
          existing?.externalListingId ||
          existing?.externalSku ||
          listing.sku ||
          createDeterministicExternalId(["hepsiburada", listing.productId, listing.variantId]);
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
      const merchantId = getCredentialValue(credentials, "merchantId");
      const integrationUsername = getCredentialValue(credentials, "integrationUsername");
      const { listingBase } = getBaseUrls(settings);
      const headers = buildHeaders(credentials);
      const response = await sendProviderRequest<Record<string, unknown>>({
        method: "POST",
        url: `${listingBase}/listings/merchantid/${encodeURIComponent(merchantId)}/inventory-uploads`,
        headers,
        body: {
          integrator: integrationUsername || "Ornek Magaza",
          items: inventory.map((item) => ({
            merchantSku: item.sku,
            hbSku: item.externalListingId || null,
            availableStock: Math.max(0, Math.floor(item.stock)),
            price: Number(item.price.toFixed(2)),
          })),
        },
        timeoutMs: 28_000,
        maxRetries: 2,
      });

      const uploadPayload = toRecord(response.data);
      const uploadId =
        (typeof uploadPayload.id === "string" && uploadPayload.id) ||
        (typeof uploadPayload.uploadId === "string" && uploadPayload.uploadId) ||
        null;
      if (uploadId) {
        await pollInventoryUploadStatus({
          listingBase,
          merchantId,
          uploadId,
          headers,
        });
      }

      return inventory.map<MarketplaceInventorySyncResultItem>((item) => ({
        variantId: item.variantId,
        externalListingId: item.externalListingId,
        raw: {
          providerStatusCode: response.metadata.status,
          correlationId: response.metadata.correlationId,
          requestId: response.metadata.requestId,
        },
      }));
    },

    async pullOrders({ credentials, settings, since }) {
      const merchantId = getCredentialValue(credentials, "merchantId");
      const { orderBase } = getBaseUrls(settings);
      const queryDate = since || new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
      const response = await sendProviderRequest<Record<string, unknown>>({
        method: "GET",
        url: `${orderBase}/packages/merchantid/${encodeURIComponent(
          merchantId,
        )}?begindate=${encodeURIComponent(queryDate)}&offset=0&limit=100`,
        headers: buildHeaders(credentials),
        timeoutMs: 24_000,
        maxRetries: 2,
      });

      return mapPulledOrders(response.data);
    },

    async acknowledgeOrder({ externalOrderId }) {
      return buildSuccessResult("Hepsiburada siparis ack gerektirmiyor.", {
        externalOrderId,
      });
    },

    async updateOrderStatus({ credentials, settings, update }) {
      const merchantId = getCredentialValue(credentials, "merchantId");
      const { orderBase } = getBaseUrls(settings);
      const normalizedStatus = update.status.trim().toLowerCase();

      if (!["shipped", "delivered", "cancelled"].includes(normalizedStatus)) {
        return buildSuccessResult("Hepsiburada status writeback atlandi.", {
          skipped: true,
          externalOrderId: update.externalOrderId,
        });
      }

      const response = await sendProviderRequest<Record<string, unknown>>({
        method: "PUT",
        url: `${orderBase}/packages/merchantid/${encodeURIComponent(
          merchantId,
        )}/packagenumber/${encodeURIComponent(update.externalOrderId)}`,
        headers: buildHeaders(credentials),
        body: {
          status: mapInternalStatusToMarketplace(update.status),
          trackingNumber: update.trackingNumber || null,
          cargoCompany: update.shippingCarrier || null,
        },
        timeoutMs: 20_000,
        maxRetries: 1,
      });

      return buildSuccessResult("Hepsiburada siparis durumu guncellendi.", {
        providerStatusCode: response.metadata.status,
        correlationId: response.metadata.correlationId,
      });
    },

    async verifyWebhookSignature({ credentials, headers }) {
      const webhookUsername = getCredentialValue(credentials, "webhookUsername");
      const webhookPassword = getCredentialValue(credentials, "webhookPassword");
      if (!webhookUsername || !webhookPassword) {
        return {
          success: false,
          statusCode: 403,
          message: "Webhook basic auth bilgisi tanimli degil.",
        };
      }

      const normalizedHeaders = Object.fromEntries(
        Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
      );
      const valid = verifyBasicAuthHeader({
        authorizationHeader: normalizedHeaders.authorization,
        expectedUsername: webhookUsername,
        expectedPassword: webhookPassword,
      });

      if (!valid) {
        return {
          success: false,
          statusCode: 403,
          message: "Webhook basic auth dogrulanamadi.",
        };
      }

      return {
        success: true,
      };
    },

    normalizeError(error) {
      return normalizeProviderError(error);
    },
  };
}
