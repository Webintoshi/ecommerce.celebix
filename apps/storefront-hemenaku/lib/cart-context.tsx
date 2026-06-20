"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { CartItem, CartContextType } from "@/types/cart";
import { Product, ProductVariant } from "@/types/product";
import { CartCustomizationPayload } from "@/types/product-customization";
import { SHIPPING_THRESHOLD, SHIPPING_COST } from "@/lib/constants";
import { fetchShippingZonesFromSettings, getCartShippingSummary, type ShippingZone } from "@/lib/shipping";
import { getSessionId } from "@/lib/tracking";

const CartContext = createContext<CartContextType | undefined>(undefined);
const CART_ID_STORAGE_KEY = "celebix_storefront_cart_id";

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function createCustomizationFingerprint(
  customization?: CartCustomizationPayload
): string {
  if (!customization) return "standard";
  return stableStringify({
    schema_id: customization.schema_id,
    selections: customization.selections.map((selection) => ({
      step_key: selection.step_key,
      value: selection.value,
    })),
    price: customization.price_breakdown?.final_price ?? 0,
  });
}

function createCartItemId(
  productId: string,
  variantId: string,
  customizationFingerprint: string
): string {
  return `${productId}:${variantId}:${customizationFingerprint}`;
}

function getCartItemUnitPrice(
  variant: ProductVariant,
  customization?: CartCustomizationPayload
): number {
  return customization?.price_breakdown?.final_price ?? variant.price;
}

function loadCartFromStorage(): CartItem[] {
  if (typeof window === "undefined") return [];
  
  const savedCart = localStorage.getItem("celebix_storefront_cart");
  if (!savedCart) return [];
  
  try {
    const parsedCart = JSON.parse(savedCart) as CartItem[];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const hasInvalidIds = parsedCart.some(
      (item) => !uuidRegex.test(item.productId) || !uuidRegex.test(item.variantId)
    );

    if (hasInvalidIds) {
      console.warn("Legacy cart data detected (invalid UUIDs). Clearing cart.");
      localStorage.removeItem("celebix_storefront_cart");
      return [];
    }
    
    return parsedCart.map((item) => {
      const customizationFingerprint =
        item.customizationFingerprint ||
        createCustomizationFingerprint(item.customization);
      return {
        ...item,
        id:
          item.id ||
          createCartItemId(item.productId, item.variantId, customizationFingerprint),
        customizationFingerprint,
        unitPrice:
          typeof item.unitPrice === "number"
            ? item.unitPrice
            : getCartItemUnitPrice(item.variant, item.customization),
      };
    });
  } catch (e) {
    console.error("Failed to parse cart data", e);
    return [];
  }
}

function getOrCreateSessionId(): string {
  return getSessionId();
}

function getOrCreateCartId(): string {
  if (typeof window === "undefined") return "";

  let cartId = localStorage.getItem(CART_ID_STORAGE_KEY);
  if (!cartId) {
    cartId = `cart_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(CART_ID_STORAGE_KEY, cartId);
  }

  return cartId;
}

async function deleteStoredAbandonedCart() {
  try {
    const sessionId = getOrCreateSessionId();
    if (!sessionId) return;

    await fetch(`/api/abandoned-carts?session_id=${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    });
  } catch (error) {
    console.error("Failed to clear abandoned cart:", error);
  }
}

async function saveToAbandonedCart(items: CartItem[]) {
  if (items.length === 0) return;
  
  try {
    const sessionId = getOrCreateSessionId();
    const cartId = getOrCreateCartId();
    const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    
    const response = await fetch('/api/abandoned-carts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cart_id: cartId,
        session_id: sessionId,
        items: items.map(item => ({
          id: item.id,
          productId: item.productId,
          product_id: item.productId,
          productName: item.product.name,
          productSlug: item.product.slug,
          productImage: item.product.images?.[0] || "",
          variant_id: item.variantId,
          variantId: item.variantId,
          variantName: item.variant.name,
          name: item.product.name,
          price: item.unitPrice,
          quantity: item.quantity,
          stock: item.variant.stock ?? 0,
          weight: item.variant.weight,
          image: item.product.images?.[0] || "",
          customization: item.customization || null,
        })),
        total,
        item_count: items.reduce((sum, item) => sum + item.quantity, 0),
        is_anonymous: true,
        status: 'active'
      })
    });
    
    const result = await response.json();
    console.log("Sepet kaydedildi:", result);
    
    if (!result.success) {
      console.error("Sepet kaydetme hatası:", result.error);
    }
  } catch (error) {
    console.error("Failed to save abandoned cart:", error);
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadCartFromStorage);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(true);
  const [lastAddedItem, setLastAddedItem] = useState<CartItem | null>(null);
  const [shippingZones, setShippingZones] = useState<ShippingZone[] | null>(null);
  const preserveServerCartRef = useRef(false);
  const didRunInitialCartSyncRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    fetchShippingZonesFromSettings()
      .then((zones) => {
        if (isMounted) {
          setShippingZones(zones);
        }
      })
      .catch((error) => {
        console.error("Failed to load shipping settings for cart:", error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Save cart to localStorage and database whenever items change
  useEffect(() => {
    localStorage.setItem("celebix_storefront_cart", JSON.stringify(items));

    if (!didRunInitialCartSyncRef.current) {
      didRunInitialCartSyncRef.current = true;
      if (items.length === 0) {
        return;
      }
    }

    if (items.length === 0) {
      if (preserveServerCartRef.current) {
        preserveServerCartRef.current = false;
        return;
      }

      deleteStoredAbandonedCart();
      return;
    }

    saveToAbandonedCart(items);
  }, [items]);

  const addToCart = (
    product: Product,
    variant: ProductVariant,
    quantity: number = 1,
    customization?: CartCustomizationPayload
  ) => {
    const customizationFingerprint = createCustomizationFingerprint(customization);
    const itemId = createCartItemId(product.id, variant.id, customizationFingerprint);
    const unitPrice = getCartItemUnitPrice(variant, customization);

    const newItem: CartItem = {
      id: itemId,
      productId: product.id,
      variantId: variant.id,
      quantity,
      unitPrice,
      product,
      variant,
      customization,
      customizationFingerprint,
    };

    setItems((prev) => {
      const existingItem = prev.find((item) => item.id === itemId);

      if (existingItem) {
        return prev.map((item) =>
          item.id === itemId
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }

      return [...prev, newItem];
    });

    setLastAddedItem(newItem);
    setIsOpen(true);
  };

  const removeFromCart = (itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
    if (lastAddedItem?.id === itemId) {
      setLastAddedItem(null);
    }
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = (options?: { preserveServerCart?: boolean }) => {
    preserveServerCartRef.current = Boolean(options?.preserveServerCart);
    setItems([]);
    setLastAddedItem(null);
  };

  const getItemQuantity = (productId: string, variantId: string) => {
    return items
      .filter((item) => item.productId === productId && item.variantId === variantId)
      .reduce((sum, item) => sum + item.quantity, 0);
  };

  const getTotalItems = () => {
    return items.reduce((total, item) => total + item.quantity, 0);
  };

  const subtotal = items.reduce(
    (total, item) => total + item.unitPrice * item.quantity,
    0
  );

  const shippingSummary = shippingZones
    ? getCartShippingSummary(shippingZones, subtotal)
    : {
        threshold: SHIPPING_THRESHOLD,
        shippingCost: subtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_COST,
        remaining: Math.max(SHIPPING_THRESHOLD - subtotal, 0),
        progress: Math.min((subtotal / SHIPPING_THRESHOLD) * 100, 100),
        qualifiesForFreeShipping: subtotal >= SHIPPING_THRESHOLD,
      };

  const shipping = shippingSummary.shippingCost;
  const shippingThreshold = shippingSummary.threshold;
  const freeShippingRemaining = shippingSummary.remaining;
  const freeShippingProgress = shippingSummary.progress;

  const total = subtotal + shipping;

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        getItemQuantity,
        getTotalItems,
        subtotal,
        shipping,
        shippingThreshold,
        freeShippingRemaining,
        freeShippingProgress,
        total,
        isOpen,
        setIsOpen,
        lastAddedItem,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
