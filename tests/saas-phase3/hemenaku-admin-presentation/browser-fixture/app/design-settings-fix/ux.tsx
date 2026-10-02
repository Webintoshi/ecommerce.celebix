"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  normalizeStarterThemeCompositionV4,
  type HomepageSectionId,
  type StorefrontAsset,
  type StorefrontDesignAssetOption,
  type StorefrontDesignDocument,
  type StorefrontDesignEditorMediaOption,
  type StorefrontDesignMediaOption,
} from "@celebix/saas-contracts";
import { DesignSettingsModal } from "@/components/settings/design/DesignSettingsDrawer";
import { DesignStepEditor } from "@/components/settings/design/DesignStepEditor";
import { HomepageSectionEditor } from "@/components/settings/design/HomepageBuilder";
import { designCanvasSurface, type DesignCanvasTrigger } from "@/components/settings/design/design-surface-model";
import { initialDesignFixture } from "./fixture-data";
import { fixtureCategoryIds, fixtureDestinations } from "./catalog-fixture";

// These URLs are presentation data only. They never pass through a transport parser.
const IMAGES = [
  ["product-dantel-bluz.webp", "Dantel bluz"],
  ["product-ekru-triko.webp", "Ekru triko"],
  ["product-antrasit-jean.webp", "Antrasit jean"],
  ["product-mavi-jean.webp", "Mavi jean"],
] as const;
const LOCAL_MEDIA: readonly StorefrontDesignMediaOption[] = IMAGES.map(([filename, altText], index) => ({
  id: `99000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  url: `/seo-assets/${filename}`,
  altText,
  mediaType: "image/webp",
  width: 800,
  height: 1000,
}));
const LOCAL_ASSETS: readonly StorefrontDesignAssetOption[] = IMAGES.map(([filename, altText], index) => ({
  id: `99000000-0000-4000-8000-${String(index + 20).padStart(12, "0")}`,
  kind: index < 2 ? "hero" : "category",
  url: `/seo-assets/${filename}`,
  altText,
  mediaType: "image/webp",
  width: 800,
  height: 1000,
}));

function makeDesign(): StorefrontDesignDocument {
  const original = initialDesignFixture().design;
  const composition = normalizeStarterThemeCompositionV4(original.composition);
  const sections = composition.sections.map((section) => {
    if (section.kind === "banner") return { ...section, slides: section.slides.map((slide) => ({ ...slide, desktopImage: { kind: "media" as const, mediaId: LOCAL_MEDIA[1]!.id } })) };
    if (section.kind === "category_grid") return { ...section, categoryImages: section.categoryIds.map((categoryId, index) => ({ categoryId, assetId: LOCAL_ASSETS[index % 2 + 2]!.id })) };
    if (section.kind === "brand_story") return { ...section, assetId: LOCAL_ASSETS[0]!.id };
    return section;
  });
  return {
    ...original,
    brand: { ...original.brand, logo: { kind: "media", mediaId: LOCAL_MEDIA[0]!.id }, favicon: { kind: "media", mediaId: LOCAL_MEDIA[2]!.id }, primaryColor: "#FE6100", accentColor: "#2B2B2B", backgroundColor: "#F8F7F5", textColor: "#2B2B2B" },
    announcement: { ...original.announcement, enabled: true, items: ["Yeni sezon koleksiyonu mağazada"] },
    composition: {
      ...composition,
      announcement: { enabled: true, items: ["Yeni sezon koleksiyonu mağazada"], destination: "/products" },
      navigation: { rootCategoryIds: fixtureCategoryIds.slice(0, 3), rootLinks: fixtureCategoryIds.slice(0, 3).map((resourceId) => ({ kind: "category", resourceId })) },
      sections: [...sections, { kind: "split_campaign", sectionId: "home_ux_campaign", enabled: true, panels: [
        { heading: "Yeni sezon", assetId: LOCAL_ASSETS[0]!.id, destination: "/products" },
        { heading: "Seçili parçalar", assetId: LOCAL_ASSETS[1]!.id, destination: "/favorites" },
      ] }],
    },
  };
}

type Choice = "logo" | "brand" | "navigation" | "announcement" | "banner" | "category" | "campaign" | "story" | "footer";
const CHOICES: readonly Readonly<{ key: Choice; label: string; sectionId?: HomepageSectionId }>[] = [
  { key: "logo", label: "Logo" }, { key: "brand", label: "Marka" },
  { key: "navigation", label: "Üst alan ve menü" }, { key: "announcement", label: "Duyuru" },
  { key: "banner", label: "Banner", sectionId: "home_banner_between" },
  { key: "category", label: "Kategori", sectionId: "home_categories_first" },
  { key: "campaign", label: "Kampanya", sectionId: "home_ux_campaign" },
  { key: "story", label: "Hikâye", sectionId: "home_story_last" },
  { key: "footer", label: "Alt alan" },
];

export function DesignUxFixture() {
  const [local, setLocal] = useState(false);
  const [baseline, setBaseline] = useState(makeDesign);
  const [design, setDesign] = useState(baseline);
  const [media, setMedia] = useState<readonly StorefrontDesignMediaOption[]>(LOCAL_MEDIA);
  const [assets, setAssets] = useState<readonly StorefrontDesignAssetOption[]>(LOCAL_ASSETS);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [sectionOverride, setSectionOverride] = useState<HomepageSectionId>();
  const [readOnly, setReadOnly] = useState(false);
  const [failUpload, setFailUpload] = useState(false);
  const [notice, setNotice] = useState("Yerel UX örneği");
  const [pendingCount, setPendingCount] = useState(0);
  const pending = useRef(new Set<string>());
  const returnFocusRef = useRef<DesignCanvasTrigger | null>(null);
  const objectUrls = useRef<string[]>([]);
  const mounted = useRef(true);
  const latest = useRef({ design, readOnly, failUpload }); latest.current = { design, readOnly, failUpload };
  useEffect(() => {
    mounted.current = true;
    setLocal(["localhost", "127.0.0.1", "::1", "[::1]"].includes(window.location.hostname));
    return () => { mounted.current = false; objectUrls.current.forEach((url) => URL.revokeObjectURL(url)); };
  }, []);
  const mediaBusy = useCallback((id: string, busy: boolean) => {
    if (busy) pending.current.add(id); else pending.current.delete(id);
    if (mounted.current) setPendingCount(pending.current.size);
  }, []);
  const upload = useCallback(async (file: File, altText: string): Promise<StorefrontDesignMediaOption> => {
    if (latest.current.readOnly) throw new Error("Salt okunur");
    await new Promise<void>((resolve) => window.setTimeout(resolve, 900));
    if (!mounted.current || latest.current.readOnly) throw new Error("Editör kapatıldı");
    if (latest.current.failUpload) { setFailUpload(false); throw new Error("Yerel örnek yükleme hatası"); }
    const url = URL.createObjectURL(file); objectUrls.current.push(url);
    const created: StorefrontDesignMediaOption = { id: crypto.randomUUID(), url, altText, mediaType: file.type as StorefrontDesignMediaOption["mediaType"], width: 800, height: 1000 };
    if (mounted.current) setMedia((current) => [...current, created]);
    return created;
  }, []);
  const assetUploaded = useCallback((asset: StorefrontAsset) => {
    if (mounted.current) setAssets((current) => [...current.filter((item) => item.id !== asset.id), { id: asset.id, kind: asset.kind, url: asset.publicUrl, altText: asset.altText, mediaType: asset.mediaType, width: asset.width, height: asset.height }]);
  }, []);
  const editorMedia = useMemo<readonly StorefrontDesignEditorMediaOption[]>(() => [
    ...media.map((item) => ({ ...item, reference: { kind: "media" as const, mediaId: item.id } })),
    ...assets.map(({ kind, ...item }) => ({ ...item, assetKind: kind, reference: { kind: "asset" as const, assetId: item.id } })),
  ], [assets, media]);
  const selected = CHOICES.find((item) => item.key === choice);
  const selectedSectionId = sectionOverride ?? selected?.sectionId;
  const banner = design.composition.sections.find((section) => section.kind === "banner");
  const firstSlide = banner?.kind === "banner" ? banner.slides[0] : undefined;
  const bannerMediaId = firstSlide?.desktopImage?.kind === "media" ? firstSlide.desktopImage.mediaId : undefined;
  const bannerAssetId = firstSlide?.desktopImage?.kind === "asset" ? firstSlide.desktopImage.assetId : undefined;
  const bannerImage = bannerMediaId ? media.find((item) => item.id === bannerMediaId)?.url : bannerAssetId ? assets.find((item) => item.id === bannerAssetId)?.url : firstSlide?.desktopImage?.kind === "legacy_https" ? firstSlide.desktopImage.url : undefined;
  const logoMediaId = design.brand.logo?.kind === "media" ? design.brand.logo.mediaId : undefined;
  const logo = logoMediaId ? media.find((item) => item.id === logoMediaId)?.url : design.brand.logo?.kind === "legacy_https" ? design.brand.logo.url : undefined;
  const dirty = JSON.stringify(design) !== JSON.stringify(baseline);
  const open = (next: Choice, trigger: HTMLElement) => { returnFocusRef.current = trigger; setDesign(baseline); setSectionOverride(undefined); setChoice(next); setNotice("Yerel UX örneği"); };
  const close = useCallback(() => { setDesign(baseline); setChoice(null); setNotice("Değişiklikler bırakıldı"); }, [baseline]);
  const apply = () => {
    if (readOnly || pending.current.size > 0 || !dirty) return;
    setBaseline(design); setChoice(null); setNotice("Yerel örneğe uygulandı");
  };
  const onChange = (next: StorefrontDesignDocument) => { if (!latest.current.readOnly) setDesign(next); };

  if (!local) return <main style={{ padding: 24 }}><p role="status">UX örneği yalnız localhost üzerinde açılır.</p></main>;
  return <main className="uxFixture">
    <header className="uxHeader"><div><h1>Tasarım</h1><p role="status">{notice}{pendingCount ? " · Görsel bekleniyor" : dirty ? " · Değişiklik var" : ""}</p></div><div className="uxChecks">
      <label><input type="checkbox" checked={readOnly} onChange={(event) => setReadOnly(event.currentTarget.checked)} /> Salt okunur</label>
      <label><input type="checkbox" checked={failUpload} onChange={(event) => setFailUpload(event.currentTarget.checked)} /> İlk yükleme hatası</label>
    </div></header>
    <nav className="uxChoices" aria-label="UX doğrulama alanları">{CHOICES.map((item) => <button key={item.key} type="button" onClick={(event) => open(item.key, event.currentTarget)}>{item.label}</button>)}</nav>
    <section className="uxCanvas" aria-label="Yerel mağaza önizlemesi">
      <button className="uxAnnouncement" type="button" onClick={(event) => open("announcement", event.currentTarget)}>{design.composition.announcement.enabled ? design.composition.announcement.items.join(" · ") : "Duyuru gizli"}</button>
      <header className="uxStoreHeader"><button type="button" onClick={(event) => open("logo", event.currentTarget)}>{logo ? <img src={logo} alt="Yerel mağaza logosu" /> : "CELEBIX"}</button><button type="button" onClick={(event) => open("navigation", event.currentTarget)}>Kolyeler · Bileklikler · Küpeler</button><span>♡ &nbsp; Sepet</span></header>
      <button className="uxBanner" type="button" onClick={(event) => open("banner", event.currentTarget)}>{bannerImage ? <img src={bannerImage} alt="Yerel banner örneği" /> : null}<span><small>YENİ SEZON</small><strong>{firstSlide?.headline || "Koleksiyonlarımızı keşfedin"}</strong><span>{firstSlide?.body}</span></span></button>
      <div className="uxProducts">{LOCAL_MEDIA.slice(0, 3).map((item) => <button key={item.id} type="button" onClick={(event) => open("category", event.currentTarget)}><img src={item.url} alt={item.altText} /><span>{item.altText}</span></button>)}</div>
    </section>
    <DesignSettingsModal open={choice !== null} surface={selectedSectionId ? { label: selected?.label ?? "Bölüm", hint: "Yerel örnek tasarımı düzenleyin." } : designCanvasSurface(choice === "logo" ? "brand" : choice === "brand" ? "style" : choice === "navigation" ? "navigation" : choice === "footer" ? "footer" : "announcement")} returnFocusRef={returnFocusRef} onClose={close} onApply={apply} applyDisabled={readOnly || pendingCount > 0 || !dirty}>
      {choice && selectedSectionId ? <HomepageSectionEditor key={selectedSectionId} design={design} sectionId={selectedSectionId} media={editorMedia} assets={assets} destinations={fixtureDestinations} disabled={readOnly} onChange={onChange} onSelectSection={setSectionOverride} onUpload={upload} onMediaBusyChange={mediaBusy} onAssetUploaded={assetUploaded} /> : choice ? <DesignStepEditor step={choice === "logo" ? "brand" : choice === "brand" ? "style" : choice === "footer" ? "footer" : "navigation"} surface={choice === "logo" ? "brand" : choice === "brand" ? "style" : choice} design={design} storeName="Yerel UX Mağazası" timezone="Europe/Istanbul" media={media} assets={assets} destinations={fixtureDestinations} canManage={!readOnly} previewMode="desktop" onChange={onChange} onUpload={upload} onMediaBusyChange={mediaBusy} onAssetUploaded={assetUploaded} /> : null}
    </DesignSettingsModal>
    <style jsx>{`
      .uxFixture { min-height: 100vh; padding: 24px; color: var(--cp-text-primary); background: var(--cp-canvas); }
      .uxHeader { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
      .uxHeader h1 { margin: 0; font-size: 24px; font-weight: 650; }
      .uxHeader p { margin: 8px 0 0; color: var(--cp-text-secondary); font-size: 12px; }
      .uxChecks { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
      .uxChecks label { display: flex; min-height: 44px; align-items: center; gap: 8px; font-size: 12px; }
      .uxChecks input { accent-color: var(--cp-graphite); }
      .uxChoices { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
      .uxChoices button { min-height: 44px; border: 1px solid var(--cp-border); border-radius: 8px; padding: 8px 16px; color: var(--cp-text-primary); background: var(--cp-surface); font: inherit; font-size: 13px; cursor: pointer; }
      .uxCanvas { max-width: 1200px; min-width: 0; margin: auto; border: 1px solid var(--cp-border); border-radius: 12px; overflow: hidden; background: var(--cp-surface); }
      .uxCanvas button { color: inherit; font: inherit; cursor: pointer; }
      .uxAnnouncement { display: block; width: 100%; min-height: 44px; border: 0; padding: 8px 16px; background: var(--cp-graphite); color: var(--cp-text-inverse) !important; font-size: 12px !important; }
      .uxStoreHeader { display: flex; min-height: 80px; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 24px; font-size: 13px; }
      .uxStoreHeader button { min-height: 44px; border: 0; padding: 8px; background: transparent; }
      .uxStoreHeader button:first-child { font-size: 20px; font-weight: 650; letter-spacing: 4px; }
      .uxStoreHeader button:first-child img { display: block; width: 112px; height: 44px; object-fit: contain; }
      .uxBanner { position: relative; display: flex; width: 100%; min-height: 360px; align-items: center; border: 0; padding: 40px; overflow: hidden; background: var(--cp-soft); text-align: left; }
      .uxBanner > img { position: absolute; inset: 0 0 0 auto; width: 48%; height: 100%; object-fit: cover; }
      .uxBanner > span { position: relative; display: grid; max-width: 48%; gap: 16px; }
      .uxBanner strong { font-size: 32px; font-weight: 600; line-height: 1.2; }
      .uxBanner small { font-size: 12px; letter-spacing: 2px; }
      .uxProducts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; padding: 24px; }
      .uxProducts button { display: grid; min-width: 0; gap: 12px; border: 0; padding: 0; background: transparent; text-align: left; font-size: 13px; }
      .uxProducts img { width: 100%; height: 240px; border-radius: 8px; object-fit: cover; }
      .uxFixture button:focus-visible, .uxFixture input:focus-visible { outline: 2px solid var(--cp-brand); outline-offset: 4px; }
      @media (max-width: 700px) { .uxFixture { padding: 16px; } .uxHeader { align-items: flex-start; flex-direction: column; } .uxStoreHeader { flex-wrap: wrap; padding: 12px; } .uxStoreHeader > span { display: none; } .uxBanner { min-height: 320px; padding: 24px; } .uxBanner strong { font-size: 24px; } .uxProducts { gap: 8px; padding: 16px; } .uxProducts img { height: 160px; } }
    `}</style>
  </main>;
}
