import {accountingExact,accountingInteger,accountingUuid,parseAccountingFilters} from './validation.ts';
import {parseAccountingReceivable} from './response.ts';
import type {AccountingFilters,AccountingReceivable} from './types.ts';

export type AccountingDueStatus='all'|'today'|'overdue'|'upcoming'|'undated';
export interface AccountingScheduleFilters extends AccountingFilters {readonly dueStatus?:AccountingDueStatus;}
export interface AccountingInstallmentIntent {readonly dueDate:string;readonly amountCents:number;}
export interface AccountingScheduleIntent {readonly receivableId:string;readonly expectedVersion:number;readonly installments:readonly AccountingInstallmentIntent[];}
export interface AccountingInstallment extends AccountingInstallmentIntent {readonly coveredCents:number;readonly dueCents:number;}
export interface AccountingDebtSchedule {readonly receivable:AccountingReceivable;readonly hasPlan:boolean;readonly plannedCents:number;readonly unplannedCents:number;readonly installments:readonly AccountingInstallment[];}
export interface AccountingSchedules {readonly schedules:readonly AccountingDebtSchedule[];readonly today:string;readonly hasMore:boolean;}
export interface AccountingScheduleResult {readonly operationId:string;readonly replayed:boolean;readonly schedule:AccountingDebtSchedule;}
function fail():never{throw new TypeError('invalid_accounting_schedule');}
function date(value:unknown):string{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000')||!Number.isFinite(Date.parse(value+'T00:00:00.000Z'))||new Date(value+'T00:00:00.000Z').toISOString().slice(0,10)!==value)fail();return value;}
function bool(value:unknown):boolean{if(typeof value!=='boolean')fail();return value;}
function sum(values:readonly number[]):number{const total=values.reduce((a,b)=>a+BigInt(b),0n);if(total>BigInt(Number.MAX_SAFE_INTEGER))fail();return Number(total);}
function ordered<T extends AccountingInstallmentIntent>(values:readonly T[]):readonly T[]{if(values.some((v,i)=>i>0&&v.dueDate<=values[i-1]!.dueDate))fail();sum(values.map(v=>v.amountCents));return Object.freeze(values);}
export function parseAccountingScheduleIntent(value:unknown):AccountingScheduleIntent{
 const b=accountingExact(value,['receivableId','expectedVersion','installments']);if(!Array.isArray(b.installments)||b.installments.length<1||b.installments.length>36)fail();
 return Object.freeze({receivableId:accountingUuid(b.receivableId),expectedVersion:accountingInteger(b.expectedVersion,1),installments:ordered(b.installments.map(v=>{const item=accountingExact(v,['dueDate','amountCents']);return Object.freeze({dueDate:date(item.dueDate),amountCents:accountingInteger(item.amountCents,1)});}))});
}
export function parseAccountingScheduleFilters(value:unknown):AccountingScheduleFilters{
 const b=accountingExact(value,[],['dateFrom','dateTo','channel','salesChannel','currency','query','customerId','orderId','dueStatus']);const {dueStatus,...base}=b;
 if(dueStatus!==undefined&&!['all','today','overdue','upcoming','undated'].includes(dueStatus as string))fail();
 return Object.freeze({...parseAccountingFilters(base),...(dueStatus===undefined?{}:{dueStatus:dueStatus as AccountingDueStatus})});
}
export function parseAccountingDebtSchedule(value:unknown):AccountingDebtSchedule{
 const b=accountingExact(value,['receivable','hasPlan','plannedCents','unplannedCents','installments']);const receivable=parseAccountingReceivable(b.receivable),hasPlan=bool(b.hasPlan),plannedCents=accountingInteger(b.plannedCents),unplannedCents=accountingInteger(b.unplannedCents);
 if(!Array.isArray(b.installments)||b.installments.length>36)fail();
 const installments=ordered(b.installments.map(v=>{const item=accountingExact(v,['dueDate','amountCents','coveredCents','dueCents']);const amountCents=accountingInteger(item.amountCents,1),coveredCents=accountingInteger(item.coveredCents),dueCents=accountingInteger(item.dueCents);if(coveredCents+dueCents!==amountCents)fail();return Object.freeze({dueDate:date(item.dueDate),amountCents,coveredCents,dueCents});}));
 if(hasPlan!==Boolean(installments.length)||sum(installments.map(v=>v.amountCents))!==plannedCents||unplannedCents!==Math.max(receivable.dueCents-plannedCents,0))fail();
 let reduction=Math.max(plannedCents-receivable.dueCents,0);for(const item of installments){const covered=Math.min(reduction,item.amountCents);if(item.coveredCents!==covered)fail();reduction-=covered;}
 if(sum(installments.map(v=>v.dueCents))+unplannedCents!==receivable.dueCents)fail();
 return Object.freeze({receivable,hasPlan,plannedCents,unplannedCents,installments});
}
export function parseAccountingSchedules(value:unknown):AccountingSchedules{const b=accountingExact(value,['schedules','today','hasMore']);if(!Array.isArray(b.schedules)||b.schedules.length>200)fail();return Object.freeze({schedules:Object.freeze(b.schedules.map(parseAccountingDebtSchedule)),today:date(b.today),hasMore:bool(b.hasMore)});}
export function parseAccountingScheduleResult(value:unknown):AccountingScheduleResult{const b=accountingExact(value,['operationId','replayed','schedule']);return Object.freeze({operationId:accountingUuid(b.operationId),replayed:bool(b.replayed),schedule:parseAccountingDebtSchedule(b.schedule)});}
