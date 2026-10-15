import type {AccountingReceivable} from "@celebix/saas-contracts";
export type ScheduleDraftRow={dueDate:string;amountText:string};
export type ScheduleEntry={dueDate:string;amountCents:number};
type DraftSource={receivable:Pick<AccountingReceivable,"id"|"currency"|"dueCents"|"dueDate"|"version">;hasPlan:boolean;plannedCents:number;unplannedCents:number;installments:readonly {dueDate:string;dueCents:number}[]};
export function scheduleDraft(schedule:DraftSource):ScheduleDraftRow[]{
  if(schedule.receivable.dueCents<=0)return[];
  if(!schedule.hasPlan)return[{dueDate:schedule.receivable.dueDate??"",amountText:String(schedule.receivable.dueCents/100)}];
  const rows=schedule.installments.filter(row=>row.dueCents>0).map(row=>({dueDate:row.dueDate,amountText:String(row.dueCents/100)}));
  if(schedule.unplannedCents>0)rows.push({dueDate:"",amountText:String(schedule.unplannedCents/100)});
  return rows;
}
function validDate(value:string):boolean{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith("0000"))return false;
  const date=new Date(`${value}T00:00:00.000Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function validateScheduleDraft(rows:readonly {dueDate:string;amountCents:number|null}[],dueCents:number):{installments:ScheduleEntry[]|null;totalCents:number|null;differenceCents:number|null;error:string|null}{
  const result=(error:string|null,totalCents:number|null=null,installments:ScheduleEntry[]|null=null)=>({installments,totalCents,differenceCents:totalCents===null?null:dueCents-totalCents,error});
  if(!Number.isSafeInteger(dueCents)||dueCents<=0)return result("Bu kayıtta planlanacak borç kalmadı.");
  if(rows.length<1||rows.length>36)return result("Plan 1 ile 36 ödeme içermeli.");
  let total=BigInt(0);
  for(const row of rows){if(row.amountCents===null||!Number.isSafeInteger(row.amountCents)||row.amountCents<=0)return result("Her ödeme için sıfırdan büyük bir tutar gir.");total+=BigInt(row.amountCents);}
  if(total>BigInt(Number.MAX_SAFE_INTEGER))return result("Plan tutarı hesap sınırını aşıyor.");
  const totalCents=Number(total);
  for(let index=0;index<rows.length;index++){if(!validDate(rows[index].dueDate))return result("Her ödeme için geçerli bir tarih gir.",totalCents);if(index>0&&rows[index].dueDate<=rows[index-1].dueDate)return result("Ödeme tarihlerini eskiden yeniye, birbirinden farklı gir.",totalCents);}
  if(totalCents!==dueCents)return result("Planın toplamı kalan borca eşit olmalı.",totalCents);
  return result(null,totalCents,rows.map(row=>({dueDate:row.dueDate,amountCents:row.amountCents!})));
}
export const DEBT_DUE_VIEWS=[{value:"all",label:"Tümü"},{value:"today",label:"Bugün"},{value:"overdue",label:"Geciken"},{value:"upcoming",label:"Yaklaşan"},{value:"undated",label:"Vadesiz"}] as const;
