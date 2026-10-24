import type { ProductPageReviewAvailability, ReviewSubmission } from "@celebix/saas-contracts";
import { ProductPageReviewError, type ProductPageReviewRepository } from "@celebix/saas-data";
import { accountCredentialDigestCandidates, readAccountCookie, type StorefrontIdentityKeyring } from "../account/credential.ts";

type Authority = Readonly<{ hostname: string; productId: string; cookieHeader: string | null }>;
export type ProductPageReviewRuntime = Readonly<{
  availability(input: Authority): Promise<ProductPageReviewAvailability>;
  submit(input: Authority & Readonly<{ operationId: string; review: ReviewSubmission }>): Promise<Readonly<{ status: "pending" }>>;
}>;
export function createProductPageReviewRuntime({ repository, keyring, now }: Readonly<{ repository: ProductPageReviewRepository; keyring: StorefrontIdentityKeyring; now(): Date }>): ProductPageReviewRuntime {
  function credentials(cookieHeader: string | null) {
    const cookie = readAccountCookie(cookieHeader);
    return cookie.kind === "present" ? accountCredentialDigestCandidates(cookie.value, keyring) : Object.freeze([]);
  }
  return Object.freeze({
    async availability({ hostname, productId, cookieHeader }: Authority) { return repository.availability({ hostname, productId, now: now(), candidates: credentials(cookieHeader) }); },
    async submit({ hostname, productId, cookieHeader, operationId, review }: Authority & Readonly<{ operationId: string; review: ReviewSubmission }>) {
      const candidates = credentials(cookieHeader);
      if (!candidates.length) throw new ProductPageReviewError("unauthenticated");
      return repository.submit({ hostname, productId, now: now(), candidates, operationId, review });
    },
  });
}
