import type { AccountingAllocation, AccountingEvent, AccountingFilters, AccountingReceivable } from "@celebix/saas-contracts";
export function previewCollection(rows:readonly AccountingReceivable[],amountCents:number,orderId:string|null=null):readonly AccountingAllocation[]{
  if(!Number.isSafeInteger(amountCents)||amountCents<1)throw new Error("Sıfırdan büyük bir tahsilat tutarı gir.");
  const debts=rows.filter(row=>row.dueCents>0&&(!orderId||row.orderId===orderId));
  if(new Set(debts.map(row=>row.currency)).size>1)throw new Error("Her para birimi için ayrı tahsilat kaydet.");
  if(amountCents>debts.reduce((sum,row)=>sum+row.dueCents,0))throw new Error("Tahsilat açık borcu aşamaz.");
  let remaining=amountCents;const allocations:AccountingAllocation[]=[];
  for(const row of [...debts].sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.id.localeCompare(b.id))){const applied=Math.min(remaining,row.dueCents);if(applied>0)allocations.push({receivableId:row.id,orderId:row.orderId,amountCents:applied});remaining-=applied;if(!remaining)break;}
  return Object.freeze(allocations);
}
export const accountingMoney=(cents:number,currency="TRY")=>new Intl.NumberFormat("tr-TR",{style:"currency",currency}).format(cents/100);
export const accountingDate=(value:string)=>new Intl.DateTimeFormat("tr-TR",{dateStyle:"short",timeStyle:value.length>10?"short":undefined}).format(new Date(value));
export const ACCOUNT_TYPE_LABELS={cash:"Kasa",bank:"Banka",card:"Kart hesabı"};
export const EVENT_LABELS:Readonly<Record<string,string>>={sale:"Satış",collection:"Tahsilat",opening_debt:"Açılış borcu",opening_balance:"Açılış bakiyesi",expense:"Ödenmiş gider",transfer:"Transfer",transfer_out:"Transfer çıkışı",transfer_in:"Transfer girişi",card_settlement:"Kart aktarımı",commission:"Komisyon",reversal:"Ters kayıt",return_credit:"İade alacağı",refund:"Para iadesi"};
export function accountingEventContext(event: AccountingEvent) {
  const allocatedOrders = Array.from(new Set(event.allocations.map(row => row.orderId).filter((id): id is string => Boolean(id))));
  const orderId = event.orderId ?? (allocatedOrders.length === 1 ? allocatedOrders[0]! : null);
  const partLinked = typeof event.metadata.saleId === "string" && typeof event.metadata.partId === "string";
  const unallocatedManualPart = partLinked && event.channel === "POS" && orderId === null && event.allocations.length === 0;
  const cancelledManualSale = unallocatedManualPart && event.metadata.saleStatus === "cancelled";
  const pendingManualSale = unallocatedManualPart && !cancelledManualSale;
  return { pendingManualSale, orderId, canReverse: !event.reversed && !unallocatedManualPart, label: cancelledManualSale ? "İptal edilen manuel satış" : pendingManualSale ? "Bekleyen manuel satış" : null };
}
export function accountingFilterQuery(draft: Readonly<Record<string, string>>): AccountingFilters {
  const values = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value));
  if (values.channel === "manual" || values.channel === "social") {
    values.salesChannel = values.channel;
    values.channel = "POS";
  }
  return values as AccountingFilters;
}
export function toExpenseCsv(events:readonly AccountingEvent[]):string{const cell=(value:string)=>`"${(/^[=+@\-\t\r]/.test(value)?"'":"")+value.replaceAll('"','""')}"`;return '\uFEFF'+[["Tarih","Kategori","Belge numarası","Açıklama","Tutar","Para birimi","Durum"],...events.map(event=>[accountingDate(event.occurredAt),event.category??"",event.documentNumber??"",event.note??"",(event.amountCents/100).toFixed(2).replace(".",","),event.currency,event.reversed?"Ters kaydedildi":"Ödendi"])].map(row=>row.map(cell).join(";")).join("\r\n");}
