import assert from "node:assert/strict";
import test from "node:test";
const m=await import("./model.ts").catch(()=>({})) as typeof import("./model.ts");
const row=(id:string,date:string,due:number,orderId:string|null=id)=>({id,customerId:"customer",customerName:"Ayşe",customerPhone:null,customerArchived:false,orderId,orderNumber:id,channel:"POS" as const,currency:"TRY",saleCents:due,collectedCents:0,returnCents:0,refundedCents:0,dueCents:due,refundDueCents:0,occurredAt:date,dueDate:null,version:1});
test("collection preview allocates oldest debts and leaves order collection within the selected order",()=>{
  assert.equal(typeof m.previewCollection,"function","FIFO collection preview must exist");
  const rows=[row("new","2026-10-02T12:00:00Z",60000),row("old","2026-09-01T12:00:00Z",100000)];
  assert.deepEqual(m.previewCollection(rows,120000),[{receivableId:"old",orderId:"old",amountCents:100000},{receivableId:"new",orderId:"new",amountCents:20000}]);
  assert.deepEqual(m.previewCollection(rows,50000,"new"),[{receivableId:"new",orderId:"new",amountCents:50000}]);
  assert.throws(()=>m.previewCollection(rows,60001,"new"));assert.throws(()=>m.previewCollection(rows,-1));
});
test("collection preview never nets refund due against remaining debt or blends currencies",()=>{
  assert.equal(typeof m.previewCollection,"function");const refund={...row("refunded","2026-08-01T12:00:00Z",0),refundDueCents:50000};
  assert.deepEqual(m.previewCollection([refund,row("open","2026-09-01T12:00:00Z",50000)],50000),[{receivableId:"open",orderId:"open",amountCents:50000}]);
  assert.throws(()=>m.previewCollection([row("try","2026-09-01T12:00:00Z",50000),{...row("usd","2026-10-01T12:00:00Z",50000),currency:"USD"}],50000));
});
test("CSV quotes fields and neutralizes spreadsheet formula prefixes",()=>{
  assert.equal(typeof m.toExpenseCsv,"function");const csv=m.toExpenseCsv([{id:"1",kind:"expense",currency:"TRY",amountCents:12500,accountId:null,customerId:null,orderId:null,channel:null,paymentMethod:null,note:'=HYPERLINK("url")',category:"Kira, ofis",documentNumber:null,metadata:{},actorMembershipId:"actor",occurredAt:"2026-10-02T00:00:00Z",createdAt:"2026-10-02T00:00:00Z",reversesEventId:null,reversed:false,allocations:[]}]);
  assert.match(csv,/Kira, ofis/);assert.match(csv,/'=HYPERLINK/);assert.match(csv,/125,00/);
});

test("manual payment stays identifiable and protected until its existing receipt is allocated",()=>{
  assert.equal(typeof m.accountingEventContext,"function");
  const event={id:"1",kind:"collection",currency:"TRY",amountCents:60000,accountId:null,customerId:null,orderId:null,channel:"POS" as const,paymentMethod:"cash" as const,note:null,category:null,documentNumber:null,metadata:{saleId:"sale",partId:"part"},actorMembershipId:"actor",occurredAt:"2026-10-07T12:00:00Z",createdAt:"2026-10-07T12:00:00Z",reversesEventId:null,reversed:false,allocations:[]};
  assert.deepEqual(m.accountingEventContext(event),{pendingManualSale:true,orderId:null,canReverse:false,label:"Bekleyen manuel satış"});
  assert.deepEqual(m.accountingEventContext({...event,allocations:[{receivableId:"receivable",orderId:"order",amountCents:60000}]}),{pendingManualSale:false,orderId:"order",canReverse:true,label:null});
  assert.equal(m.accountingEventContext({...event,kind:"refund"}).canReverse,false);
  assert.deepEqual(m.accountingEventContext({...event,metadata:{...event.metadata,saleStatus:"cancelled"}}),{pendingManualSale:false,orderId:null,canReverse:false,label:"İptal edilen manuel satış"});
  assert.equal(m.accountingEventContext({...event,metadata:{}}).pendingManualSale,false);
});

test("social source filter preserves POS accounting authority and other filters",()=>{
  assert.equal(typeof m.accountingFilterQuery,"function");
  const draft={query:" Ayşe ",dateFrom:"2026-10-01",dateTo:"",channel:"social",currency:"TRY"};
  assert.deepEqual(m.accountingFilterQuery(draft),{query:"Ayşe",dateFrom:"2026-10-01",channel:"POS",salesChannel:"social",currency:"TRY"});
  assert.deepEqual(m.accountingFilterQuery({...draft,channel:"manual"}),{query:"Ayşe",dateFrom:"2026-10-01",channel:"POS",salesChannel:"manual",currency:"TRY"});
  assert.deepEqual(m.accountingFilterQuery({channel:"WEB",query:""}),{channel:"WEB"});
});
