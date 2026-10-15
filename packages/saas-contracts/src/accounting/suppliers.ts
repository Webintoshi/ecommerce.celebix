import {accountingExact,accountingInteger,accountingUuid} from './validation.ts';
import {parseAccountingAccount} from './response.ts';
import type {AccountingAccount} from './types.ts';

export const ACCOUNTING_SUPPLIER_ACTIONS=['createDebt','pay','reversePayment','cancelDebt'] as const;
export type AccountingSupplierAction=typeof ACCOUNTING_SUPPLIER_ACTIONS[number];
export interface AccountingSupplierCreateIntent {readonly supplierName:string;readonly amountCents:number;readonly currency:string;readonly occurredOn:string;readonly dueOn:string|null;readonly documentNumber:string|null;readonly note:string;}
export interface AccountingSupplierPayIntent {readonly debtId:string;readonly accountId:string;readonly amountCents:number;readonly currency:string;readonly occurredOn:string;readonly note:string;readonly expectedVersion:number;readonly expectedAccountVersion:number;}
export interface AccountingSupplierReverseIntent {readonly debtId:string;readonly paymentId:string;readonly reason:string;readonly expectedVersion:number;readonly expectedAccountVersion:number;}
export interface AccountingSupplierCancelIntent {readonly debtId:string;readonly reason:string;readonly expectedVersion:number;}
export interface AccountingSupplierIntentMap {createDebt:AccountingSupplierCreateIntent;pay:AccountingSupplierPayIntent;reversePayment:AccountingSupplierReverseIntent;cancelDebt:AccountingSupplierCancelIntent;}
export interface AccountingSupplierFilters {readonly query?:string;readonly status?:'open'|'paid'|'cancelled'|'all';readonly due?:'all'|'overdue'|'today'|'upcoming'|'undated';readonly currency?:string;}
export interface AccountingSupplierDebt {
 readonly id:string;readonly supplierName:string;readonly currency:string;readonly amountCents:number;readonly paidCents:number;readonly dueCents:number;readonly occurredOn:string;readonly dueOn:string|null;readonly documentNumber:string|null;readonly note:string;
 readonly status:'unpaid'|'partial'|'paid'|'cancelled';readonly version:number;readonly createdAt:string;readonly createdBy:string;readonly cancelledAt:string|null;readonly cancelledBy:string|null;readonly cancellationReason:string|null;
}
export interface AccountingSupplierPayment {readonly id:string;readonly debtId:string;readonly eventId:string;readonly accountId:string;readonly accountName:string;readonly accountType:'cash'|'bank';readonly currency:string;readonly amountCents:number;readonly occurredOn:string;readonly createdAt:string;readonly note:string;readonly reversed:boolean;readonly reversalReason:string|null;}
export interface AccountingSupplierList {readonly debts:readonly AccountingSupplierDebt[];readonly today:string;readonly hasMore:boolean;}
export interface AccountingSupplierDetail {readonly debt:AccountingSupplierDebt;readonly payments:readonly AccountingSupplierPayment[];readonly hasMore:boolean;}
export interface AccountingSupplierResult {readonly operationId:string;readonly replayed:boolean;readonly kind:AccountingSupplierAction;readonly debt:AccountingSupplierDebt;readonly payment:AccountingSupplierPayment|null;readonly account:AccountingAccount|null;readonly previousDueCents:number|null;readonly previousBalanceCents:number|null;}

function fail():never{throw new TypeError('invalid_accounting_supplier');}
function text(value:unknown,max=2000):string{if(typeof value!=='string'||value.length<1||value.length>max||value!==value.trim()||/[\u0000-\u001f\u007f]/.test(value))fail();return value;}
function currency(value:unknown):string{if(typeof value!=='string'||! /^[A-Z]{3}$/.test(value))fail();return value;}
function date(value:unknown):string{const v=text(value,10);if(! /^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v||v<'0001-01-01')fail();return v;}
function timestamp(value:unknown):string{const v=text(value,24);if(v.length!==24||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)fail();return v;}
function nullable<T>(v:unknown,parse:(value:unknown)=>T):T|null{return v===null?null:parse(v);}
function bool(v:unknown):boolean{if(typeof v!=='boolean')fail();return v;}
function action(v:unknown):AccountingSupplierAction{if(!(ACCOUNTING_SUPPLIER_ACTIONS as readonly unknown[]).includes(v))fail();return v as AccountingSupplierAction;}
function unique(rows:readonly {id:string}[]):void{if(new Set(rows.map(r=>r.id)).size!==rows.length)fail();}
function eqSum(a:number,b:number,c:number):boolean{return BigInt(a)+BigInt(b)===BigInt(c);}

export function parseAccountingSupplierIntent<K extends AccountingSupplierAction>(kind:K,value:unknown):AccountingSupplierIntentMap[K]{
 action(kind);
 const keys={createDebt:['supplierName','amountCents','currency','occurredOn','dueOn','documentNumber','note'],pay:['debtId','accountId','amountCents','currency','occurredOn','note','expectedVersion','expectedAccountVersion'],reversePayment:['debtId','paymentId','reason','expectedVersion','expectedAccountVersion'],cancelDebt:['debtId','reason','expectedVersion']} as const;
 const b=accountingExact(value,keys[kind]);let result:AccountingSupplierIntentMap[AccountingSupplierAction];
 if(kind==='createDebt'){
  const occurredOn=date(b.occurredOn),dueOn=nullable(b.dueOn,date);if(dueOn!==null&&dueOn<occurredOn)fail();
  result={supplierName:text(b.supplierName,200),amountCents:accountingInteger(b.amountCents,1),currency:currency(b.currency),occurredOn,dueOn,documentNumber:nullable(b.documentNumber,v=>text(v,100)),note:text(b.note)};
 }else if(kind==='pay')result={debtId:accountingUuid(b.debtId),accountId:accountingUuid(b.accountId),amountCents:accountingInteger(b.amountCents,1),currency:currency(b.currency),occurredOn:date(b.occurredOn),note:text(b.note),expectedVersion:accountingInteger(b.expectedVersion,1),expectedAccountVersion:accountingInteger(b.expectedAccountVersion,1)};
 else if(kind==='reversePayment')result={debtId:accountingUuid(b.debtId),paymentId:accountingUuid(b.paymentId),reason:text(b.reason),expectedVersion:accountingInteger(b.expectedVersion,1),expectedAccountVersion:accountingInteger(b.expectedAccountVersion,1)};
 else result={debtId:accountingUuid(b.debtId),reason:text(b.reason),expectedVersion:accountingInteger(b.expectedVersion,1)};
 return Object.freeze(result) as AccountingSupplierIntentMap[K];
}
export function parseAccountingSupplierFilters(value:unknown):AccountingSupplierFilters{
 const b=accountingExact(value,[],['query','status','due','currency']);const result:Record<string,string>={};
 if(b.query!==undefined)result.query=text(b.query,200);
 if(b.currency!==undefined)result.currency=currency(b.currency);
 if(b.status!==undefined){if(!['open','paid','cancelled','all'].includes(b.status as string))fail();result.status=b.status as string;}
 if(b.due!==undefined){if(!['all','overdue','today','upcoming','undated'].includes(b.due as string))fail();result.due=b.due as string;}
 return Object.freeze(result) as AccountingSupplierFilters;
}
export function parseAccountingSupplierDebt(value:unknown):AccountingSupplierDebt{
 const b=accountingExact(value,['id','supplierName','currency','amountCents','paidCents','dueCents','occurredOn','dueOn','documentNumber','note','status','version','createdAt','createdBy','cancelledAt','cancelledBy','cancellationReason']);
 if(!['unpaid','partial','paid','cancelled'].includes(b.status as string))fail();
 const v:AccountingSupplierDebt={id:accountingUuid(b.id),supplierName:text(b.supplierName,200),currency:currency(b.currency),amountCents:accountingInteger(b.amountCents,1),paidCents:accountingInteger(b.paidCents),dueCents:accountingInteger(b.dueCents),occurredOn:date(b.occurredOn),dueOn:nullable(b.dueOn,date),documentNumber:nullable(b.documentNumber,x=>text(x,100)),note:text(b.note),status:b.status as AccountingSupplierDebt['status'],version:accountingInteger(b.version,1),createdAt:timestamp(b.createdAt),createdBy:accountingUuid(b.createdBy),cancelledAt:nullable(b.cancelledAt,timestamp),cancelledBy:nullable(b.cancelledBy,accountingUuid),cancellationReason:nullable(b.cancellationReason,text)};
 if(v.dueOn!==null&&v.dueOn<v.occurredOn)fail();
 if(v.status==='cancelled'){if(v.paidCents!==0||v.dueCents!==0||v.cancelledAt===null||v.cancelledBy===null||v.cancellationReason===null||v.cancelledAt<v.createdAt||v.version<2)fail();}
 else{if(v.cancelledAt!==null||v.cancelledBy!==null||v.cancellationReason!==null||!eqSum(v.paidCents,v.dueCents,v.amountCents)||v.status!==(v.paidCents===0?'unpaid':v.dueCents===0?'paid':'partial'))fail();}
 return Object.freeze(v);
}
export function parseAccountingSupplierPayment(value:unknown):AccountingSupplierPayment{
 const b=accountingExact(value,['id','debtId','eventId','accountId','accountName','accountType','currency','amountCents','occurredOn','createdAt','note','reversed','reversalReason']);if(!['cash','bank'].includes(b.accountType as string))fail();
 const v:AccountingSupplierPayment={id:accountingUuid(b.id),debtId:accountingUuid(b.debtId),eventId:accountingUuid(b.eventId),accountId:accountingUuid(b.accountId),accountName:text(b.accountName,200),accountType:b.accountType as 'cash'|'bank',currency:currency(b.currency),amountCents:accountingInteger(b.amountCents,1),occurredOn:date(b.occurredOn),createdAt:timestamp(b.createdAt),note:text(b.note),reversed:bool(b.reversed),reversalReason:nullable(b.reversalReason,text)};
 if(v.reversed!==(v.reversalReason!==null))fail();return Object.freeze(v);
}
export function parseAccountingSupplierList(value:unknown):AccountingSupplierList{
 const b=accountingExact(value,['debts','today','hasMore']);if(!Array.isArray(b.debts)||b.debts.length>100)fail();const debts=b.debts.map(parseAccountingSupplierDebt),hasMore=bool(b.hasMore);unique(debts);if(hasMore&&debts.length!==100)fail();return Object.freeze({debts:Object.freeze(debts),today:date(b.today),hasMore});
}
export function parseAccountingSupplierDetail(value:unknown):AccountingSupplierDetail{
 const b=accountingExact(value,['debt','payments','hasMore']);if(!Array.isArray(b.payments)||b.payments.length>100)fail();const debt=parseAccountingSupplierDebt(b.debt),payments=b.payments.map(parseAccountingSupplierPayment),hasMore=bool(b.hasMore);unique(payments);if(hasMore&&payments.length!==100)fail();
 if(payments.some(p=>p.debtId!==debt.id||p.currency!==debt.currency))fail();
 if(!hasMore){const sum=payments.reduce((n,p)=>n+(p.reversed?0n:BigInt(p.amountCents)),0n);if(sum!==BigInt(debt.paidCents)||debt.version!==1+payments.length+payments.filter(p=>p.reversed).length+(debt.status==='cancelled'?1:0))fail();}
 return Object.freeze({debt,payments:Object.freeze(payments),hasMore});
}
export function parseAccountingSupplierResult(value:unknown):AccountingSupplierResult{
 const b=accountingExact(value,['operationId','replayed','kind','debt','payment','account','previousDueCents','previousBalanceCents']);
 const v:AccountingSupplierResult={operationId:accountingUuid(b.operationId),replayed:bool(b.replayed),kind:action(b.kind),debt:parseAccountingSupplierDebt(b.debt),payment:nullable(b.payment,parseAccountingSupplierPayment),account:nullable(b.account,parseAccountingAccount),previousDueCents:nullable(b.previousDueCents,accountingInteger),previousBalanceCents:nullable(b.previousBalanceCents,accountingInteger)};
 if(v.kind==='createDebt'){if(v.debt.status!=='unpaid'||v.debt.version!==1||v.debt.id!==v.operationId||v.payment!==null||v.account!==null||v.previousDueCents!==null||v.previousBalanceCents!==null)fail();}
 else if(v.kind==='cancelDebt'){if(v.debt.status!=='cancelled'||v.payment!==null||v.account!==null||v.previousBalanceCents!==null||v.previousDueCents!==v.debt.amountCents)fail();}
 else{
  const p=v.payment,a=v.account;if(!p||!a||v.previousDueCents===null||v.previousBalanceCents===null||p.debtId!==v.debt.id||p.accountId!==a.id||p.accountName!==a.name||p.accountType!==a.type||p.currency!==a.currency||p.currency!==v.debt.currency||v.debt.status==='cancelled'||v.debt.version<2||a.version<2||v.previousDueCents>v.debt.amountCents)fail();
  if(v.kind==='pay'){if(p.reversed||p.id!==v.operationId||!eqSum(v.debt.dueCents,p.amountCents,v.previousDueCents)||!eqSum(a.balanceCents,p.amountCents,v.previousBalanceCents)||v.debt.paidCents<p.amountCents)fail();}
  else if(!p.reversed||!eqSum(v.previousDueCents,p.amountCents,v.debt.dueCents)||!eqSum(v.previousBalanceCents,p.amountCents,a.balanceCents))fail();
 }
 return Object.freeze(v);
}
export function accountingSupplierResultMatches(result:AccountingSupplierResult,kind:AccountingSupplierAction,intent:AccountingSupplierIntentMap[AccountingSupplierAction],operationId:string):boolean{
 if(result.operationId!==operationId||result.kind!==kind)return false;const d=result.debt;
 if(kind==='createDebt'){const i=intent as AccountingSupplierCreateIntent;return d.id===operationId&&(['supplierName','amountCents','currency','occurredOn','dueOn','documentNumber','note'] as const).every(k=>d[k]===i[k]);}
 const i=intent as AccountingSupplierPayIntent|AccountingSupplierReverseIntent|AccountingSupplierCancelIntent;if(d.id!==i.debtId||BigInt(d.version)!==BigInt(i.expectedVersion)+1n)return false;
 if(kind==='cancelDebt')return d.cancellationReason===(i as AccountingSupplierCancelIntent).reason;
 const p=result.payment,a=result.account;if(!p||!a||BigInt(a.version)!==BigInt((i as AccountingSupplierPayIntent|AccountingSupplierReverseIntent).expectedAccountVersion)+1n)return false;
 if(kind==='reversePayment'){const r=i as AccountingSupplierReverseIntent;return p.id===r.paymentId&&p.reversed&&p.reversalReason===r.reason;}
 const pay=i as AccountingSupplierPayIntent;return p.id===operationId&&p.accountId===pay.accountId&&p.amountCents===pay.amountCents&&p.currency===pay.currency&&p.occurredOn===pay.occurredOn&&p.note===pay.note&&!p.reversed;
}
