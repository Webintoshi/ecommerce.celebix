"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Barcode, Check, ChevronLeft, ChevronRight, Package, RefreshCw, SlidersHorizontal } from "lucide-react";
import type { GoogleMerchantOverview, GoogleMerchantProduct, GoogleMerchantProducts, GoogleMerchantIdentityInput } from "@celebix/saas-contracts";
import { GoogleMarketingConnections } from "@/components/google-marketing/GoogleMarketingConnections";
import { OrderActionDialog } from "@/components/orders/OrderActionDialog";
import { PanelSkeletonBlock, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { MarketplaceArtwork } from "@/components/marketplaces/MarketplaceArtwork";
import { googleMerchantClient, type GoogleMerchantClient, type GoogleMerchantPreferences } from "./client";
import { attributeDraft, attributesFromDraft, failureMessage, lastSyncLabel, productStatus, type AttributeDraft } from "./model";
import styles from "./google-merchant.module.css";

const MERCHANT_ONLY = Object.freeze(["merchant"] as const);
const currency = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
type PreferenceAttempt = { input: GoogleMerchantPreferences; operationId: string };
type Editor = { product: GoogleMerchantProduct; draft: AttributeDraft; error: string; attempt?: PreferenceAttempt };
type IdentityEditor = {ownBrand:boolean;brandName:string;version:number;dirty:boolean;error:string;attempt?:{input:GoogleMerchantIdentityInput;operationId:string}};
function code(error: unknown): string { return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "unavailable"; }

export function GoogleMerchantConsole({ canManage, client = googleMerchantClient }: Readonly<{ canManage: boolean; client?: GoogleMerchantClient }>) {
  const [overview, setOverview] = useState<GoogleMerchantOverview | null>(null);
  const [page, setPage] = useState<GoogleMerchantProducts | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [notice, setNotice] = useState("");
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [identity,setIdentity]=useState<IdentityEditor|null>(null);
  const [identitySaving,setIdentitySaving]=useState(false);
  const alive = useRef(true);
  const reads = useRef(0);
  const mutation = useRef(false);
  const syncAttempt = useRef<string | null>(null);
  const buffers = useRef(new Map<string, Editor>());
  const rowAttempts = useRef(new Map<string, PreferenceAttempt>());
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const identityRef=useRef(identity);
  identityRef.current=identity;

  async function load(cursor: string | null = cursors[pageIndex] ?? null,refreshIdentityVersion=false) {
    const ticket = ++reads.current;
    setLoading(true); setError("");
    const results = await Promise.allSettled([client.overview(), client.products(cursor ?? undefined)]);
    if (!alive.current || ticket !== reads.current) return;
    if (results[0].status === "fulfilled") {
      setOverview(results[0].value);
      const profile=results[0].value.identityProfile;
      if(profile)setIdentity(current=>current?.dirty||current?.attempt?refreshIdentityVersion&&!current.attempt?{...current,version:profile.version}:current:{ownBrand:profile.ownBrand,brandName:profile.brandName??'',version:profile.version,dirty:false,error:''});
    }
    if (results[1].status === "fulfilled") setPage(results[1].value);
    const failure = results.find(result => result.status === "rejected");
    if (failure?.status === "rejected") setError(code(failure.reason));
    setLoading(false);
    return results[1].status === "fulfilled";
  }
  useEffect(() => {
    alive.current = true;
    void load(null);
    return () => { alive.current = false; reads.current++; };
    // One local read at entry. Subsequent reads require a user action or a completed mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  function changeIdentity(field:'ownBrand'|'brandName',value:boolean|string){
    if(mutation.current)return;
    setIdentity(current=>!current||current.attempt?current:{...current,[field]:value,dirty:true,error:''});
  }
  async function saveIdentity(){
    const current=identityRef.current;
    if(!canManage||!current||mutation.current)return;
    const brandName=current.ownBrand?current.brandName.trim():null;
    if(current.ownBrand&&(!brandName||brandName.length>70||/[\x00-\x1f\x7f<>]/u.test(brandName))){setIdentity({...current,error:'invalid_input'});return;}
    const attempt=current.attempt??{input:{ownBrand:current.ownBrand,brandName,expectedVersion:current.version},operationId:crypto.randomUUID()};
    const pending={...current,dirty:true,attempt,error:''};
    setIdentity(pending);mutation.current=true;setIdentitySaving(true);
    try{
      await client.identity(attempt.input,attempt.operationId);
      if(!alive.current)return;
      setIdentity({...pending,dirty:false,attempt:undefined});
      setNotice('Marka ayarı kaydedildi. Ürünler otomatik yeniden kontrol ediliyor.');
      await load();
    }catch(caught){
      if(alive.current){const error=code(caught);const definitive=['invalid_input','membership_denied','durable_authority_invalid','not_found','version_conflict','operation_mismatch'].includes(error);setIdentity({...pending,error,...(definitive?{attempt:undefined}:{})});if(error==='version_conflict')await load(undefined,true);}
    }finally{mutation.current=false;if(alive.current)setIdentitySaving(false);}
  }

  async function sync() {
    if (!canManage || mutation.current || overview?.connection.status !== "connected") return;
    mutation.current = true; setSyncing(true); setSyncError("");
    const operationId = syncAttempt.current ?? crypto.randomUUID();
    syncAttempt.current = operationId;
    try {
      const result = await client.sync(operationId);
      if (!alive.current) return;
      syncAttempt.current = null;
      setNotice(`${result.queued} ürün kontrol ve aktarım için sıraya alındı.`);
      await load();
    } catch (caught) { if (alive.current) setSyncError(code(caught)); }
    finally { mutation.current = false; if (alive.current) setSyncing(false); }
  }
  function openEditor(product: GoogleMerchantProduct) {
    if (!canManage || mutation.current || rowAttempts.current.has(product.variantId)) return;
    setEditor(buffers.current.get(product.variantId) ?? { product, draft: attributeDraft(product), error: "" });
  }
  function changeDraft(key: keyof AttributeDraft, value: string) {
    setEditor(current => {
      if (!current || current.attempt || mutation.current) return current;
      const draft = { ...current.draft, [key]: value } as AttributeDraft;
      if (key === "identifierExists" && value === "no") { draft.gtin = ""; draft.mpn = ""; }
      const next = { ...current, draft, error: "" };
      buffers.current.set(current.product.variantId, next);
      return next;
    });
  }
  function closeEditor() {
    if (mutation.current) return;
    if (editorRef.current) buffers.current.set(editorRef.current.product.variantId, editorRef.current);
    setEditor(null);
  }
  async function saveAttributes() {
    const current = editorRef.current;
    if (!current || !canManage || mutation.current) return;
    const attributes = attributesFromDraft(current.draft);
    if (!attributes) { setEditor({ ...current, error: "invalid_input" }); return; }
    const attempt = current.attempt ?? { input: { productId: current.product.productId, enabled: current.product.enabled, attributes }, operationId: crypto.randomUUID() };
    const pending = { ...current, attempt, error: "" };
    buffers.current.set(current.product.variantId, pending);
    setEditor(pending); mutation.current = true; setSaving(true);
    try {
      await client.preferences(current.product.variantId, attempt.input, attempt.operationId);
      if (!alive.current) return;
      buffers.current.delete(current.product.variantId);
      setEditor(null); setNotice("Google bilgileri kaydedildi. Ürün yeniden kontrol ediliyor.");
      await load();
    } catch (caught) {
      if (alive.current) {
        const error = code(caught);
        const failed = { ...pending, error, ...(["invalid_input", "not_found", "membership_denied"].includes(error) ? { attempt: undefined } : {}) };
        buffers.current.set(current.product.variantId, failed); setEditor(failed);
      }
    } finally { mutation.current = false; if (alive.current) setSaving(false); }
  }
  async function setEnabled(product: GoogleMerchantProduct, enabled: boolean) {
    if (!canManage || mutation.current) return;
    const attempt = rowAttempts.current.get(product.variantId) ?? { input: { productId: product.productId, enabled, attributes: product.attributes }, operationId: crypto.randomUUID() };
    rowAttempts.current.set(product.variantId, attempt);
    mutation.current = true; setRowBusy(product.variantId); setRowErrors(value => ({ ...value, [product.variantId]: "" }));
    try {
      await client.preferences(product.variantId, attempt.input, attempt.operationId);
      if (!alive.current) return;
      rowAttempts.current.delete(product.variantId);
      setNotice(attempt.input.enabled ? "Ürün aktarımı açıldı. Ürün yeniden kontrol ediliyor." : "Ürün aktarımı kapatıldı. Google’dan kaldırma sıraya alındı.");
      await load();
    } catch (caught) {
      if (alive.current) {
        const error = code(caught);
        if (["invalid_input", "not_found", "membership_denied"].includes(error)) rowAttempts.current.delete(product.variantId);
        setRowErrors(value => ({ ...value, [product.variantId]: error }));
      }
    } finally { mutation.current = false; if (alive.current) setRowBusy(null); }
  }
  async function move(nextIndex: number, nextCursor?: string) {
    if (loading || nextIndex < 0) return;
    const next = nextCursor ? [...cursors.slice(0, nextIndex), nextCursor] : cursors;
    if (await load(next[nextIndex] ?? null)) { setCursors(next); setPageIndex(nextIndex); }
  }
  const counts = overview?.counts;
  const busy = syncing || saving || identitySaving || Boolean(rowBusy);
  const metrics = counts ? [
    ["Google onayladı", counts.approved], ["Google’a gönderildi", counts.submitted], ["Aktarıma hazır", counts.ready], ["Sırada", counts.pending],
    ["Sınırlı gösterim", counts.limited], ["Google reddetti", counts.disapproved], ["Aktarılmıyor", counts.excluded], ["Aktarılamadı", counts.failed],
  ] as const : [];
  const maxMetricCount = Math.max(1, ...metrics.map(([, value]) => value));

  return <div className={styles.workspace}>
    <h1 className="sr-only">Google Merchant Center</h1>
    <nav className={styles.back} aria-label="Pazaryeri gezinme"><Link href="/marketplaces"><ArrowLeft size={16} aria-hidden="true" />Pazaryerleri</Link></nav>
    <GoogleMarketingConnections canManage={canManage} services={MERCHANT_ONLY} onChange={() => { setCursors([undefined]); setPageIndex(0); void load(null); }} />
    {notice ? <p className={styles.notice} role="status"><Check size={16} aria-hidden="true" />{notice}</p> : null}
    {error ? <div className={styles.feedback}><p role="alert">Ürün durumu yüklenemedi. {failureMessage(error)}</p><button className="button button-secondary" type="button" disabled={loading} onClick={() => void load()}>Listeyi yeniden yükle</button></div> : null}
    {loading&&!overview?<section className={`${styles.identity} ${styles.identityLoading}`} role="status" aria-label="Ürün markası yükleniyor"><PanelSkeletonBlock className={styles.loadingLabel}/><div className={styles.identityContent}><PanelSkeletonBlock/><PanelSkeletonBlock/><PanelSkeletonBlock/></div></section>:null}
    {identity?<section className={styles.identity} aria-labelledby="merchant-identity-heading" aria-busy={identitySaving||undefined}>
      <div className={styles.sectionLabel}><Package size={20} aria-hidden="true" /><h2 id="merchant-identity-heading">Ürün markası</h2></div>
      <div className={styles.identityContent}>{canManage?<>
        <label className={styles.exportChoice}><input type="checkbox" aria-label="Markası olmayan ürünleri kendi markamızla satıyoruz" checked={identity.ownBrand} disabled={busy||Boolean(identity.attempt)} onChange={event=>changeIdentity('ownBrand',event.target.checked)}/>Markası olmayan ürünleri kendi markamızla satıyoruz</label>
        <p className={styles.help}>Yalnız ürettiğiniz veya kendi markanızla sattığınız ürünlerde stok kodu otomatik MPN olur. Mevcut üretici markası ve barkodu korunur.</p>
        <div className={styles.identityActions}>{identity.ownBrand?<label className={`${styles.field} ${styles.brandField}`}>Marka adı<input aria-label="Marka adı" autoComplete="organization" value={identity.brandName} maxLength={70} disabled={busy||Boolean(identity.attempt)} onChange={event=>changeIdentity('brandName',event.target.value)}/></label>:null}
          <button className="button button-secondary" type="button" disabled={busy||loading||!identity.dirty} onClick={()=>void saveIdentity()}>{identitySaving?'Kaydediliyor…':identity.attempt?'Marka kaydını tekrar dene':'Marka ayarını kaydet'}</button>
        </div>
        {identity.error?<p role="alert" className={styles.feedback}>{identity.error==='invalid_input'?'Geçerli marka adını yazın.':identity.error==='version_conflict'?'Marka ayarı değişti. Yazdığınız bilgiler korundu; güncel ayarla tekrar kaydedebilirsiniz.':failureMessage(identity.error)}</p>:null}
      </>:<p className={styles.help}>{identity.ownBrand?identity.brandName:'Ürünlerin mevcut üretici bilgileri kullanılır.'}</p>}</div>
    </section>:null}
    <section className={styles.products} aria-labelledby="merchant-products-heading" aria-busy={loading || undefined}>
      <div className={styles.toolbar}>
        <div><h2 id="merchant-products-heading">Ürünler</h2><p>Son tamamlanan aktarım: <strong>{lastSyncLabel(overview?.lastSyncedAt ?? null)}</strong></p></div>
        <div className={styles.toolbarActions}>
          <button type="button" className="button button-text" disabled={loading} onClick={() => void load()}><RefreshCw size={16} aria-hidden="true" />Durumu yenile</button>
          {canManage ? <button type="button" className="button button-secondary" disabled={busy || overview?.connection.status !== "connected"} onClick={() => void sync()}>{syncing ? "Sıraya alınıyor…" : syncError ? "Tekrar kontrol et" : "Ürünleri yeniden kontrol et"}</button> : null}
        </div>
      </div>
      {syncError ? <p role="alert" className={styles.feedback}>{failureMessage(syncError)}</p> : null}
      {!counts&&loading?<div className={styles.metrics} role="status" aria-label="Ürün özeti yükleniyor">{Array.from({length:8},(_,index)=><div className={styles.loadingMetric} key={index}><PanelSkeletonBlock/><PanelSkeletonBlock/><PanelSkeletonBlock/></div>)}</div>:null}
      {counts ? <dl className={styles.metrics}>{metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value.toLocaleString("tr-TR")}</dd><span className={styles.metricTrack} aria-hidden="true"><span style={{ width: `${value / maxMetricCount * 100}%` }} /></span></div>)}</dl> : null}
      <div className={styles.productRegion}>
      {loading && !page ? <div role="status" className={styles.loading}><span className="sr-only">Ürünler yükleniyor…</span><div aria-hidden="true">{[0, 1].map(row => <span className={styles.loadingRow} key={row}><span /><span /><span /><span /><span /></span>)}</div></div> : page?.items.length ? <>
        <div className={styles.tableScroll} role="region" aria-label="Google ürün tablosu" tabIndex={0}>
          <table aria-label="Google Merchant ürünleri" className={styles.table}><thead><tr><th scope="col">Ürün / varyant</th><th scope="col">Fiyat</th><th scope="col">Google durumu</th>{canManage ? <th scope="col">Aktarım</th> : null}<th scope="col"><span className="sr-only">İşlemler</span></th></tr></thead><tbody>
            {page.items.map(product => {
              const status = productStatus(product.status);
              const attempt = rowAttempts.current.get(product.variantId);
              return <tr key={product.variantId}>
                <td className={styles.productCell}><strong>{product.title}</strong>{product.sku ? <span>{product.sku}</span> : null}</td>
                <td data-label="Fiyat" className={styles.price}>{product.priceCents === null ? "Fiyat eksik" : currency.format(product.priceCents / 100)}</td>
                <td className={styles.statusCell} data-label="Google durumu"><PanelStatusBadge tone={status.tone}>{status.label}</PanelStatusBadge>{product.issues.length ? <ul>{product.issues.map((issue, i) => <li key={`${issue.code}:${i}`}>{issue.message}</li>)}</ul> : null}{rowErrors[product.variantId] ? <div className={styles.rowError}><p role="alert">{failureMessage(rowErrors[product.variantId])}</p>{attempt ? <button type="button" className="button button-text" disabled={busy} onClick={() => void setEnabled(product, attempt.input.enabled)}>Aktarımı tekrar dene</button> : null}</div> : null}</td>
                {canManage ? <td className={styles.transferCell}><label className={styles.exportChoice}><input type="checkbox" checked={attempt?.input.enabled ?? product.enabled} aria-label={`${product.title} Google’a aktarılsın`} disabled={busy || Boolean(attempt)} onChange={event => void setEnabled(product, event.target.checked)} />Aktar</label></td> : null}
                <td className={styles.rowActions}>{canManage ? <button data-merchant-edit type="button" className="button button-secondary" aria-label={`${product.title} Google bilgilerini düzenle`} disabled={busy || Boolean(attempt)} onClick={() => openEditor(product)}><SlidersHorizontal size={16} aria-hidden="true" />Google bilgileri</button> : null}<Link href={`/products/${product.productId}`} className={styles.productLink}>Ürünü düzenle<ArrowUpRight size={14} aria-hidden="true" /></Link></td>
              </tr>;
            })}
          </tbody></table>
        </div>
        <div className={styles.pagination}><button type="button" className="button button-secondary" disabled={loading || pageIndex === 0} onClick={() => move(pageIndex - 1)}><ChevronLeft size={16} aria-hidden="true" />Önceki</button><span>{pageIndex + 1}. sayfa</span><button type="button" className="button button-secondary" disabled={loading || !page.nextCursor} onClick={() => move(pageIndex + 1, page.nextCursor ?? undefined)}>Sonraki<ChevronRight size={16} aria-hidden="true" /></button></div>
      </> : !error && page ? <div className={styles.empty}><MarketplaceArtwork variant="products" className={styles.emptyArtwork} /><div><h3>Henüz ürün aktarımı yok.</h3><p>{overview?.connection.status === "connected" ? "Yayımlanmış ürünler otomatik kontrol edilir. Ürünleri yeniden kontrol edebilirsiniz." : "Önce Google Merchant bağlantısını tamamlayın."}</p><Link className="button button-secondary" href="/products">Ürünleri aç<ArrowUpRight size={16} aria-hidden="true" /></Link></div></div> : null}
      </div>
      <p className={styles.help}>Google’a gönderilmesi, ürünün onaylandığı anlamına gelmez. Google inceleme sonucunu ürün durumunda gösterir.</p>
    </section>
    <OrderActionDialog open={Boolean(editor)} title="Google ürün bilgileri" className={styles.dialog} busy={saving} onClose={closeEditor} footer={editor ? <div className={styles.dialogActions}><button className="button button-secondary" type="button" disabled={saving} onClick={closeEditor}>Vazgeç</button><button className="button button-primary" type="button" disabled={saving} onClick={() => void saveAttributes()}>{saving ? "Kaydediliyor…" : editor.attempt ? "Tekrar kaydet" : "Kaydet"}</button></div> : null}>
      {editor ? <div className={styles.form}>
        <div className={styles.editorProduct}><Package size={20} aria-hidden="true" /><div><strong>{editor.product.title}</strong>{editor.product.sku ? <p className={styles.help}>{editor.product.sku}</p> : null}</div></div>
        {editor.error ? <p role="alert" className={styles.feedback}>{failureMessage(editor.error)}</p> : null}
        <fieldset className={styles.formSection}><legend><Barcode size={16} aria-hidden="true" />Tanımlayıcılar</legend>
          <p className={styles.help}>Üreticinin gerçek ürün bilgilerini kullanın. Stok kodu, üretici barkodu yerine geçmez.</p>
          <label className={styles.field}>Ürün tanımlayıcıları<select value={editor.draft.identifierExists} disabled={saving || Boolean(editor.attempt)} onChange={event => changeDraft("identifierExists", event.target.value)}><option value="">Katalog bilgisini kullan</option><option value="yes">Üretici tanımlayıcıları var</option><option value="no">Üretici tanımlayıcısı yok</option></select></label>
          <div className={styles.formGrid}>{([ ["gtin", "Üretici barkodu (GTIN)"], ["mpn", "Üretici parça kodu (MPN)"] ] as const).map(([key, label]) => <label key={key} className={styles.field}>{label}<input aria-label={label} value={editor.draft[key]} maxLength={key === "gtin" ? 14 : 70} inputMode={key === "gtin" ? "numeric" : undefined} disabled={saving || Boolean(editor.attempt) || editor.draft.identifierExists === "no"} onChange={event => changeDraft(key, event.target.value)} /></label>)}</div>
        </fieldset>
        <fieldset className={styles.formSection}><legend><SlidersHorizontal size={16} aria-hidden="true" />Ürün özellikleri</legend>
          <div className={styles.formGrid}>{([ ["color", "Renk"], ["size", "Beden / ölçü"], ["material", "Malzeme"] ] as const).map(([key, label]) => <label key={key} className={styles.field}>{label}<input aria-label={label} value={editor.draft[key]} maxLength={70} disabled={saving || Boolean(editor.attempt)} onChange={event => changeDraft(key, event.target.value)} /></label>)}</div>
          <div className={styles.formGrid}><label className={styles.field}>Cinsiyet<select value={editor.draft.gender} disabled={saving || Boolean(editor.attempt)} onChange={event => changeDraft("gender", event.target.value)}><option value="">Belirtilmedi</option><option value="male">Erkek</option><option value="female">Kadın</option><option value="unisex">Unisex</option></select></label><label className={styles.field}>Yaş grubu<select value={editor.draft.ageGroup} disabled={saving || Boolean(editor.attempt)} onChange={event => changeDraft("ageGroup", event.target.value)}><option value="">Belirtilmedi</option><option value="newborn">Yenidoğan</option><option value="infant">Bebek</option><option value="toddler">Küçük çocuk</option><option value="kids">Çocuk</option><option value="adult">Yetişkin</option></select></label></div>
        </fieldset>
      </div> : null}
    </OrderActionDialog>
  </div>;
}
