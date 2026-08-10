"use client";

import { Layers3, Monitor, Smartphone } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getStorefrontDesignPublishIssue, type StorefrontDesignDocument, type StorefrontDesignMediaOption, type StorefrontDesignWorkspace } from "@celebix/saas-contracts";

import { PanelTopbarBridge } from "@/components/panel/PanelTopbarChrome";
import { StorefrontDesignApiError, storefrontDesignApi } from "@/lib/storefront-design-ui/client";
import { DesignPreview } from "./DesignPreview";
import { DesignSettingsDrawer } from "./DesignSettingsDrawer";
import { DesignStepEditor } from "./DesignStepEditor";
import {
  type DesignWorkspaceLocation,
} from "./workspace-navigation-model";
import {
  DESIGN_CANVAS_SURFACES,
  designCanvasSurface,
  designCanvasSurfaceForLocation,
  type DesignCanvasSurface,
} from "./design-surface-model";
import { applyDesignEdit, beginDesignSave, completeDesignSave, createDesignEditorState, type DesignSaveToken } from "./workspace-model";
import styles from "../design-settings.module.css";

const STATUS_LABEL = Object.freeze({ saved: "Taslak kaydedildi", dirty: "Yayınlanmamış değişiklik", saving: "Kaydediliyor", publishing: "Yayınlanıyor", error: "Kaydedilemedi", conflict: "Başka bir oturumda değişti" } as const);

export function DesignWorkspace({ workspace, canManage, initialLocation = Object.freeze({ area: "site", step: "brand" }) }: Readonly<{ workspace: StorefrontDesignWorkspace; canManage: boolean; initialLocation?: DesignWorkspaceLocation }>) {
  const [editor, setEditor] = useState(() => createDesignEditorState(workspace));
  const [location, setLocation] = useState<DesignWorkspaceLocation>(initialLocation);
  const [selectedSurface, setSelectedSurface] = useState<DesignCanvasSurface>(() => designCanvasSurfaceForLocation(initialLocation).key);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [media, setMedia] = useState(workspace.media);
  const editorRef = useRef(editor);
  const draftVersionRef = useRef(workspace.draftVersion);
  const publishedVersionRef = useRef(workspace.publishedVersion);
  const savedRevisionRef = useRef(0);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const nowRef = useRef(new Date());
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  editorRef.current = editor;

  useEffect(() => () => { mountedRef.current = false; if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const queueSave = useCallback((design: StorefrontDesignDocument, revision: number) => {
    const token: DesignSaveToken = Object.freeze({ design, revision });
    if (mountedRef.current) setEditor((current) => beginDesignSave(current).state);
    const job = saveChainRef.current.catch(() => undefined).then(async () => {
      const result = await storefrontDesignApi.saveDraft({ expectedDraftVersion: draftVersionRef.current, design });
      draftVersionRef.current = result.draftVersion;
      savedRevisionRef.current = Math.max(savedRevisionRef.current, revision);
      if (mountedRef.current) setEditor((current) => completeDesignSave(current, token, result));
    }).catch((error: unknown) => {
      if (!mountedRef.current) return;
      setEditor((current) => ({ ...current, status: error instanceof StorefrontDesignApiError && error.code === "version_conflict" ? "conflict" : "error" }));
      throw error;
    });
    saveChainRef.current = job.catch(() => undefined);
    return job;
  }, []);

  useEffect(() => {
    if (!canManage || editor.revision <= savedRevisionRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const snapshot = editor.design, revision = editor.revision;
    timerRef.current = setTimeout(() => { timerRef.current = null; void queueSave(snapshot, revision).catch(() => undefined); }, 700);
    return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  }, [canManage, editor.design, editor.revision, queueSave]);

  const change = useCallback((design: StorefrontDesignDocument) => setEditor((current) => applyDesignEdit(current, design)), []);
  const upload = useCallback(async (file: File, altText: string): Promise<StorefrontDesignMediaOption> => {
    const created = await storefrontDesignApi.uploadMedia({ file, altText });
    setMedia((current) => Object.freeze([...current.filter(({ id }) => id !== created.id), created]));
    return created;
  }, []);
  const publish = useCallback(async () => {
    if (!canManage || editorRef.current.status === "publishing") return;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    await saveChainRef.current;
    if (editorRef.current.revision > savedRevisionRef.current) await queueSave(editorRef.current.design, editorRef.current.revision);
    if (!mountedRef.current) return;
    setEditor((current) => ({ ...current, status: "publishing" }));
    try {
      const result = await storefrontDesignApi.publish({ expectedDraftVersion: draftVersionRef.current, expectedPublishedVersion: publishedVersionRef.current });
      publishedVersionRef.current = result.publishedVersion;
      setEditor((current) => ({ ...current, publishedVersion: result.publishedVersion, status: "saved" }));
    } catch (error) {
      setEditor((current) => ({ ...current, status: error instanceof StorefrontDesignApiError && error.code === "version_conflict" ? "conflict" : "error" }));
    }
  }, [canManage, queueSave]);

  const publishIssue = useMemo(() => getStorefrontDesignPublishIssue(editor.design), [editor.design]);
  const publishIssueLabel = publishIssue?.code === "hero_enabled_slide_missing" ? "En az bir bannerı açın" : publishIssue?.code === "hero_slide_headline_missing" ? `${(publishIssue.slideIndex ?? 0) + 1}. banner başlığı gerekli` : publishIssue?.code === "hero_slide_desktop_image_missing" ? `${(publishIssue.slideIndex ?? 0) + 1}. banner görseli gerekli` : null;

  const selectSurface = useCallback((surface: DesignCanvasSurface, trigger?: HTMLButtonElement) => {
    returnFocusRef.current = trigger ?? null;
    setSelectedSurface(surface);
    setLocation(designCanvasSurface(surface).location);
    setDrawerOpen(true);
  }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const selected = useMemo(() => designCanvasSurface(selectedSurface), [selectedSurface]);

  const topbarActions = useMemo(() => <div className={styles.topbarActions}>
    <details className={styles.surfaceMenu}><summary><Layers3 size={17} />Alanlar</summary><div>{DESIGN_CANVAS_SURFACES.map((surface) => <button type="button" key={surface.key} aria-current={surface.key === selectedSurface ? "true" : undefined} onClick={(event) => { selectSurface(surface.key, event.currentTarget); event.currentTarget.closest("details")?.removeAttribute("open"); }}><strong>{surface.label}</strong><span>{surface.hint}</span></button>)}</div></details>
    <div className={styles.previewSwitch} role="group" aria-label="Önizleme boyutu"><button type="button" className={previewMode === "desktop" ? styles.active : ""} onClick={() => setPreviewMode("desktop")}><Monitor size={17} />Masaüstü</button><button type="button" className={previewMode === "mobile" ? styles.active : ""} onClick={() => setPreviewMode("mobile")}><Smartphone size={17} />Mobil</button></div>
    <button type="button" className={styles.publishButton} title={publishIssueLabel ?? undefined} disabled={!canManage || publishIssue !== null || ["saving", "publishing", "conflict"].includes(editor.status)} onClick={() => void publish()}>Yayınla</button>
  </div>, [canManage, editor.status, previewMode, publish, publishIssue, publishIssueLabel, selectSurface, selectedSurface]);

  return <section className={styles.workspace} data-panel-layout="open-canvas">
    <PanelTopbarBridge title="Tasarım" subtitle={publishIssueLabel ?? STATUS_LABEL[editor.status]} actions={topbarActions} />
    <main className={styles.canvasStage}><DesignPreview design={editor.design} storeName={workspace.store.name} publishedVersion={publishedVersionRef.current} publishedAt={workspace.publishedAt} media={media} destinations={workspace.destinations} mode={previewMode} now={nowRef.current} selectedSurface={drawerOpen ? selectedSurface : undefined} onSelectSurface={selectSurface} /></main>
    <DesignSettingsDrawer open={drawerOpen} surface={selected} onClose={closeDrawer} returnFocusRef={returnFocusRef}><DesignStepEditor step={location.step} design={editor.design} storeName={workspace.store.name} timezone={workspace.store.timezone} media={media} destinations={workspace.destinations} canManage={canManage} onChange={change} onUpload={upload} /></DesignSettingsDrawer>
  </section>;
}
