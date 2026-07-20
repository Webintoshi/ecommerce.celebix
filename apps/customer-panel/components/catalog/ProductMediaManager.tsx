"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import type { ProductMedia } from "../../../../packages/saas-contracts/src/media/index.ts";

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

export function ProductMediaManager({ productId }: { productId: string }) {
  const [media, setMedia] = useState<readonly ProductMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedFile, setSelectedFile] = useState<File>();
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [archiveTarget, setArchiveTarget] = useState<ProductMedia>();
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

  async function updateAlt(event: FormEvent<HTMLFormElement>, item: ProductMedia) {
    event.preventDefault();
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
    const next = index + direction;
    if (next < 0 || next >= media.length) return;
    const ids = media.map((item) => item.id); [ids[index], ids[next]] = [ids[next]!, ids[index]!];
    setBusy("reorder"); setError(""); setNotice("");
    try { setMedia(await productMediaApi.reorder(productId, ids)); setNotice("Görsel sırası güncellendi."); }
    catch (failure) { setError(safeMessage(failure)); if (failure instanceof ProductMediaApiError && failure.code === "version_conflict") await load(); }
    finally { setBusy(""); }
  }

  async function archive() {
    if (archiveTarget === undefined) return;
    setBusy(`archive-${archiveTarget.id}`); setError(""); setNotice("");
    try {
      await productMediaApi.archive(productId, archiveTarget.id, archiveTarget.version);
      setMedia((current) => Object.freeze(current.filter((item) => item.id !== archiveTarget.id)));
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

  return (
    <section className="product-media-section" aria-labelledby="product-media-title">
      <div className="section-heading-row">
        <div><span className="eyebrow">ÜRÜN GÖRSELLERİ</span><h2 id="product-media-title">Fotoğraflar</h2><p>PNG, JPEG veya WebP · en fazla 5 MB · ilk görsel birincildir.</p></div>
      </div>
      {error ? <div className="feedback feedback-error" role="alert"><div><strong>Görsel işlemi tamamlanamadı</strong><p>{error}</p></div></div> : null}
      {notice ? <div className="feedback feedback-success" role="status"><div><strong>Bilgi</strong><p>{notice}</p></div></div> : null}

      <form ref={mediaUploadCardRef} className="media-upload-card" onSubmit={upload} tabIndex={-1}>
        <label className="media-picker">
          <span>{selectedFile ? "Başka görsel seç" : "Görsel seç"}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile} disabled={busy !== ""} />
        </label>
        <div className="media-upload-preview">
          {previewUrl ? <img src={previewUrl} alt="Yüklenecek görsel önizlemesi" /> : <span aria-hidden="true">◇</span>}
          <label className="field"><span>Alt metin</span><input name="altText" maxLength={500} placeholder="Görseli erişilebilir biçimde açıklayın" disabled={busy !== ""} /></label>
        </div>
        {busy === "upload" ? <div className="upload-progress"><span>Yükleme ilerlemesi</span><progress role="progressbar" max="100" value={uploadProgress}>{uploadProgress}%</progress><b>{uploadProgress}%</b></div> : null}
        <div className="form-actions"><button className="button button-primary" type="submit" disabled={busy !== "" || selectedFile === undefined}>{busy === "upload" ? "Yükleniyor…" : "Görseli yükle"}</button></div>
      </form>

      {loading ? <div className="catalog-loading" role="status"><span className="spinner" aria-hidden="true" /> Görseller yükleniyor…</div> : media.length === 0 ? (
        <div className="empty-variants"><strong>Henüz ürün görseli yok</strong><p>İlk görsel mağazada ürünün birincil görseli olacaktır.</p></div>
      ) : (
        <div className="product-media-grid">
          {media.map((item, index) => (
            <article className="product-media-card" key={item.id}>
              <div className="media-thumbnail"><img src={item.publicUrl} alt={item.altText} />{index === 0 ? <span>Birincil görsel</span> : null}</div>
              <form onSubmit={(event) => void updateAlt(event, item)} key={item.version}>
                <label className="field"><span>Alt metin</span><input name="altText" maxLength={500} defaultValue={item.altText} disabled={busy !== ""} /></label>
                <button className="button button-secondary" type="submit" disabled={busy !== ""}>{busy === `alt-${item.id}` ? "Kaydediliyor…" : "Alt metni kaydet"}</button>
              </form>
              <div className="media-order-controls" aria-label="Görsel sırası">
                <button type="button" className="button button-secondary" onClick={() => void move(index, -1)} disabled={busy !== "" || index === 0}>↑ Yukarı taşı</button>
                <button type="button" className="button button-secondary" onClick={() => void move(index, 1)} disabled={busy !== "" || index === media.length - 1}>↓ Aşağı taşı</button>
                <button type="button" className="text-danger-button" onClick={(event) => { archiveTriggerRef.current = event.currentTarget; setArchiveTarget(item); }} disabled={busy !== ""}>Arşivle</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {archiveTarget ? (
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
