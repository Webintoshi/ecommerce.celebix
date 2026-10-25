import "server-only";
import { resolveDefaultPublicStorefrontRuntime } from "../default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";
import { createProductPageReviewRoutes } from "./product-page-route.ts";
const handlers = createProductPageReviewRoutes({ selectAuthority: selectTrustedStorefrontHostAuthority, resolveRuntime: async () => (await resolveDefaultPublicStorefrontRuntime())?.productPageReviews ?? null });
export const handleProductPageReviewAvailability = handlers.GET;
export const handleProductPageReviewSubmission = handlers.POST;
