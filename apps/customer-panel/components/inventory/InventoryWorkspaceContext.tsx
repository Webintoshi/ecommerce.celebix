"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { InventoryLocation } from "@celebix/saas-contracts";

import type { CatalogVariantChoice } from "@/lib/catalog-ui/variant-choices";
import type { InventoryFormChoices } from "@/lib/inventory-ui/form-choices";
import { createInventoryWorkspaceController, EMPTY_INVENTORY_WORKSPACE, type InventoryWorkspaceSnapshot } from "@/lib/inventory-ui/workspace-data";

export type InventoryWorkspaceContextValue = Readonly<{
  inventoryCanRead: boolean;
  phase: "loading" | "loaded" | "error";
  locations: readonly InventoryLocation[];
  variants: readonly CatalogVariantChoice[];
  formChoices: InventoryFormChoices;
  locationName(id: string): string;
  variantName(id: string): string;
  reload(): void;
  revision: number;
}>;

const InventoryWorkspaceContext = createContext<InventoryWorkspaceContextValue | null>(null);

export function InventoryWorkspaceProvider({ inventoryCanRead, children }: Readonly<{ inventoryCanRead: boolean; children: ReactNode }>) {
  const controller = useRef<ReturnType<typeof createInventoryWorkspaceController> | null>(null);
  const [snapshot, setSnapshot] = useState<InventoryWorkspaceSnapshot>({ phase: "loading", data: EMPTY_INVENTORY_WORKSPACE, revision: 0 });
  useEffect(() => {
    if (!inventoryCanRead) {
      setSnapshot({ phase: "error", data: EMPTY_INVENTORY_WORKSPACE, revision: 0 });
      return;
    }
    const active = createInventoryWorkspaceController({ onChange: setSnapshot });
    controller.current = active;
    void active.reload();
    return () => {
      active.dispose();
      if (controller.current === active) controller.current = null;
    };
  }, [inventoryCanRead]);
  const reload = useCallback(() => { void controller.current?.reload(); }, []);
  const value = useMemo<InventoryWorkspaceContextValue>(() => {
    const locations = new Map(snapshot.data.locations.map((location) => [location.id, location.name]));
    const variants = new Map(snapshot.data.variants.map((variant) => [variant.variantId, `${variant.productTitle} · ${variant.variantTitle}${variant.sku ? ` (${variant.sku})` : ""}`]));
    return Object.freeze({
      inventoryCanRead,
      phase: snapshot.phase,
      locations: snapshot.data.locations,
      variants: snapshot.data.variants,
      formChoices: snapshot.data.formChoices,
      locationName: (id: string) => locations.get(id) ?? "Depo bilgisi yüklenemedi",
      variantName: (id: string) => variants.get(id) ?? "Ürün bilgisi yüklenemedi",
      reload,
      revision: snapshot.revision,
    });
  }, [inventoryCanRead, snapshot, reload]);
  return <InventoryWorkspaceContext.Provider value={value}>{children}</InventoryWorkspaceContext.Provider>;
}

export function useOptionalInventoryWorkspace() {
  return useContext(InventoryWorkspaceContext);
}
export function useInventoryWorkspace(): InventoryWorkspaceContextValue {
  const context = useOptionalInventoryWorkspace();
  if (!context) throw new Error("inventory_workspace_provider_missing");
  return context;
}
