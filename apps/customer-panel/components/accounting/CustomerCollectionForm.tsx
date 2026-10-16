"use client";
import{useEffect,useRef,useState,type FormEvent}from"react";
import{ChevronDown}from"lucide-react";
import{accountingExact,accountingUuid,parseAccountingIntent,parseAccountingMutationResult,accountingCollectionResultMatches,type AccountingCollectionPreview,type AccountingCollectionIntent,type AccountingCustomerAccount}from"@celebix/saas-contracts";
import{accountingUi,AccountingUiError}from"@/lib/accounting-ui/client";
import{accountingMoney as money,previewCollection,collectionSettlementTotal}from"@/lib/accounting-ui/model";
import{parseMinorUnits}from"@/lib/in-store-sales-ui/model";
import{AccountingEffects}from"./AccountingEffects";
import{previewAccountingEffects}from"@/lib/accounting-ui/effects";
import{CollectionCustomerSummary}from"./CollectionPresentation";
import styles from"./accounting.module.css";
import workspace from"./ReceivablesWorkspace.module.css";
export function CustomerCollectionForm({customerId,orderId=null,currency="TRY",scopeKey,onCollected,onLockedChange,allowDiscount=false}:{customerId:string;orderId?:string|null;currency?:string;scopeKey:string;onCollected:()=>void;onLockedChange?:(locked:boolean)=>void;allowDiscount?:boolean}){
 const[account,setAccount]=useState<AccountingCustomerAccount|null>(null),[amount,setAmount]=useState(""),[discount,setDiscount]=useState(""),[method,setMethod]=useState<AccountingCollectionIntent["paymentMethod"]>("cash"),[note,setNote]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[pending,setPending]=useState<{key:string;intent:AccountingCollectionIntent}|null>(null),[revision,setRevision]=useState(0),command=useRef<typeof pending>(null);
 const[storageReady,setStorageReady]=useState(false),[storageError,setStorageError]=useState<string|null>(null),inFlight=useRef(false);
 const[serverPreview,setServerPreview]=useState<{amount:number;value:AccountingCollectionPreview}|null>(null),[previewBusy,setPreviewBusy]=useState(false),[previewError,setPreviewError]=useState<string|null>(null);
 const accountKey=JSON.stringify([scopeKey,customerId,orderId,currency]);
 const[loadedAccountKey,setLoadedAccountKey]=useState<string|null>(null),[settledAccountKey,setSettledAccountKey]=useState<string|null>(null);
 const hasCurrentAccount=loadedAccountKey===accountKey;
 const storageKey=`celebix-accounting-collection:${scopeKey}:${customerId}:${orderId??"customer"}:${currency}`;
 useEffect(()=>{setStorageReady(false);setStorageError(null);command.current=null;setPending(null);try{const raw=window.sessionStorage.getItem(storageKey);if(raw!==null){if(raw.length>65536)throw Error();const stored=accountingExact(JSON.parse(raw),["key","intent"]),intent=parseAccountingIntent("collect",stored.intent),value={key:accountingUuid(stored.key),intent};if(intent.customerId!==customerId||intent.orderId!==orderId||intent.currency!==currency)throw Error();command.current=value;setPending(value);setAmount(String(intent.amountCents/100));setDiscount(String((intent.discountCents??0)/100));setMethod(intent.paymentMethod);setNote(intent.note??"");setError("Önceki tahsilatın sonucu kontrol edilmeli. Yeniden para alma.");}}catch{setStorageError("Önceki işlem bilgileri okunamadı. Yeni kayıt oluşturmadan destekle iletişime geç.");}finally{setStorageReady(true);}},[storageKey,customerId,orderId,currency]);
 useEffect(()=>{onLockedChange?.(busy||Boolean(pending)||Boolean(storageError));},[busy,pending,storageError,onLockedChange]);
 useEffect(()=>{const abort=new AbortController();setLoading(true);void accountingUi.customerAccount(customerId,currency,abort.signal).then(value=>{if(!abort.signal.aborted){setAccount(value);setLoadedAccountKey(accountKey);}}).catch(e=>{if(!abort.signal.aborted)setError(e instanceof AccountingUiError?e.message:"Müşteri hesabı yüklenemedi. Yeniden dene.");}).finally(()=>{if(!abort.signal.aborted){setLoading(false);setSettledAccountKey(accountKey);}});return()=>abort.abort();},[customerId,currency,revision,accountKey]);
 const cents=amount.trim()?parseMinorUnits(amount):0,discountCents=allowDiscount?parseMinorUnits(discount.trim()||"0"):0,total=collectionSettlementTotal(cents,discountCents);let allocations:ReturnType<typeof previewCollection>=[],amountError:string|null=null;if(account&&total!==null)try{allocations=previewCollection(account.receivables,total!,orderId);}catch(e){amountError=(e as Error).message;}
 useEffect(()=>{setServerPreview(null);setPreviewError(null);if(!hasCurrentAccount||!account||total===null||amountError||pending)return;const abort=new AbortController();setPreviewBusy(true);const timer=setTimeout(()=>{void accountingUi.collectionPreview({customerId,orderId,currency,amountCents:total},abort.signal).then(value=>{if(!abort.signal.aborted){if(value.version!==account.version){setPreviewError("Müşteri hesabı değişti. Güncel bakiye yükleniyor; tutarı kontrol et.");setRevision(v=>v+1);}else setServerPreview({amount:total,value});}}).catch(e=>{if(!abort.signal.aborted)setPreviewError(e instanceof AccountingUiError?e.message:"Tahsilat dağılımı doğrulanamadı. Tutarı yeniden kontrol et.");}).finally(()=>{if(!abort.signal.aborted)setPreviewBusy(false);});},180);return()=>{abort.abort();clearTimeout(timer);};},[account,total,amountError,pending,customerId,orderId,currency,hasCurrentAccount]);
 function clear(){command.current=null;setPending(null);try{window.sessionStorage.removeItem(storageKey);}catch{}}
 async function save(recover=false){
  if(inFlight.current||busy||loading||!hasCurrentAccount||!storageReady||storageError)return;
  inFlight.current=true;setBusy(true);setError(null);let lookupCompleted=!recover;
  try{
   let current=command.current;
   if(!current){
    if(!account||total===null)throw new Error("Geçerli bir ödeme veya iskonto tutarı gir.");
    previewCollection(account.receivables,total,orderId);
    if(!serverPreview||serverPreview.amount!==total||serverPreview.value.version!==account.version)throw new Error("Tahsilat dağılımının doğrulanmasını bekle.");
    current={key:accountingUi.newId(),intent:{customerId,orderId,amountCents:cents!,...(discountCents!>0?{discountCents:discountCents!}:{}),currency,paymentMethod:method,accountId:null,expectedVersion:account.version,note:note.trim()||null}};
    const serialized=JSON.stringify(current);
    try{window.sessionStorage.setItem(storageKey,serialized);if(window.sessionStorage.getItem(storageKey)!==serialized)throw Error();}catch{throw new Error("İşlem bilgileri tarayıcıda korunamadı. Bilgilerin duruyor; yeniden dene.");}
    command.current=current;setPending(current);
   }
   const operation=recover?await accountingUi.getOperation(current.key):null;lookupCompleted=true;
   if(operation){let matches=false;try{matches=accountingCollectionResultMatches(parseAccountingMutationResult(operation),current.intent,current.key);}catch{}if(!matches)throw new AccountingUiError("unavailable",true);}
   else await accountingUi.mutate("collect",current.intent,current.key);
   clear();onCollected();
  }catch(e){setError(e instanceof AccountingUiError?e.message:e instanceof Error?e.message:"Tahsilat kaydedilemedi.");if(lookupCompleted&&(!(e instanceof AccountingUiError)||!e.unknownResult)){clear();if(e instanceof AccountingUiError&&e.code==="version_conflict")setRevision(v=>v+1);}}
  finally{inFlight.current=false;setBusy(false);}
 }
 function submit(event:FormEvent){event.preventDefault();void save(Boolean(command.current));}
 if(!hasCurrentAccount&&settledAccountKey!==accountKey)return<div className={`${styles.dialogBody} ${styles.collectionLoading}`} role="status"><span className="sr-only">Müşteri hesabı yükleniyor…</span><div/><div/><div/></div>;
 if(!hasCurrentAccount||!account)return<div className={styles.dialogBody}><p className={styles.error} role="alert">{error??"Müşteri hesabı yüklenemedi."}</p><button className={styles.secondary} onClick={()=>setRevision(v=>v+1)}>Yeniden dene</button></div>;
 const due=account.receivables.filter(row=>!orderId||row.orderId===orderId).reduce((sum,row)=>sum+row.dueCents,0);
 return<form className={workspace.collectionForm} onSubmit={submit} aria-busy={loading}>
  <div className={`${styles.dialogBody} ${workspace.collectionBody}`}>
   <CollectionCustomerSummary name={account.customerName} phone={account.customerPhone} dueCents={due} currency={currency} archived={account.customerArchived}/>
   <div className={workspace.amountFields}>
    <label className={styles.field}><span>Alınan ödeme</span><input name="amount" value={amount} onChange={event=>{if(!pending)setAmount(event.target.value);}} inputMode="decimal" placeholder="0,00" maxLength={30} required={!allowDiscount} disabled={busy||Boolean(pending)||Boolean(storageError)}/></label>
    {allowDiscount?<label className={styles.field}><span>İskonto</span><input name="discount" value={discount} onChange={event=>{if(!pending)setDiscount(event.target.value);}} inputMode="decimal" placeholder="0,00" maxLength={30} aria-describedby="collection-discount-help" disabled={busy||Boolean(pending)||Boolean(storageError)}/><small id="collection-discount-help" className={styles.muted}>Borçtan düşülür; para girişi olmaz.</small></label>:null}
   </div>
   <label className={`${styles.field} ${workspace.methodField}`}><span>Ödeme nasıl alındı?</span><select value={method} onChange={event=>setMethod(event.target.value as typeof method)} disabled={busy||Boolean(pending)||Boolean(storageError)}><option value="cash">Nakit</option><option value="card">Kart · Harici POS</option><option value="bank_transfer">Banka havalesi</option></select></label>
   <details className={workspace.details}><summary className={workspace.detailsSummary}>Açıklama · isteğe bağlı <ChevronDown size={16} aria-hidden="true"/></summary><div className={workspace.detailsFields}><label className={styles.field}><span className="sr-only">Açıklama · isteğe bağlı</span><input value={note} onChange={event=>setNote(event.target.value)} maxLength={2000} disabled={busy||Boolean(pending)||Boolean(storageError)}/></label></div></details>
   <p className={workspace.scopeHint}>{orderId?"Tahsilat yalnız bu siparişe uygulanır.":"Ödeme ve iskonto en eski açık borçtan başlayarak uygulanır."} Alınan ödeme seçtiğin yöntemin hesabına kaydedilir.</p>
   {previewBusy&&!pending?<p role="status" className={styles.muted}>Tahsilat dağılımı doğrulanıyor…</p>:null}
   {previewError?<p role="alert" className={styles.error}>{previewError}</p>:null}
   {!pending&&!loading&&allocations.length?<dl className={workspace.allocationList} aria-label="Tahsilat dağılımı">{allocations.map(allocation=><div key={allocation.receivableId}><dt>{account.receivables.find(row=>row.id===allocation.receivableId)?.orderNumber??"Önceden kalan borç"}</dt><dd>{money(allocation.amountCents,currency)}</dd></div>)}</dl>:null}
   {!pending?(!loading?<AccountingEffects compact preview={previewAccountingEffects({kind:"collect",amountCents:amount.trim()||discount.trim()?cents:null,discountCents,currency,accounts:[],customerAccount:account,orderId})}/>:null):<div className={styles.notice} role="status"><strong>İşlem bilgileri korunuyor</strong><p>Alınan ödeme · {money(pending.intent.amountCents,pending.intent.currency)}</p>{(pending.intent.discountCents??0)>0?<p>İskonto · {money(pending.intent.discountCents!,pending.intent.currency)}</p>:null}<p>Sonuç doğrulanana kadar yeni bir hesaplama gösterilmez.</p></div>}
   {amountError?<p role="alert" className={styles.error}>{amountError}</p>:null}{storageError?<p role="alert" className={styles.error}>{storageError}</p>:null}{error?<p role="alert" className={styles.error}>{error}</p>:null}
  </div>
  <footer className={`${styles.dialogActions} ${workspace.collectionFooter}`}><button className={styles.primary} disabled={!storageReady||Boolean(storageError)||loading||busy||!pending&&(total===null||Boolean(amountError)||!serverPreview||serverPreview.amount!==total||previewBusy)}>{busy?"Kaydediliyor…":pending?"Aynı tahsilatı kontrol et":discountCents!>0?(cents===0?"İskontoyu kaydet":"Ödeme ve iskontoyu kaydet"):"Alınan ödemeyi kaydet"}</button></footer>
 </form>;
}
