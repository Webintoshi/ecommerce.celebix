'use client';
import {useEffect,useState} from 'react';
import type {AccountingTaxFilters,AccountingTaxReport,AccountingTaxCurrency} from '@celebix/saas-contracts';
import {accountingUi} from '@/lib/accounting-ui/client';
import {accountingMoney as money} from '@/lib/accounting-ui/model';
import shared from './accounting.module.css';
import styles from './tax-summary.module.css';

function CurrencyTax({row}:{row:AccountingTaxCurrency}){
 return <article className={styles.currency} aria-label={`${row.currency} satış KDV ayrımı`}>
  <h3>{row.currency}</h3>
  <dl className={styles.amounts}>
   <div><dt>KDV bilgisi olan satışlar</dt><dd>{money(row.knownGrossCents,row.currency)}</dd><small>{row.knownLineCount} satış kalemi</small></div>
   <div><dt>KDV hariç ürün tutarı</dt><dd>{money(row.taxableBaseCents,row.currency)}</dd><small>KDV uygulanan ürünler</small></div>
   <div><dt>Satış KDV’si</dt><dd>{money(row.vatCents,row.currency)}</dd><small>Satış fiyatının içindeki KDV</small></div>
  </dl>
  {row.exemptGrossCents>0?<p className={shared.muted}>KDV’den muaf ürünler: {money(row.exemptGrossCents,row.currency)}.</p>:null}
  {row.zeroRateGrossCents>0?<p className={shared.muted}>%0 KDV’li ürünler: {money(row.zeroRateGrossCents,row.currency)}.</p>:null}
  {row.unknownLineCount>0?<p className={styles.coverage} role="note"><strong>KDV bilgisi eksik: {money(row.unknownGrossCents,row.currency)}</strong><span>{row.unknownLineCount} satış kalemi KDV hesabına eklenmedi. Eski satışlar güncel ürün bilgisiyle değiştirilmez.</span></p>:null}
  {row.returnGrossCents>0?<div className={styles.returns}><h4>İadeler</h4><dl><div><dt>İade kayıtları</dt><dd>{money(row.returnGrossCents,row.currency)}</dd></div><div><dt>İadelerin KDV’si</dt><dd>{money(row.returnVatCents,row.currency)}</dd></div></dl>{row.unknownReturnGrossCents>0?<p className={shared.muted}>{money(row.unknownReturnGrossCents,row.currency)} tutarındaki iadenin KDV’si belirlenemedi; sıfır sayılmadı.</p>:null}</div>:null}
  {row.reversalGrossCents>0?<div className={styles.returns}><h4>İptal edilen iadeler</h4><dl><div><dt>İade iptali</dt><dd>{money(row.reversalGrossCents,row.currency)}</dd></div><div><dt>İptal edilen iadenin KDV’si</dt><dd>{money(row.reversalVatCents,row.currency)}</dd></div></dl>{row.unknownReversalGrossCents>0?<p className={shared.muted}>{money(row.unknownReversalGrossCents,row.currency)} tutarındaki iptalin KDV’si belirlenemedi.</p>:null}</div>:null}
 </article>;
}
export function AccountingTaxSummary({scopeKey,filters,revision}:{scopeKey:string;filters:AccountingTaxFilters;revision:number}){
 const [snapshot,setSnapshot]=useState<{key:string;report:AccountingTaxReport}|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 const queryKey=JSON.stringify([scopeKey,filters.dateFrom,filters.dateTo,filters.currency??null]),report=snapshot?.key===queryKey?snapshot.report:null;
 useEffect(()=>{
  const abort=new AbortController();setLoading(true);setError(false);
  void Promise.resolve().then(()=>accountingUi.tax({dateFrom:filters.dateFrom,dateTo:filters.dateTo,...filters.currency?{currency:filters.currency}:{}},abort.signal)).then(value=>{if(!abort.signal.aborted)setSnapshot({key:queryKey,report:value});}).catch(()=>{if(!abort.signal.aborted)setError(true);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
  return()=>abort.abort();
 },[queryKey,filters.dateFrom,filters.dateTo,filters.currency,revision,retry]);
 return <section className={styles.report} aria-label="Satışların KDV ayrımı" aria-busy={loading}>
  <header><h2>Satışların KDV ayrımı</h2><p>Ürün fiyatının içindeki KDV’yi ayrı gör. Kasa, müşteri borcu ve mevcut kâr hesabı değişmez.</p></header>
  {error?<p className={shared.error} role="alert">KDV özeti yüklenemedi. Diğer muhasebe alanlarını kullanabilirsin.<button type="button" className={shared.secondary} disabled={loading} onClick={()=>setRetry(v=>v+1)}>KDV özetini yeniden dene</button></p>:null}
  {!report&&loading?<div className={styles.loading} role="status"><span className="sr-only">KDV özeti yükleniyor…</span><i aria-hidden="true"/><i aria-hidden="true"/><i aria-hidden="true"/></div>:null}
  {report?report.currencies.length?report.currencies.map(row=><CurrencyTax key={row.currency} row={row}/>):<p className={shared.muted}>Bu dönemde satış veya iade yok.</p>:null}
  <p className={styles.note}>Ödenecek vergi tutarı değildir. Alış ve gider KDV’si bu özette izlenmez. Siparişe veya ürüne bağlanamayan iadelerin KDV’si hesaplanmaz. Ürün dökümü bulunmayan eski silinmiş siparişler bu özete girmez.</p>
 </section>;
}
