export const PRODUCT_REVIEW_STATUS_VALUES = ["pending", "approved", "rejected"] as const;

export type ProductReviewStatus = (typeof PRODUCT_REVIEW_STATUS_VALUES)[number];

export const DEFAULT_PRODUCT_REVIEW_STATUS: ProductReviewStatus = "pending";

export const MAX_PRODUCT_REVIEW_IMAGES = 4;

export function isProductReviewStatus(value: unknown): value is ProductReviewStatus {
  return (
    typeof value === "string" &&
    PRODUCT_REVIEW_STATUS_VALUES.includes(value as ProductReviewStatus)
  );
}

