const normalizePurchaseQuantityLimit = (maximum: number) =>
  Math.max(1, Math.min(99, Math.trunc(Number.isFinite(maximum) ? maximum : 99)));

export const clampPurchaseQuantity = (value: number, maximum = 99) =>
  Math.max(1, Math.min(normalizePurchaseQuantityLimit(maximum), Math.trunc(Number.isFinite(value) ? value : 1)));

export const decrementPurchaseQuantity = (value: number, maximum = 99) => clampPurchaseQuantity(value - 1, maximum);

export const incrementPurchaseQuantity = (value: number, maximum = 99) => clampPurchaseQuantity(value + 1, maximum);
