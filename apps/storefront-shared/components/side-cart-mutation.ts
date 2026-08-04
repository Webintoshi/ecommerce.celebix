import type { PublicCart, PublicCartLine } from "@celebix/saas-contracts";

import type { StorefrontCartClient } from "@/lib/cart/types.ts";

export type SideCartMutationInput = Readonly<{
  line: PublicCartLine;
  cartVersion: number;
  quantity: number | null;
  client: Pick<StorefrontCartClient, "setQuantity" | "remove">;
  replaceCart(cart: PublicCart): void;
  refresh(): Promise<boolean>;
}>;

export async function mutateSideCartLine(input: SideCartMutationInput): Promise<string> {
  try {
    const next = input.quantity === null
      ? await input.client.remove({ variantId: input.line.variantId, expectedVersion: input.cartVersion })
      : await input.client.setQuantity({ variantId: input.line.variantId, quantity: input.quantity, expectedVersion: input.cartVersion });
    input.replaceCart(next);
    return input.quantity === null
      ? `${input.line.title} sepetten çıkarıldı.`
      : `${input.line.title} adedi güncellendi.`;
  } catch {
    return await input.refresh()
      ? "Sepet güncellenemedi. Güncel sepet yeniden yüklendi."
      : "Sepet güncellenemedi. Güncel durum doğrulanamadı.";
  }
}
