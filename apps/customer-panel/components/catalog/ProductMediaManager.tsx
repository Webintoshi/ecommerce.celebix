"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import type { ProductMediaLifecycle } from "../../../../packages/saas-contracts/src/media/index.ts";
import { Archive, ArrowLeft, ArrowRight, GripVertical, Image as ImageIcon, ImagePlus, Pencil, RotateCcw, Trash2 } from "lucide-react";

import { imageSignature, type AuthoringMediaBridge } from "@/lib/content-authoring-ui/image-alts";
import { ProductMediaApiError, productMediaApi } from "@/lib/catalog-ui/media-client";
import { CatalogSortArea, CatalogSortItem } from "./CatalogSortArea";
import styles from "./product-media-manager.module.css";

function safeMessage(error: unknown) {
  return error instanceof ProductMediaApiError ? error.message : "Görsel işlemi tamamlanamadı. Lütfen yeniden deneyin.";
}

export function restoreArchiveFocus(trigger: HTMLElement | null, fallback: HTMLElement | null) {
  if (trigger?.isConnected) {
    trigger.focus();
    return "trigger";
  }
  if (fallback?.isConnected) {
    fallback.focus();
    return "fallback";
  }
  return "none";
}

function ProductMediaManagerWorkspace({
  productId,
  canManage = false,
  canArchive = false,
  onActiveMediaChange,
  onAuthoringMediaBridgeChange,
}: Readonly<{
  productId: string;
  canManage?: boolean;
  canArchive?: boolean;
  onActiveMediaChange?: (media: readonly ProductMediaLifecycle[]) => void;
  onAuthoringMediaBridgeChange?: (bridge:AuthoringMediaBridge|null)=>void;
}>) {
  const [media, setMedia] = useState<readonly ProductMediaLifecycle[]>([]);
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [editingAltId, setEditingAltId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [resolved, setResolved] = useState(false);
  const [busy, setBusy] = useState("");
  const busyRef = useRef("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<readonly File[]>([]);
  const [previewUrl, setPreviewUrl] = useState("");
  const pendingFileIds=useRef(new Map<File,string>());
  const [pendingAlts,setPendingAlts]=useState<Readonly<Record<string,string>>>({});
  const [uploadProgress, setUploadProgress] = useState(0);
  const [archiveTarget, setArchiveTarget] = useState<ProductMediaLifecycle>();
  const archiveDialogRef = useRef<HTMLDivElement>(null);
  const archiveCancelButtonRef = useRef<HTMLButtonElement>(null);
  const archiveTriggerRef = useRef<HTMLButtonElement>(null);
  const mediaUploadCardRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addImageButtonRef = useRef<HTMLButtonElement>(null);
  const altTriggerRef = useRef<HTMLButtonElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const archivedTabRef = useRef<HTMLButtonElement>(null);
  const wasArchiveDialogOpen = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setMedia(await productMediaApi.list(productId)); setResolved(true); }
    catch (failure) { setError(safeMessage(failure)); }
    finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const activeMedia = useMemo(
    () => media.filter((item) => item.status === "active").sort((left, right) => left.sortOrder - right.sortOrder),
    [media],
  );
  const archivedMedia = useMemo(
    () => media.filter((item) => item.status === "archived"),
    [media],
  );
  useEffect(() => { if (!loading) onActiveMediaChange?.(activeMedia); }, [activeMedia, loading, onActiveMediaChange]);
  const authoringMediaBridge:AuthoringMediaBridge={
    captureImages:()=>[...activeMedia.filter(item=>item.publicUrl).map(item=>({id:item.id,url:item.publicUrl,thumbnailUrl:`/api/content-ai/image-source/${productId}/${item.id}`,altText:item.altText,version:item.version})),...selectedFiles.map(file=>({id:pendingFileIds.current.get(file)!,file,altText:pendingAlts[pendingFileIds.current.get(file)!]??''}))],
    canApplyImageAlts:(results,captured)=>canManage&&!loading&&!busyRef.current&&imageSignature(authoringMediaBridge.captureImages())===imageSignature(captured)&&results.every(result=>captured.some(image=>image.id===result.id)),
    applyImageAlts:async(results,captured)=>{
      if(!authoringMediaBridge.canApplyImageAlts(results,captured)||!beginMutation('authoring-alt'))return false;
      try{
        const local=new Map(selectedFiles.map(file=>[pendingFileIds.current.get(file)!,file]));
        for(const result of results){
          if(local.has(result.id)){setPendingAlts(current=>({...current,[result.id]:result.altText}));continue;}
          const item=activeMedia.find(image=>image.id===result.id);if(!item)return false;
          const updated=await productMediaApi.updateAlt(productId,item.id,{expectedVersion:item.version,altText:result.altText});
          setMedia(current=>current.map(candidate=>candidate.id===item.id?updated.media:candidate));
        }
        setNotice('Seçili görsellerin alt metinleri uygulandı.');return true;
      }catch(failure){setError(safeMessage(failure));return false;}finally{finishMutation();}
    },
  };
  useEffect(()=>{onAuthoringMediaBridgeChange?.(authoringMediaBridge);return()=>onAuthoringMediaBridgeChange?.(null);},[onAuthoringMediaBridgeChange,activeMedia,selectedFiles,pendingAlts,loading,busy,canManage]);


  useEffect(() => {
    if (archiveTarget !== undefined) {
      wasArchiveDialogOpen.current = true;
      archiveCancelButtonRef.current?.focus();
      return;
    }
    if (!wasArchiveDialogOpen.current) return;
    wasArchiveDialogOpen.current = false;
    restoreArchiveFocus(archiveTriggerRef.current, mediaUploadCardRef.current);
  }, [archiveTarget]);

  function closeArchiveDialog() {
    if (busyRef.current === "") setArchiveTarget(undefined);
  }

  function beginMutation(operation: string) {
    if (busyRef.current || loading) return false;
    busyRef.current = operation;
    setBusy(operation); setError(""); setNotice("");
    return true;
  }

  function finishMutation() { busyRef.current = ""; setBusy(""); }

  function handleArchiveDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      closeArchiveDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(archiveDialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    if (focusable.length === 0) {
      event.preventDefault();
      archiveDialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && (document.activeElement === first || !archiveDialogRef.current?.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !archiveDialogRef.current?.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    if (!canManage || loading || busyRef.current) return;
    const files = Array.from(event.currentTarget.files ?? []);
    setError("");
    setUploadProgress(0);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (files.length === 0) { setSelectedFiles([]); setPreviewUrl(""); return; }
    if (files.length + activeMedia.length > 16) {
      event.currentTarget.value = "";
      setSelectedFiles([]);
      setPreviewUrl("");
      setError(`Bir ürüne en fazla 16 görsel eklenebilir. ${16 - activeMedia.length} görsel daha seçebilirsiniz.`);
      return;
    }
    if (files.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1 || file.size > 5_242_880)) {
      event.currentTarget.value = "";
      setSelectedFiles([]);
      setPreviewUrl("");
      setError("Tüm görseller PNG, JPEG veya WebP biçiminde ve en fazla 5 MB olmalı.");
      return;
    }
    pendingFileIds.current=new Map(files.map(file=>[file,crypto.randomUUID()]));
    setPendingAlts({});
    setSelectedFiles(files);
    setPreviewUrl(URL.createObjectURL(files[0]!));
    setTab("active");
  }

  function clearSelectedFiles() {
    if (busyRef.current) return;
    setSelectedFiles([]);
    setPreviewUrl("");
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    addImageButtonRef.current?.focus();
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || loading || busyRef.current) return;
    if (selectedFiles.length === 0) { setError("Yüklenecek görselleri seçin."); return; }
    const formElement = event.currentTarget;
    const form = new FormData(formElement), altText = selectedFiles.length === 1 ? form.get("altText") : "";
    if (typeof altText !== "string" || altText.trim() !== altText || altText.length > 500) { setError("Alt metin en fazla 500 karakter olmalı ve başında veya sonunda boşluk bulunmamalı."); return; }
    if (!beginMutation("upload")) return;
    setUploadProgress(0);
    let uploaded = 0;
    try {
      for (const file of selectedFiles) {
        const result = await productMediaApi.upload(productId, {
          file,
          altText: (pendingAlts[pendingFileIds.current.get(file)!] ?? (selectedFiles.length === 1 ? altText : "")).trim(),
          onProgress: (value) => setUploadProgress(Math.round(((uploaded + value / 100) / selectedFiles.length) * 100)),
        });
        uploaded++;
        setMedia((current) => Object.freeze([...current, result.media].sort((left, right) => left.sortOrder - right.sortOrder)));
      }
      setSelectedFiles([]); setPreviewUrl(""); formElement.reset();
      addImageButtonRef.current?.focus();
      setNotice(`${uploaded} görsel yüklendi. İlk sıradaki görsel mağazada kapak olarak kullanılır.`);
    } catch (failure) {
      const remaining = selectedFiles.slice(uploaded + 1);
      setSelectedFiles(remaining);
      setPreviewUrl(remaining[0] ? URL.createObjectURL(remaining[0]) : "");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploadProgress(0);
      setError(`${uploaded} görsel yüklendi. ${uploaded + 1}. görsel yüklenemedi: ${safeMessage(failure)} Galeriyi kontrol edip yüklenmeyen görseli yeniden seçin.${remaining.length ? ` Kalan ${remaining.length} görsel seçili.` : ""}`);
    }
    finally { finishMutation(); }
  }

  async function updateAlt(event: FormEvent<HTMLFormElement>, item: ProductMediaLifecycle) {
    event.preventDefault();
    if (!canManage) return;
    const altText = new FormData(event.currentTarget).get("altText");
    if (typeof altText !== "string") return;
    if (!beginMutation(`alt-${item.id}`)) return;
    try {
      const result = await productMediaApi.updateAlt(productId, item.id, { expectedVersion: item.version, altText });
      setMedia((current) => Object.freeze(current.map((candidate) => candidate.id === item.id ? result.media : candidate)));
      setEditingAltId(undefined);
      if (altTriggerRef.current?.isConnected) altTriggerRef.current.focus();
      setNotice("Alt metin güncellendi.");
    } catch (failure) { setError(safeMessage(failure)); if (failure instanceof ProductMediaApiError && failure.code === "version_conflict") await load(); }
    finally { finishMutation(); }
  }

  async function reorder(ids: string[]) {
    if (!canManage || tab !== "active" || archiveTarget || ids.length !== activeMedia.length || new Set(ids).size !== ids.length || ids.some(id => !activeMedia.some(item => item.id === id)) || ids.every((id, index) => activeMedia[index]?.id === id)) return;
    if (!beginMutation("reorder")) return;
    try { setMedia(await productMediaApi.reorder(productId, ids)); setNotice("Görsel sırası güncellendi."); }
    catch (failure) { setError(safeMessage(failure)); if (failure instanceof ProductMediaApiError && failure.code === "version_conflict") await load(); }
    finally { finishMutation(); }
  }

  async function move(index: number, direction: -1 | 1) {
    if (!canManage || loading || busyRef.current || tab !== "active") return;
    const next = index + direction;
    if (next < 0 || next >= activeMedia.length) return;
    const ids = activeMedia.map((item) => item.id); [ids[index], ids[next]] = [ids[next]!, ids[index]!];
    await reorder(ids);
  }

  function dropMedia(sourceId: string, targetId: string) {
    if (sourceId === targetId || !canManage || loading || busyRef.current || tab !== "active") return;
    const ids = activeMedia.map((item) => item.id);
    const sourceIndex = ids.indexOf(sourceId);
    const targetIndex = ids.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    ids.splice(sourceIndex, 1);
    ids.splice(targetIndex, 0, sourceId);
    void reorder(ids);
  }

  async function archive() {
    if (archiveTarget === undefined || !canArchive) return;
    if (!beginMutation(`archive-${archiveTarget.id}`)) return;
    try {
      const result = await productMediaApi.archive(productId, archiveTarget.id, archiveTarget.version);
      setMedia((current) => Object.freeze(current.map((item) => item.id === archiveTarget.id ? result.media : item)));
      setArchiveTarget(undefined); setNotice("Görsel arşivlendi ve mağazadan kaldırıldı.");
    } catch (failure) {
      setError(safeMessage(failure));
      if (failure instanceof ProductMediaApiError && failure.code === "version_conflict") {
        await load();
        setArchiveTarget(undefined);
      }
    }
    finally { finishMutation(); }
  }

  async function restore(item: ProductMediaLifecycle) {
    if (!canArchive || item.status !== "archived") return;
    if (!beginMutation(`restore-${item.id}`)) return;
    try {
      const result = await productMediaApi.restore(productId, item.id, item.version);
      setMedia((current) => Object.freeze(current.map((candidate) => candidate.id === item.id ? result.media : candidate)));
      setNotice("Görsel geri yüklendi ve mağazada yeniden yayınlandı.");
    } catch (failure) { setError(safeMessage(failure)); if (failure instanceof ProductMediaApiError && failure.code === "version_conflict") await load(); }
    finally { finishMutation(); }
  }

  async function cleanup(item: ProductMediaLifecycle) {
    if (!canArchive || item.cleanupState !== "eligible") return;
    if (!beginMutation(`cleanup-${item.id}`)) return;
    try {
      const result = await productMediaApi.cleanup(productId, item.id, item.version);
      setMedia((current) => Object.freeze(current.map((candidate) => candidate.id === item.id ? result.media : candidate)));
      setNotice("Saklama süresi dolan görsel güvenli biçimde kalıcı olarak temizlendi.");
    } catch (failure) { setError(safeMessage(failure)); await load(); }
    finally { finishMutation(); }
  }

  const visibleMedia = tab === "active" ? activeMedia : archivedMedia;

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, nextTab: "active" | "archived") {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setTab(nextTab);
    (nextTab === "active" ? activeTabRef : archivedTabRef).current?.focus();
  }

  return (
    <section id="product-images" className={`product-detail-section product-detail-media ${styles.root}`} aria-labelledby="product-media-title">
      <div className={styles.header}>
        <div className={styles.heading}>
          <h2 id="product-media-title">Görseller <span className={styles.count}>{loading && !resolved ? "…" : visibleMedia.length}</span></h2>
          {tab === "active" ? <p>İlk görsel mağazada kapak olur.</p> : null}
        </div>
        {canArchive ? <div className={styles.tabs} role="tablist" aria-label="Görsel durumu">
          <button ref={activeTabRef} type="button" role="tab" aria-selected={tab === "active"} tabIndex={tab === "active" ? 0 : -1} onClick={() => setTab("active")} onKeyDown={(event) => handleTabKeyDown(event, "archived")}>Aktif <span>{activeMedia.length}</span></button>
          <button ref={archivedTabRef} type="button" role="tab" aria-selected={tab === "archived"} tabIndex={tab === "archived" ? 0 : -1} onClick={() => setTab("archived")} onKeyDown={(event) => handleTabKeyDown(event, "active")}>Arşiv <span>{archivedMedia.length}</span></button>
        </div> : null}
      </div>

      {error ? <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>Galeriyi yenile</button></div> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}

      {loading && !resolved ? <div className={styles.grid} role="status" aria-label="Görseller yükleniyor"><span className={styles.skeleton} /><span className={styles.skeleton} /><span className={styles.skeleton} /><span className={styles.skeleton} /></div> : tab === "archived" && visibleMedia.length === 0 ? (
        <div className={styles.empty}><ImageIcon aria-hidden="true" /><strong>Arşivlenmiş görsel yok</strong><span>Arşivlediğiniz görseller burada görünür.</span></div>
      ) : tab === "active" && visibleMedia.length === 0 && !canManage ? (
        <div className={styles.empty}><ImageIcon aria-hidden="true" /><strong>Henüz görsel yok</strong><span>Görsel eklemek için ürün düzenleme yetkisi gerekir.</span></div>
      ) : (
        <CatalogSortArea ids={visibleMedia.map(item => item.id)} onMove={dropMedia} layout="grid" label="Görsel sırası"
          getLabel={id => visibleMedia.find(item => item.id === id)?.altText || `Görsel ${visibleMedia.findIndex(item => item.id === id) + 1}`}
          disabled={!canManage || loading || tab !== "active" || busy !== "" || Boolean(archiveTarget)}>
        <div className={styles.grid}>
          {visibleMedia.map((item, index) => (
            <CatalogSortItem as="article" className={styles.card} id={item.id} key={item.id}>{drag => <>
              <div className={styles.thumbnail}>
                <button {...drag.pointerProps} type="button" tabIndex={-1} className={styles.imageButton} aria-label={`${index + 1}. ürün görseli`}>
                  {item.publicUrl ? <img src={item.publicUrl} alt={item.altText || `Ürün görseli ${index + 1}`} loading="lazy" draggable={false} /> : <span className={styles.purgedImage} aria-label="Görsel kalıcı olarak temizlendi"><ImageIcon aria-hidden="true" /></span>}
                </button>
                {tab === "active" && index === 0 ? <span className={styles.coverBadge}>Kapak</span> : <span className={styles.positionBadge}>{String(index + 1).padStart(2, "0")}</span>}
                {canManage && tab === "active" ? <button {...drag.handleProps} className={styles.dragHandle} title="Sürükleyerek sırala"><GripVertical aria-hidden="true" /></button> : null}
                {canManage && tab === "active" ? <div className={styles.orderControls} role="group" aria-label={`${index + 1}. görselin sırası`}>
                  <button type="button" aria-label={`${index + 1}. görseli öne taşı`} title="Öne taşı" onClick={() => void move(index, -1)} disabled={loading || busy !== "" || index === 0}><ArrowLeft aria-hidden="true" /></button>
                  <button type="button" aria-label={`${index + 1}. görseli arkaya taşı`} title="Arkaya taşı" onClick={() => void move(index, 1)} disabled={loading || busy !== "" || index === visibleMedia.length - 1}><ArrowRight aria-hidden="true" /></button>
                </div> : null}
              </div>
              <div className={styles.cardHeading}><strong>Görsel {index + 1}</strong>{canManage && tab === "active" ? <div className={styles.cardActions}>
                <button type="button" aria-label={`${index + 1}. görselin alt metnini düzenle`} title="Alt metni düzenle" aria-expanded={editingAltId === item.id} onClick={(event) => { altTriggerRef.current = event.currentTarget; setEditingAltId((current) => current === item.id ? undefined : item.id); }} disabled={loading || busy !== ""}><Pencil aria-hidden="true" /></button>
                {canArchive ? <button type="button" aria-label={`${index + 1}. görseli arşivle`} title="Arşivle" onClick={(event) => { archiveTriggerRef.current = event.currentTarget; setArchiveTarget(item); }} disabled={loading || busy !== ""}><Archive aria-hidden="true" /></button> : null}
              </div> : null}</div>
              {editingAltId === item.id && canManage && tab === "active" ? <form className={styles.altForm} onSubmit={(event) => void updateAlt(event, item)} key={item.version}>
                <label className={styles.field}><span>Alt metin</span><input name="altText" maxLength={500} defaultValue={item.altText} disabled={loading || busy !== ""} /></label>
                <div className={styles.altActions}><button className={styles.quietButton} type="button" onClick={() => { setEditingAltId(undefined); altTriggerRef.current?.focus(); }} disabled={loading || busy !== ""}>Vazgeç</button><button className={styles.darkButton} type="submit" disabled={loading || busy !== ""}>{busy === `alt-${item.id}` ? "Kaydediliyor…" : "Kaydet"}</button></div>
              </form> : <p className={styles.altText} title={item.altText || undefined}>{item.altText || "Alt metin eklenmemiş"}</p>}
              {tab === "archived" ? <p className={styles.retention}>{item.cleanupState === "retained" ? `${item.retentionExpiresAt ? new Date(item.retentionExpiresAt).toLocaleString("tr-TR") : "Belirtilen tarihe"} kadar saklanır.` : item.cleanupState === "eligible" ? "Kalıcı temizliğe hazır." : item.cleanupState === "cleanup_pending" ? "Temizlik doğrulanıyor." : "Kalıcı olarak temizlendi."}</p> : null}
              {canArchive && tab === "archived" ? <div className={styles.archiveActions}>{item.cleanupState === "retained" ? <button type="button" className={styles.quietButton} onClick={() => void restore(item)} disabled={loading || busy !== ""}><RotateCcw aria-hidden="true" /> {busy === `restore-${item.id}` ? "Geri yükleniyor…" : "Geri yükle"}</button> : null}{item.cleanupState === "eligible" ? <button type="button" className={styles.dangerButton} onClick={() => void cleanup(item)} disabled={loading || busy !== ""}><Trash2 aria-hidden="true" /> {busy === `cleanup-${item.id}` ? "Temizleniyor…" : "Kalıcı temizle"}</button> : null}</div> : null}
            </>}</CatalogSortItem>
          ))}
          {canManage && tab === "active" ? <form ref={mediaUploadCardRef} className={styles.uploadForm} data-expanded={selectedFiles.length ? "true" : "false"} onSubmit={upload} tabIndex={-1}>
            <input ref={fileInputRef} className={styles.fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="Ürün görsellerini seç" tabIndex={-1} onChange={selectFiles} disabled={loading || busy !== "" || activeMedia.length >= 16} />
            <button ref={addImageButtonRef} className={styles.addButton} type="button" onClick={() => fileInputRef.current?.click()} disabled={loading || busy !== "" || activeMedia.length >= 16}><ImagePlus aria-hidden="true" /><strong>{selectedFiles.length ? "Başka görsel seç" : "Görsel ekle"}</strong><small>JPG, PNG, WebP · 5 MB · Çoklu seçim</small></button>
            {selectedFiles.length ? <div className={styles.uploadDetails}>
              {previewUrl ? <img src={previewUrl} alt="Yüklenecek görsel önizlemesi" /> : <span aria-hidden="true"><ImageIcon /></span>}
              <div className={styles.uploadFields}>
                <span className={styles.fileName} title={selectedFiles.map((file) => file.name).join(", ")}>{selectedFiles.length === 1 ? selectedFiles[0]!.name : `${selectedFiles.length} görsel seçildi`}</span>
                {selectedFiles.length === 1 ? <label className={styles.field}><span>Alt metin</span><input name="altText" maxLength={500} value={pendingAlts[pendingFileIds.current.get(selectedFiles[0]!)!]??""} onChange={event=>setPendingAlts(current=>({...current,[pendingFileIds.current.get(selectedFiles[0]!)!]:event.target.value}))} placeholder="Görseli kısaca açıklayın" disabled={loading || busy !== ""} /></label> : <span className={styles.bulkHint}>Alt metinleri yükledikten sonra düzenleyebilirsiniz.</span>}
              </div>
              <div className={styles.uploadActions}><button className={styles.quietButton} type="button" onClick={clearSelectedFiles} disabled={loading || busy !== ""}>Vazgeç</button><button className={styles.darkButton} type="submit" disabled={loading || busy !== ""}>{busy === "upload" ? "Yükleniyor…" : selectedFiles.length === 1 ? "Yükle" : `${selectedFiles.length} görseli yükle`}</button></div>
              {busy === "upload" ? <div className={styles.progress}><span>Yükleme</span><progress role="progressbar" max="100" value={uploadProgress}>{uploadProgress}%</progress><b>{uploadProgress}%</b></div> : null}
            </div> : null}
          </form> : null}
        </div>
        </CatalogSortArea>
      )}

      {archiveTarget && canArchive ? (
        <div className={styles.dialogLayer}>
          <div ref={archiveDialogRef} className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="archive-media-title" aria-describedby="archive-media-description" tabIndex={-1} onKeyDown={handleArchiveDialogKeyDown}>
            <div><strong id="archive-media-title">Görseli arşivle</strong><p id="archive-media-description">Görsel galeriden ve mağazadan kaldırılır. Saklama süresi içinde geri yüklenebilir.</p></div>
            <div className={styles.dialogActions}><button ref={archiveCancelButtonRef} className={styles.quietButton} type="button" onClick={closeArchiveDialog} disabled={loading || busy !== ""}>Vazgeç</button><button className={styles.dangerButton} type="button" onClick={() => void archive()} disabled={loading || busy !== ""}>{busy === `archive-${archiveTarget.id}` ? "Arşivleniyor…" : "Arşivle"}</button></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function ProductMediaManager(props: Parameters<typeof ProductMediaManagerWorkspace>[0]) {
  return <ProductMediaManagerWorkspace key={props.productId} {...props} />;
}
