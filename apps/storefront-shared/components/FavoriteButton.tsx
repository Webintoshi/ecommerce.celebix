"use client";

import { useFavoriteStatus } from "./FavoriteStatusProvider";
import { StoreIcon } from "./StoreIcon";

export function FavoriteButton({ productId, productTitle }: Readonly<{ productId: string; productTitle: string }>) {
  const { ids, toggle } = useFavoriteStatus();
  const selected = ids.includes(productId);
  return <button className="favorite-button" type="button" aria-label={`${productTitle} ${selected ? "favorilerden çıkar" : "favorilere ekle"}`} aria-pressed={selected} onClick={() => toggle(productId)}><StoreIcon name="heart" /></button>;
}
