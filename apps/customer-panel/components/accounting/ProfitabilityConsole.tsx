'use client';
import { PanelInitialDataGate } from "@/components/panel/PanelInitialDataGate";
import Link from 'next/link';
import {useEffect,useState,type FormEvent} from 'react';
import {ChevronDown,RefreshCw} from 'lucide-react';
import type{AccountingProfitability} from '@celebix/saas-contracts';
import {PanelPageHeader,PanelPageShell} from '@/components/panel/PanelPageShell';
import {accountingUi} from '@/lib/accounting-ui/client';
import {accountingMoney as money} from '@/lib/accounting-ui/model';
import {defaultProfitabilityPeriod,profitabilityFilters,profitabilityGaps,profitabilityCostNotice,type ProfitabilityFilters} from '@/lib/accounting-ui/profitability-model';
import {AccountingTaxSummary} from './AccountingTaxSummary';
import {AccountingNavigation} from './AccountingNavigation';
import {AccountingEmptyState} from './AccountingEmptyState';
import shared from './accounting.module.css';
import styles from './profitability.module.css';

type Summary=AccountingProfitability['currencies'][number];
const dateLabel=(value:string)=>value.split('-').reverse().join('.');
function Amount({label,value,currency,emphasis=false}:{label:string;value:number|null;currency:string;emphasis?:boolean}){
 return<div className={emphasis?styles.total:undefined}><dt>{label}</dt><dd>{value===null?'Hesaplanamıyor':money(value===0?0:value,currency)}</dd></div>;
}
function CurrencySummary({row}:{row:Summary}){
 const gaps=profitabilityGaps(row),costNotice=profitabilityCostNotice(row);
 const partial=row.grossProfitCents===null?row.knownProfit:undefined;
 const profitValue=partial?partial.grossProfitCents:row.profitCents;
 const profitLabel=partial?'Bilinen satışların kârı':'Hesaplanan kâr';
 const profitUnavailable=partial?.includedOrderCount===0?'Maliyeti bilinen satış yok':'Hesaplanamıyor';
 return<article className={styles.currency} aria-label={`${row.currency} gelir ve kâr özeti`}>
  <div className={styles.currencyHeading}><h2 className={shared.currencyLabel}>{row.currency}</h2><span>Dönem özeti</span></div>
  <dl className={styles.metrics} aria-label="Satış, tahsilat ve kâr">
   <div><dt>Net satış</dt><dd>{money(row.netSalesCents,row.currency)}</dd><small>{row.discountCents?'İade ve iskontolar çıkarıldı.':'Satışlardan iade kayıtları çıkarıldı.'}</small></div>
   <div><dt>Tahsilat</dt><dd>{money(row.collectionsCents,row.currency)}</dd><small>Bu dönemde alınan ödeme; eski borçlar da dahil.</small></div>
   <div><dt>{profitLabel}</dt><dd className={profitValue===null?styles.unavailable:undefined}>{profitValue===null?profitUnavailable:money(profitValue,row.currency)}</dd><small>{partial?'Kısmi hesap · İşletme gideri ve komisyon düşülmeden.':row.profitCents===null?'Eksik kayıtlar aşağıda gösteriliyor.':'Ürün maliyeti, kayıtlı işletme gideri ve komisyon sonrası.'}</small></div>
  </dl>
  {partial?<div className={styles.gaps} role="note"><strong>Kısmi kâr hesabı</strong><p>{partial.includedOrderCount} satış dahil, {partial.excludedOrderCount} satış hariç.</p><p>Hariç satışların tutarı ve maliyeti bu kâra eklenmedi.</p>{gaps.length?<ul>{gaps.map(gap=><li key={gap}>{gap}</li>)}</ul>:null}{partial.unallocatedAdjustmentCount?<p>{partial.unallocatedAdjustmentCount} iskonto veya iade eşleştirilemedi. Kısmi kâr hesaplanamıyor.</p>:null}</div>:gaps.length?<div className={styles.gaps} role="note"><strong>Kâr hesabı için eksik kayıt var</strong><ul>{gaps.map(gap=><li key={gap}>{gap}</li>)}</ul><p>Eksik tutarlar sıfır sayılmaz; tamamlanmadan kâr gösterilmez.</p></div>:null}
  <div className={styles.breakdowns}>
   <section className={styles.breakdown} aria-label={`${row.currency} kâr hesabı`}><h3>{partial?'Kısmi kâr hesabı':'Kâr hesabı'}</h3>
    {partial?<><dl><Amount label="Hesaba alınan satışlar" value={partial.salesCents} currency={row.currency}/>{partial.discountCents?<Amount label="İskonto" value={-partial.discountCents} currency={row.currency}/>:null}<Amount label="Net satış" value={partial.netSalesCents} currency={row.currency} emphasis/><Amount label="Ürün maliyeti" value={-partial.costCents} currency={row.currency}/><Amount label="Bilinen satışların kârı" value={partial.grossProfitCents} currency={row.currency} emphasis/></dl><p className={shared.muted}>İşletme gideri ve komisyon düşülmedi. Dönemin para hareketleri ayrıca gösteriliyor.</p>{costNotice?<p className={shared.muted} role="note">Eksik geçmiş maliyetler için güncel ürün maliyeti kullanılır. Bu maliyetler değişirse özet de değişebilir.</p>:null}</>:<><dl><Amount label="Satış tutarı" value={row.salesCents} currency={row.currency}/><Amount label="İade kayıtları" value={-row.returnCents} currency={row.currency}/>{row.discountCents?<Amount label="İskonto" value={-row.discountCents} currency={row.currency}/>:null}<Amount label="Net satış" value={row.netSalesCents} currency={row.currency} emphasis/>
     <Amount label="Kayıtlı ürün maliyeti" value={-row.knownCostCents} currency={row.currency}/><Amount label="Ürün maliyeti sonrası kalan" value={row.grossProfitCents} currency={row.currency} emphasis/>
     <Amount label="Ödenmiş işletme gideri" value={-row.operatingExpensesCents} currency={row.currency}/><Amount label="Kart komisyonu" value={-row.commissionCents} currency={row.currency}/><Amount label="Hesaplanan kâr" value={row.profitCents} currency={row.currency} emphasis/>
    </dl><p className={shared.muted}>Ürün maliyeti kayıtlı satış tutarı: {money(row.costedSalesCents,row.currency)}.</p>{costNotice?<p className={shared.muted} role="note">{costNotice}</p>:null}</>}
   </section>
   <section className={styles.breakdown} aria-label={`${row.currency} para hareketleri`}><h3>Alınan ve ödenen para</h3>
    <dl><Amount label="Tahsilat" value={row.collectionsCents} currency={row.currency}/><Amount label="Müşteriye iade edilen" value={-row.refundsCents} currency={row.currency}/><Amount label="Ödenmiş işletme gideri" value={-row.operatingExpensesCents} currency={row.currency}/><Amount label="Tedarikçilere ödenen" value={-row.supplierPaymentsCents} currency={row.currency}/><Amount label="Kart komisyonu" value={-row.commissionCents} currency={row.currency}/><Amount label="Tahsilattan kalan" value={row.netCashCents} currency={row.currency} emphasis/></dl>
    <p className={shared.muted}>Kartla alınan ödemeler de dahildir; bu tutar banka bakiyesi veya kâr değildir. Hesaplar arası aktarımlar dahil edilmez.</p>
    <Link className={shared.quiet} href="/accounting/accounts">Kasa ve banka bakiyeleri</Link>
   </section>
  </div>
 </article>;
}
export function ProfitabilityConsole(props:{canRead:boolean;scopeKey:string}){return<ProfitabilityWorkspace key={`${props.scopeKey}:${props.canRead}`} {...props}/>;}
function ProfitabilityWorkspace({canRead,scopeKey}:{canRead:boolean;scopeKey:string}){
 const[filters,setFilters]=useState<ProfitabilityFilters>(defaultProfitabilityPeriod),[draft,setDraft]=useState(()=>({...defaultProfitabilityPeriod(),currency:''}));
 const[snapshot,setSnapshot]=useState<{key:string;value:AccountingProfitability}|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[filterError,setFilterError]=useState<string|null>(null),[revision,setRevision]=useState(0);
 const queryKey=JSON.stringify([scopeKey,filters]),data=snapshot?.key===queryKey?snapshot.value:null;
 useEffect(()=>{
  if(!canRead)return;const abort=new AbortController();setLoading(true);setError(null);
  void accountingUi.profitability(filters,abort.signal).then(value=>{if(!abort.signal.aborted)setSnapshot({key:queryKey,value})}).catch(()=>{if(!abort.signal.aborted)setError('Gelir ve kâr özeti yüklenemedi. Filtrelerin korunuyor; yeniden dene.')}).finally(()=>{if(!abort.signal.aborted)setLoading(false)});
  return()=>abort.abort();
 },[scopeKey,canRead,queryKey,filters,revision]);
 function apply(event:FormEvent){event.preventDefault();try{setFilters(profitabilityFilters(draft));setFilterError(null)}catch(e){setFilterError(e instanceof Error?e.message:'Tarihleri ve para birimini kontrol et.')}}
 if(!canRead)return<PanelPageShell><PanelPageHeader title="Gelir ve kâr"/><h1 className="sr-only">Gelir ve kâr</h1><p className={shared.empty}>Gelir ve kâr özeti için mağaza yöneticisi yetkisi gerekiyor.</p></PanelPageShell>;
 return<PanelInitialDataGate pending={canRead && loading && !data} scopeKey={scopeKey}>{<PanelPageShell><PanelPageHeader title="Gelir ve kâr"/><h1 className="sr-only">Gelir ve kâr</h1><div className={shared.console}>
  <AccountingNavigation active="profitability"/>
  <div className={shared.toolbar}><form className={shared.filters} onSubmit={apply}><label className={shared.filterField}><span>Başlangıç</span><input name="dateFrom" type="date" value={draft.dateFrom} required onChange={e=>setDraft(v=>({...v,dateFrom:e.target.value}))}/></label><label className={shared.filterField}><span>Bitiş</span><input name="dateTo" type="date" value={draft.dateTo} required onChange={e=>setDraft(v=>({...v,dateTo:e.target.value}))}/></label><label className={shared.filterField}><span>Para birimi</span><input name="currency" value={draft.currency} placeholder="Tümü" maxLength={3} onChange={e=>setDraft(v=>({...v,currency:e.target.value.toUpperCase()}))}/></label><button className={shared.secondary} disabled={loading}>Uygula</button></form><button type="button" className={shared.secondary} disabled={loading} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={16} aria-hidden="true"/>Yenile</button></div>
  {filterError?<p role="alert" className={shared.error}>{filterError}</p>:null}
  <div className={styles.reportContext}><span>Tüm satış kanalları · {dateLabel(filters.dateFrom)} – {dateLabel(filters.dateTo)}</span><details><summary>Hesap kapsamı <ChevronDown size={16} aria-hidden="true"/></summary><p>Manuel satışlar tamamlandığında, web satışları kayıtlı ödeme doğrulamasında hesaba girer. Tahsilat ödeme tarihine göredir. Para birimleri ayrı hesaplanır.</p></details></div>
  {error?<p role="alert" className={shared.error}>{error}<button type="button" className={shared.secondary} disabled={loading} onClick={()=>setRevision(v=>v+1)}>Yeniden dene</button></p>:null}
  <div className={styles.data} aria-busy={loading}>
   {!data&&loading?<div role="status" className={styles.loading}><span className="sr-only">Gelir ve kâr özeti yükleniyor…</span><div className={styles.currency} aria-hidden="true"><div className={styles.skeletonLabel}/><div className={styles.metrics}>{Array.from({length:3},(_,i)=><div key={i}><i/><b/><small><i/><i/></small></div>)}</div><div className={styles.breakdowns}>{[8,6].map((count,i)=><div key={i} className={styles.breakdown}><div className={styles.skeletonLabel}/><div>{Array.from({length:count},(_,j)=><div className={styles.skeletonRow} key={j}><i/><b/></div>)}</div><div className={styles.skeletonText}><i/><i/></div></div>)}</div></div></div>:null}
   {data?data.currencies.length?data.currencies.map(row=><CurrencySummary key={row.currency} row={row}/>):<AccountingEmptyState variant="profitability" title="Bu dönemde muhasebe hareketi yok." description="Tarih veya para birimi filtresini değiştir."/>:null}
  </div>
  <p className={styles.reportNote}>{data?.currencies.some(row=>row.grossProfitCents===null&&row.knownProfit)?'Kısmi kâr yalnız maliyeti bilinen satışları içerir; işletme gideri ve komisyon düşülmez. Tutarlar vergi ve kaydedilmemiş giderler hariçtir.':'Satılan ürün maliyeti ve kayıtlı giderler sonrası; vergi ve kaydedilmemiş giderler hariç. Tedarikçi ödemeleri ürün maliyetinden ayrı izlenir; gider türü bilinmiyorsa kâr gösterilmez.'}</p>
  <AccountingTaxSummary scopeKey={scopeKey} filters={filters} revision={revision}/>
 </div></PanelPageShell>}</PanelInitialDataGate>;
}
