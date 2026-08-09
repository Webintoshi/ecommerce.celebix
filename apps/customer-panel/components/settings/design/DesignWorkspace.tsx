"use client";

import { Monitor, Smartphone } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getStorefrontDesignPublishIssue, type StorefrontDesignDocument, type StorefrontDesignMediaOption, type StorefrontDesignWorkspace } from "@celebix/saas-contracts";

import { PanelTopbarBridge } from "@/components/panel/PanelTopbarChrome";
import { StorefrontDesignApiError, storefrontDesignApi } from "@/lib/storefront-design-ui/client";
import { DesignPreview } from "./DesignPreview";
import { DesignStepEditor } from "./DesignStepEditor";
import {
  defaultStepForDesignArea,
  designWorkspaceAreas,
  designWorkspaceSteps,
  type DesignWorkspaceLocation,
} from "./workspace-navigation-model";
import { applyDesignEdit, beginDesignSave, completeDesignSave, createDesignEditorState, type DesignSaveToken } from "./workspace-model";
import styles from "../design-settings.module.css";

const STATUS_LABEL = Object.freeze({ saved: "Taslak kaydedildi", dirty: "Yayınlanmamış değişiklik", saving: "Kaydediliyor", publishing: "Yayınlanıyor", error: "Kaydedilemedi", conflict: "Başka bir oturumda değişti" } as const);

export function DesignWorkspace({ workspace, canManage, initialLocation = Object.freeze({ area: "site", step: "brand" }) }: Readonly<{ workspace: StorefrontDesignWorkspace; canManage: boolean; initialLocation?: DesignWorkspaceLocation }>) {
  const [editor, setEditor] = useState(() => createDesignEditorState(workspace));
  const [location, setLocation] = useState<DesignWorkspaceLocation>(initialLocation);
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

  const topbarActions = useMemo(() => <div className={styles.topbarActions}><div className={styles.previewSwitch} role="group" aria-label="Önizleme boyutu"><button type="button" className={previewMode === "desktop" ? styles.active : ""} onClick={() => setPreviewMode("desktop")}><Monitor size={17} />Masaüstü</button><button type="button" className={previewMode === "mobile" ? styles.active : ""} onClick={() => setPreviewMode("mobile")}><Smartphone size={17} />Mobil</button></div><button type="button" className={styles.publishButton} title={publishIssueLabel ?? undefined} disabled={!canManage || publishIssue !== null || ["saving", "publishing", "conflict"].includes(editor.status)} onClick={() => void publish()}>Yayınla</button></div>, [canManage, editor.status, previewMode, publish, publishIssue, publishIssueLabel]);

  const areas = designWorkspaceAreas(location.area);
  const steps = designWorkspaceSteps(location.area, location.step);
  const selectedStep = steps.find(({ selected }) => selected) ?? steps[0]!;

  return <section className={styles.workspace} data-panel-layout="open-canvas">
    <PanelTopbarBridge title="Tasarım" subtitle={publishIssueLabel ?? STATUS_LABEL[editor.status]} actions={topbarActions} />
    <nav className={styles.areaSwitch} aria-label="Tasarım alanı">{areas.map((area) => <button type="button" key={area.key} className={area.selected ? styles.active : ""} aria-pressed={area.selected} onClick={() => setLocation({ area: area.key, step: defaultStepForDesignArea(area.key) })}><strong>{area.label}</strong><span>{area.hint}</span></button>)}</nav>
    <aside className={styles.stepRail}><p>{location.area === "site" ? "Tüm site ayarları" : "Ana sayfa ayarları"}</p><nav aria-label="Tasarım adımları">{steps.map((step, index) => <button type="button" key={step.key} className={step.selected ? styles.active : ""} aria-current={step.selected ? "step" : undefined} onClick={() => setLocation({ area: location.area, step: step.key })}><span>{index + 1}</span><span><strong>{step.label}</strong><small>{step.hint}</small></span></button>)}</nav></aside>
    <div className={styles.inspector}><header className={styles.stepIntro}><span>{location.area === "site" ? "Tüm site" : "Ana sayfa"}</span><h2>{selectedStep.label}</h2><p>{selectedStep.hint}</p></header><DesignStepEditor step={location.step} design={editor.design} storeName={workspace.store.name} timezone={workspace.store.timezone} media={media} destinations={workspace.destinations} canManage={canManage} onChange={change} onUpload={upload} /></div>
    <main className={styles.preview}><DesignPreview design={editor.design} storeName={workspace.store.name} publishedVersion={publishedVersionRef.current} publishedAt={workspace.publishedAt} media={media} destinations={workspace.destinations} mode={previewMode} now={nowRef.current} /></main>
  </section>;
}
