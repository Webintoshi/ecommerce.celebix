import type { CampaignHomeProjection } from "@celebix/saas-data";
import type { PublicProduct, PublicStorefront, PublicStorefrontDesign } from "@celebix/saas-contracts";
import { StorefrontFrame } from "../../components/StorefrontFrame";
import { FavoriteButton } from "../../components/FavoriteButton";
import { CampaignProductRow } from "../../components/CampaignProductRow";
import { LilyumHomeContent, LilyumProductCardsContent } from "./LilyumHomeContent";

export function LilyumProductCards({ products, locale }: { products: readonly PublicProduct[]; locale: string }) {
 return <LilyumProductCardsContent products={products} locale={locale} renderFavorite={product => <FavoriteButton productId={product.id} productTitle={product.title} />} />;
}

export function LilyumHome({ storefront, design, projection }: { storefront: PublicStorefront; design: PublicStorefrontDesign; projection: CampaignHomeProjection }) {
 return <StorefrontFrame storefront={{ ...storefront, presentation: projection.presentation }} design={design}>
  <LilyumHomeContent storefront={storefront} design={design} projection={projection} renderProductCards={products => <LilyumProductCards products={products} locale={storefront.locale} />} renderProductRow={input => <CampaignProductRow {...input} />} />
 </StorefrontFrame>;
}
