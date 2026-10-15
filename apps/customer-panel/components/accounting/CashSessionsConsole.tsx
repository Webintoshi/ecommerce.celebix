"use client";

import Link from 'next/link';
import{useEffect,useRef,useState,type FormEvent}from'react';
import{RefreshCw}from'lucide-react';
import type{AccountingAccount,AccountingCashAction,AccountingCashSessions}from'@celebix/saas-contracts';
import{PanelPageHeader,PanelPageShell}from'@/components/panel/PanelPageShell';
import{accountingUi,AccountingUiError}from'@/lib/accounting-ui/client';
import{accountingMoney as money,accountingDate as date}from'@/lib/accounting-ui/model';
import{bindCashResult,cashCountText,cashCountPreview,cashDifferenceLabel,cashStorageKey,parseStoredCashCommand,type CashCommand}from'@/lib/accounting-ui/cash-session-model';
import{parseMinorUnits}from'@/lib/in-store-sales-ui/model';
import{FinanceModal}from'./FinanceModal';
import styles from'./accounting.module.css';

type Target={kind:AccountingCashAction;accountId:string;sessionId:string|null};
const errorText=(error:unknown)=>error instanceof AccountingUiError?(error.code==='invalid_transition'&&!error.unknownResult?'Kasanın durumu değişti. Güncel kaydı aç.':error.code==='amount_overflow'&&!error.unknownResult?'Tutar hesap sınırını aşıyor. Sayımı ve güncel tutarları kontrol et.':error.message):'Kasa sayımı tamamlanamadı. Bilgilerin korunuyor; yeniden dene.';
function readPending(scopeKey:string):CashCommand|null{try{const raw=window.sessionStorage.getItem(cashStorageKey(scopeKey));return raw?parseStoredCashCommand(JSON.parse(raw)):null;}catch{return null;}}
function Difference({value,currency}:{value:number|null;currency:string}){return value===null?<span>—</span>:<span>{cashDifferenceLabel(value)}{value!==0?` · ${money(Math.abs(value),currency)}`:''}</span>;}

type Props={canManage:boolean;scopeKey:string;initialAccountId?:string};
export function CashSessionsConsole(props:Props){return<CashSessionsWorkspace key={`${props.scopeKey}:${props.canManage}:${props.initialAccountId??''}`} {...props}/>;}
function CashSessionsWorkspace({canManage,scopeKey,initialAccountId}:Props){
 const[accounts,setAccounts]=useState<readonly AccountingAccount[]>([]),[accountsScope,setAccountsScope]=useState<string|null>(null),[accountsLoading,setAccountsLoading]=useState(true),[accountsError,setAccountsError]=useState<string|null>(null),[accountsRevision,setAccountsRevision]=useState(0);
 const[accountId,setAccountId]=useState(''),[snapshot,setSnapshot]=useState<{scope:string;value:AccountingCashSessions}|null>(null),[loading,setLoading]=useState(false),[readError,setReadError]=useState<string|null>(null),[revision,setRevision]=useState(0);
 const[target,setTarget]=useState<Target|null>(null),[count,setCount]=useState(''),[note,setNote]=useState(''),[formError,setFormError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null),[pending,setPending]=useState<CashCommand|null>(null),[saving,setSaving]=useState(false);
 const command=useRef<CashCommand|null>(null),running=useRef(false);
 const data=snapshot?.scope===scopeKey&&snapshot.value.account.id===accountId?snapshot.value:null;
 const currentAccounts=accountsScope===scopeKey?accounts:[];
 const currency=pending?.currency??data?.account.currency??currentAccounts.find(row=>row.id===accountId)?.currency??'TRY';
 function restore(value:CashCommand){command.current=value;setPending(value);setAccountId(value.intent.accountId);setTarget({kind:value.kind,accountId:value.intent.accountId,sessionId:value.kind==='close'?value.intent.sessionId:null});setCount(cashCountText(value.intent.countedCents));setNote(value.intent.note??'');}
 useEffect(()=>{command.current=null;setPending(null);setTarget(null);setCount('');setNote('');setSnapshot(null);setAccountId('');setReadError(null);setFormError(null);setNotice(null);if(canManage){const stored=readPending(scopeKey);if(stored)restore(stored);}},[scopeKey,canManage]);
 useEffect(()=>{
  if(!canManage)return;
  const abort=new AbortController();setAccountsLoading(true);setAccountsError(null);
  void accountingUi.accounts({},abort.signal).then(value=>{if(abort.signal.aborted)return;const cash=value.accounts.filter(row=>row.type==='cash');setAccounts(cash);setAccountsScope(scopeKey);setAccountId(selected=>command.current?.intent.accountId??(cash.some(row=>row.id===selected)?selected:cash.some(row=>row.id===initialAccountId)?initialAccountId!:cash[0]?.id??''));}).catch(error=>{if(!abort.signal.aborted)setAccountsError(errorText(error));}).finally(()=>{if(!abort.signal.aborted)setAccountsLoading(false);});
  return()=>abort.abort();
 },[scopeKey,canManage,accountsRevision,initialAccountId]);
 useEffect(()=>{
  if(!canManage||accountsScope!==scopeKey||!accountId)return;
  const abort=new AbortController();setLoading(true);setReadError(null);
  void accountingUi.cashSessions(accountId,abort.signal).then(value=>{if(abort.signal.aborted)return;if(value.account.id!==accountId)throw new AccountingUiError('unavailable');setSnapshot({scope:scopeKey,value});}).catch(error=>{if(!abort.signal.aborted)setReadError(errorText(error));}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
  return()=>abort.abort();
 },[scopeKey,canManage,accountId,accountsScope,revision]);
 function close(){if(running.current||command.current)return;setTarget(null);setFormError(null);}
 function open(){const stored=readPending(scopeKey);if(stored){restore(stored);return;}if(!data||loading||readError||!canManage)return;setTarget({kind:data.active?'close':'open',accountId:data.account.id,sessionId:data.active?.id??null});setCount('');setNote('');setFormError(null);setNotice(null);}
 function clearCommand(){const key=command.current?.key;command.current=null;setPending(null);try{if(key&&readPending(scopeKey)?.key===key)window.sessionStorage.removeItem(cashStorageKey(scopeKey));}catch{}}
 const selectedData=target&&data?.account.id===target.accountId?data:null;
 const transitionError=target&&selectedData&&(target.kind==='close'?selectedData.active?.id!==target.sessionId:Boolean(selectedData.active))?'Bu sayımın kasa oturumu değişti. Pencereyi kapatıp güncel kasa kaydını aç.':null;
 const cents=parseMinorUnits(count);
 const preview=target&&selectedData&&!transitionError?cashCountPreview(target.kind,cents,selectedData.account.balanceCents,selectedData.active):null;
 const noteMissing=Boolean(preview?.noteRequired&&!note.trim());
 const canSave=Boolean(target&&selectedData&&!loading&&!readError&&!transitionError&&preview&&!preview.error&&!noteMissing&&!saving);
 async function execute(current:CashCommand,recover=false){
  if(running.current||!canManage)return;running.current=true;setSaving(true);setFormError(null);let lookupCompleted=!recover;
  try{
   let result=null;
   if(recover){result=await accountingUi.cashOperation(current.key);lookupCompleted=true;}
   if(!result)result=await accountingUi.cashMutate(current.kind,current.intent,current.key);
   try{bindCashResult(current,result);}catch{throw new AccountingUiError('unavailable',true);}
   clearCommand();setTarget(null);setNotice(current.kind==='open'?'Kasa açılışı kaydedildi.':'Kasa kapanışı kaydedildi.');setRevision(value=>value+1);
  }catch(error){
   setFormError(errorText(error));
   if(lookupCompleted&&error instanceof AccountingUiError&&!error.unknownResult){clearCommand();if(error.code==='version_conflict'||error.code==='invalid_transition'){setLoading(true);setRevision(value=>value+1);}}
  }finally{running.current=false;setSaving(false);}
 }
 function submit(event:FormEvent){
  event.preventDefault();if(running.current||!canManage)return;
  if(command.current){void execute(command.current,true);return;}
  const stored=readPending(scopeKey);if(stored){restore(stored);return;}
  if(!canSave||!target||!selectedData||cents===null)return;
  const common={accountId:target.accountId,expectedVersion:selectedData.account.version,countedCents:cents,note:note.trim()||null};
  try{
   const current=parseStoredCashCommand({key:accountingUi.newId(),kind:target.kind,currency:selectedData.account.currency,accountName:selectedData.account.name,intent:target.kind==='open'?{...common,expectedLastSessionId:selectedData.lastSessionId}:{...common,sessionId:target.sessionId}});
   try{window.sessionStorage.setItem(cashStorageKey(scopeKey),JSON.stringify(current));if(JSON.stringify(readPending(scopeKey))!==JSON.stringify(current))throw new Error('cash_command_not_persisted');}catch{setFormError('Sayım bilgileri tarayıcıda korunamadı. Yeniden dene.');return;}
   command.current=current;setPending(current);void execute(current);
  }catch{setFormError('Sayım bilgilerini kontrol et. Tutar ve açıklama korunuyor.');}
 }
 if(!canManage)return<PanelPageShell><PanelPageHeader title="Kasa sayımı"/><h1 className="sr-only">Kasa sayımı</h1><p className={styles.empty}>Kasa sayımı için mağaza yöneticisi yetkisi gerekiyor.</p></PanelPageShell>;
 return<PanelPageShell><PanelPageHeader title="Kasa sayımı"/><h1 className="sr-only">Kasa sayımı</h1><div className={styles.console}>
  <nav className={styles.tabs} aria-label="Muhasebe bölümleri"><Link href="/accounting">Muhasebe</Link><Link href="/accounting/receivables">Müşteri borçları</Link><Link href="/accounting/suppliers">Tedarikçi borçları</Link><Link href="/accounting/accounts">Kasa ve banka</Link><Link href="/accounting/cash-sessions" aria-current="page">Kasa sayımı</Link><Link href="/accounting/expenses">Giderler</Link><Link href="/accounting/settings">İşletme bilgileri</Link></nav>
  <div className={styles.toolbar}><div className={styles.cashAccountPicker}><label className={styles.field}><span>Kasa</span><select name="cashAccount" value={accountId} disabled={accountsLoading||saving||Boolean(pending)||!currentAccounts.length} onChange={event=>{if(command.current)return;setAccountId(event.target.value);setTarget(null);setReadError(null);setNotice(null);}}>{!currentAccounts.length?<option value={accountId}>{pending?.accountName??'Kasa seç'}</option>:null}{pending&&!currentAccounts.some(row=>row.id===pending.intent.accountId)?<option value={pending.intent.accountId}>{pending.accountName}</option>:null}{currentAccounts.map(row=><option key={row.id} value={row.id}>{row.name} · {row.currency}</option>)}</select></label><button type="button" className={styles.secondary} disabled={accountsLoading||loading||saving||Boolean(pending)} onClick={()=>{if(accountsError||!currentAccounts.length)setAccountsRevision(value=>value+1);else setRevision(value=>value+1);}}><RefreshCw size={16} aria-hidden="true"/>Yenile</button></div>{data?<button className={styles.primary} disabled={loading||Boolean(readError)||saving||Boolean(pending)} onClick={open}>{data.active?'Say ve kapat':'Kasayı aç'}</button>:null}</div>
  {accountsError?<p className={styles.error} role="alert">{accountsError}</p>:null}{readError?<p className={styles.error} role="alert">{readError}</p>:null}{notice?<p className={styles.notice} role="status">{notice}</p>:null}
  <div className={styles.cashData} aria-busy={accountsLoading||loading}>
   {!data&&(accountsLoading||loading)?<div className={styles.cashLoading} role="status"><span className="sr-only">Kasa sayımı yükleniyor…</span><div className={styles.cashCurrent} aria-hidden="true"><div className={styles.cashSkeletonLine}/><div className={styles.cashMetrics}>{Array.from({length:4},(_,i)=><div key={i}><i/><b/></div>)}</div><div className={styles.cashSkeletonLine}/><div className={styles.cashSkeletonLine}/></div><div className={`${styles.section} ${styles.cashHistorySection}`} aria-hidden="true"><h2>Kapanış geçmişi</h2><p className={styles.muted}>Son 100 kapanış gösterilir. Kapanıştaki tutarlar sonradan değişmez.</p><div className={styles.loadingTable}>{Array.from({length:5},(_,i)=><div key={i}><i/><i/><i/></div>)}</div></div></div>:null}
   {!accountsLoading&&!accountsError&&!currentAccounts.length?<div className={styles.empty}><p>Henüz nakit kasası yok. Kasa ve banka bölümünden bir kasa hesabı ekle.</p><Link className={styles.secondary} href="/accounting/accounts">Kasa ve bankaya git</Link></div>:null}
   {data?<>
    <section className={styles.cashCurrent} aria-label="Güncel kasa sayımı"><div className={styles.cashState}><h2>{data.active?'Kasa açık':'Kasa kapalı'}</h2>{data.active?<span>{date(data.active.openedAt)} tarihinde açıldı</span>:null}</div>
     {data.active?<><dl className={styles.cashMetrics}><div><dt>Açılışta sayılan</dt><dd>{money(data.active.openingCountCents,currency)}</dd></div><div><dt>Açılıştan bu yana net hareket</dt><dd>{data.active.movementCents>0?'+':''}{money(data.active.movementCents,currency)}</dd></div><div><dt>Şu an beklenen</dt><dd>{money(data.active.expectedCents,currency)}</dd></div><div><dt>Kayıtlı bakiye</dt><dd>{money(data.account.balanceCents,currency)}</dd></div></dl><dl className={styles.cashDifferences}><div><dt>Açılıştan gelen fark</dt><dd><Difference value={data.active.openingDifferenceCents} currency={currency}/></dd></div></dl>{data.active.openingNote?<p className={styles.muted}>Açılış açıklaması: {data.active.openingNote}</p>:null}<p className={styles.muted}>Beklenen para, açılışta sayılan tutara kayıtlı bakiyedeki net değişim eklenerek hesaplanır.</p></>:<><dl className={styles.financeSummary}><div><dt>Kayıtlı bakiye</dt><dd>{money(data.account.balanceCents,currency)}</dd></div></dl><p className={styles.muted}>Kasadaki parayı sayıp açılışı kaydet. Sayım, kayıtlı bakiyeyi değiştirmez.</p></>}
    </section>
    <section className={`${styles.section} ${styles.cashHistorySection}`} aria-label="Kapanış geçmişi"><h2>Kapanış geçmişi</h2><p className={styles.muted}>Son 100 kapanış gösterilir. Kapanıştaki tutarlar sonradan değişmez.</p>{data.hasMore?<p className={styles.notice}>Daha eski kapanış kayıtları da var.</p>:null}
     {data.history.length?<div className={`${styles.tableScroll} ${styles.cashHistory}`} tabIndex={0} aria-label="Kasa kapanış kayıtları"><table><thead><tr><th>Kapanış</th><th>Sayılan</th><th>Beklenen</th><th>Bu sayımın farkı</th><th>Toplam fark</th><th>Ayrıntılar</th></tr></thead><tbody>{data.history.map(row=><tr key={row.id}><td><strong>{date(row.closedAt!)}</strong><small>{row.sequence}. sayım</small></td><td className={styles.numeric}>{money(row.countedCents!,row.currency)}</td><td className={styles.numeric}>{money(row.expectedCents,row.currency)}</td><td><Difference value={row.differenceCents} currency={row.currency}/></td><td><Difference value={row.totalDifferenceCents} currency={row.currency}/></td><td><details className={styles.cashDetails}><summary>Sayım ayrıntıları</summary><dl><div><dt>Açılış</dt><dd>{date(row.openedAt)}</dd></div><div><dt>Açılışta sayılan</dt><dd>{money(row.openingCountCents,row.currency)}</dd></div><div><dt>Açılıştan gelen fark</dt><dd><Difference value={row.openingDifferenceCents} currency={row.currency}/></dd></div><div><dt>Net hareket</dt><dd>{money(row.movementCents,row.currency)}</dd></div><div><dt>Kapanıştaki kayıtlı bakiye</dt><dd>{money(row.balanceCents,row.currency)}</dd></div></dl>{row.openingNote?<p>Açılış açıklaması: {row.openingNote}</p>:null}{row.closingNote?<p>Kapanış açıklaması: {row.closingNote}</p>:null}</details></td></tr>)}</tbody></table></div>:<p className={styles.empty}>Bu kasa için kapanış kaydı yok.</p>}
    </section>
   </>:null}
  </div>
  <FinanceModal title={target?.kind==='close'?'Kasayı say ve kapat':'Kasayı aç'} open={Boolean(target)} locked={saving||Boolean(pending)} onClose={close}>
   <form onSubmit={submit}><div className={styles.dialogBody}>
    <div className={styles.customerSummary}><strong>{pending?.accountName??selectedData?.account.name??'Kasa sayımı'}</strong><span>{target?.kind==='close'?'Kapanış sayımı':'Açılış sayımı'}</span></div>
    {pending?<div className={styles.notice} role="status"><strong>Sayım bilgileri korunuyor</strong><p>Sonuç doğrulanana kadar aynı kasa, tutar ve açıklama korunur.</p></div>:null}
    <label className={styles.field}><span>Kasada saydığın para · {currency}</span><input name="counted" inputMode="decimal" value={pending?cashCountText(pending.intent.countedCents):count} onChange={event=>{if(command.current)return;setCount(event.target.value);setFormError(null);}} disabled={saving||Boolean(pending)} required aria-describedby="cash-count-help"/></label>
    <p id="cash-count-help" className={styles.muted}>Kasa boşsa 0 yaz. Sayım para girişi veya çıkışı oluşturmaz.</p>
    {!pending&&selectedData&&preview&&!transitionError?<><dl className={styles.financeSummary}><div><dt>{target?.kind==='close'?'Kayıtlara göre beklenen':'Kayıtlı bakiye'}</dt><dd>{money(preview.expectedCents!,currency)}</dd></div></dl><dl className={styles.cashDifferences} aria-label="Sayım farkları">{target?.kind==='close'?<div><dt>Açılıştan gelen fark</dt><dd><Difference value={preview.inheritedDifferenceCents} currency={currency}/></dd></div>:null}<div><dt>{target?.kind==='close'?'Bu sayımın farkı':'Açılış farkı'}</dt><dd><Difference value={preview.differenceCents} currency={currency}/></dd></div>{target?.kind==='close'?<div><dt>Kayıtlı bakiyeyle toplam fark</dt><dd><Difference value={preview.totalDifferenceCents} currency={currency}/></dd></div>:null}</dl>{preview.error?<p className={styles.muted}>{preview.error}</p>:null}</>:null}
    <label className={styles.field}><span>Açıklama{pending?.intent.note||preview?.noteRequired?' · fark varsa gerekli':' · isteğe bağlı'}</span><input name="note" value={pending?pending.intent.note??'':note} onChange={event=>{if(command.current)return;setNote(event.target.value);setFormError(null);}} disabled={saving||Boolean(pending)} required={!pending&&Boolean(preview?.noteRequired)} maxLength={2000}/></label>
    {!pending?<><p className={styles.effectNote}>Kaydederken güncel kasa tutarı yeniden kontrol edilir. Kayıtlı bakiye, satışlar ve tahsilatlar değişmez.</p>{loading?<p role="status" className={styles.muted}>Güncel kasa sayımı yükleniyor…</p>:null}{readError?<p className={styles.error} role="alert">{readError}</p>:null}{transitionError?<p className={styles.error} role="alert">{transitionError}</p>:null}</>:null}
    {formError?<p className={styles.error} role="alert">{formError}</p>:null}
   </div><footer className={styles.dialogActions}>{pending?<button className={styles.primary} disabled={saving}>{saving?'Kontrol ediliyor…':'Aynı sayımı kontrol et'}</button>:<><button className={styles.secondary} type="button" disabled={saving} onClick={close}>Vazgeç</button><button className={styles.primary} disabled={!canSave}>{saving?'Kaydediliyor…':target?.kind==='close'?'Kapanışı kaydet':'Açılışı kaydet'}</button></>}</footer></form>
  </FinanceModal>
 </div></PanelPageShell>;
}
