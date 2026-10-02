import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { createSioraCartRecommendationsGet } from "@/themes/siora/cart-recommendations.ts";

export const GET = createSioraCartRecommendationsGet(resolveStorefrontPage);
