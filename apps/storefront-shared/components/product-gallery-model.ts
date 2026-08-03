export type ProductGalleryState = Readonly<{ selected: number; zoomed: boolean }>;
export type ProductGalleryAction =
  | Readonly<{ type: "select" | "open"; index: number; imageCount: number }>
  | Readonly<{ type: "close" }>;

export const initialProductGalleryState: ProductGalleryState = Object.freeze({ selected: 0, zoomed: false });

export function productGalleryReducer(state: ProductGalleryState, action: ProductGalleryAction): ProductGalleryState {
  if (action.type === "close") return state.zoomed ? Object.freeze({ ...state, zoomed: false }) : state;
  if (!Number.isInteger(action.index) || action.index < 0 || action.index >= action.imageCount) return state;
  return Object.freeze({ selected: action.index, zoomed: action.type === "open" ? true : state.zoomed });
}

export function galleryEscapeRequested(key: string): boolean { return key === "Escape"; }

export function lockGalleryDocument(body: Readonly<{ style: { overflow: string } }>): () => void {
  const previousOverflow = body.style.overflow;
  body.style.overflow = "hidden";
  return () => { body.style.overflow = previousOverflow; };
}

export function scheduleGalleryFocus(target: Readonly<{ focus(): void }> | null, schedule: (callback: () => void) => unknown): void {
  schedule(() => target?.focus());
}
