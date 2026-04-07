import type {
  MarketplaceInventorySyncResultItem,
  MarketplaceListingUpsertResultItem,
  MarketplaceProviderAdapter,
  MarketplaceProviderAdapterResult,
  MarketplacePulledOrder,
} from "@/types/marketplace";
import { buildGoogleMerchantCatalogSnapshot } from "@/lib/google-merchant";

function buildFeedSummaryMessage(summary: {
  validItems: number;
  issueCount: number;
  feedUrl: string;
}) {
  const issuePart =
    summary.issueCount > 0
      ? ` ${summary.issueCount} urunde duzeltilmesi gereken alan var.`
      : "";
  return `Google Merchant feed hazir. ${summary.validItems} urun Scheduled Fetch ile alinabilir.${issuePart}`;
}

function toAdapterResult(summary: Awaited<ReturnType<typeof buildGoogleMerchantCatalogSnapshot>>): MarketplaceProviderAdapterResult {
  return {
    success: summary.validItems > 0,
    message:
      summary.validItems > 0
        ? buildFeedSummaryMessage(summary)
        : "Feed olusturuldu fakat Merchant Center icin hazir urun bulunamadi.",
    raw: {
      feedUrl: summary.feedUrl,
      feedItemCount: summary.validItems,
      feedIssueCount: summary.issueCount,
      sampleIssues: summary.sampleIssues,
      feedSettings: summary.settings,
    },
  };
}

export function createGoogleMerchantAdapter(): MarketplaceProviderAdapter {
  return {
    async connect(input) {
      const summary = await buildGoogleMerchantCatalogSnapshot(input.settings || {});
      return toAdapterResult(summary);
    },

    async testConnection(input) {
      const summary = await buildGoogleMerchantCatalogSnapshot(input.settings || {});
      return toAdapterResult(summary);
    },

    async upsertListings(input) {
      return input.listings.map<MarketplaceListingUpsertResultItem>((listing) => ({
        variantId: listing.variantId,
        externalListingId: listing.sku || listing.variantId,
        externalSku: listing.sku,
        status: "active",
        raw: {
          feedSource: "google_merchant",
        },
      }));
    },

    async updateInventory(input) {
      return input.inventory.map<MarketplaceInventorySyncResultItem>((inventory) => ({
        variantId: inventory.variantId,
        externalListingId: inventory.externalListingId,
        raw: {
          feedSource: "google_merchant",
        },
      }));
    },

    async pullOrders() {
      return [] as MarketplacePulledOrder[];
    },

    async acknowledgeOrder() {
      return {
        success: true,
        message: "Google Merchant siparis verisi saglamaz.",
      };
    },

    async updateOrderStatus() {
      return {
        success: true,
        message: "Google Merchant feed tabanli bir kanaldir; siparis durumu guncellenmez.",
      };
    },

    normalizeError(error: unknown) {
      return error instanceof Error ? error.message : "Google Merchant islemi basarisiz.";
    },
  };
}
