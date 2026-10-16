import {accountingExact,accountingInteger,parseAccountingFilters} from './validation.ts';

export interface AccountingProfitabilityFilters {readonly dateFrom:string;readonly dateTo:string;readonly currency?:string;}
export interface AccountingProfitabilityCurrency {
 readonly currency:string;
 readonly salesCents:number;readonly returnCents:number;readonly discountCents?:number;readonly netSalesCents:number;
 readonly collectionsCents:number;readonly refundsCents:number;
 readonly expensesCents:number;readonly supplierPaymentsCents:number;readonly operatingExpensesCents:number;readonly commissionCents:number;readonly netCashCents:number;
 readonly knownCostCents:number;readonly costedSalesCents:number;
 readonly missingCostOrderCount:number;readonly unresolvedReturnCount:number;readonly unclassifiedSupplierPaymentCount:number;
 readonly grossProfitCents:number|null;readonly profitCents:number|null;
}
export interface AccountingProfitability {readonly dateFrom:string;readonly dateTo:string;readonly currencies:readonly AccountingProfitabilityCurrency[];}
function fail():never{throw new TypeError('invalid_accounting_profitability');}
export function parseAccountingProfitabilityFilters(value:unknown):Readonly<AccountingProfitabilityFilters>{
 const b=accountingExact(value,['dateFrom','dateTo'],['currency']);
 parseAccountingFilters(b);
 if(String(b.dateFrom).startsWith('0000-')||String(b.dateTo).startsWith('0000-'))fail();
 const days=(Date.parse(String(b.dateTo)+'T00:00:00Z')-Date.parse(String(b.dateFrom)+'T00:00:00Z'))/86400000+1;
 if(days<1||days>366)fail();
 return Object.freeze(b) as unknown as AccountingProfitabilityFilters;
}
const MONEY=['salesCents','returnCents','netSalesCents','collectionsCents','refundsCents','expensesCents','supplierPaymentsCents','operatingExpensesCents','commissionCents','netCashCents','knownCostCents','costedSalesCents'] as const;
const COUNTS=['missingCostOrderCount','unresolvedReturnCount','unclassifiedSupplierPaymentCount'] as const;
function currencyRow(value:unknown):Readonly<AccountingProfitabilityCurrency>{
 const b=accountingExact(value,['currency',...MONEY,...COUNTS,'grossProfitCents','profitCents'],['discountCents']);
 if(typeof b.currency!=='string'||! /^[A-Z]{3}$/.test(b.currency))fail();
 for(const key of MONEY)accountingInteger(b[key],Number.MIN_SAFE_INTEGER);
 if(Object.hasOwn(b,'discountCents'))accountingInteger(b.discountCents,Number.MIN_SAFE_INTEGER);
 for(const key of COUNTS)accountingInteger(b[key]);
 for(const key of ['grossProfitCents','profitCents'])if(b[key]!==null)accountingInteger(b[key],Number.MIN_SAFE_INTEGER);
 const n=(key:string)=>BigInt(b[key] as number);
 if(n('netSalesCents')!==n('salesCents')-n('returnCents')-BigInt((b.discountCents??0) as number)||n('operatingExpensesCents')!==n('expensesCents')-n('supplierPaymentsCents')||n('netCashCents')!==n('collectionsCents')-n('refundsCents')-n('expensesCents')-n('commissionCents'))fail();
 const costComplete=b.missingCostOrderCount===0&&b.unresolvedReturnCount===0;
 if(costComplete){if(b.grossProfitCents===null||n('grossProfitCents')!==n('netSalesCents')-n('knownCostCents'))fail();}else if(b.grossProfitCents!==null)fail();
 if(costComplete&&b.unclassifiedSupplierPaymentCount===0){if(b.profitCents===null||n('profitCents')!==n('grossProfitCents')-n('operatingExpensesCents')-n('commissionCents'))fail();}else if(b.profitCents!==null)fail();
 return Object.freeze(b) as unknown as AccountingProfitabilityCurrency;
}
export function parseAccountingProfitability(value:unknown):Readonly<AccountingProfitability>{
 const b=accountingExact(value,['dateFrom','dateTo','currencies']);
 parseAccountingProfitabilityFilters({dateFrom:b.dateFrom,dateTo:b.dateTo});
 if(!Array.isArray(b.currencies)||b.currencies.length>100)fail();
 const currencies=b.currencies.map(currencyRow);
 if(new Set(currencies.map(row=>row.currency)).size!==currencies.length)fail();
 return Object.freeze({...b,currencies:Object.freeze(currencies)}) as unknown as AccountingProfitability;
}
