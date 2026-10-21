import { StorefrontFrame } from "../../../../../../apps/storefront-shared/components/StorefrontFrame";
import { FavoritesPageClient } from "../../../../../../apps/storefront-shared/components/FavoritesPageClient";
import {storefront,design} from "../data";
export default function Page(){return <StorefrontFrame storefront={storefront} design={design}><section className="store-section store-container"><FavoritesPageClient locale="tr" cardStyle="compact" imageRatio="square"/></section></StorefrontFrame>}
