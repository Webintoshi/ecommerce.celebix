"use client";

import type {
  StorefrontDesignDestinationOption,
  StorefrontDesignAssetOption,
  StorefrontDesignDocument,
  StorefrontDesignMediaOption,
  StorefrontAsset,
} from "@celebix/saas-contracts";
import { Component, type ReactNode } from "react";

import { StarterThemeComposer } from "@/components/settings/StarterThemeComposer";
import { StorefrontAssetManager } from "@/components/settings/StorefrontAssetManager";
import { DesignInspector } from "./DesignInspector";
import { synchronizeCompositionAnnouncement } from "./design-editor-model";
import type { DesignWorkspaceStep } from "./workspace-navigation-model";
import styles from "../design-settings.module.css";

const HOMEPAGE_ASSET_KINDS = Object.freeze(["hero", "category"] as const);
const BRAND_ASSET_KINDS = Object.freeze(["logo", "favicon", "social"] as const);

class ThemeEditorErrorBoundary extends Component<
  Readonly<{ children: ReactNode; resetKey: StorefrontDesignDocument["composition"] }>,
  Readonly<{ failed: boolean }>
> {
  state = Object.freeze({ failed: false });

  static getDerivedStateFromError(): Readonly<{ failed: boolean }> {
    return Object.freeze({ failed: true });
  }

  componentDidUpdate(previous: Readonly<{ resetKey: StorefrontDesignDocument["composition"] }>): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <section role="alert" className={styles.editorGroup}>
      <header><h3>Tema düzenleyicisi açılamadı</h3><p>Kayıtlı tasarım korundu. Alanı yeniden açmayı deneyin.</p></header>
      <button type="button" onClick={() => this.setState({ failed: false })}>Yeniden dene</button>
    </section>;
  }
}

interface DesignStepEditorProps {
  readonly step: DesignWorkspaceStep;
  readonly design: StorefrontDesignDocument;
  readonly storeName: string;
  readonly timezone: string;
  readonly media: readonly StorefrontDesignMediaOption[];
  readonly assets?: readonly StorefrontDesignAssetOption[];
  readonly onAssetsChange?: () => void;
  readonly destinations: readonly StorefrontDesignDestinationOption[];
  readonly canManage: boolean;
  readonly previewMode: "desktop" | "mobile";
  readonly onChange: (design: StorefrontDesignDocument) => void;
  readonly surface?: "announcement" | "navigation" | string;
  readonly onValidationChange?: (invalid: boolean) => void;
  readonly onMediaBusyChange?: (id: string, busy: boolean) => void;
  readonly onAssetUploaded?: (asset: StorefrontAsset) => void;
  readonly onUpload: (file: File, altText: string) => Promise<StorefrontDesignMediaOption>;
}

export function DesignStepEditor({
  step,
  design,
  storeName,
  timezone,
  media,
  destinations,
  assets = [],
  onAssetsChange,
  canManage,
  previewMode,
  onChange,
  onUpload,
  surface,
  onMediaBusyChange,
  onValidationChange,
  onAssetUploaded,
}: Readonly<DesignStepEditorProps>) {
  const inspector = (section: "brand" | "colors" | "typography" | "hero" | "promotion" | "announcement") => <DesignInspector
    section={section}
    design={design}
    storeName={storeName}
    timezone={timezone}
    media={media}
    destinations={destinations}
    canManage={canManage}
    onChange={onChange}
    onUpload={onUpload}
    onMediaBusyChange={onMediaBusyChange}
  />;
  const composer = (activePanel: "visual" | "navigation" | "product" | "cart" | "footer") => <ThemeEditorErrorBoundary resetKey={design.composition}>
    <StarterThemeComposer
      activePanel={activePanel}
      canManage={canManage}
      showPreview={false}
      value={{...design.composition,schemaVersion:3,sections:[]}}
      destinations={destinations}
      showAnnouncement={activePanel !== "navigation"}
      onMediaBusyChange={onMediaBusyChange}
      onValidationChange={onValidationChange}
      onAssetUploaded={onAssetUploaded}
      onChange={(value) => onChange(synchronizeCompositionAnnouncement(design, value))}
    />
  </ThemeEditorErrorBoundary>;

  if (step === "brand") return <div className={styles.editorStack}>
    <section className={styles.editorGroup} aria-labelledby="design-brand-heading">
      <header className={styles.srOnly}><h3 id="design-brand-heading">Logo ve simge</h3></header>
      {inspector("brand")}
    </section>
    <details className={styles.advancedDisclosure}>
      <summary>Logo ve paylaşım arşivi</summary>
      <StorefrontAssetManager onAssetsChange={onAssetsChange} allowedKinds={BRAND_ASSET_KINDS} canManage={canManage} title="Marka görselleri" description="Logo, site simgesi ve sosyal paylaşım görsellerinizi burada saklayın." />
    </details>
  </div>;

  if (step === "style") return <div className={styles.editorStack}>
    <section className={styles.editorGroup} aria-labelledby="design-color-heading"><header><h3 id="design-color-heading">Renkler</h3></header>{inspector("colors")}</section>
    <section className={styles.editorGroup} aria-labelledby="design-type-heading"><header><h3 id="design-type-heading">Yazılar</h3></header>{inspector("typography")}</section>
    <details className={styles.advancedDisclosure}><summary>Gelişmiş görünüm</summary>{composer("visual")}</details>
  </div>;

  if (step === "navigation") return <div className={styles.editorStack}>
    {surface === "announcement" ? inspector("announcement") : <>{composer("navigation")}{surface !== "navigation" ? <details className={styles.advancedDisclosure}><summary>Duyuru şeridi</summary>{inspector("announcement")}</details> : null}</>}
  </div>;

  if (step === "product") return composer("product");
  if (step === "cart") return composer("cart");
  if (step === "footer") return composer("footer");
  if (step === "homepage") return <div className={styles.editorStack}>
    <details className={styles.advancedDisclosure}><summary>Kampanya zamanlaması</summary>{inspector("promotion")}</details>
    <details className={styles.advancedDisclosure}><summary>Ana sayfa görsel arşivi</summary><StorefrontAssetManager onAssetsChange={onAssetsChange} allowedKinds={HOMEPAGE_ASSET_KINDS} canManage={canManage} title="Ana sayfa görselleri" description="Banner ve kategori kartlarında kullanacağınız görselleri yükleyin." /></details>
  </div>;
  return null;
}
