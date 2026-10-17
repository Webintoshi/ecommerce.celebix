import {accountingExact,accountingInteger,accountingUuid,parseAccountingFilters} from './validation.ts';

export type AccountingCommissionBasis='net_product_sales';
export type AccountingCommissionsFilters=Readonly<{dateFrom:string;dateTo:string}>;
export type AccountingCommissionTotals=Readonly<{
 completedSaleCount:number;merchandiseSalesCents:number;returnAdjustmentCents:number;
 collectionDiscountCents:number;eligibleBaseCents:number;earnedCommissionCents:number;
}>;
export type AccountingCommissionRow=AccountingCommissionTotals&Readonly<{
 membershipId:string;displayName:string;phoneMasked:string|null;
 commissionEnabled:boolean;commissionRateBps:number;
}>;
export type AccountingCommissions=Readonly<{
 dateFrom:string;dateTo:string;basis:AccountingCommissionBasis;currency:'TRY';prospectiveOnly:true;
 rows:readonly AccountingCommissionRow[];totals:AccountingCommissionTotals;
}>;
const NUMBERS=['completedSaleCount','merchandiseSalesCents','returnAdjustmentCents','collectionDiscountCents','eligibleBaseCents','earnedCommissionCents'] as const;
function fail():never{throw new TypeError('invalid_accounting_commissions');}
function text(value:unknown,max:number):string{if(typeof value!=='string'||value.length<1||value.length>max||value!==value.trim()||/[\u0000-\u001f\u007f]/.test(value))fail();return value;}
export function parseAccountingCommissionsFilters(value:unknown):AccountingCommissionsFilters{
 const body=accountingExact(value,['dateFrom','dateTo']);parseAccountingFilters(body);
 if(String(body.dateFrom).startsWith('0000-')||String(body.dateTo).startsWith('0000-'))fail();
 const days=(Date.parse(String(body.dateTo)+'T00:00:00Z')-Date.parse(String(body.dateFrom)+'T00:00:00Z'))/86400000+1;
 if(days<1||days>366)fail();return Object.freeze(body) as AccountingCommissionsFilters;
}
function totals(value:unknown):AccountingCommissionTotals{
 const body=accountingExact(value,NUMBERS);for(const key of NUMBERS)accountingInteger(body[key]);
 if(body.completedSaleCount===0&&NUMBERS.some(key=>key!=='completedSaleCount'&&body[key]!==0))fail();
 if(BigInt(body.merchandiseSalesCents as number)-BigInt(body.returnAdjustmentCents as number)-BigInt(body.collectionDiscountCents as number)!==BigInt(body.eligibleBaseCents as number)||(body.earnedCommissionCents as number)>(body.eligibleBaseCents as number))fail();
 return Object.freeze(body) as AccountingCommissionTotals;
}
function row(value:unknown):AccountingCommissionRow{
 const body=accountingExact(value,['membershipId','displayName','phoneMasked','commissionEnabled','commissionRateBps',...NUMBERS]);
 const rate=accountingInteger(body.commissionRateBps);if(typeof body.commissionEnabled!=='boolean'||rate>10000||body.commissionEnabled&&rate<1)fail();
 const money=totals(Object.fromEntries(NUMBERS.map(key=>[key,body[key]])));
 return Object.freeze({...money,membershipId:accountingUuid(body.membershipId),displayName:text(body.displayName,320),phoneMasked:body.phoneMasked===null?null:text(body.phoneMasked,80),commissionEnabled:body.commissionEnabled,commissionRateBps:rate});
}
export function parseAccountingCommissions(value:unknown):AccountingCommissions{
 const body=accountingExact(value,['dateFrom','dateTo','basis','currency','prospectiveOnly','rows','totals']);
 const period=parseAccountingCommissionsFilters({dateFrom:body.dateFrom,dateTo:body.dateTo});
 if(body.basis!=='net_product_sales'||body.currency!=='TRY'||body.prospectiveOnly!==true||!Array.isArray(body.rows)||body.rows.length>1000)fail();
 const descriptors=Object.getOwnPropertyDescriptors(body.rows);if(Reflect.ownKeys(descriptors).length!==body.rows.length+1)fail();
 const rows:AccountingCommissionRow[]=[];const ids=new Set<string>();for(let i=0;i<body.rows.length;i++){const d=descriptors[String(i)];if(!d||!('value'in d)||!d.enumerable)fail();const entry=row(d.value);if(ids.has(entry.membershipId))fail();ids.add(entry.membershipId);rows.push(entry);}
 const sum=totals(body.totals);for(const key of NUMBERS)if(rows.reduce((acc,item)=>acc+BigInt(item[key]),0n)!==BigInt(sum[key]))fail();
 return Object.freeze({...period,basis:'net_product_sales',currency:'TRY',prospectiveOnly:true,rows:Object.freeze(rows),totals:sum});
}
