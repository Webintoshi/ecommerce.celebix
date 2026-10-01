"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { ProductVariantGallery } from "@celebix/saas-contracts";
import { productVariantMediaApi, ProductVariantMediaApiError } from "@/lib/catalog-ui/variant-media-client";
import { VariantGalleryDialog, VariantGalleryIcon, type VariantGalleryAssignment, type VariantGalleryMedia, type VariantGalleryTarget } from "./VariantGalleryDialog";
import styles from "./variant-gallery.module.css";
/** Keeps variant image selection independent of the expanded price and stock editor. */
export function ProductVariantGalleryEditor({ productId, media, variants, canManage = true, assignments = [], onAssignmentsChange, children }: Readonly<{
    productId?: string;
    media: readonly VariantGalleryMedia[];
    variants: readonly VariantGalleryTarget[];
    canManage?: boolean;
    assignments?: readonly VariantGalleryAssignment[];
    onAssignmentsChange?(value: readonly VariantGalleryAssignment[]): void;
    children(input: Readonly<{
        thumbnail(variantId: string): ReactNode;
    }>): ReactNode;
}>) {
    const [gallery, setGallery] = useState<ProductVariantGallery | undefined>();
    const [loading, setLoading] = useState(Boolean(productId));
    const [error, setError] = useState("");
    const [editing, setEditing] = useState<string>();
    const [conflict, setConflict] = useState(false);
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        if (!productId)
            return;
        let current = true;
        setLoading(true);
        void productVariantMediaApi.list(productId).then(value => { if (current) {
            setGallery(value);
            setError("");
        } }).catch(() => { if (current)
            setError("Varyant görselleri yüklenemedi. Tekrar deneyin."); }).finally(() => { if (current)
            setLoading(false); });
        return () => { current = false; };
    }, [productId, revision]);
    const links = productId ? gallery?.assignments ?? [] : assignments;
    function selected(variantId: string) { const explicit = links.find(item => item.variantId === variantId); return explicit?.mediaIds ?? media.filter(item => item.variantId === variantId).map(item => item.id); }
    function thumbnail(variantId: string) {
        const target = variants.find(item => item.id === variantId);
        if (!target)
            return null;
        const image = selected(variantId).flatMap(id => media.find(item => item.id === id) ?? [])[0] ?? media[0];
        return <button type="button" className={styles.thumbnail} title={canManage ? loading ? "Görseller yükleniyor" : "Görselleri seç" : "Görseller salt okunur"} aria-busy={loading} aria-label={`${target.title} görsellerini seç`} aria-haspopup="dialog" disabled={!canManage || loading || Boolean(productId && !gallery)} onClick={() => { setEditing(variantId); setConflict(false); }}>{loading ? <span className={styles.thumbnailSkeleton} aria-hidden="true" /> : image ? <><img src={image.url} alt=""/><span className={styles.thumbnailHint}><VariantGalleryIcon kind="image" /></span></> : <VariantGalleryIcon kind="images" />}</button>;
    }
    const target = variants.find(item => item.id === editing);
    async function apply(next: readonly VariantGalleryAssignment[], operationId: string) {
        if (productId) {
            if (!gallery)
                throw new Error("Galeri yüklenemedi. Tekrar deneyin.");
            try {
                const result = await productVariantMediaApi.save(productId, { expectedVersion: gallery.version, assignments: next, operationId });
                setGallery(result.gallery);
            }
            catch (failure) {
                if (failure instanceof ProductVariantMediaApiError && failure.code === "version_conflict")
                    setConflict(true);
                throw failure;
            }
        }
        else
            onAssignmentsChange?.(next);
        setEditing(undefined);
        setConflict(false);
    }
    async function reload() { if (!productId)
        return; const value = await productVariantMediaApi.list(productId); setGallery(value); setConflict(false); }
    return <>{error ? <div role="alert" className="feedback feedback-error">{error}<button type="button" onClick={() => setRevision(current => current + 1)}>Tekrar dene</button></div> : null}{children({ thumbnail })}{target ? <VariantGalleryDialog variant={target} variants={variants} media={media} selectedIds={selected(target.id)} onApply={apply} onClose={() => setEditing(undefined)} operationRevision={gallery?.version ?? 1} onReload={conflict ? reload : undefined}/> : null}</>;
}
