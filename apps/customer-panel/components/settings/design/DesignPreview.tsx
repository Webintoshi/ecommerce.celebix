import type { StorefrontDesignDocument, StorefrontDesignDestinationOption, StorefrontDesignMediaOption } from "@celebix/saas-contracts";

import type { DesignCanvasSurface } from "./design-surface-model";
import { VisualStorefrontCanvas } from "./VisualStorefrontCanvas";
import styles from "../design-settings.module.css";

export function DesignPreview({ design, storeName, publishedVersion, publishedAt, media, destinations, mode, now, selectedSurface, onSelectSurface = () => undefined }: Readonly<{ design: StorefrontDesignDocument; storeName: string; publishedVersion: number; publishedAt: string; media: readonly StorefrontDesignMediaOption[]; destinations: readonly StorefrontDesignDestinationOption[]; mode: "desktop" | "mobile"; now: Date; selectedSurface?: DesignCanvasSurface; onSelectSurface?: (surface: DesignCanvasSurface, trigger?: HTMLButtonElement) => void }>) {
  try {
    return <VisualStorefrontCanvas design={design} storeName={storeName} publishedVersion={publishedVersion} publishedAt={publishedAt} media={media} destinations={destinations} mode={mode} now={now} selectedSurface={selectedSurface} onSelectSurface={onSelectSurface} />;
  } catch {
    return <div className={styles.previewUnavailable} role="status">Önizleme hazır değil</div>;
  }
}
