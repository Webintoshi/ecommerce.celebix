"use client";

import { SideCart } from "@/components/cart/SideCart";
import { useCart } from "@/lib/cart-context";

export function CartWrapper() {
  const { isOpen, setIsOpen } = useCart();

  return <SideCart isOpen={isOpen} onClose={() => setIsOpen(false)} />;
}
