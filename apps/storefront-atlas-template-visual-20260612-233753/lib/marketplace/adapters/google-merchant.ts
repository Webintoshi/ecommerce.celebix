import type {
  MarketplaceInventorySyncResultItem,
  MarketplaceListingUpsertResultItem,
  MarketplaceProviderAdapter,
  MarketplaceProviderAdapterResult,
  MarketplacePulledOrder,
} from "@/types/marketplace";

function success(message: string, raw?: Record<string, unknown>): MarketplaceProviderAdapterResult {
  return { success: true, message, raw };
}

export function createGoogleMerchantAdapter(): MarketplaceProviderAdapter {
  return {
    async connect(input) {
      return success("Google Merchant feed baglantisi hazir.", {
        merchantId: input.credentials.merchantId || "",
      });
    },

    async testConnection(input) {
      return success("Google Merchant feed baglantisi hazir.", {
        merchantId: input.credentials.merchantId || "",
      });
    },

    async upsertListings(input) {
      return input.listings.map<MarketplaceListingUpsertResultItem>((listing) => ({
        variantId: listing.variantId,
        externalListingId: listing.sku || listing.variantId,
        externalSku: listing.sku,
        status: "active",
      }));
    },

    async updateInventory(input) {
      return input.inventory.map<MarketplaceInventorySyncResultItem>((inventory) => ({
        variantId: inventory.variantId,
        externalListingId: inventory.externalListingId,
      }));
    },

    async pullOrders() {
      return [] as MarketplacePulledOrder[];
    },

    async acknowledgeOrder() {
      return success("Google Merchant feed tabanli calisir; siparis acknowledgement kullanilmaz.");
    },

    async updateOrderStatus() {
      return success("Google Merchant feed tabanli calisir; siparis durumu guncellenmez.");
    },

    normalizeError(error: unknown) {
      return error instanceof Error ? error.message : "Google Merchant islemi basarisiz.";
    },
  };
}
