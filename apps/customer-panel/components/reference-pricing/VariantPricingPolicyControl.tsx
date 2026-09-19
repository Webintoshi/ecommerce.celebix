"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ReferenceIdentity, VariantPricingPolicy } from "@celebix/saas-contracts";
import type { VariantPolicyPreview, VariantPolicyProjection } from "@celebix/saas-data";

import { ReferencePricingApiError, referencePricingApi, referencePricingErrorState } from "@/lib/reference-pricing-ui/client";
import { buildVariantPricingPolicy, canSaveVariantPolicy, type VariantPolicyDraft } from "@/lib/reference-pricing-ui/model";
import styles from "./reference-pricing.module.css";

type Method = VariantPricingPolicy["method"];
type LaborMode = "none" | "per_item_try" | "per_gram_try";
type Editor = Readonly<{
  method: Method;
  referenceId: string;
  sourceText: string;
  gramsText: string;
  purityMode: "direct" | "ratio";
  productPurityText: string;
  laborMode: LaborMode;
  laborText: string;
  upliftText: string;
  allowFullDiscount: boolean;
}>;

const displayDecimal = (value?: string) => value?.replace(".", ",") ?? "";
const label = (method: Method) => method === "fixed_try" ? "Sabit TL" : method === "usd" ? "USD bazlı" : method === "eur" ? "EUR bazlı" : "Gram altın bazlı";
const sourceLabel = (source: VariantPolicyPreview["sourceKind"]) => source === "price_list" ? "Fiyat listesi" : source === "base" ? "Varyant tabanı" : "Eski fiyat çözümlenemedi";
function formatStoredCents(cents: number): string {
  const exact = BigInt(cents);
  return `${new Intl.NumberFormat("tr-TR").format(exact / 100n)},${String(exact % 100n).padStart(2, "0")} ₺`;
}
const formatPreviewCents = (cents: number | null) => cents === null ? "Hesaplanamıyor" : formatStoredCents(cents);
function PolicyPreviewDetails({ result, definitions }: Readonly<{ result: VariantPolicyPreview; definitions: readonly ReferenceIdentity[] }>) {
  const reference = definitions.find((item) => item.id === result.referenceId);
  return <section className={styles.policyPreview} aria-label="Kaydetmeden önce TL fiyat önizlemesi" aria-live="polite">
    <div><h4>Sunucu fiyat önizlemesi</h4><p>Bu hesap kayıt değildir. Referans veya fiyat listesi değişirse kaydetme işlemi yeniden önizleme ister.</p></div>
    <div className={styles.priceComparison}>
      <div><span>Önce · {sourceLabel(result.sourceKind)}</span><strong>{formatPreviewCents(result.oldPriceCents)}</strong></div>
      <div><span>Sonra · {result.priceListId ? "Fiyat listesi geçerli" : label(result.method)}</span><strong>{formatPreviewCents(result.newPriceCents)}</strong></div>
    </div>
    {result.priceListId ? <p className={styles.policyHelp}>Bu varyant için fiyat listesi önceliklidir. Yöntem kaydedilse de liste geçerliyken satış fiyatı onun tutarıdır.</p> : null}
    {result.oldPriceCents === null ? <p className={styles.policyHelp}>Eski fiyat şu anda çözümlenemiyor; yeni tutar varsa ayrıca değerlendirip kaydedebilirsiniz.</p> : null}
    {result.newPriceCents === null ? <p className={styles.feedback} role="alert">Yeni TL fiyatı çözümlenemiyor. Bu önizleme kaydedilemez.</p> : null}
    <dl className={styles.policyTrace}>
      <div><dt>Yöntem</dt><dd>{label(result.method)}</dd></div>
      <div><dt>Referans</dt><dd>{reference?.label ?? (result.referenceId ? "Seçili mağaza referansı" : "Gerekmez")}</dd></div>
      <div><dt>Etkin referans sürümü</dt><dd>{result.activeSetVersion === null ? "Yok" : `v${result.activeSetVersion}`}</dd></div>
      <div><dt>Referans kuru / gram değeri</dt><dd>{result.referenceRateTry === null ? "Yok" : `${displayDecimal(result.referenceRateTry)} TL`}</dd></div>
      <div><dt>Metal / döviz bileşeni</dt><dd>{result.metalComponentTry === null ? "Yok" : `${displayDecimal(result.metalComponentTry)} TL`}</dd></div>
      <div><dt>İşçilik</dt><dd>{result.laborTry === null ? "Yok" : `${displayDecimal(result.laborTry)} TL`}</dd></div>
      <div><dt>Politika / varyant sürümü</dt><dd>v{result.policyVersion} / v{result.variantVersion}</dd></div>
      {result.priceListId ? <div><dt>Mevcut fiyat kaynağı</dt><dd>Fiyat listesi</dd></div> : null}
    </dl>
    <p className={styles.policyHelp}>Tutarlar, seçili mağaza referansı ve satış kanalı üzerinden sunucuda hesaplandı; piyasa verisi değildir.</p>
  </section>;
}
function policyFromEditor(editor: Editor, definitions: readonly ReferenceIdentity[], fixedPriceCents: number): VariantPricingPolicy {
  let intent: VariantPolicyDraft;
  if (editor.method === "fixed_try") intent = { method: "fixed_try", fixedPriceCents };
  else if (editor.method === "usd" || editor.method === "eur") intent = { method: editor.method, referenceId: editor.referenceId, sourceText: editor.sourceText,
    upliftText: editor.upliftText, laborMode: editor.laborMode === "per_gram_try" ? "none" : editor.laborMode, laborText: editor.laborText,
  };
  else intent = { method: "gold_gram", referenceId: editor.referenceId, gramsText: editor.gramsText, purityMode: editor.purityMode,
    productPurityText: editor.productPurityText, laborMode: editor.laborMode, laborText: editor.laborText,
    upliftText: editor.upliftText, allowFullDiscount: editor.allowFullDiscount,
  };
  const selected = definitions.find((item) => item.id === editor.referenceId);
  if (editor.method !== "fixed_try" && (!selected || selected.kind !== editor.method
    || (editor.method === "gold_gram" && editor.purityMode === "ratio" && !selected.referencePurity))) throw new TypeError("reference_pricing_draft_reference_invalid");
  return buildVariantPricingPolicy(intent);
}
function editorFromPolicy(policy?: VariantPricingPolicy): Editor {
  const dynamic = policy && policy.method !== "fixed_try" ? policy : undefined;
  return Object.freeze({
    method: policy?.method ?? "fixed_try",
    referenceId: dynamic?.referenceId ?? "",
    sourceText: policy?.method === "usd" || policy?.method === "eur" ? displayDecimal(policy.sourceAmount) : "",
    gramsText: policy?.method === "gold_gram" ? displayDecimal(policy.metalGrams) : "",
    purityMode: policy?.method === "gold_gram" ? policy.purityMode : "direct",
    productPurityText: policy?.method === "gold_gram" ? displayDecimal(policy.productPurity) : "",
    laborMode: dynamic?.laborMode ?? "none",
    laborText: displayDecimal(dynamic?.laborAmount),
    upliftText: displayDecimal(dynamic?.upliftPercent) || "0",
    allowFullDiscount: policy?.method === "gold_gram" ? policy.allowFullDiscount : false,
  });
}

export function VariantPricingPolicyControl(props: Readonly<{
  variantId: string;
  variantVersion: number;
  fixedPriceCents: number;
  canManage: boolean;
  onSaved(): void;
  onClose(): void;
}>) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [projection, setProjection] = useState<VariantPolicyProjection | null>(null);
  const [definitions, setDefinitions] = useState<readonly ReferenceIdentity[]>([]);
  const [editor, setEditor] = useState<Editor>(() => editorFromPolicy());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const [locked, setLocked] = useState(false);
  const [previewPhase, setPreviewPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [reviewed, setReviewed] = useState<Readonly<{ policy: VariantPricingPolicy; result: VariantPolicyPreview }> | null>(null);
  const previewAbort = useRef<AbortController | null>(null);
  const previewGeneration = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    previewAbort.current?.abort();
    previewGeneration.current += 1;
    setReviewed(null);
    setPreviewPhase("idle");
    setPhase("loading");
    void Promise.all([
      referencePricingApi.getPolicy(props.variantId, controller.signal).catch((failure: unknown) => {
        if (failure instanceof ReferencePricingApiError && failure.code === "not_found") return null;
        throw failure;
      }),
      referencePricingApi.listDefinitions(controller.signal),
    ]).then(([selected, list]) => {
      if (controller.signal.aborted) return;
      setProjection(selected);
      setDefinitions(list.items);
      setEditor(editorFromPolicy(selected?.policy));
      setPhase("ready");
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      setProblem(referencePricingErrorState(failure) === "denied" ? "Bu varyantın fiyatlandırma politikasını görüntüleme yetkiniz yok." : "Fiyat yöntemi yüklenemedi. Yeniden deneyin.");
      setPhase("error");
    });
    return () => { controller.abort(); previewAbort.current?.abort(); previewGeneration.current += 1; };
  }, [props.variantId]);

  function clearPreview() {
    previewAbort.current?.abort();
    previewAbort.current = null;
    previewGeneration.current += 1;
    setReviewed(null);
    setPreviewPhase("idle");
  }
  function update(patch: Partial<Editor>) { clearPreview(); setEditor((current) => ({ ...current, ...patch })); setProblem(""); setNotice(""); }
  function changeMethod(method: Method) {
    const first = definitions.find((item) => item.kind === method);
    update({ method, referenceId: first?.id ?? "", laborMode: "none", laborText: "", upliftText: "0" });
  }

  async function previewCandidate() {
    if (busy || locked || previewPhase === "loading") return;
    setProblem(""); setNotice("");
    let selectedPolicy: VariantPricingPolicy;
    try { selectedPolicy = policyFromEditor(editor, definitions, props.fixedPriceCents); }
    catch { setProblem("Yöntem için uygun referansı ve miktar, gram, saflık, işçilik, ek yüzde alanlarını kontrol edin. Virgüllü ondalık kullanın."); return; }
    clearPreview();
    const controller = new AbortController();
    previewAbort.current = controller;
    const generation = previewGeneration.current;
    setPreviewPhase("loading");
    try {
      const result = await referencePricingApi.previewPolicy({ variantId: props.variantId, policy: selectedPolicy, channel: "storefront" }, controller.signal);
      if (controller.signal.aborted || generation !== previewGeneration.current) return;
      setReviewed({ policy: selectedPolicy, result });
      setPreviewPhase("ready");
      if (result.newPriceCents === null) setProblem("Yeni fiyat bu referanslarla hesaplanamıyor. Eksik veya pasif referansı düzeltmeden kaydedemezsiniz.");
      else if (result.variantVersion !== (projection?.variantVersion ?? props.variantVersion) || result.policyVersion !== (projection?.version ?? 0))
        setProblem("Varyant veya politika önizleme sırasında değişmiş. Sunucudaki sürümü yenileyin.");
    } catch (failure) {
      if (controller.signal.aborted || generation !== previewGeneration.current) return;
      setPreviewPhase("error");
      setProblem(referencePricingErrorState(failure) === "denied" ? "Önizleme yetkiniz yok." : "TL fiyat önizlemesi yüklenemedi. Girdileriniz korundu; yeniden deneyin.");
    } finally { if (previewAbort.current === controller) previewAbort.current = null; }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!props.canManage || busy || locked || !reviewed) return;
    let selectedPolicy: VariantPricingPolicy;
    try { selectedPolicy = policyFromEditor(editor, definitions, props.fixedPriceCents); }
    catch { clearPreview(); setProblem("Alanlar değişti veya geçersiz. Sunucuda yeniden önizleyin."); return; }
    const expectedVariantVersion = projection?.variantVersion ?? props.variantVersion;
    const expectedPolicyVersion = projection?.version ?? 0;
    if (!canSaveVariantPolicy({ variantId: props.variantId, expectedVariantVersion, expectedPolicyVersion,
      previewedPolicy: reviewed.policy, candidatePolicy: selectedPolicy, preview: reviewed.result })) {
      clearPreview(); setProblem("Önizleme artık bu varyantla eşleşmiyor. Kaydetmeden önce yeniden önizleyin."); return;
    }
    if (!window.confirm(`Sunucunun önizlediği fiyat ${formatPreviewCents(reviewed.result.oldPriceCents)} → ${formatPreviewCents(reviewed.result.newPriceCents)}. ${label(editor.method)} yöntemiyle kaydedilsin mi?`)) return;
    setProblem(""); setNotice("");
    setBusy(true);
    try {
      const saved = await referencePricingApi.savePolicy({ variantId: props.variantId, expectedVariantVersion,
        expectedPolicyVersion, expectedScopeDigest: reviewed.result.scopeDigest, policy: selectedPolicy });
      setProjection(saved);
      setEditor(editorFromPolicy(saved.policy));
      clearPreview();
      setNotice("Önizlenen fiyat yöntemi kaydedildi. Güncel TL fiyatı ve varyant sürümü sunucudan yenileniyor.");
      props.onSaved();
    } catch (failure) {
      const state = referencePricingErrorState(failure);
      if (state === "verification_unavailable") {
        setLocked(true);
        setProblem("Kaydın sonucu doğrulanamıyor. Tekrar göndermeyin; tam sayfa yenileme ile sunucu durumunu kontrol edin.");
      } else if (state === "conflict") { clearPreview(); setProblem("Varyant, fiyat listesi veya referans önizlemeden sonra değişti. Girdileriniz korundu; sunucuda yeniden önizleyin."); }
      else if (state === "denied") setProblem("Bu fiyat yöntemini kaydetme yetkiniz yok.");
      else setProblem("Fiyat yöntemi kaydedilemedi. Girdileriniz korundu; bağlantıyı kontrol edip yeniden deneyin.");
    } finally { setBusy(false); }
  }

  return <section className={styles.policy} aria-label="Varyant fiyatlandırma yöntemi">
    <div className={styles.policyHeading}><div><h3>Fiyatlandırma yöntemi</h3><p>Varyanta özel; mevcut katalog fiyatı ve maliyet alanlarından ayrıdır.</p></div><button type="button" onClick={props.onClose} aria-label="Fiyat yöntemini kapat">Kapat</button></div>
    {phase === "loading" ? <p className={styles.state} role="status">Fiyat yöntemi yükleniyor…</p> : null}
    {phase === "error" ? <p className={styles.feedback} role="alert">{problem}</p> : null}
    {phase === "ready" ? <>
      <p className={styles.policyHelp}>Mevcut yöntem: <strong>{label(projection?.policy.method ?? "fixed_try")}</strong>{projection ? ` · Politika sürümü v${projection.version}` : " · Eski sabit TL varyantı"}. Referans değişimi, maliyet alanınızı değiştirmez.</p>
      <p className={styles.policyHelp}>Katalogda kayıtlı sabit TL tabanı: <strong>{formatStoredCents(props.fixedPriceCents)}</strong>. Referans bazlı yöntemde bu tutar güncel efektif satış fiyatı değildir.</p>
      {notice ? <p className={styles.success} role="status">{notice}</p> : null}
      {problem ? <p className={styles.feedback} role="alert">{problem}</p> : null}
      {locked ? <p className={styles.warning} role="alert"><a href="/products">İşlemi tekrar göndermeden sayfayı tamamen yenileyin.</a></p> : null}
      {props.canManage ? <form className={styles.policyForm} onSubmit={(event) => void save(event)}><div className={styles.policyFields}>
        <label><span>Yöntem</span><select value={editor.method} onChange={(event) => changeMethod(event.target.value as Method)} disabled={busy || locked}><option value="fixed_try">Sabit TL</option><option value="usd">USD bazlı</option><option value="eur">EUR bazlı</option><option value="gold_gram">Gram altın bazlı</option></select></label>
        {editor.method === "fixed_try" ? <p className={styles.policyHelp}>Sabit TL’ye dönüş, yukarıdaki kayıtlı TL tabanını kullanır. Farklı tutar gerekiyorsa önce varyantın “Düzenle” alanında değiştirin.</p> : <>
          <label><span>Mağaza referansı</span><select required value={editor.referenceId} onChange={(event) => update({ referenceId: event.target.value })} disabled={busy || locked}><option value="">Referans seçin</option>{definitions.filter((item) => item.kind === editor.method).map((item) => <option value={item.id} key={item.id}>{item.label}{item.referencePurity ? ` · saflık ${displayDecimal(item.referencePurity)}` : ""}</option>)}</select></label>
          {editor.method === "gold_gram" ? <label><span>Fiyatlandırma gramı</span><input required inputMode="decimal" value={editor.gramsText} onChange={(event) => update({ gramsText: event.target.value })} placeholder="2,500000" disabled={busy || locked} /><small>Kargo ağırlığı veya stok miktarı değildir.</small></label> : <label><span>Baz satış tutarı ({editor.method.toUpperCase()})</span><input required inputMode="decimal" value={editor.sourceText} onChange={(event) => update({ sourceText: event.target.value })} placeholder="2,50" disabled={busy || locked} /></label>}
          {editor.method === "gold_gram" ? <><label><span>Saflık hesabı</span><select value={editor.purityMode} onChange={(event) => update({ purityMode: event.target.value as "direct" | "ratio" })} disabled={busy || locked}><option value="direct">Doğrudan tarife</option><option value="ratio">Ürün / referans saflık oranı</option></select></label>{editor.purityMode === "ratio" ? <label><span>Ürün saflığı</span><input required inputMode="decimal" value={editor.productPurityText} onChange={(event) => update({ productPurityText: event.target.value })} placeholder="0,750" disabled={busy || locked} /></label> : null}</> : null}
          <label><span>İşçilik</span><select value={editor.laborMode} onChange={(event) => update({ laborMode: event.target.value as LaborMode })} disabled={busy || locked}><option value="none">Yok</option><option value="per_item_try">Ürün başına TL</option>{editor.method === "gold_gram" ? <option value="per_gram_try">Gram başına TL</option> : null}</select></label>
          {editor.laborMode !== "none" ? <label><span>İşçilik tutarı (TL)</span><input required inputMode="decimal" value={editor.laborText} onChange={(event) => update({ laborText: event.target.value })} placeholder="0,00" disabled={busy || locked} /></label> : null}
          <label><span>Ek fiyat yüzdesi</span><input required inputMode="decimal" value={editor.upliftText} onChange={(event) => update({ upliftText: event.target.value })} placeholder="0" disabled={busy || locked} /></label>
          {editor.method === "gold_gram" ? <label className={styles.toggle}><input type="checkbox" checked={editor.allowFullDiscount} onChange={(event) => update({ allowFullDiscount: event.target.checked })} disabled={busy || locked} /><span>İndirim metal ve işçilik toplamına uygulanabilir</span></label> : null}
        </>}
      </div><p className={styles.policyHelp}>Yeni TL tutarı tarayıcıda hesaplanmaz. Kaydetmeden önce sunucu fiyatı ve referans sürümünü gösterir; kayıt anında aynı kapsamı yeniden doğrular. <Link href="/settings/pricing">Kur ve altın referansları</Link></p>
      {previewPhase === "loading" ? <p className={styles.state} role="status">TL fiyatı ve referans sürümü sunucuda hesaplanıyor…</p> : null}
      {reviewed ? <PolicyPreviewDetails result={reviewed.result} definitions={definitions} /> : null}
      <div className={styles.policyActions}>
        <button className={reviewed ? undefined : styles.primary} type="button" onClick={() => void previewCandidate()} disabled={busy || locked || previewPhase === "loading"}>{previewPhase === "loading" ? "Hesaplanıyor…" : reviewed ? "Yeniden önizle" : "TL fiyatını önizle"}</button>
        {reviewed ? <button className={styles.primary} type="submit" disabled={busy || locked || !canSaveVariantPolicy({
          variantId: props.variantId, expectedVariantVersion: projection?.variantVersion ?? props.variantVersion,
          expectedPolicyVersion: projection?.version ?? 0, previewedPolicy: reviewed.policy,
          candidatePolicy: reviewed.policy, preview: reviewed.result,
        })}>{busy ? "Kaydediliyor…" : "Önizlenen yöntemi kaydet"}</button> : null}
        <button type="button" onClick={props.onClose}>Vazgeç</button>
      </div></form> : <div className={styles.policyForm}>
        <p className={styles.state}>Fiyat yöntemini görüntüleme modundasınız; değiştirmek için fiyatlandırma yetkisi gerekir.</p>
        {previewPhase === "loading" ? <p className={styles.state} role="status">TL fiyatı sunucuda hesaplanıyor…</p> : null}
        {reviewed ? <PolicyPreviewDetails result={reviewed.result} definitions={definitions} /> : null}
        <div className={styles.policyActions}><button type="button" onClick={() => void previewCandidate()} disabled={locked || previewPhase === "loading"}>{previewPhase === "loading" ? "Hesaplanıyor…" : "Mevcut TL fiyatını önizle"}</button></div>
      </div>}
    </> : null}
  </section>;
}
