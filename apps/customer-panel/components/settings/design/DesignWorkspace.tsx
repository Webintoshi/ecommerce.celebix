"use client";

import { Layers3, Monitor, Smartphone } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getStorefrontDesignPublishIssue, type StorefrontDesignDocument, type StorefrontDesignMediaOption, type StorefrontDesignWorkspace } from "@celebix/saas-contracts";

import { PanelTopbarBridge } from "@/components/panel/PanelTopbarChrome";
import { createDirtyNavigationGuard } from "../../../lib/catalog-ui/dirty-navigation.ts";
import { StorefrontDesignApiError, storefrontDesignApi } from "@/lib/storefront-design-ui/client";
import type { StorefrontDesignPreviewResources } from "@/lib/storefront-design-preview-model";
import { useStorefrontDesignPreviewResources } from "@/lib/storefront-design-preview-ui/use-preview-resources";
import { DesignPreview } from "./DesignPreview";
import { DesignSettingsModal } from "./DesignSettingsDrawer";
import { DesignStepEditor } from "./DesignStepEditor";
import {
  type DesignWorkspaceLocation,
} from "./workspace-navigation-model";
import {
  DESIGN_CANVAS_SURFACES,
  designCanvasSurface,
  designCanvasSurfaceForLocation,
  type DesignCanvasSurface,
  type DesignCanvasTrigger,
} from "./design-surface-model";
import { applyDesignEdit, beginDesignSave, compareDesignDrafts, completeDesignSave, createDesignEditorState, type DesignEditorState, type DesignSaveToken } from "./workspace-model";
import { forgetNavigationDraft, readNavigationDraft, retainNavigationDraft } from "./draft-navigation-recovery.ts";
import styles from "../design-settings.module.css";

const STATUS_LABEL = Object.freeze({ saved: "Taslak kaydedildi", dirty: "Yayınlanmamış değişiklik", saving: "Kaydediliyor", publishing: "Yayınlanıyor", error: "Kaydedilemedi", conflict: "Başka bir oturumda değişti" } as const);

export function DesignWorkspaceToolbar({ selectedSurface, previewMode, publishDisabled, publishIssueLabel, onSelectSurface, onPreviewModeChange, onPublish }: Readonly<{
  selectedSurface: DesignCanvasSurface;
  previewMode: "desktop" | "mobile";
  publishDisabled: boolean;
  publishIssueLabel: string | null;
  onSelectSurface: (surface: DesignCanvasSurface, trigger?: DesignCanvasTrigger) => void;
  onPreviewModeChange: (mode: "desktop" | "mobile") => void;
  onPublish: () => void;
}>) {
  return <div className={styles.topbarActions} role="toolbar" aria-label="Tasarım önizleme araçları" data-design-toolbar="true">
    <details className={styles.surfaceMenu}><summary tabIndex={0} aria-label="Tasarım alanlarını aç"><Layers3 size={17} aria-hidden="true" />Alanlar</summary><div>{DESIGN_CANVAS_SURFACES.map((surface) => <button type="button" key={surface.key} aria-current={surface.key === selectedSurface ? "true" : undefined} onClick={(event) => { const menu = event.currentTarget.closest("details"); const summary = menu?.querySelector<HTMLElement>("summary"); onSelectSurface(surface.key, summary ?? event.currentTarget); menu?.removeAttribute("open"); }}><strong>{surface.label}</strong><span>{surface.hint}</span></button>)}</div></details>
    <div className={styles.previewSwitch} role="group" aria-label="Önizleme boyutu"><button type="button" className={previewMode === "desktop" ? styles.active : ""} aria-pressed={previewMode === "desktop"} onClick={() => onPreviewModeChange("desktop")}><Monitor size={17} aria-hidden="true" />Masaüstü</button><button type="button" className={previewMode === "mobile" ? styles.active : ""} aria-pressed={previewMode === "mobile"} onClick={() => onPreviewModeChange("mobile")}><Smartphone size={17} aria-hidden="true" />Mobil</button></div>
    <button type="button" className={styles.publishButton} title={publishIssueLabel ?? undefined} disabled={publishDisabled} onClick={onPublish}>Yayınla</button>
  </div>;
}

export function DesignWorkspace({ workspace, initialPreviewResources, canManage, recoveryScope, initialLocation = Object.freeze({ area: "site", step: "brand" }) }: Readonly<{ workspace: StorefrontDesignWorkspace; initialPreviewResources: StorefrontDesignPreviewResources; canManage: boolean; recoveryScope?: string; initialLocation?: DesignWorkspaceLocation }>) {
  const [editor, setEditor] = useState<DesignEditorState>(() => {
    const retained = canManage ? readNavigationDraft(recoveryScope) : undefined;
    // Remounted server props may themselves be a client-router cache entry.
    // Always require a fresh comparison before writing a recovered local draft.
    return retained ? { ...retained, status: "conflict" } : createDesignEditorState(workspace);
  });
  const [location, setLocation] = useState<DesignWorkspaceLocation>(initialLocation);
  const [selectedSurface, setSelectedSurface] = useState<DesignCanvasSurface>(() => designCanvasSurfaceForLocation(initialLocation).key);
  const [modalOpen, setModalOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [media, setMedia] = useState(workspace.media);
  const [recovery, setRecovery] = useState<StorefrontDesignWorkspace | null>(null);
  const [message, setMessage] = useState(editor.status === "conflict" ? "Kaydedilmemiş değişiklikleriniz geri getirildi. Kaydetmeden önce güncel taslakla karşılaştırın." : "");
  const [navigationRecovered, setNavigationRecovered] = useState(editor.status === "conflict");
  const [busyPublishing, setBusyPublishing] = useState(false);
  const [readingLatest, setReadingLatest] = useState(false);
  const [publishedAt, setPublishedAt] = useState(workspace.publishedAt);
  const [publishedRevision, setPublishedRevision] = useState<number | null>(null);
  const [failedOperation, setFailedOperation] = useState<"save" | "publish">("save");
  const previewResources = useStorefrontDesignPreviewResources(editor.design.composition, initialPreviewResources);
  const editorRef = useRef(editor);
  const draftVersionRef = useRef(editor.draftVersion);
  const publishedVersionRef = useRef(workspace.publishedVersion);
  const savedRevisionRef = useRef(editor.savedRevision);
  const saveChainRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const nowRef = useRef(new Date());
  const returnFocusRef = useRef<DesignCanvasTrigger | null>(null);
  const epochRef = useRef(0);
  const abandonedRef = useRef(false);
  const failureRef = useRef<"error" | "conflict" | null>(editor.status === "conflict" ? "conflict" : null);
  const publishLockRef = useRef(false);
  const readingRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const canManageRef = useRef(canManage);
  canManageRef.current = canManage;

  const update = useCallback((transform: (current: DesignEditorState) => DesignEditorState) => {
    editorRef.current = transform(editorRef.current);
    if (mountedRef.current) setEditor(editorRef.current);
  }, []);
  const cancelTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    const guard = createDirtyNavigationGuard({
      isDirty: () => !abandonedRef.current && (editorRef.current.revision > savedRevisionRef.current || publishLockRef.current),
      confirm: () => {
        if (requestRef.current || publishLockRef.current) {
          setMessage("İşlem sürüyor. Ayrılmadan önce tamamlanmasını bekleyin.");
          return false;
        }
        if (!window.confirm("Kaydedilmemiş tasarım değişiklikleriniz var. Bu değişiklikleri bırakıp ayrılmak istiyor musunuz?")) return false;
        abandonedRef.current = true;
        forgetNavigationDraft(recoveryScope);
        epochRef.current += 1;
        cancelTimer();
        return true;
      },
    });
    const unload = guard.bindBeforeUnload(window);
    const navigation = guard.bindApplicationNavigation(document, () => window.location.href);
    return () => {
      if (abandonedRef.current) forgetNavigationDraft(recoveryScope);
      else retainNavigationDraft(recoveryScope, editorRef.current);
      mountedRef.current = false;
      epochRef.current += 1;
      cancelTimer(); requestRef.current?.abort();
      unload(); navigation();
    };
  }, [cancelTimer, recoveryScope]);

  const fail = useCallback((error: unknown, operation: "save" | "publish" = "save") => {
    const status = error instanceof StorefrontDesignApiError && error.code === "version_conflict" ? "conflict" : "error";
    failureRef.current = status;
    setNavigationRecovered(false);
    setFailedOperation(operation);
    cancelTimer();
    setRecovery(null);
    setMessage(error instanceof StorefrontDesignApiError ? error.message : "Tasarım işlemi tamamlanamadı. Değişiklikleriniz bu sayfada korunuyor.");
    update((current) => ({ ...current, status }));
  }, [cancelTimer, update]);

  const queueSave = useCallback((design: StorefrontDesignDocument, revision: number) => {
    const token: DesignSaveToken = Object.freeze({ design, revision });
    const epoch = epochRef.current;
    const job = saveChainRef.current.then(async () => {
      if (!mountedRef.current || abandonedRef.current || epoch !== epochRef.current || !canManageRef.current || failureRef.current) return false;
      if (revision <= savedRevisionRef.current) return true;
      const controller = new AbortController();
      requestRef.current = controller;
      update((current) => beginDesignSave(current).state);
      try {
        const result = await storefrontDesignApi.saveDraft({ expectedDraftVersion: draftVersionRef.current, design }, controller.signal);
        if (!mountedRef.current || epoch !== epochRef.current) return false;
        draftVersionRef.current = result.draftVersion;
        savedRevisionRef.current = Math.max(savedRevisionRef.current, revision);
        update((current) => completeDesignSave(current, token, result));
        if (editorRef.current.revision <= savedRevisionRef.current) forgetNavigationDraft(recoveryScope);
        setMessage("");
        return true;
      } catch (error) {
        if (mountedRef.current && epoch === epochRef.current) fail(error);
        return false;
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
      }
    });
    saveChainRef.current = job;
    return job;
  }, [fail, recoveryScope, update]);

  useEffect(() => {
    if (!canManage || abandonedRef.current || failureRef.current || publishLockRef.current || editor.revision <= savedRevisionRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const snapshot = editor.design, revision = editor.revision;
    timerRef.current = setTimeout(() => { timerRef.current = null; void queueSave(snapshot, revision); }, 700);
    return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  }, [canManage, editor.design, editor.revision, queueSave]);

  const change = useCallback((design: StorefrontDesignDocument) => {
    if (!canManageRef.current || abandonedRef.current || publishLockRef.current) return;
    update((current) => ({ ...applyDesignEdit(current, design), ...(failureRef.current ? { status: failureRef.current } : {}) }));
  }, [update]);
  const upload = useCallback(async (file: File, altText: string): Promise<StorefrontDesignMediaOption> => {
    if (!canManageRef.current || abandonedRef.current || publishLockRef.current) throw new StorefrontDesignApiError("membership_denied", 403);
    const created = await storefrontDesignApi.uploadMedia({ file, altText });
    setMedia((current) => Object.freeze([...current.filter(({ id }) => id !== created.id), created]));
    return created;
  }, []);
  const publish = useCallback(async () => {
    if (!canManageRef.current || abandonedRef.current || publishLockRef.current || failureRef.current || getStorefrontDesignPublishIssue(editorRef.current.design)) return;
    publishLockRef.current = true;
    setBusyPublishing(true);
    cancelTimer();
    try {
      if (!await saveChainRef.current) return;
      if (editorRef.current.revision > savedRevisionRef.current && !await queueSave(editorRef.current.design, editorRef.current.revision)) return;
      if (!mountedRef.current || abandonedRef.current || !canManageRef.current) return;
      update((current) => ({ ...current, status: "publishing" }));
      const controller = new AbortController();
      requestRef.current = controller;
      const result = await storefrontDesignApi.publish({ expectedDraftVersion: draftVersionRef.current, expectedPublishedVersion: publishedVersionRef.current }, controller.signal);
      if (!mountedRef.current) return;
      publishedVersionRef.current = result.publishedVersion;
      setPublishedAt(result.publishedAt);
      setPublishedRevision(editorRef.current.revision);
      setMessage("");
      update((current) => ({ ...current, publishedVersion: result.publishedVersion, status: "saved" }));
    } catch (error) {
      if (mountedRef.current) fail(error, "publish");
    } finally {
      requestRef.current = null;
      publishLockRef.current = false;
      if (mountedRef.current) setBusyPublishing(false);
    }
  }, [cancelTimer, fail, queueSave, update]);

  const retrySave = useCallback(async () => {
    if (!canManageRef.current || abandonedRef.current || requestRef.current || publishLockRef.current || failureRef.current !== "error") return;
    failureRef.current = null;
    setMessage("");
    update((current) => ({ ...current, status: current.revision > savedRevisionRef.current ? "dirty" : "saved" }));
    await queueSave(editorRef.current.design, editorRef.current.revision);
  }, [queueSave, update]);
  const compareLatest = useCallback(async () => {
    if (!canManageRef.current || abandonedRef.current || readingRef.current || failureRef.current !== "conflict") return;
    readingRef.current = true;
    setReadingLatest(true);
    const epoch = epochRef.current;
    try {
      const latest = await storefrontDesignApi.workspace();
      if (mountedRef.current && epoch === epochRef.current) { setRecovery(latest); setMessage(""); }
    } catch (error) {
      if (mountedRef.current && epoch === epochRef.current) setMessage(error instanceof StorefrontDesignApiError ? error.message : "Güncel taslak yüklenemedi. Yeniden deneyin.");
    } finally {
      readingRef.current = false;
      if (mountedRef.current) setReadingLatest(false);
    }
  }, []);
  const resolveConflict = useCallback(async (overwrite: boolean) => {
    if (!canManageRef.current || abandonedRef.current || !recovery || requestRef.current || failureRef.current !== "conflict") return;
    cancelTimer();
    epochRef.current += 1;
    failureRef.current = null;
    draftVersionRef.current = recovery.draftVersion;
    setNavigationRecovered(false);
    publishedVersionRef.current = recovery.publishedVersion;
    setPublishedAt(recovery.publishedAt);
    setPublishedRevision(null);
    setMedia(recovery.media);
    setRecovery(null); setMessage("");
    if (overwrite) {
      // A fresh expected version is used only after this explicit overwrite choice.
      // Another remote edit still fails through the server's ordinary version check.
      update((current) => ({ ...current, revision: current.revision + 1, draftVersion: recovery.draftVersion, publishedVersion: recovery.publishedVersion, status: "dirty" }));
      await queueSave(editorRef.current.design, editorRef.current.revision);
    } else {
      forgetNavigationDraft(recoveryScope);
      savedRevisionRef.current = 0;
      update(() => createDesignEditorState(recovery));
      saveChainRef.current = Promise.resolve(true);
    }
  }, [cancelTimer, queueSave, recovery, recoveryScope, update]);

  const publishIssue = useMemo(() => getStorefrontDesignPublishIssue(editor.design), [editor.design]);
  const publishIssueLabel = publishIssue?.code === "hero_enabled_slide_missing" ? "En az bir bannerı açın" : publishIssue?.code === "hero_slide_headline_missing" ? `${(publishIssue.slideIndex ?? 0) + 1}. banner başlığı gerekli` : publishIssue?.code === "hero_slide_desktop_image_missing" ? `${(publishIssue.slideIndex ?? 0) + 1}. banner görseli gerekli` : null;

  const selectSurface = useCallback((surface: DesignCanvasSurface, trigger?: DesignCanvasTrigger) => {
    returnFocusRef.current = trigger ?? null;
    setSelectedSurface(surface);
    setLocation(designCanvasSurface(surface).location);
    setModalOpen(true);
  }, []);
  const closeModal = useCallback(() => setModalOpen(false), []);
  const selected = useMemo(() => designCanvasSurface(selectedSurface), [selectedSurface]);

  const publishDisabled = !canManage || busyPublishing || publishIssue !== null || ["saving", "publishing", "conflict", "error"].includes(editor.status);
  const statusLabel = editor.status === "conflict" && navigationRecovered ? "Kaydedilmemiş taslak geri getirildi" : editor.status === "error" && failedOperation === "publish" ? "Yayınlanamadı" : editor.status === "saved" && publishedRevision === editor.revision ? "Yayınlandı" : STATUS_LABEL[editor.status];
  const differences = useMemo(() => recovery ? compareDesignDrafts(editor.design, recovery.draft) : [], [editor.design, recovery]);
  const recoveryControls = <>
    {message && <p role="alert">{message}</p>}
    {editor.status === "error" && (failedOperation === "publish"
      ? <button type="button" disabled={!canManage} onClick={() => void retrySave().then(publish)}>Yayınlamayı yeniden dene</button>
      : <button type="button" disabled={!canManage} onClick={() => void retrySave()}>Kaydetmeyi yeniden dene</button>)}
    {editor.status === "conflict" && <section className={styles.conflictRecovery} aria-label="Taslak çakışmasını çöz">
      <p>Yerel değişiklikleriniz korunuyor. Güncel taslağı okuyup karşılaştırın; seçiminize kadar kayıt duraklatıldı.</p>
      <button type="button" disabled={!canManage || readingLatest} onClick={() => void compareLatest()}>Güncel taslakla karşılaştır</button>
      {recovery && <>
        {differences.length > 0 ? <div className={styles.conflictComparison}><table aria-label="Taslak farkları"><thead><tr><th>Alan</th><th>Yerel değişiklikleriniz</th><th>Güncel kayıtlı taslak</th></tr></thead><tbody>{differences.map((row) => <tr key={row.field}><th scope="row">{row.field}</th><td>{row.local}</td><td>{row.remote}</td></tr>)}</tbody></table></div> : <p>Taslak içerikleri aynı. Güncel taslağı kullanarak devam edebilirsiniz.</p>}
        <p>Üzerine yazmak güncel taslağın tamamını yerel değişikliklerinizle değiştirir.</p>
        <button type="button" disabled={!canManage} onClick={() => void resolveConflict(true)}>Yerel değişikliklerle üzerine yaz</button>
        <button type="button" disabled={!canManage} onClick={() => void resolveConflict(false)}>Yerel değişiklikleri bırak, günceli kullan</button>
      </>}
    </section>}
  </>;

  return <section className={styles.workspace} data-panel-layout="visual-storefront-canvas">
    <PanelTopbarBridge title="Tasarım" subtitle={statusLabel} />
    <div className={styles.workspaceToolbar}><DesignWorkspaceToolbar selectedSurface={selectedSurface} previewMode={previewMode} publishDisabled={publishDisabled} publishIssueLabel={publishIssueLabel} onSelectSurface={selectSurface} onPreviewModeChange={setPreviewMode} onPublish={() => void publish()} /></div>
    {!modalOpen && <div className={styles.saveRecovery}>{recoveryControls}</div>}
    <main className={styles.canvasStage}><DesignPreview design={editor.design} storeName={workspace.store.name} publishedVersion={publishedVersionRef.current} publishedAt={publishedAt} media={media} destinations={workspace.destinations} previewResources={previewResources} mode={previewMode} now={nowRef.current} selectedSurface={modalOpen ? selectedSurface : undefined} onSelectSurface={selectSurface} /></main>
    <DesignSettingsModal open={modalOpen} surface={selected} onClose={closeModal} returnFocusRef={returnFocusRef}><div className={styles.saveRecovery}><p role="status">{statusLabel}</p>{recoveryControls}</div><DesignStepEditor step={location.step} design={editor.design} storeName={workspace.store.name} timezone={workspace.store.timezone} media={media} destinations={workspace.destinations} canManage={canManage && !busyPublishing} previewMode={previewMode} onChange={change} onUpload={upload} /></DesignSettingsModal>
  </section>;
}
