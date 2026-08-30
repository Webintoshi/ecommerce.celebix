"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import type { ProductMediaLifecycle } from "../../../../packages/saas-contracts/src/media/index.ts";
import { Archive, ArrowDown, ArrowUp, Image as ImageIcon, ImagePlus, RotateCcw, Trash2 } from "lucide-react";

import { ProductMediaApiError, productMediaApi } from "@/lib/catalog-ui/media-client";

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
}: Readonly<{ productId: string; canManage?: boolean; canArchive?: boolean }>) {
  const [media, setMedia] = useState<readonly ProductMediaLifecycle[]>([]);
  const [tab, setTab] = useState<"active" | "archived">("active");
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
  const wasArchiveDialogOpen = useRef(false);

  const load = useCallback(async () => {
    setError("");
    try { setMedia(await productMediaApi.list(productId)); }
    catch (failure) { setError(safeMessage(failure)); }
    finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

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
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    if (selectedFile === undefined) { setError("Yüklenecek görseli seçin."); return; }
    const form = new FormData(event.currentTarget), altText = form.get("altText");
    if (typeof altText !== "string" || altText.trim() !== altText || altText.length > 500) { setError("Alt metin en fazla 500 karakter olmalı ve başında veya sonunda boşluk bulunmamalı."); return; }
    setBusy("upload"); setError(""); setNotice(""); setUploadProgress(0);
    try {
      const result = await productMediaApi.upload(productId, { file: selectedFile, altText, onProgress: setUploadProgress });
      setMedia((current) => Object.freeze([...current, result.media].sort((left, right) => left.sortOrder - right.sortOrder)));
      setSelectedFile(undefined); setPreviewUrl(""); event.currentTarget.reset();
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
      setNotice("Alt metin güncellendi.");
    } catch (failure) { setError(safeMessage(failure)); if (failure instanceof ProductMediaApiError && failure.code === "version_conflict") await load(); }
    finally { setBusy(""); }
  }

  async function move(index: number, direction: -1 | 1) {
    if (!canManage) return;
    const next = index + direction;
    if (next < 0 || next >= media.length) return;
    const ids = visibleMedia.map((item) => item.id); [ids[index], ids[next]] = [ids[next]!, ids[index]!];
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

  const visibleMedia = media.filter((item) => item.status === tab);

  return (
    <section className="product-media-section product-detail-section product-detail-media" aria-labelledby="product-media-title">
      <div className="section-heading-row product-detail-section-header">
        <div><span className="eyebrow">ÜRÜN GÖRSELLERİ</span><h2 id="product-media-title">Medya</h2><p>İlk sıradaki görsel mağazada birincil görsel olarak kullanılır.</p></div>
        <span className="product-media-count">{loading ? "Yükleniyor" : `${visibleMedia.length} görsel`}</span>
      </div>
      {error ? <div className="feedback feedback-error" role="alert"><div><strong>Görsel işlemi tamamlanamadı</strong><p>{error}</p></div></div> : null}
      {notice ? <div className="feedback feedback-success" role="status"><div><strong>Bilgi</strong><p>{notice}</p></div></div> : null}

      {canArchive ? <div className="catalog-tabs" role="tablist" aria-label="Medya yaşam döngüsü"><button type="button" role="tab" aria-selected={tab === "active"} onClick={() => setTab("active")}>Aktif</button><button type="button" role="tab" aria-selected={tab === "archived"} onClick={() => setTab("archived")}>Arşivlenenler</button></div> : null}

      {canManage && tab === "active" ? <form ref={mediaUploadCardRef} className="media-upload-card product-media-uploader" onSubmit={upload} tabIndex={-1}>
        <label className="media-picker">
          <ImagePlus aria-hidden="true" />
          <span>{selectedFile ? "Başka görsel seç" : "Görsel seç"}</span>
          <small>PNG, JPEG veya WebP · en fazla 5 MB</small>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile} disabled={busy !== ""} />
        </label>
        <div className="media-upload-preview">
          {previewUrl ? <img src={previewUrl} alt="Yüklenecek görsel önizlemesi" /> : <span aria-hidden="true"><ImageIcon /></span>}
          <label className="field"><span>Alt metin</span><input name="altText" maxLength={500} placeholder="Görseli erişilebilir biçimde açıklayın" disabled={busy !== ""} /></label>
        </div>
        {busy === "upload" ? <div className="upload-progress"><span>Yükleme ilerlemesi</span><progress role="progressbar" max="100" value={uploadProgress}>{uploadProgress}%</progress><b>{uploadProgress}%</b></div> : null}
        <div className="form-actions"><button className="button button-primary" type="submit" disabled={busy !== "" || selectedFile === undefined}>{busy === "upload" ? "Yükleniyor…" : "Görseli yükle"}</button></div>
      </form> : null}

      {loading ? <div className="catalog-loading" role="status"><span className="spinner" aria-hidden="true" /> Görseller yükleniyor…</div> : visibleMedia.length === 0 ? (
        <div className="empty-variants"><strong>{tab === "active" ? "Henüz ürün görseli yok" : "Arşivlenmiş görsel yok"}</strong><p>{tab === "active" ? "İlk görsel mağazada ürünün birincil görseli olacaktır." : "Arşivlenen görseller 30 günlük saklama süresi içinde geri yüklenebilir."}</p></div>
      ) : (
        <div className="product-media-grid">
          {visibleMedia.map((item, index) => (
            <article className="product-media-card product-media-item" key={item.id}>
              <div className="media-thumbnail">{item.publicUrl ? <img src={item.publicUrl} alt={item.altText} /> : <span aria-label="Görsel kalıcı olarak temizlendi"><ImageIcon /></span>}{tab === "active" && index === 0 ? <span>Birincil görsel</span> : null}</div>
              {tab === "archived" ? <p>{item.cleanupState === "retained" ? `${item.retentionExpiresAt ? new Date(item.retentionExpiresAt).toLocaleString("tr-TR") : "Belirtilen tarihe"} kadar saklanır.` : item.cleanupState === "eligible" ? "Saklama süresi doldu; kalıcı temizliğe hazır." : item.cleanupState === "cleanup_pending" ? "Kalıcı temizlik doğrulanıyor." : "Nesne kalıcı olarak temizlendi."}</p> : null}
              {canManage && tab === "active" ? <form onSubmit={(event) => void updateAlt(event, item)} key={item.version}>
                <label className="field"><span>Alt metin</span><input name="altText" maxLength={500} defaultValue={item.altText} disabled={busy !== ""} /></label>
                <button className="button button-secondary" type="submit" disabled={busy !== ""}>{busy === `alt-${item.id}` ? "Kaydediliyor…" : "Alt metni kaydet"}</button>
              </form> : <p>{item.altText || "Alt metin eklenmemiş"}</p>}
              {canManage && tab === "active" ? <div className="media-order-controls" aria-label="Görsel sırası">
                <button type="button" className="button button-secondary" onClick={() => void move(index, -1)} disabled={busy !== "" || index === 0}><ArrowUp aria-hidden="true" /> Yukarı taşı</button>
                <button type="button" className="button button-secondary" onClick={() => void move(index, 1)} disabled={busy !== "" || index === visibleMedia.length - 1}><ArrowDown aria-hidden="true" /> Aşağı taşı</button>
                {canArchive ? <button type="button" className="text-danger-button" onClick={(event) => { archiveTriggerRef.current = event.currentTarget; setArchiveTarget(item); }} disabled={busy !== ""}><Archive aria-hidden="true" /> Arşivle</button> : null}
              </div> : null}
              {canArchive && tab === "archived" ? <div className="media-order-controls" aria-label="Arşivlenmiş görsel işlemleri">{item.cleanupState === "retained" ? <button type="button" className="button button-secondary" onClick={() => void restore(item)} disabled={busy !== ""}><RotateCcw aria-hidden="true" /> {busy === `restore-${item.id}` ? "Geri yükleniyor…" : "Geri yükle"}</button> : null}{item.cleanupState === "eligible" ? <button type="button" className="text-danger-button" onClick={() => void cleanup(item)} disabled={busy !== ""}><Trash2 aria-hidden="true" /> {busy === `cleanup-${item.id}` ? "Temizleniyor…" : "Kalıcı temizle"}</button> : null}</div> : null}
            </article>
          ))}
        </div>
      )}

      {archiveTarget && canArchive ? (
        <div className="archive-dialog-layer">
          <div ref={archiveDialogRef} className="archive-dialog" role="alertdialog" aria-modal="true" aria-labelledby="archive-media-title" aria-describedby="archive-media-description" tabIndex={-1} onKeyDown={handleArchiveDialogKeyDown}>
            <div><strong id="archive-media-title">Görseli arşivlemeyi onayla</strong><p id="archive-media-description">Görsel ürün galerisinden ve mağazadan kaldırılacak.</p></div>
            <div className="confirmation-actions"><button ref={archiveCancelButtonRef} className="button button-secondary" type="button" onClick={closeArchiveDialog} disabled={busy !== ""}>Vazgeç</button><button className="button button-danger" type="button" onClick={() => void archive()} disabled={busy !== ""}>{busy === `archive-${archiveTarget.id}` ? "Arşivleniyor…" : "Görseli arşivle"}</button></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
