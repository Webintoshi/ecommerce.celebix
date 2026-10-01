"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import styles from "./variant-gallery.module.css";
export type VariantGalleryMedia = Readonly<{
    id: string;
    url: string;
    altText: string;
    variantId?: string;
}>;
export type VariantGalleryTarget = Readonly<{
    id: string;
    title: string;
    attributes: Readonly<Record<string, string>>;
}>;
export type VariantGalleryAssignment = Readonly<{
    variantId: string;
    mediaIds: readonly string[];
}>;
export function VariantGalleryDialog({ variant, variants, media, selectedIds, onApply, onClose, operationRevision = 1, onReload }: Readonly<{
    variant: VariantGalleryTarget;
    variants: readonly VariantGalleryTarget[];
    media: readonly VariantGalleryMedia[];
    selectedIds: readonly string[];
    onApply(assignments: readonly VariantGalleryAssignment[], operationId: string): Promise<void>;
    onClose(): void;
    operationRevision?: number;
    onReload?(): Promise<void>;
}>) {
    const headingId = useId();
    const descriptionId = useId();
    const [ids, setIds] = useState<readonly string[]>(() => selectedIds.filter(id => media.some(item => item.id === id)).slice(0, 16));
    const [attribute, setAttribute] = useState("");
    const [targets, setTargets] = useState<readonly string[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const dialog = useRef<HTMLDivElement>(null);
    const operation = useRef<{
        fingerprint: string;
        id: string;
    } | undefined>(undefined);
    const lock = useRef(false);
    const selected = ids.flatMap(id => media.find(item => item.id === id) ?? []);
    const candidates = attribute ? variants.filter(item => item.id !== variant.id && Object.hasOwn(item.attributes, attribute) && item.attributes[attribute] === variant.attributes[attribute]) : [];
    useEffect(() => {
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
        // Keep keyboard and assistive technology on the current decision.
        const siblings: {
            element: HTMLElement;
            inert: boolean;
        }[] = [];
        let current: HTMLElement | null = dialog.current?.parentElement ?? null;
        while (current && current !== document.body) {
            for (const sibling of current.parentElement?.children ?? [])
                if (sibling !== current && sibling instanceof HTMLElement) {
                    siblings.push({ element: sibling, inert: sibling.inert });
                    sibling.inert = true;
                }
            current = current.parentElement;
        }
        return () => { document.body.style.overflow = previousOverflow; for (const item of siblings)
            item.element.inert = item.inert; if (previous?.isConnected)
            previous.focus(); };
    }, []);
    function keys(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === "Escape" && !lock.current) {
            event.preventDefault();
            event.stopPropagation();
            onClose();
            return;
        }
        if (event.key !== "Tab")
            return;
        const focusable = [...dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []];
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
        }
        else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
        }
    }
    function toggle(id: string) { setIds(current => current.includes(id) ? current.filter(item => item !== id) : current.length < 16 ? [...current, id] : current); }
    function move(index: number, delta: number) { setIds(current => { const next = [...current], destination = index + delta; if (destination < 0 || destination >= next.length)
        return current; [next[index], next[destination]] = [next[destination]!, next[index]!]; return next; }); }
    async function apply() {
        if (lock.current)
            return;
        const assignments = [variant.id, ...targets].map(variantId => ({ variantId, mediaIds: ids }));
        const fingerprint = JSON.stringify([operationRevision, assignments]);
        if (operation.current?.fingerprint !== fingerprint)
            operation.current = { fingerprint, id: crypto.randomUUID() };
        lock.current = true;
        setBusy(true);
        try {
            await onApply(assignments, operation.current.id);
            setError("");
        }
        catch (failure) {
            setError(failure instanceof Error ? failure.message : "Görseller kaydedilemedi. Seçiminiz korunuyor; tekrar deneyin.");
        }
        finally {
            lock.current = false;
            setBusy(false);
        }
    }
    return <div className={styles.backdrop}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={headingId} aria-describedby={descriptionId} className={styles.dialog} onKeyDown={keys} aria-busy={busy}>
      <header className={styles.header}><div><h2 id={headingId}>Varyant görselleri</h2><p id={descriptionId}>{variant.title}</p></div><button type="button" className={styles.close} aria-label="Görsel seçimini kapat" disabled={busy} onClick={onClose}>×</button></header>
      <div className={styles.body}>
        {error ? <div className="feedback feedback-error" role="alert">{error}{onReload ? <button type="button" disabled={busy} onClick={async () => { if (lock.current)
        return; lock.current = true; setBusy(true); try {
        await onReload();
        setError("");
    }
    catch {
        setError("Güncel galeri yüklenemedi. Seçiminiz korunuyor; tekrar deneyin.");
    }
    finally {
        lock.current = false;
        setBusy(false);
    } }}>Güncel sürümü yükle</button> : null}</div> : null}
        <div className={styles.sectionHeading}><strong>Ürün görselleri</strong><span>{ids.length} / 16 seçili</span></div>
        {media.length ? <div className={styles.mediaGrid}>{media.map((item, index) => <button key={item.id} type="button" className={styles.media} data-selected={ids.includes(item.id)} aria-pressed={ids.includes(item.id)} aria-label={`${item.altText || `${index + 1}.`} görselini seç`} disabled={busy || (!ids.includes(item.id) && ids.length >= 16)} onClick={() => toggle(item.id)}><img src={item.url} alt={item.altText}/><span>{ids.includes(item.id) ? ids.indexOf(item.id) + 1 : "Seç"}</span></button>)}</div> : <p>Önce ürüne görsel ekleyin.</p>}
        <div className={styles.sectionHeading}><strong>Galeri sırası</strong><button type="button" disabled={busy} onClick={() => { setIds([]); setTargets([]); }}>Ürün görsellerini kullan</button></div>
        {selected.length ? <ol className={styles.order}>{selected.map((item, index) => <li key={item.id} data-cover={index === 0}><img src={item.url} alt=""/><span>{index === 0 ? "Kapak" : `${index + 1}. görsel`}</span><button type="button" aria-label={`${index + 1}. görseli öne taşı`} disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label={`${index + 1}. görseli arkaya taşı`} disabled={busy || index === selected.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" aria-label={`${index + 1}. görseli kaldır`} disabled={busy} onClick={() => toggle(item.id)}>×</button></li>)}</ol> : <p className={styles.quiet}>Bu varyant ürünün genel galerisini kullanır.</p>}
        {Object.keys(variant.attributes).length && variants.length > 1 ? <fieldset className={styles.batch} disabled={busy}><legend>Diğer varyantlara da uygula</legend><label>Ortak nitelik<select aria-label="Ortak nitelik" value={attribute} onChange={event => { setAttribute(event.target.value); setTargets([]); }}><option value="">Nitelik seç</option>{Object.entries(variant.attributes).map(([key, value]) => <option key={key} value={key}>{key}: {value}</option>)}</select></label>{attribute && !candidates.length ? <p>Eşleşen başka varyant yok.</p> : null}{candidates.map(item => <label key={item.id} className={styles.target}><input type="checkbox" value={item.id} checked={targets.includes(item.id)} onChange={event => setTargets(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))}/><span>{item.title}</span></label>)}</fieldset> : null}
      </div>
      <footer className={styles.footer}><button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>Vazgeç</button><button type="button" className="button button-primary" disabled={busy} onClick={() => void apply()}>{busy ? "Kaydediliyor…" : "Uygula"}</button></footer>
    </div>
  </div>;
}
