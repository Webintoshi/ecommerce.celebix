export const clampPurchaseQuantity = (value: number) =>
  Math.max(1, Math.min(99, Math.trunc(Number.isFinite(value) ? value : 1)));

export const decrementPurchaseQuantity = (value: number) => clampPurchaseQuantity(value - 1);

export const incrementPurchaseQuantity = (value: number) => clampPurchaseQuantity(value + 1);
