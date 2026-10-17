"use client";

import {useEffect,useState,type FormEvent} from "react";
import {RefreshCw} from "lucide-react";
import type {AccountingCommissions,AccountingCommissionsFilters} from "@celebix/saas-contracts";
import {PanelPageHeader,PanelPageShell} from "@/components/panel/PanelPageShell";
import {accountingUi} from "@/lib/accounting-ui/client";
import {accountingMoney as money} from "@/lib/accounting-ui/model";
import {defaultProfitabilityPeriod,profitabilityFilters} from "@/lib/accounting-ui/profitability-model";
import {AccountingNavigation} from "./AccountingNavigation";
import {CommissionPaymentsWorkspace} from "./CommissionPaymentsWorkspace";
import shared from "./accounting.module.css";
import styles from "./commissions.module.css";

const percent=(value:number)=>new Intl.NumberFormat("tr-TR",{maximumFractionDigits:2}).format(value/100);
export function CommissionConsole(props:{canRead:boolean;scopeKey:string}){return <CommissionWorkspace key={`${props.scopeKey}:${props.canRead}`} {...props}/>;}
function CommissionWorkspace({canRead,scopeKey}:{canRead:boolean;scopeKey:string}){
 const[filters,setFilters]=useState<AccountingCommissionsFilters>(defaultProfitabilityPeriod),[draft,setDraft]=useState(defaultProfitabilityPeriod);
 const[snapshot,setSnapshot]=useState<{key:string;value:AccountingCommissions}|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[filterError,setFilterError]=useState<string|null>(null),[revision,setRevision]=useState(0);
 const queryKey=JSON.stringify([scopeKey,filters]),data=snapshot?.key===queryKey?snapshot.value:null;
 useEffect(()=>{
  if(!canRead)return;
  const abort=new AbortController();setLoading(true);setError(null);
  void accountingUi.commissions(filters,abort.signal).then(value=>{if(!abort.signal.aborted)setSnapshot({key:queryKey,value});}).catch(()=>{if(!abort.signal.aborted)setError("Primler yüklenemedi. Filtrelerin korunuyor; yeniden dene.");}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
  return()=>abort.abort();
 },[scopeKey,canRead,queryKey,filters,revision]);
 function apply(event:FormEvent){event.preventDefault();try{const next=profitabilityFilters({...draft,currency:""});setFilters({dateFrom:next.dateFrom,dateTo:next.dateTo});setFilterError(null);}catch(reason){setFilterError(reason instanceof Error?reason.message:"Tarihleri kontrol et.");}}
 if(!canRead)return <PanelPageShell><PanelPageHeader title="Primler"/><h1 className="sr-only">Primler</h1><p className={shared.empty}>Primleri yalnızca mağaza sahibi veya yönetici görebilir.</p></PanelPageShell>;
 return <PanelPageShell><PanelPageHeader title="Primler"/><h1 className="sr-only">Primler</h1><div className={`${shared.console} ${styles.root}`}>
  <AccountingNavigation active="commissions"/>
  <CommissionPaymentsWorkspace canManage={canRead} scopeKey={scopeKey}/>
  <h2 className={styles.sectionHeading}>Dönem satışları ve hak edilen prim</h2>
  <div className={shared.toolbar}><form className={shared.filters} onSubmit={apply}>
   <label className={shared.filterField}><span>Başlangıç</span><input name="dateFrom" type="date" required value={draft.dateFrom} onChange={event=>setDraft(value=>({...value,dateFrom:event.target.value}))}/></label>
   <label className={shared.filterField}><span>Bitiş</span><input name="dateTo" type="date" required value={draft.dateTo} onChange={event=>setDraft(value=>({...value,dateTo:event.target.value}))}/></label>
   <button className={shared.secondary} disabled={loading}>Uygula</button>
  </form><button type="button" className={shared.secondary} disabled={loading} onClick={()=>setRevision(value=>value+1)}><RefreshCw size={16} aria-hidden="true"/>Yenile</button></div>
  {filterError?<p role="alert" className={shared.error}>{filterError}</p>:null}
  <p className={shared.muted}>Prim açıldıktan sonra tamamlanan satışlar hesaplanır. İndirim sonrası ürün tutarı esas alınır. İade ve iskonto önce kalan ürün tutarından, bu tutarı aşmadan düşülür. Kargo prim hesabına katılmaz.</p>
  {error?<div role="alert" className={shared.error}>{error}<button type="button" className={shared.secondary} disabled={loading} onClick={()=>setRevision(value=>value+1)}>Yeniden dene</button></div>:null}
  <div className={styles.data} aria-busy={loading}>
   {!data&&loading?<div className={styles.loading} role="status"><span className="sr-only">Primler yükleniyor…</span><div className={styles.summary} aria-hidden="true">{[0,1,2].map(key=><div key={key}><i/><b/></div>)}</div><div className={styles.skeletonRows} aria-hidden="true">{[0,1,2].map(key=><div key={key}><i/><b/></div>)}</div></div>:null}
   {data?data.rows.length?<>
    <dl className={styles.summary} aria-label="Dönem prim özeti"><div><dt>Tamamlanan satış</dt><dd>{data.totals.completedSaleCount}</dd></div><div><dt>Prime esas ürün tutarı</dt><dd>{money(data.totals.eligibleBaseCents,data.currency)}</dd></div><div><dt>Hak edilen prim</dt><dd>{money(data.totals.earnedCommissionCents,data.currency)}</dd></div></dl>
    <div className={styles.tableWrap}><table className={styles.table}><caption className="sr-only">Kasiyer primleri</caption><thead><tr><th scope="col">Kasiyer</th><th scope="col">Güncel prim oranı</th><th scope="col">Satış</th><th scope="col">Prime esas tutar</th><th scope="col">Hak edilen prim</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.membershipId}>
     <td data-label="Kasiyer"><strong>{row.displayName}</strong><small>{row.phoneMasked??"Telefon tanımlanmadı"}</small></td>
     <td data-label="Güncel prim oranı"><span>%{percent(row.commissionRateBps)}</span>{!row.commissionEnabled?<small>Prim kapalı</small>:null}</td>
     <td data-label="Satış" className={styles.numeric}>{row.completedSaleCount}</td>
     <td data-label="Prime esas tutar" className={styles.numeric}>{money(row.eligibleBaseCents,data.currency)}<small>Ürün satışı {money(row.merchandiseSalesCents,data.currency)}</small>{row.returnAdjustmentCents>0?<small>İade −{money(row.returnAdjustmentCents,data.currency)}</small>:null}{row.collectionDiscountCents>0?<small>İskonto −{money(row.collectionDiscountCents,data.currency)}</small>:null}</td>
     <td data-label="Hak edilen prim" className={styles.numeric}><strong>{money(row.earnedCommissionCents,data.currency)}</strong></td>
    </tr>)}</tbody></table></div>
   </>:<p className={shared.empty}>Bu dönemde prim kaydı yok. Başka bir tarih aralığı seçebilirsin.</p>:null}
  </div>
  <p className={shared.muted}>Prim satışı yapan kasiyere aittir; tahsilatı başka biri yaparsa değişmez. Satıştaki oran korunur; güncel oran geçmiş kazancı değiştirmez. Satıştan hesaplanan prim kasa ve banka bakiyesini kendiliğinden değiştirmez.</p>
 </div></PanelPageShell>;
}
