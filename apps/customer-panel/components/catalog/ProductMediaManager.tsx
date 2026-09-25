"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import type { ProductMediaLifecycle } from "../../../../packages/saas-contracts/src/media/index.ts";
import { Archive, ArrowLeft, ArrowRight, Image as ImageIcon, ImagePlus, Pencil, RotateCcw, Trash2 } from "lucide-react";

import { ProductMediaApiError, productMediaApi } from "@/lib/catalog-ui/media-client";
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

export function ProductMediaManager({
  productId,
  canManage = false,
  canArchive = false,
  onActiveMediaChange,
}: Readonly<{
  productId: string;
  canManage?: boolean;
  canArchive?: boolean;
  onActiveMediaChange?: (media: readonly ProductMediaLifecycle[]) => void;
}>) {
  const [media, setMedia] = useState<readonly ProductMediaLifecycle[]>([]);
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [editingAltId, setEditingAltId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedFile, setSelectedFile] = useState<File>();
  const [previewUrl, setPreviewUrl] = useState("");
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
    try { setMedia(await productMediaApi.list(productId)); }
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
    if (busy === "") setArchiveTarget(undefined);
  }

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

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    if (!canManage) return;
    const file = event.currentTarget.files?.[0];
    setError("");
    setUploadProgress(0);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (file === undefined) { setSelectedFile(undefined); setPreviewUrl(""); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1 || file.size > 5_242_880) {
      event.currentTarget.value = "";
      setSelectedFile(undefined);
      setPreviewUrl("");
      setError("PNG, JPEG veya WebP biçiminde ve en fazla 5 MB bir görsel seçin.");
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setTab("active");
  }

  function clearSelectedFile() {
    setSelectedFile(undefined);
    setPreviewUrl("");
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    addImageButtonRef.current?.focus();
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    if (selectedFile === undefined) { setError("Yüklenecek görseli seçin."); return; }
    const formElement = event.currentTarget;
    const form = new FormData(formElement), altText = form.get("altText");
    if (typeof altText !== "string" || altText.trim() !== altText || altText.length > 500) { setError("Alt metin en fazla 500 karakter olmalı ve başında veya sonunda boşluk bulunmamalı."); return; }
    setBusy("upload"); setError(""); setNotice(""); setUploadProgress(0);
    try {
      const result = await productMediaApi.upload(productId, { file: selectedFile, altText, onProgress: setUploadProgress });
      setMedia((current) => Object.freeze([...current, result.media].sort((left, right) => left.sortOrder - right.sortOrder)));
      setSelectedFile(undefined); setPreviewUrl(""); formElement.reset();
      addImageButtonRef.current?.focus();
      setNotice("Görsel yüklendi. İlk sıradaki görsel mağazada birincil görsel olarak kullanılır.");
    } catch (failure) { setError(safeMessage(failure)); }
    finally { setBusy(""); }
  }

  async function updateAlt(event: FormEvent<HTMLFormElement>, item: ProductMediaLifecycle) {
    event.preventDefault();
    if (!canManage) return;
    const altText = new FormData(event.currentTarget).get("altText");
    if (typeof altText !== "string") return;
    setBusy(`alt-${item.id}`); setError(""); setNotice("");
    try {
      const result = await productMediaApi.updateAlt(productId, item.id, { expectedVersion: item.version, altText });
      setMedia((current) => Object.freeze(current.map((candidate) => candidate.id === item.id ? result.media : candidate)));
      setEditingAltId(undefined);
      if (altTriggerRef.current?.isConnected) altTriggerRef.current.focus();
      setNotice("Alt metin güncellendi.");
    } catch (failure) { setError(safeMessage(failure)); if (failure instanceof ProductMediaApiError && failure.code === "version_conflict") await load(); }
    finally { setBusy(""); }
  }

  async function move(index: number, direction: -1 | 1) {
    if (!canManage) return;
    const next = index + direction;
    if (next < 0 || next >= activeMedia.length) return;
    const ids = activeMedia.map((item) => item.id); [ids[index], ids[next]] = [ids[next]!, ids[index]!];
    setBusy("reorder"); setError(""); setNotice("");
    try { setMedia(await productMediaApi.reorder(productId, ids)); setNotice("Görsel sırası güncellendi."); }
    catch (failure) { setError(safeMessage(failure)); if (failure instanceof ProductMediaApiError && failure.code === "version_conflict") await load(); }
    finally { setBusy(""); }
  }

  async function archive() {
    if (archiveTarget === undefined || !canArchive) return;
    setBusy(`archive-${archiveTarget.id}`); setError(""); setNotice("");
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
    finally { setBusy(""); }
  }

  async function restore(item: ProductMediaLifecycle) {
    if (!canArchive || item.status !== "archived") return;
    setBusy(`restore-${item.id}`); setError(""); setNotice("");
    try {
      const result = await productMediaApi.restore(productId, item.id, item.version);
      setMedia((current) => Object.freeze(current.map((candidate) => candidate.id === item.id ? result.media : candidate)));
      setNotice("Görsel geri yüklendi ve mağazada yeniden yayınlandı.");
    } catch (failure) { setError(safeMessage(failure)); if (failure instanceof ProductMediaApiError && failure.code === "version_conflict") await load(); }
    finally { setBusy(""); }
  }

  async function cleanup(item: ProductMediaLifecycle) {
    if (!canArchive || item.cleanupState !== "eligible") return;
    setBusy(`cleanup-${item.id}`); setError(""); setNotice("");
    try {
      const result = await productMediaApi.cleanup(productId, item.id, item.version);
      setMedia((current) => Object.freeze(current.map((candidate) => candidate.id === item.id ? result.media : candidate)));
      setNotice("Saklama süresi dolan görsel güvenli biçimde kalıcı olarak temizlendi.");
    } catch (failure) { setError(safeMessage(failure)); await load(); }
    finally { setBusy(""); }
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
          <span className={styles.kicker}>GÖRSEL YÖNETİMİ</span>
          <h2 id="product-media-title">Görseller <span className={styles.count}>{loading ? "…" : visibleMedia.length}</span></h2>
        </div>
        {canManage ? <form ref={mediaUploadCardRef} className={styles.uploadForm} data-expanded={selectedFile ? "true" : "false"} onSubmit={upload} tabIndex={-1}>
          <input ref={fileInputRef} className={styles.fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Ürün görseli seç" tabIndex={-1} onChange={selectFile} disabled={busy !== ""} />
          <button ref={addImageButtonRef} className={styles.addButton} type="button" onClick={() => fileInputRef.current?.click()} disabled={busy !== ""}><ImagePlus aria-hidden="true" /> {selectedFile ? "Başka görsel seç" : "Görsel ekle"}</button>
          {selectedFile ? <div className={styles.uploadDetails}>
            {previewUrl ? <img src={previewUrl} alt="Yüklenecek görsel önizlemesi" /> : <span aria-hidden="true"><ImageIcon /></span>}
            <div className={styles.uploadFields}>
              <span className={styles.fileName} title={selectedFile.name}>{selectedFile.name}</span>
              <label className={styles.field}><span>Alt metin</span><input name="altText" maxLength={500} placeholder="Görseli kısaca açıklayın" disabled={busy !== ""} /></label>
              <span className={styles.fileHelp}>PNG, JPEG, WebP · en fazla 5 MB</span>
            </div>
            <div className={styles.uploadActions}><button className={styles.quietButton} type="button" onClick={clearSelectedFile} disabled={busy !== ""}>Vazgeç</button><button className={styles.darkButton} type="submit" disabled={busy !== ""}>{busy === "upload" ? "Yükleniyor…" : "Yükle"}</button></div>
            {busy === "upload" ? <div className={styles.progress}><span>Yükleme</span><progress role="progressbar" max="100" value={uploadProgress}>{uploadProgress}%</progress><b>{uploadProgress}%</b></div> : null}
          </div> : null}
        </form> : null}
      </div>

      {error ? <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>Yeniden dene</button></div> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}

      {canArchive ? <div className={styles.tabs} role="tablist" aria-label="Görsel durumu">
        <button ref={activeTabRef} type="button" role="tab" aria-selected={tab === "active"} tabIndex={tab === "active" ? 0 : -1} onClick={() => setTab("active")} onKeyDown={(event) => handleTabKeyDown(event, "archived")}>Aktif <span>{activeMedia.length}</span></button>
        <button ref={archivedTabRef} type="button" role="tab" aria-selected={tab === "archived"} tabIndex={tab === "archived" ? 0 : -1} onClick={() => setTab("archived")} onKeyDown={(event) => handleTabKeyDown(event, "active")}>Arşivlenenler <span>{archivedMedia.length}</span></button>
      </div> : null}

      {loading ? <div className={styles.grid} role="status" aria-label="Görseller yükleniyor"><span className={styles.skeleton} /><span className={styles.skeleton} /><span className={styles.skeleton} /><span className={styles.skeleton} /></div> : visibleMedia.length === 0 ? (
        <div className={styles.empty}><ImageIcon aria-hidden="true" /><strong>{tab === "active" ? "Henüz görsel yok" : "Arşivlenmiş görsel yok"}</strong><span>{tab === "active" ? "İlk görsel mağaza kapağı olur." : "Arşivlenen görseller burada görünür."}</span></div>
      ) : (
        <div className={styles.grid}>
          {visibleMedia.map((item, index) => (
            <article className={styles.card} key={item.id}>
              <div className={styles.thumbnail}>{item.publicUrl ? <img src={item.publicUrl} alt={item.altText || `Ürün görseli ${index + 1}`} loading="lazy" /> : <span className={styles.purgedImage} aria-label="Görsel kalıcı olarak temizlendi"><ImageIcon aria-hidden="true" /></span>}{tab === "active" && index === 0 ? <span className={styles.coverBadge}>Kapak</span> : null}</div>
              <div className={styles.cardHeading}><strong>Görsel {index + 1}</strong>{canManage && tab === "active" ? <div className={styles.cardActions}>
                <button type="button" aria-label={`${index + 1}. görselin alt metnini düzenle`} title="Alt metni düzenle" aria-expanded={editingAltId === item.id} onClick={(event) => { altTriggerRef.current = event.currentTarget; setEditingAltId((current) => current === item.id ? undefined : item.id); }} disabled={busy !== ""}><Pencil aria-hidden="true" /></button>
                {canArchive ? <button type="button" aria-label={`${index + 1}. görseli arşivle`} title="Arşivle" onClick={(event) => { archiveTriggerRef.current = event.currentTarget; setArchiveTarget(item); }} disabled={busy !== ""}><Archive aria-hidden="true" /></button> : null}
              </div> : null}</div>
              {editingAltId === item.id && canManage && tab === "active" ? <form className={styles.altForm} onSubmit={(event) => void updateAlt(event, item)} key={item.version}>
                <label className={styles.field}><span>Alt metin</span><input name="altText" maxLength={500} defaultValue={item.altText} disabled={busy !== ""} /></label>
                <button className={styles.quietButton} type="submit" disabled={busy !== ""}>{busy === `alt-${item.id}` ? "Kaydediliyor…" : "Kaydet"}</button>
              </form> : <p className={styles.altText} title={item.altText || undefined}>{item.altText || "Alt metin eklenmemiş"}</p>}
              {tab === "archived" ? <p className={styles.retention}>{item.cleanupState === "retained" ? `${item.retentionExpiresAt ? new Date(item.retentionExpiresAt).toLocaleString("tr-TR") : "Belirtilen tarihe"} kadar saklanır.` : item.cleanupState === "eligible" ? "Kalıcı temizliğe hazır." : item.cleanupState === "cleanup_pending" ? "Temizlik doğrulanıyor." : "Kalıcı olarak temizlendi."}</p> : null}
              {canManage && tab === "active" ? <div className={styles.orderControls} role="group" aria-label={`${index + 1}. görselin sırası`}>
                <button type="button" aria-label={`${index + 1}. görseli öne taşı`} title="Öne taşı" onClick={() => void move(index, -1)} disabled={busy !== "" || index === 0}><ArrowLeft aria-hidden="true" /></button>
                <button type="button" aria-label={`${index + 1}. görseli arkaya taşı`} title="Arkaya taşı" onClick={() => void move(index, 1)} disabled={busy !== "" || index === visibleMedia.length - 1}><ArrowRight aria-hidden="true" /></button>
              </div> : null}
              {canArchive && tab === "archived" ? <div className={styles.archiveActions}>{item.cleanupState === "retained" ? <button type="button" className={styles.quietButton} onClick={() => void restore(item)} disabled={busy !== ""}><RotateCcw aria-hidden="true" /> {busy === `restore-${item.id}` ? "Geri yükleniyor…" : "Geri yükle"}</button> : null}{item.cleanupState === "eligible" ? <button type="button" className={styles.dangerButton} onClick={() => void cleanup(item)} disabled={busy !== ""}><Trash2 aria-hidden="true" /> {busy === `cleanup-${item.id}` ? "Temizleniyor…" : "Kalıcı temizle"}</button> : null}</div> : null}
            </article>
          ))}
        </div>
      )}
      {!loading && activeMedia.length > 0 && tab === "active" ? <p className={styles.footnote}>İlk görsel mağazada kapak olarak kullanılır.</p> : null}

      {archiveTarget && canArchive ? (
        <div className={styles.dialogLayer}>
          <div ref={archiveDialogRef} className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="archive-media-title" aria-describedby="archive-media-description" tabIndex={-1} onKeyDown={handleArchiveDialogKeyDown}>
            <div><strong id="archive-media-title">Görseli arşivle</strong><p id="archive-media-description">Görsel galeriden ve mağazadan kaldırılır. Saklama süresi içinde geri yüklenebilir.</p></div>
            <div className={styles.dialogActions}><button ref={archiveCancelButtonRef} className={styles.quietButton} type="button" onClick={closeArchiveDialog} disabled={busy !== ""}>Vazgeç</button><button className={styles.dangerButton} type="button" onClick={() => void archive()} disabled={busy !== ""}>{busy === `archive-${archiveTarget.id}` ? "Arşivleniyor…" : "Arşivle"}</button></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
