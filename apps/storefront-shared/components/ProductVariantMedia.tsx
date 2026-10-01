"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { resolveProductGallerySelection, resolvePublicProductVariantMedia, type PublicProduct } from "@celebix/saas-contracts";

type VariantSelection = Readonly<{ productId: string; selectedId: string; selectVariant: (id: string) => void }>;
const ProductVariantContext = createContext<VariantSelection | null>(null);

function initialVariant(product: PublicProduct, preferredId?: string): string {
  if (preferredId && product.variants.some(({ id }) => id === preferredId)) return preferredId;
  return product.variants.find(({ available }) => available)?.id ?? product.variants[0]?.id ?? "";
}

/** A small client boundary coordinates the gallery and purchase controls around server-rendered content. */
export function ProductVariantMediaProvider({ product, children, initialVariantId }: Readonly<{ product: PublicProduct; children: ReactNode; initialVariantId?: string }>) {
  const [selection, setSelection] = useState(() => ({ productId: product.id, selectedId: initialVariant(product, initialVariantId) }));
  const selectedId = selection.productId === product.id && product.variants.some(({ id }) => id === selection.selectedId)
    ? selection.selectedId : initialVariant(product, initialVariantId);
  const selectVariant = useCallback((id: string) => {
    if (product.variants.some((variant) => variant.id === id)) setSelection({ productId: product.id, selectedId: id });
  }, [product]);
  const value = useMemo(() => ({ productId: product.id, selectedId, selectVariant }), [product.id, selectedId, selectVariant]);
  return <ProductVariantContext.Provider value={value}>{children}</ProductVariantContext.Provider>;
}

export function useProductVariantSelection(product: PublicProduct): readonly [string, (id: string) => void] {
  const shared = useContext(ProductVariantContext);
  const [localId, setLocalId] = useState(() => initialVariant(product));
  if (shared?.productId === product.id) return [shared.selectedId, shared.selectVariant];
  const selectedId = product.variants.some(({ id }) => id === localId) ? localId : initialVariant(product);
  return [selectedId, setLocalId];
}

export function useProductVariantMedia(product: PublicProduct) {
  const [variantId] = useProductVariantSelection(product);
  const images = useMemo(() => resolvePublicProductVariantMedia(product, variantId), [product, variantId]);
  const [currentMediaId, setCurrentMediaId] = useState<string | null>(() => images[0]?.id ?? null);
  const selectedMediaId = resolveProductGallerySelection(images, currentMediaId);
  useEffect(() => { setCurrentMediaId(selectedMediaId); }, [selectedMediaId]);
  return { images, selectedMediaId, selectMedia: setCurrentMediaId };
}
