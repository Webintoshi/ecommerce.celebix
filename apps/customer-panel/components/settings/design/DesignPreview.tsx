import { normalizeStorefrontDesignDocumentV5, type HomepageSectionId, type StorefrontDesignDocument, StorefrontDesignDestinationOption, StorefrontDesignMediaOption } from "@celebix/saas-contracts";
import type { StorefrontDesignPreviewResources } from "../../../lib/storefront-design-preview-model";

import type { DesignCanvasSurface, DesignCanvasTrigger } from "./design-surface-model";
import { VisualStorefrontCanvas } from "./VisualStorefrontCanvas";
import styles from "../design-settings.module.css";

export function DesignPreview({ design, storeName, publishedVersion, publishedAt, media, destinations, previewResources, previewProductId, onSelectPreviewProduct, mode, now, selectedSurface, onSelectSurface = () => undefined, selectedSectionId, onSelectSection, onInsertSection }: Readonly<{ design: StorefrontDesignDocument; storeName: string; publishedVersion: number; publishedAt: string; media: readonly StorefrontDesignMediaOption[]; destinations: readonly StorefrontDesignDestinationOption[]; previewResources: StorefrontDesignPreviewResources; previewProductId?: string; onSelectPreviewProduct?: (productId: string) => void; mode: "desktop" | "mobile"; now: Date; selectedSurface?: DesignCanvasSurface; selectedSectionId?: HomepageSectionId; onSelectSection?: (sectionId:HomepageSectionId,trigger?:DesignCanvasTrigger)=>void; onInsertSection?: (index:number,trigger?:DesignCanvasTrigger)=>void; onSelectSurface?: (surface: DesignCanvasSurface, trigger?: DesignCanvasTrigger) => void }>) {
  try {
    normalizeStorefrontDesignDocumentV5(design);
    return <VisualStorefrontCanvas design={design} storeName={storeName} publishedVersion={publishedVersion} publishedAt={publishedAt} media={media} destinations={destinations} previewResources={previewResources} previewProductId={previewProductId} onSelectPreviewProduct={onSelectPreviewProduct} mode={mode} now={now} selectedSurface={selectedSurface} onSelectSurface={onSelectSurface} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} onInsertSection={onInsertSection} />;
  } catch {
    return <div className={styles.previewUnavailable} role="status">Önizleme hazır değil</div>;
  }
}
