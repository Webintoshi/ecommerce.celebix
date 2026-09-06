"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PROMOTION_PICKER_KINDS, type PromotionPickerKind } from "@celebix/saas-contracts";
import { PromotionTargetPageLoader, promotionApi } from "@/lib/promotion-ui/client";
import { updatePromotionDraft, type PromotionDraft, type PromotionTarget } from "@/lib/promotion-ui/model";
import styles from "./promotion-studio.module.css";

const KIND_LABELS: Readonly<Record<PromotionPickerKind, string>> = Object.freeze({
  product: "Ürün", variant: "Varyant", category: "Kategori", brand: "Marka", collection: "Koleksiyon",
  customer_segment: "Müşteri grubu", customer_tag: "Müşteri etiketi", masked_customer: "Maskeli müşteri", abandoned_cart: "Terk edilmiş sepet",
  payment_method: "Ödeme yöntemi", shipping_method: "Kargo yöntemi",
});

type PickerProps = Readonly<{
  title: string;
  help: string;
  kinds: readonly PromotionPickerKind[];
  selected: readonly PromotionTarget[];
  onChange(next: readonly PromotionTarget[]): void;
}>;

export function PromotionPicker({ title, help, kinds, selected, onChange }: PickerProps) {
  const [kind, setKind] = useState<PromotionPickerKind>(kinds[0] ?? "product");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<readonly PromotionTarget[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [displaySelected, setDisplaySelected] = useState<readonly PromotionTarget[]>(selected);
  const pageLoader = useMemo(() => new PromotionTargetPageLoader(promotionApi), []);
  const requestKey = useRef(0);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const selectedForKind = useMemo(() => selected.filter((item) => item.kind === kind), [kind, selected]);
  const selectedIdentity = selectedForKind.map((item) => item.id).sort().join(",");
  const allSelectedIdentity = selected.map((item) => `${item.kind}:${item.id}`).sort().join(",");

  useEffect(() => {
    setDisplaySelected((current) => {
      const currentById = new Map(current.map((item) => [`${item.kind}:${item.id}`, item]));
      return selected.map((item) => currentById.get(`${item.kind}:${item.id}`) ?? item);
    });
  }, [allSelectedIdentity]);

  useEffect(() => {
    if (!kinds.includes(kind)) setKind(kinds[0] ?? "product");
  }, [kind, kinds]);

  useEffect(() => {
    pageLoader.invalidate();
    const controller = new AbortController();
    const generation = ++requestKey.current;
    setPhase("loading"); setItems([]); setNextCursor(null);
    const timer = window.setTimeout(() => {
      void Promise.all([
        promotionApi.targets(kind, search.trim() ? { search: search.trim() } : {}, controller.signal),
        promotionApi.resolveTargets(kind, selectedRef.current.filter((item) => item.kind === kind).map((item) => item.id), controller.signal),
      ]).then(([page, resolved]) => {
        if (controller.signal.aborted || generation !== requestKey.current) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setPhase("ready");
        if (selectedRef.current.some((item) => item.kind === kind)) {
          setDisplaySelected((current) => promotionApi.reconcileTargetSelections(current, selectedRef.current, kind, resolved));
        }
      }).catch(() => {
        if (!controller.signal.aborted && generation === requestKey.current) setPhase("error");
      });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); pageLoader.invalidate(); };
  }, [kind, search, selectedIdentity, pageLoader]);

  useEffect(() => () => pageLoader.dispose(), [pageLoader]);

  const toggle = (item: PromotionTarget) => {
    const exists = selected.some((current) => current.kind === item.kind && current.id === item.id);
    if (exists) onChange(selected.filter((current) => current.kind !== item.kind || current.id !== item.id));
    else if (item.status === "active") onChange([...selected, item]);
  };

  const loadMore = () => {
    if (!nextCursor) return;
    const cursor = nextCursor;
    const selectedKind = kind;
    const selectedSearch = search.trim();
    void pageLoader.load(selectedKind, { cursor, ...(selectedSearch ? { search: selectedSearch } : {}) }).then((page) => {
      if (!page) return;
      setItems((current) => promotionApi.mergeTargetSelections(current, page.items));
      setNextCursor(page.nextCursor);
      setPhase("ready");
    }).catch(() => setPhase("error"));
  };

  return <section className={styles.picker}>
    <div><h3>{title}</h3><p>{help}</p></div>
    {kinds.length > 1 ? <label>Ne seçmek istiyorsunuz?<select value={kind} onChange={(event) => setKind(event.target.value as PromotionPickerKind)}>{kinds.map((value) => <option key={value} value={value}>{KIND_LABELS[value]}</option>)}</select></label> : null}
    <label>Listede ara<input type="search" value={search} placeholder={`Örnek: ${KIND_LABELS[kind].toLocaleLowerCase("tr-TR")} adı`} onChange={(event) => setSearch(event.target.value)} /></label>
    <p aria-live="polite"><strong>{selected.length}</strong> kayıt seçildi</p>
    {displaySelected.length > 0 ? <div className={styles.chips} aria-label="Seçilen kayıtlar">{displaySelected.map((item) => <button key={`${item.kind}:${item.id}`} type="button" className={item.status === "unavailable" ? styles.unavailable : undefined} onClick={() => toggle(item)}>{item.status === "unavailable" ? "Artık kullanılamıyor — kaldır" : item.label}<span aria-hidden="true"> ×</span></button>)}</div> : null}
    {phase === "loading" ? <p role="status">Seçenekler yükleniyor…</p> : null}
    {phase === "error" ? <p role="alert">Seçenekler yüklenemedi. Aramanızı değiştirip tekrar deneyin.</p> : null}
    {phase === "ready" && items.length === 0 ? <p>Aramanızla eşleşen aktif kayıt bulunamadı.</p> : null}
    {phase === "ready" ? <div className={styles.pickerResults}>{items.map((item) => {
      const checked = selectedForKind.some((current) => current.id === item.id);
      return <label key={item.id}><input type="checkbox" checked={checked} disabled={item.status !== "active"} onChange={() => toggle(item)} />{item.label}</label>;
    })}</div> : null}
    {phase === "ready" && nextCursor ? <button type="button" className={styles.secondaryButton} onClick={loadMore}>Daha fazla göster</button> : null}
  </section>;
}

const CATALOG_KINDS = PROMOTION_PICKER_KINDS.filter((kind) => ["product", "variant", "category", "brand", "collection"].includes(kind));

export function PromotionTargetPicker({ draft, mode, onChange }: Readonly<{ draft: PromotionDraft; mode: "include" | "exclude"; onChange(next: PromotionDraft): void }>) {
  const selected = mode === "include" ? draft.selectedTargets : draft.excludedTargets;
  return <PromotionPicker
    title={mode === "include" ? "Dahil edilecek ürünler" : "Hariç tutulacak ürünler"}
    help={mode === "include" ? "Boş bırakırsanız kampanya tüm mağazada geçerli olur." : "İndirim uygulanmamasını istediğiniz kayıtları seçin."}
    kinds={CATALOG_KINDS}
    selected={selected}
    onChange={(next) => onChange(updatePromotionDraft(draft, mode === "include" ? { selectedTargets: next } : { excludedTargets: next }))}
  />;
}
