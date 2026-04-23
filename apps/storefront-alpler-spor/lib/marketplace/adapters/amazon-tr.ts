import type {
  AmazonTrCredentials,
  MarketplaceInventorySyncResultItem,
  MarketplaceProviderAdapter,
  MarketplacePulledOrder,
} from "@/types/marketplace";
import {
  buildPulledOrder,
  buildSuccessResult,
  createDeterministicExternalId,
  normalizeProviderError,
  resolveUnitPrice,
} from "@/lib/marketplace/adapter-utils";
import {
  parseNumber,
  sendProviderRequest,
  toRecord,
} from "@/lib/marketplace/runtime";

const DEFAULT_AMAZON_BASE_URL = "https://sellingpartnerapi-eu.amazon.com";
const DEFAULT_MARKETPLACE_ID_TR = "A33AVAJ2PDY3EV";
const AMAZON_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

type CachedAmazonAccessToken = {
  token: string;
  expiresAt: number;
};

const tokenCache = new Map<string, CachedAmazonAccessToken>();

function getCredentialValue(credentials: Record<string, string>, key: keyof AmazonTrCredentials) {
  return (credentials[key] || "").trim();
}

function getBaseUrl(settings?: Record<string, unknown>) {
  const fromSettings =
    typeof settings?.baseUrl === "string" && settings.baseUrl.trim() ? settings.baseUrl.trim() : "";
  const fromEnv = (process.env.MARKETPLACE_AMAZON_BASE_URL || "").trim();
  return (fromSettings || fromEnv || DEFAULT_AMAZON_BASE_URL).replace(/\/$/, "");
}

function getMarketplaceId(credentials: Record<string, string>, settings?: Record<string, unknown>) {
  const credentialMarketplace = getCredentialValue(credentials, "marketplaceId");
  const settingsMarketplace =
    typeof settings?.marketplaceId === "string" && settings.marketplaceId.trim()
      ? settings.marketplaceId.trim()
      : "";
  return settingsMarketplace || credentialMarketplace || DEFAULT_MARKETPLACE_ID_TR;
}

async function getAccessToken(credentials: Record<string, string>) {
  const clientId = getCredentialValue(credentials, "clientId");
  const clientSecret = getCredentialValue(credentials, "clientSecret");
  const refreshToken = getCredentialValue(credentials, "refreshToken");
  const cacheKey = `${clientId}:${refreshToken}`;
  const existing = tokenCache.get(cacheKey);
  if (existing && existing.expiresAt > Date.now() + 15_000) {
    return existing.token;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  }).toString();

  const response = await fetch(AMAZON_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      (typeof payload.error_description === "string" && payload.error_description) ||
        (typeof payload.error === "string" && payload.error) ||
        "Amazon access token alinamadi.",
    );
  }

  const token = typeof payload.access_token === "string" ? payload.access_token : "";
  if (!token) {
    throw new Error("Amazon access token cevabi gecersiz.");
  }

  const expiresIn = parseNumber(payload.expires_in, 3600);
  tokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + Math.max(120, expiresIn - 60) * 1000,
  });
  return token;
}

async function buildHeaders(credentials: Record<string, string>) {
  const accessToken = await getAccessToken(credentials);
  return {
    "x-amz-access-token": accessToken,
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": process.env.MARKETPLACE_INTEGRATION_NAME || "Deri KordonMarketplace",
  };
}

function mapAmazonOrders(payload: unknown, itemsByOrder: Map<string, Array<Record<string, unknown>>>) {
  const payloadRecord = toRecord(payload);
  const orders = Array.isArray(payloadRecord.Orders)
    ? payloadRecord.Orders
    : Array.isArray(payloadRecord.orders)
      ? payloadRecord.orders
      : [];

  return orders
    .map((order) => toRecord(order))
    .map((order) => {
      const externalOrderId =
        (typeof order.AmazonOrderId === "string" && order.AmazonOrderId) ||
        (typeof order.amazonOrderId === "string" && order.amazonOrderId) ||
        null;
      if (!externalOrderId) return null;

      const orderItems = (itemsByOrder.get(externalOrderId) || []).map((line) => ({
        externalListingId:
          (typeof line.ASIN === "string" && line.ASIN) ||
          (typeof line.asin === "string" && line.asin) ||
          null,
        sku:
          (typeof line.SellerSKU === "string" && line.SellerSKU) ||
          (typeof line.sellerSku === "string" && line.sellerSku) ||
          null,
        name:
          (typeof line.Title === "string" && line.Title) ||
          (typeof line.title === "string" && line.title) ||
          "Amazon urunu",
        quantity: parseNumber(line.QuantityOrdered ?? line.quantityOrdered, 1),
        unitPrice: resolveUnitPrice(
          toRecord(line.ItemPrice || line.itemPrice || { Amount: line.Amount || line.amount }),
        ),
        totalPrice: parseNumber(line.amount, undefined),
      }));

      return buildPulledOrder({
        externalOrderId,
        orderNumber: externalOrderId,
        status:
          (typeof order.OrderStatus === "string" && order.OrderStatus) ||
          (typeof order.orderStatus === "string" && order.orderStatus) ||
          "Pending",
        paymentStatus:
          (typeof order.PaymentMethod === "string" && order.PaymentMethod) ||
          "Paid",
        createdAt:
          (typeof order.PurchaseDate === "string" && order.PurchaseDate) ||
          new Date().toISOString(),
        customer: {
          firstName:
            (typeof order.BuyerInfo === "object" &&
              order.BuyerInfo &&
              typeof (order.BuyerInfo as Record<string, unknown>).BuyerName === "string" &&
              String((order.BuyerInfo as Record<string, unknown>).BuyerName).split(" ")[0]) ||
            null,
          lastName:
            (typeof order.BuyerInfo === "object" &&
              order.BuyerInfo &&
              typeof (order.BuyerInfo as Record<string, unknown>).BuyerName === "string" &&
              String((order.BuyerInfo as Record<string, unknown>).BuyerName).split(" ").slice(1).join(" ")) ||
            null,
          email:
            (typeof order.BuyerInfo === "object" &&
              order.BuyerInfo &&
              typeof (order.BuyerInfo as Record<string, unknown>).BuyerEmail === "string" &&
              String((order.BuyerInfo as Record<string, unknown>).BuyerEmail)) ||
            null,
          phone: null,
        },
        shippingAddress: {},
        items: orderItems,
        raw: order,
      });
    })
    .filter(Boolean) as MarketplacePulledOrder[];
}

export function createAmazonTrAdapter(): MarketplaceProviderAdapter {
  return {
    async connect({ credentials, settings }) {
      return this.testConnection({ credentials, settings });
    },

    async testConnection({ credentials, settings }) {
      const sellerId = getCredentialValue(credentials, "sellerId");
      const marketplaceId = getMarketplaceId(credentials, settings);
      const baseUrl = getBaseUrl(settings);
      const headers = await buildHeaders(credentials);
      const createdAfter = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();

      const response = await sendProviderRequest<Record<string, unknown>>({
        method: "GET",
        url: `${baseUrl}/orders/v0/orders?MarketplaceIds=${encodeURIComponent(
          marketplaceId,
        )}&SellerOrderId=${encodeURIComponent(sellerId)}&CreatedAfter=${encodeURIComponent(createdAfter)}`,
        headers,
        timeoutMs: 22_000,
        maxRetries: 1,
      }).catch(async () =>
        sendProviderRequest<Record<string, unknown>>({
          method: "GET",
          url: `${baseUrl}/orders/v0/orders?MarketplaceIds=${encodeURIComponent(
            marketplaceId,
          )}&CreatedAfter=${encodeURIComponent(createdAfter)}`,
          headers,
          timeoutMs: 22_000,
          maxRetries: 1,
        }),
      );

      return {
        success: true,
        message: "Amazon TR baglanti testi basarili.",
        providerStatusCode: response.metadata.status,
        latencyMs: response.metadata.latencyMs,
        raw: {
          correlationId: response.metadata.correlationId,
          requestId: response.metadata.requestId,
        },
      };
    },

    async upsertListings({ credentials, settings, listings, existingMappings }) {
      const baseUrl = getBaseUrl(settings);
      const headers = await buildHeaders(credentials);
      const sellerId = getCredentialValue(credentials, "sellerId");
      const marketplaceId = getMarketplaceId(credentials, settings);
      const existingByVariant = new Map(
        existingMappings.map((mapping) => [mapping.variantId, mapping] as const),
      );

      const results = [];
      for (const listing of listings) {
        const sku = listing.sku?.trim();
        const existing = existingByVariant.get(listing.variantId);
        if (!sku) {
          results.push({
            variantId: listing.variantId,
            externalListingId:
              existing?.externalListingId ||
              createDeterministicExternalId(["amazon_tr", listing.productId, listing.variantId]),
            externalSku: existing?.externalSku || null,
            status: "pending" as const,
            raw: { skipped: true, reason: "sku_missing" },
          });
          continue;
        }

        const response = await sendProviderRequest<Record<string, unknown>>({
          method: "GET",
          url: `${baseUrl}/listings/2021-08-01/items/${encodeURIComponent(
            sellerId,
          )}/${encodeURIComponent(sku)}?marketplaceIds=${encodeURIComponent(marketplaceId)}`,
          headers,
          timeoutMs: 20_000,
          maxRetries: 1,
        });

        const payload = toRecord(response.data);
        const summaries = Array.isArray(payload.summaries) ? payload.summaries : [];
        const firstSummary = summaries.length > 0 ? toRecord(summaries[0]) : {};
        const externalListingId =
          (typeof firstSummary.asin === "string" && firstSummary.asin) ||
          (typeof payload.asin === "string" && payload.asin) ||
          existing?.externalListingId ||
          sku;

        results.push({
          variantId: listing.variantId,
          externalListingId,
          externalSku: sku,
          status: listing.isActive ? ("active" as const) : ("inactive" as const),
          raw: {
            providerStatusCode: response.metadata.status,
            correlationId: response.metadata.correlationId,
          },
        });
      }

      return results;
    },

    async updateInventory({ credentials, settings, inventory }) {
      const baseUrl = getBaseUrl(settings);
      const headers = await buildHeaders(credentials);
      const sellerId = getCredentialValue(credentials, "sellerId");
      const marketplaceId = getMarketplaceId(credentials, settings);
      const results: MarketplaceInventorySyncResultItem[] = [];

      for (const item of inventory) {
        if (!item.sku) {
          results.push({
            variantId: item.variantId,
            externalListingId: item.externalListingId,
            raw: { skipped: true, reason: "sku_missing" },
          });
          continue;
        }

        const response = await sendProviderRequest<Record<string, unknown>>({
          method: "PATCH",
          url: `${baseUrl}/listings/2021-08-01/items/${encodeURIComponent(
            sellerId,
          )}/${encodeURIComponent(item.sku)}?marketplaceIds=${encodeURIComponent(marketplaceId)}`,
          headers,
          body: {
            productType: "PRODUCT",
            patches: [
              {
                op: "replace",
                path: "/attributes/fulfillment_availability",
                value: [
                  {
                    fulfillment_channel_code: "DEFAULT",
                    quantity: Math.max(0, Math.floor(item.stock)),
                  },
                ],
              },
              {
                op: "replace",
                path: "/attributes/purchasable_offer",
                value: [
                  {
                    currency: "TRY",
                    our_price: [
                      {
                        schedule: [
                          {
                            value_with_tax: Number(item.price.toFixed(2)),
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          timeoutMs: 24_000,
          maxRetries: 1,
        });

        results.push({
          variantId: item.variantId,
          externalListingId: item.externalListingId,
          raw: {
            providerStatusCode: response.metadata.status,
            correlationId: response.metadata.correlationId,
            requestId: response.metadata.requestId,
          },
        });
      }

      return results;
    },

    async pullOrders({ credentials, settings, since }) {
      const baseUrl = getBaseUrl(settings);
      const headers = await buildHeaders(credentials);
      const marketplaceId = getMarketplaceId(credentials, settings);
      const createdAfter = since || new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();

      const ordersResponse = await sendProviderRequest<Record<string, unknown>>({
        method: "GET",
        url: `${baseUrl}/orders/v0/orders?MarketplaceIds=${encodeURIComponent(
          marketplaceId,
        )}&LastUpdatedAfter=${encodeURIComponent(createdAfter)}`,
        headers,
        timeoutMs: 26_000,
        maxRetries: 2,
      });

      const ordersPayload = toRecord(ordersResponse.data);
      const orders = Array.isArray(ordersPayload.Orders)
        ? ordersPayload.Orders.map((item) => toRecord(item))
        : [];
      const itemsByOrder = new Map<string, Array<Record<string, unknown>>>();

      for (const order of orders) {
        const orderId =
          (typeof order.AmazonOrderId === "string" && order.AmazonOrderId) ||
          (typeof order.amazonOrderId === "string" && order.amazonOrderId) ||
          null;
        if (!orderId) continue;

        const itemsResponse = await sendProviderRequest<Record<string, unknown>>({
          method: "GET",
          url: `${baseUrl}/orders/v0/orders/${encodeURIComponent(orderId)}/orderItems`,
          headers,
          timeoutMs: 20_000,
          maxRetries: 1,
        });

        const itemPayload = toRecord(itemsResponse.data);
        const items = Array.isArray(itemPayload.OrderItems)
          ? itemPayload.OrderItems.map((item) => toRecord(item))
          : [];
        itemsByOrder.set(orderId, items);
      }

      return mapAmazonOrders(ordersPayload, itemsByOrder);
    },

    async acknowledgeOrder({ externalOrderId }) {
      return buildSuccessResult("Amazon siparis ack gerektirmiyor.", {
        externalOrderId,
      });
    },

    async updateOrderStatus({ credentials, settings, update }) {
      const baseUrl = getBaseUrl(settings);
      const headers = await buildHeaders(credentials);
      const normalizedStatus = update.status.trim().toLowerCase();

      if (!["shipped", "delivered"].includes(normalizedStatus) || !update.trackingNumber) {
        return buildSuccessResult("Amazon status writeback atlandi.", {
          skipped: true,
          externalOrderId: update.externalOrderId,
        });
      }

      const response = await sendProviderRequest<Record<string, unknown>>({
        method: "POST",
        url: `${baseUrl}/orders/v0/orders/${encodeURIComponent(update.externalOrderId)}/shipment`,
        headers,
        body: {
          packageReferenceId: update.externalOrderId,
          carrierCode: update.shippingCarrier || "OTHER",
          trackingNumber: update.trackingNumber,
          shippingDate: new Date().toISOString(),
        },
        timeoutMs: 20_000,
        maxRetries: 1,
      });

      return buildSuccessResult("Amazon siparis durumu guncellendi.", {
        providerStatusCode: response.metadata.status,
        correlationId: response.metadata.correlationId,
      });
    },

    normalizeError(error) {
      return normalizeProviderError(error);
    },
  };
}

