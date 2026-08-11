import type { DesignWorkspaceLocation } from "./workspace-navigation-model.ts";

export type DesignCanvasSurface =
  | "brand"
  | "announcement"
  | "navigation"
  | "style"
  | "homepage"
  | "product"
  | "cart"
  | "footer";

export interface DesignCanvasSurfaceItem {
  readonly key: DesignCanvasSurface;
  readonly label: string;
  readonly hint: string;
  readonly location: DesignWorkspaceLocation;
}

export const DESIGN_CANVAS_SURFACES = Object.freeze([
  Object.freeze({ key: "brand", label: "Logo ve marka", hint: "Logonuzu ve mağaza kimliğinizi düzenleyin.", location: Object.freeze({ area: "site", step: "brand" }) }),
  Object.freeze({ key: "announcement", label: "Duyuru şeridi", hint: "Duyuru mesajını ve hareketini düzenleyin.", location: Object.freeze({ area: "site", step: "navigation" }) }),
  Object.freeze({ key: "navigation", label: "Header ve menü", hint: "Logo ve menü yerleşimini düzenleyin.", location: Object.freeze({ area: "site", step: "navigation" }) }),
  Object.freeze({ key: "style", label: "Renk ve yazı", hint: "Mağaza renklerini ve yazılarını düzenleyin.", location: Object.freeze({ area: "site", step: "style" }) }),
  Object.freeze({ key: "homepage", label: "Ana sayfayı düzenle", hint: "Bannerı ve sıralanabilir ana sayfa bölümlerini tek yerden yönetin.", location: Object.freeze({ area: "home", step: "homepage" }) }),
  Object.freeze({ key: "product", label: "Ürün sayfası", hint: "Galeri ve satın alma alanını düzenleyin.", location: Object.freeze({ area: "site", step: "product" }) }),
  Object.freeze({ key: "cart", label: "Yan sepet", hint: "Sepet görünümünü ve güven mesajlarını düzenleyin.", location: Object.freeze({ area: "site", step: "cart" }) }),
  Object.freeze({ key: "footer", label: "Footer", hint: "Alt menü ve bülten alanını düzenleyin.", location: Object.freeze({ area: "site", step: "footer" }) }),
] satisfies readonly DesignCanvasSurfaceItem[]);

export function designCanvasSurface(key: DesignCanvasSurface): DesignCanvasSurfaceItem {
  const surface = DESIGN_CANVAS_SURFACES.find((candidate) => candidate.key === key);
  if (!surface) throw new TypeError("design_surface_unavailable");
  return surface;
}

export function designCanvasSurfaceForLocation(location: DesignWorkspaceLocation): DesignCanvasSurfaceItem {
  const surface = DESIGN_CANVAS_SURFACES.find((candidate) => candidate.location.area === location.area && candidate.location.step === location.step);
  if (!surface) throw new TypeError("design_surface_unavailable");
  return surface;
}
