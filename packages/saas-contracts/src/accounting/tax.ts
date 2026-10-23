import {accountingExact,accountingInteger} from './validation.ts';
import {parseAccountingProfitabilityFilters} from './profitability.ts';

export type AccountingTaxFilters=Readonly<{dateFrom:string;dateTo:string;currency?:string}>;
export type AccountingTaxCurrency=Readonly<{
 currency:string;grossSalesCents:number;knownGrossCents:number;unknownGrossCents:number;
 taxableBaseCents:number;vatCents:number;exemptGrossCents:number;zeroRateGrossCents:number;
 knownLineCount:number;unknownLineCount:number;returnGrossCents:number;knownReturnGrossCents:number;
 returnVatCents:number;unknownReturnGrossCents:number;
 reversalGrossCents:number;knownReversalGrossCents:number;reversalVatCents:number;unknownReversalGrossCents:number;
}>;
export type AccountingTaxReport=Readonly<{dateFrom:string;dateTo:string;timeZone:string;startAt:string;endAt:string;currencies:readonly AccountingTaxCurrency[];limitations:readonly ['purchase_vat_not_tracked','unallocated_returns_unknown','deleted_order_breakdown_unavailable']}>;
const MONEY=['grossSalesCents','knownGrossCents','unknownGrossCents','taxableBaseCents','vatCents','exemptGrossCents','zeroRateGrossCents','returnGrossCents','knownReturnGrossCents','returnVatCents','unknownReturnGrossCents','reversalGrossCents','knownReversalGrossCents','reversalVatCents','unknownReversalGrossCents'] as const;
const LIMITATIONS=['purchase_vat_not_tracked','unallocated_returns_unknown','deleted_order_breakdown_unavailable'] as const;
function fail():never{throw TypeError('invalid_accounting_tax');}
export function parseAccountingTaxFilters(value:unknown):AccountingTaxFilters{
 const b=accountingExact(value,['dateFrom','dateTo'],['currency']);
 return parseAccountingProfitabilityFilters(b);
}
export function accountingTaxReportMatches(report:AccountingTaxReport,filters:AccountingTaxFilters):boolean{
 return report.dateFrom===filters.dateFrom&&report.dateTo===filters.dateTo&&(!filters.currency||report.currencies.every(row=>row.currency===filters.currency));
}
function localDate(value:string,timeZone:string):string{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
 const get=(key:string)=>parts.find(p=>p.type===key)?.value;
 return `${get('year')}-${get('month')}-${get('day')}`;
}
function timestamp(value:unknown):string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(value)||!Number.isFinite(Date.parse(value)))fail();
 return new Date(value).toISOString();
}
export function parseAccountingTaxReport(value:unknown):AccountingTaxReport{
 const b=accountingExact(value,['dateFrom','dateTo','timeZone','startAt','endAt','currencies','limitations']);
 const dates=parseAccountingTaxFilters({dateFrom:b.dateFrom,dateTo:b.dateTo});
 if(typeof b.timeZone!=='string'||b.timeZone.length>100)fail();
 const timeZone=b.timeZone,next=new Date(dates.dateTo+'T12:00:00.000Z');next.setUTCDate(next.getUTCDate()+1);
 const startAt=timestamp(b.startAt),endAt=timestamp(b.endAt),duration=Date.parse(endAt)-Date.parse(startAt);
 if(localDate(startAt,timeZone)!==dates.dateFrom||localDate(endAt,timeZone)!==next.toISOString().slice(0,10))fail();
 if(duration<=0||duration>=367*86400000||!Array.isArray(b.currencies)||b.currencies.length>100||!Array.isArray(b.limitations)||b.limitations.length!==LIMITATIONS.length||b.limitations.some((v,i)=>v!==LIMITATIONS[i]))fail();
 const seen=new Set<string>();
 const currencies=b.currencies.map(value=>{
  const row=accountingExact(value,['currency',...MONEY,'knownLineCount','unknownLineCount']);
  if(typeof row.currency!=='string'||!/^[A-Z]{3}$/.test(row.currency)||seen.has(row.currency))fail();seen.add(row.currency);
  for(const key of [...MONEY,'knownLineCount','unknownLineCount'])accountingInteger(row[key]);
  const n=(key:string)=>BigInt(row[key] as number);
  if(n('grossSalesCents')!==n('knownGrossCents')+n('unknownGrossCents')||n('knownGrossCents')!==n('taxableBaseCents')+n('vatCents')+n('exemptGrossCents')||n('returnGrossCents')!==n('knownReturnGrossCents')+n('unknownReturnGrossCents')||n('returnVatCents')>n('knownReturnGrossCents')||n('reversalGrossCents')!==n('knownReversalGrossCents')+n('unknownReversalGrossCents')||n('reversalVatCents')>n('knownReversalGrossCents')||n('zeroRateGrossCents')>n('taxableBaseCents'))fail();
  if(row.knownLineCount===0&&row.knownGrossCents!==0||row.unknownLineCount===0&&row.unknownGrossCents!==0)fail();
  return Object.freeze(row) as unknown as AccountingTaxCurrency;
 });
 return Object.freeze({...dates,timeZone,startAt,endAt,currencies:Object.freeze(currencies),limitations:LIMITATIONS});
}
