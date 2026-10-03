import "server-only";
import { resolveDefaultPublicStorefrontRuntime } from "../default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";
import { createReviewCollectionPublicRoute } from "./route.ts";
const deps = { selectAuthority: (headers: Headers) => selectTrustedStorefrontHostAuthority(headers), resolveRepository: async () => (await resolveDefaultPublicStorefrontRuntime())?.reviewCollection ?? null, now: () => new Date() };
export const handleReviewInvitation = createReviewCollectionPublicRoute(deps, "invitation");
export const handleReviewSubmission = createReviewCollectionPublicRoute(deps, "submit");
export const handleReviewUnsubscribe = createReviewCollectionPublicRoute(deps, "unsubscribe");
