"use client";

import type {
  StorefrontDesignDestinationOption,
  StorefrontDesignDocument,
  StorefrontDesignMediaOption,
} from "@celebix/saas-contracts";

import { CategoryShowcaseEditor } from "@/components/settings/CategoryShowcaseEditor";
import { StarterThemeComposer } from "@/components/settings/StarterThemeComposer";
import { StorefrontAssetManager } from "@/components/settings/StorefrontAssetManager";
import { DesignInspector } from "./DesignInspector";
import type { DesignWorkspaceStep } from "./workspace-navigation-model";
import styles from "../design-settings.module.css";

const HOMEPAGE_ASSET_KINDS = Object.freeze(["hero", "category"] as const);
const BRAND_ASSET_KINDS = Object.freeze(["logo", "favicon", "social"] as const);

interface DesignStepEditorProps {
  readonly step: DesignWorkspaceStep;
  readonly design: StorefrontDesignDocument;
  readonly storeName: string;
  readonly timezone: string;
  readonly media: readonly StorefrontDesignMediaOption[];
  readonly destinations: readonly StorefrontDesignDestinationOption[];
  readonly canManage: boolean;
  readonly onChange: (design: StorefrontDesignDocument) => void;
  readonly onUpload: (file: File, altText: string) => Promise<StorefrontDesignMediaOption>;
}

export function DesignStepEditor({
  step,
  design,
  storeName,
  timezone,
  media,
  destinations,
  canManage,
  onChange,
  onUpload,
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
  />;
  const composer = (activePanel: "visual" | "navigation" | "home" | "product" | "cart" | "footer") => <StarterThemeComposer
    activePanel={activePanel}
    canManage={canManage}
    showPreview={false}
    value={design.composition}
    onChange={(value) => onChange({ ...design, composition: value })}
  />;

  if (step === "brand") return <div className={styles.editorStack}>
    <section className={styles.editorGroup} aria-labelledby="design-brand-heading">
      <header><h3 id="design-brand-heading">Logo ve simge</h3><p>Mağazanızın her sayfada görünen kimliğini seçin.</p></header>
      {inspector("brand")}
    </section>
    <details className={styles.advancedDisclosure}>
      <summary>Logo ve paylaşım arşivi</summary>
      <StorefrontAssetManager allowedKinds={BRAND_ASSET_KINDS} canManage={canManage} title="Marka görselleri" description="Logo, site simgesi ve sosyal paylaşım görsellerinizi burada saklayın." />
    </details>
  </div>;

  if (step === "style") return <div className={styles.editorStack}>
    <section className={styles.editorGroup} aria-labelledby="design-color-heading"><header><h3 id="design-color-heading">Renkler</h3><p>Mağazanızın ana renklerini seçin.</p></header>{inspector("colors")}</section>
    <section className={styles.editorGroup} aria-labelledby="design-type-heading"><header><h3 id="design-type-heading">Yazılar</h3><p>Başlık ve normal metin görünümünü ayrı ayrı ayarlayın.</p></header>{inspector("typography")}</section>
    <details className={styles.advancedDisclosure}><summary>Gelişmiş görünüm</summary>{composer("visual")}</details>
  </div>;

  if (step === "navigation") return <div className={styles.editorStack}>
    {composer("navigation")}
    <details className={styles.advancedDisclosure}><summary>Gelişmiş duyuru ayarları</summary>{inspector("announcement")}</details>
  </div>;

  if (step === "product") return composer("product");
  if (step === "cart") return composer("cart");
  if (step === "footer") return composer("footer");
  if (step === "hero") return inspector("hero");
  if (step === "promotion") return inspector("promotion");
  if (step === "assets") return <StorefrontAssetManager allowedKinds={HOMEPAGE_ASSET_KINDS} canManage={canManage} title="Ana sayfa görselleri" description="Banner ve kategori kartlarında kullanacağınız görselleri yükleyin." />;

  return <div className={styles.editorStack}>
    <CategoryShowcaseEditor canManage={canManage} />
    {composer("home")}
  </div>;
}
