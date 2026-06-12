import type {
  MarketplaceInventorySyncResultItem,
  MarketplaceProviderAdapter,
  MarketplacePulledOrder,
  N11Credentials,
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
} from "@/lib/marketplace/adapter-utils";
import {
  parseNumber,
  sendProviderRequest,
  toRecord,
} from "@/lib/marketplace/runtime";

const DEFAULT_N11_BASE_URL = "https://api.n11.com";

function getCredentialValue(credentials: Record<string, string>, key: keyof N11Credentials) {
  return (credentials[key] || "").trim();
}

function getBaseUrl(settings?: Record<string, unknown>) {
  const fromSettings =
    typeof settings?.baseUrl === "string" && settings.baseUrl.trim() ? settings.baseUrl.trim() : "";
  const fromEnv = (process.env.MARKETPLACE_N11_BASE_URL || "").trim();
  return (fromSettings || fromEnv || DEFAULT_N11_BASE_URL).replace(/\/$/, "");
}

function buildHeaders(credentials: Record<string, string>) {
  const appKey = getCredentialValue(credentials, "appKey");
  const appSecret = getCredentialValue(credentials, "appSecret");
  return {
    authorization: encodeBasicAuth(appKey, appSecret),
    accept: "application/json",
    "x-app-key": appKey,
    "x-app-secret": appSecret,
    "user-agent": process.env.MARKETPLACE_INTEGRATION_NAME || "Deri KordonMarketplace",
  };
}

async function pollTaskStatus(baseUrl: string, taskId: string, headers: Record<string, string>) {
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await sendProviderRequest<Record<string, unknown>>({
      method: "POST",
      url: `${baseUrl}/ms/product/task-details/page-query`,
      headers,
      body: {
        taskId,
        page: 0,
        size: 20,
      },
      timeoutMs: 20_000,
      maxRetries: 1,
    });

    const data = toRecord(response.data);
    const status =
      (typeof data.status === "string" && data.status) ||
      (typeof data.taskStatus === "string" && data.taskStatus) ||
      "";
    if (!status || ["SUCCESS", "DONE", "COMPLETED"].includes(status.toUpperCase())) {
      return;
    }
    if (["FAILED", "ERROR", "REJECTED"].includes(status.toUpperCase())) {
      throw new Error(`N11 task failed: ${status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1600));
  }
}

function mapN11Orders(payload: unknown): MarketplacePulledOrder[] {
  const payloadRecord = toRecord(payload);
  const packages = Array.isArray(payloadRecord.content)
    ? payloadRecord.content
    : Array.isArray(payloadRecord.shipmentPackages)
      ? payloadRecord.shipmentPackages
      : Array.isArray(payload)
        ? payload
        : [];

  return packages
    .map((item) => toRecord(item))
    .map((row) => {
      const packageId =
        (typeof row.id === "string" && row.id) ||
        (typeof row.id === "number" && String(row.id)) ||
        (typeof row.packageNumber === "string" && row.packageNumber) ||
        null;
      if (!packageId) return null;

      const lineItems = toOrderItems(row.lines || row.items || row.packageItems).map((line) => ({
        externalListingId:
          (typeof line.productId === "string" && line.productId) ||
          (typeof line.variantId === "string" && line.variantId) ||
          null,
        sku:
          (typeof line.stockCode === "string" && line.stockCode) ||
          (typeof line.sku === "string" && line.sku) ||
          null,
        name:
          (typeof line.productName === "string" && line.productName) ||
          "Pazaryeri urunu",
        quantity: parseNumber(line.quantity, 1),
        unitPrice: resolveUnitPrice(line),
        totalPrice: parseNumber(line.totalPrice, resolveUnitPrice(line)),
      }));

      return buildPulledOrder({
        externalOrderId: packageId,
        orderNumber:
          (typeof row.orderNumber === "string" && row.orderNumber) || `n11-${packageId}`,
        status:
          (typeof row.status === "string" && row.status) ||
          (typeof row.packageStatus === "string" && row.packageStatus) ||
          "Created",
        paymentStatus:
          (typeof row.paymentStatus === "string" && row.paymentStatus) || "Paid",
        createdAt:
          (typeof row.createdDate === "string" && row.createdDate) || new Date().toISOString(),
        customer: {
          firstName:
            (typeof row.customerName === "string" && row.customerName.split(" ")[0]) || null,
          lastName:
            (typeof row.customerName === "string" &&
              row.customerName.split(" ").slice(1).join(" ")) ||
            null,
          email: typeof row.email === "string" ? row.email : null,
          phone: typeof row.phone === "string" ? row.phone : null,
        },
        shippingAddress: toRecord(row.shippingAddress || row.address || {}),
        items: lineItems,
        raw: row,
      });
    })
    .filter(Boolean) as MarketplacePulledOrder[];
}

export function createN11Adapter(): MarketplaceProviderAdapter {
  return {
    async connect({ credentials, settings }) {
      return this.testConnection({ credentials, settings });
    },

    async testConnection({ credentials, settings }) {
      const baseUrl = getBaseUrl(settings);
      const response = await sendProviderRequest<Record<string, unknown>>({
        method: "GET",
        url: `${baseUrl}/ms/product-query?page=0&size=1`,
        headers: buildHeaders(credentials),
        timeoutMs: 18_000,
        maxRetries: 1,
      });

      return {
        success: true,
        message: "N11 baglanti testi basarili.",
        providerStatusCode: response.metadata.status,
        latencyMs: response.metadata.latencyMs,
        raw: {
          correlationId: response.metadata.correlationId,
          requestId: response.metadata.requestId,
        },
      };
    },

    async upsertListings({ credentials, settings, listings, existingMappings }) {
      const headers = buildHeaders(credentials);
      const baseUrl = getBaseUrl(settings);
      const existingByVariant = new Map(
        existingMappings.map((mapping) => [mapping.variantId, mapping] as const),
      );

      const bodyItems = listings
        .filter((listing) => listing.sku && listing.sku.trim())
        .map((listing) => ({
          stockCode: listing.sku,
          quantity: Math.max(0, Math.floor(listing.stock)),
          salePrice: Number(listing.price.toFixed(2)),
          listPrice: Number(listing.price.toFixed(2)),
        }));

      if (bodyItems.length > 0) {
        const response = await sendProviderRequest<Record<string, unknown>>({
          method: "POST",
          url: `${baseUrl}/ms/product/tasks/price-stock-update`,
          headers,
          body: {
            products: bodyItems,
          },
          timeoutMs: 25_000,
          maxRetries: 2,
        });
        const taskId =
          (typeof response.data.taskId === "string" && response.data.taskId) ||
          (typeof response.data.id === "string" && response.data.id) ||
          null;
        if (taskId) {
          await pollTaskStatus(baseUrl, taskId, headers);
        }
      }

      return listings.map((listing) => {
        const existing = existingByVariant.get(listing.variantId);
        const externalListingId =
          existing?.externalListingId ||
          listing.sku ||
          createDeterministicExternalId(["n11", listing.productId, listing.variantId]);
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
      const headers = buildHeaders(credentials);
      const baseUrl = getBaseUrl(settings);
      const response = await sendProviderRequest<Record<string, unknown>>({
        method: "POST",
        url: `${baseUrl}/ms/product/tasks/price-stock-update`,
        headers,
        body: {
          products: inventory.map((item) => ({
            stockCode: item.sku,
            quantity: Math.max(0, Math.floor(item.stock)),
            salePrice: Number(item.price.toFixed(2)),
            listPrice: Number(item.price.toFixed(2)),
          })),
        },
        timeoutMs: 25_000,
        maxRetries: 2,
      });

      const taskId =
        (typeof response.data.taskId === "string" && response.data.taskId) ||
        (typeof response.data.id === "string" && response.data.id) ||
        null;
      if (taskId) {
        await pollTaskStatus(baseUrl, taskId, headers);
      }

      return inventory.map<MarketplaceInventorySyncResultItem>((item) => ({
        variantId: item.variantId,
        externalListingId: item.externalListingId,
        raw: {
          providerStatusCode: response.metadata.status,
          correlationId: response.metadata.correlationId,
        },
      }));
    },

    async pullOrders({ credentials, settings, since }) {
      const baseUrl = getBaseUrl(settings);
      const startDate = since || new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
      const response = await sendProviderRequest<Record<string, unknown>>({
        method: "GET",
        url: `${baseUrl}/rest/delivery/v1/shipment-packages?size=100&page=0&startDate=${encodeURIComponent(
          startDate,
        )}`,
        headers: buildHeaders(credentials),
        timeoutMs: 24_000,
        maxRetries: 2,
      });

      return mapN11Orders(response.data);
    },

    async acknowledgeOrder({ externalOrderId }) {
      return buildSuccessResult("N11 siparis ack gerektirmiyor.", {
        externalOrderId,
      });
    },

    async updateOrderStatus({ credentials, settings, update }) {
      const baseUrl = getBaseUrl(settings);
      const normalizedStatus = update.status.trim().toLowerCase();

      if (!["confirmed", "processing", "preparing"].includes(normalizedStatus)) {
        return buildSuccessResult("N11 status writeback atlandi.", {
          skipped: true,
          externalOrderId: update.externalOrderId,
        });
      }

      const response = await sendProviderRequest<Record<string, unknown>>({
        method: "PUT",
        url: `${baseUrl}/rest/order/v1/update`,
        headers: buildHeaders(credentials),
        body: {
          lineId: update.externalOrderId,
          status: mapInternalStatusToMarketplace(update.status),
        },
        timeoutMs: 20_000,
        maxRetries: 1,
      });

      return buildSuccessResult("N11 siparis durumu guncellendi.", {
        providerStatusCode: response.metadata.status,
        correlationId: response.metadata.correlationId,
      });
    },

    normalizeError(error) {
      return normalizeProviderError(error);
    },
  };
}

