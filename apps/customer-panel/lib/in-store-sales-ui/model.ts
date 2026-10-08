import { calculateInStoreTotals, type InStoreBootstrap, type InStoreDiscount, type InStoreProduct, type InStoreSale, type InStoreSaleIntent, type InStoreSaleResult, type OrderAddress } from "@celebix/saas-contracts";
import { InStoreSalesUiError, type InStoreSalesUiClient, type UiPaymentPart, validatePaymentParts } from "./client.ts";

export function parseMinorUnits(input:string):number|null {
  const text=input.trim().replace(",",".");if(!/^\d+(?:\.\d{1,2})?$/.test(text))return null;
  const [whole,decimal=""]=text.split(".");const value=BigInt(whole)*100n+BigInt(decimal.padEnd(2,"0"));
  return value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
}
export const previewTotals=calculateInStoreTotals;
export function createSerialQueue(){let tail:Promise<unknown>=Promise.resolve();return Object.freeze({run<T>(task:()=>Promise<T>):Promise<T>{const next=tail.then(task);tail=next.catch(()=>undefined);return next;}});}
export type RecoveryKind="create"|"update"|"hold"|"prepare"|"payment"|"complete"|"cancel"|"discard"|"takeover"|"revise"|"abort"|"return"|"reconcile";
export type RecoveryMarker=Readonly<{scopeKey:string;kind:RecoveryKind;saleId:string;operationId:string;expectedVersion:number;expectedTotalCents:number;held?:boolean;contractVersion?:2|3|4;partId?:string;prepareOperationId?:string;originalOperationId?:string;partAmountCents?:number;partPaymentMethod?:UiPaymentPart["paymentMethod"];paymentParts?:readonly UiPaymentPart[];customerId?:string|null;dueDate?:string|null;reason?:string;paymentMethod?:"card"|"cash"|"bank_transfer"|null}>;
export type RecoveryStorage=Pick<Storage,"getItem"|"setItem"|"removeItem">;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const markerKey=(scope:string)=>`celebix-in-store-operation:${scope}`;
export function readRecoveryMarker(storage:RecoveryStorage|undefined,scopeKey:string):RecoveryMarker|null {
  try{const value=JSON.parse(storage?.getItem(markerKey(scopeKey))??"null") as RecoveryMarker|null;if(!value)return null;
    const required=["scopeKey","kind","saleId","operationId","expectedVersion","expectedTotalCents"],allowed=new Set([...required,"held","contractVersion","paymentMethod","partId","prepareOperationId","paymentParts","customerId","dueDate","reason","originalOperationId","partAmountCents","partPaymentMethod"]);
    if(Object.keys(value).some(key=>!allowed.has(key))||required.some(key=>!Object.hasOwn(value,key))||value.scopeKey!==scopeKey||!["create","update","hold","prepare","payment","complete","cancel","discard","takeover","revise","abort","return","reconcile"].includes(value.kind)||!UUID.test(value.saleId)||!UUID.test(value.operationId)||!Number.isSafeInteger(value.expectedVersion)||value.expectedVersion<0||!Number.isSafeInteger(value.expectedTotalCents)||value.expectedTotalCents<0)return null;
    if(value.contractVersion!==undefined&&![2,3,4].includes(value.contractVersion))return null;
    if(Object.hasOwn(value,"held")&&(value.kind!=="hold"||typeof value.held!=="boolean"))return null;
    if(value.kind==="payment"){if(value.contractVersion===4){if(!UUID.test(value.partId??"")||!UUID.test(value.prepareOperationId??"")||Object.hasOwn(value,"paymentMethod"))return null;}else if(value.contractVersion!==undefined&&(!Object.hasOwn(value,"paymentMethod")||value.paymentMethod!==null&&value.paymentMethod!=="cash"&&value.paymentMethod!=="card"&&!(value.contractVersion===3&&value.paymentMethod==="bank_transfer")))return null;}
    else if(Object.hasOwn(value,"paymentMethod")||Object.hasOwn(value,"prepareOperationId")&&value.kind!=="reconcile")return null;
    if(value.kind==="revise"){if(value.contractVersion!==4)return null;validatePaymentParts(value.paymentParts);if(value.customerId!==null&&!UUID.test(value.customerId??""))return null;if(value.dueDate!==null&&(typeof value.dueDate!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value.dueDate)))return null;}else if(["paymentParts","customerId","dueDate"].some(key=>Object.hasOwn(value,key)))return null;
    if(value.kind==="return"){if(value.contractVersion!==4||!UUID.test(value.partId??"")||typeof value.reason!=="string"||!value.reason.trim()||value.reason.length>500||/[\u0000-\u001f\u007f]/.test(value.reason))return null;}else if(Object.hasOwn(value,"reason"))return null;
    if(Object.hasOwn(value,"partId")&&value.kind!=="return"&&value.kind!=="reconcile"&&!(value.kind==="payment"&&value.contractVersion===4))return null;
    if(value.kind==="reconcile"){if(value.contractVersion!==4||!UUID.test(value.originalOperationId??"")||!UUID.test(value.prepareOperationId??"")||!UUID.test(value.partId??""))return null;}else if(Object.hasOwn(value,"originalOperationId"))return null;
    if(Object.hasOwn(value,"partAmountCents")&&(!["payment","reconcile"].includes(value.kind)||value.contractVersion!==4||!Number.isSafeInteger(value.partAmountCents)||value.partAmountCents!<1))return null;
    if(Object.hasOwn(value,"partPaymentMethod")&&(!["payment","reconcile"].includes(value.kind)||value.contractVersion!==4||!["cash","card","bank_transfer"].includes(value.partPaymentMethod!)))return null;
    if(value.kind==="abort"&&value.contractVersion!==4)return null;return Object.freeze(value);
  }catch{return null;}
}
export function writeRecoveryMarker(storage:RecoveryStorage|undefined,marker:RecoveryMarker):void { storage?.setItem(markerKey(marker.scopeKey),JSON.stringify(marker)); }
function clearMarker(storage:RecoveryStorage|undefined,scope:string){try{storage?.removeItem(markerKey(scope));}catch{}}
export type RegisterCartLine=Readonly<InStoreProduct&{quantity:number;catalogUnitPriceCents?:number;unitPriceOverrideCents?:number|null}>;
export type RegisterBusy="scan"|"save"|"prepare"|"payment"|"complete"|"hold"|"cancel"|"discard"|"recover"|"takeover"|"revise"|"abort"|"return"|"reconcile"|null;
export type RegisterSnapshot=Readonly<{
  phase:"loading"|"ready"|"error";bootstrap:InStoreBootstrap|null;sale:InStoreSale|null;cart:readonly RegisterCartLine[];
  salesChannel:"manual"|"social";socialPlatform:"instagram"|"facebook"|"x"|"pinterest"|"tiktok"|"whatsapp"|"other"|null;socialReference:string|null;fulfillmentMethod:"pickup"|"shipping";shippingAddress:OrderAddress|null;billingAddress:OrderAddress|null;shippingCents:number;paymentParts:readonly (UiPaymentPart&{receiptId?:string|null;receivedAt?:string|null;actorMembershipId?:string|null;refundEventId?:string|null;returnedAt?:string|null})[];autoSinglePayment:boolean;
  locationId:string;paymentMethod:"card"|"cash"|"bank_transfer"|null;customer:import("./client.ts").PosCustomer|null;customerId:string|null;initialCollectionCents:number|null;dueDate:string|null;discount:InStoreDiscount|null;customerName:string;note:string;dirty:boolean;busy:RegisterBusy;
  error:string|null;notice:string|null;priceChanged:boolean;recovery:RecoveryMarker|null;conflict:InStoreSale|null;canReenterDraft:boolean;canAcceptRecovery:boolean;paymentResumed:boolean;
}>;
const initial=():RegisterSnapshot=>({phase:"loading",bootstrap:null,sale:null,cart:[],salesChannel:"manual",socialPlatform:null,socialReference:null,fulfillmentMethod:"pickup",shippingAddress:null,billingAddress:null,shippingCents:0,paymentParts:[],autoSinglePayment:true,locationId:"",paymentMethod:null,customer:null,customerId:null,initialCollectionCents:null,dueDate:null,discount:null,customerName:"",note:"",dirty:false,busy:null,error:null,notice:null,priceChanged:false,recovery:null,conflict:null,canReenterDraft:false,canAcceptRecovery:false,paymentResumed:false});
export class InStoreRegisterController {
  private snapshot=initial();private listeners=new Set<()=>void>();private queue=createSerialQueue();private revision=0;
  private timer:ReturnType<typeof setTimeout>|undefined;private pendingRequest:(()=>Promise<InStoreSaleResult>)|null=null;
  private pendingRevision=0;private newSaleId:string|null=null;private storage:RecoveryStorage|undefined;private initialization:Promise<void>|null=null;
  constructor(private api:InStoreSalesUiClient,private storageProvider:()=>RecoveryStorage|undefined=()=>undefined){}
  getSnapshot=()=>this.snapshot;
  getContractVersion():1|2|3|4{if(this.api.contractVersion!==4)return this.api.contractVersion;if(this.snapshot.sale&&this.snapshot.sale.contractVersion!==4)return this.snapshot.sale.contractVersion??3;return this.snapshot.bootstrap?.permissions.manualSalesV4Available===true||this.snapshot.sale?.contractVersion===4?4:3;}
  private total(){return previewTotals(this.snapshot.cart.map(x=>({unitPriceCents:x.unitPriceCents??0,quantity:x.quantity,discountEligible:x.discountEligible})),this.snapshot.discount).totalCents+this.snapshot.shippingCents;}

  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private set(patch:Partial<RegisterSnapshot>){this.snapshot=Object.freeze({...this.snapshot,...patch});this.listeners.forEach(listener=>listener());}
  isEditable(){const s=this.snapshot;return s.phase==="ready"&&Boolean(s.bootstrap?.permissions.canSell)&&!s.conflict&&(!s.recovery||s.busy==="save")&&(!s.sale||s.sale.status==="draft")&&!["prepare","payment","complete","hold","cancel","discard","takeover","recover","revise","abort","return","reconcile"].includes(s.busy??"");}
  private hydrate(sale:InStoreSale|null,resumed=false,retainPhotos=false){
    this.newSaleId=null;this.revision++;
    // Mutation/replay snapshots stay immutable; retain only the known display photo.
    const photos=new Map(retainPhotos?this.snapshot.cart.map(row=>[`${row.productId}:${row.variantId}`,row.imageUrl]):[]);
    this.set({sale,salesChannel:sale?.salesChannel??"manual",socialPlatform:sale?.socialPlatform??null,socialReference:sale?.socialReference??null,fulfillmentMethod:sale?.fulfillmentMethod??"pickup",shippingAddress:sale?.shippingAddress??null,billingAddress:sale?.billingAddress??null,shippingCents:sale?.shippingCents??0,paymentParts:sale?.paymentParts??[],autoSinglePayment:!sale?.paymentParts||sale.paymentParts.length===1&&sale.paymentParts[0].amountCents===sale.totals.totalCents,cart:sale?.items.map(line=>({...line,imageUrl:line.imageUrl??photos.get(`${line.productId}:${line.variantId}`)??null,pricingUnavailable:false,availableQuantity:9999,stockTracking:false}))??[],locationId:sale?.locationId??this.snapshot.locationId,paymentMethod:sale?.paymentMethod??null,customer:sale?.customer??null,customerId:sale?.customerId??null,initialCollectionCents:sale?.status==="draft"&&sale.initialCollectionCents===sale.totals.totalCents?null:sale?.initialCollectionCents??null,dueDate:sale?.dueDate??null,discount:sale?.discount??null,customerName:sale?.customerName??"",note:sale?.note??"",dirty:false,priceChanged:false,conflict:null,canReenterDraft:false,canAcceptRecovery:false,paymentResumed:resumed&&sale?.status==="payment_pending"});
  }
  initialize(){
    if(this.initialization)return this.initialization;
    this.initialization=this.initializeInternal().finally(()=>{this.initialization=null;});return this.initialization;
  }
  private async initializeInternal(){
    this.set({phase:"loading",error:null});
    try{const bootstrap=await this.api.bootstrap();try{this.storage=this.storageProvider();}catch{this.storage=undefined;}
      this.set({bootstrap,phase:"ready",locationId:bootstrap.locations.find(x=>x.isDefault)?.id??bootstrap.locations[0]?.id??""});this.hydrate(bootstrap.activeDraft,true);
      const marker=readRecoveryMarker(this.storage,bootstrap.scopeKey);if(marker){this.set({recovery:marker});await this.recover(false);}
    }catch(error){this.set({phase:"error",error:message(error),busy:null});}
  }
  private changed(patch:Partial<RegisterSnapshot>){if(!this.isEditable())return;this.revision++;this.set({...patch,dirty:true,error:null,notice:null,priceChanged:false});if(this.getContractVersion()===4&&this.snapshot.autoSinglePayment&&this.snapshot.paymentParts.length===1){try{this.set({paymentParts:[{...this.snapshot.paymentParts[0],amountCents:this.total()}]});}catch{}}clearTimeout(this.timer);this.timer=setTimeout(()=>{void this.flush().catch(()=>undefined);},350);}
  setSalesChannel(salesChannel:RegisterSnapshot["salesChannel"],socialPlatform:RegisterSnapshot["socialPlatform"]=null,socialReference:string|null=null){if(this.getContractVersion()!==4||salesChannel==="social"&&!socialPlatform)return;this.changed({salesChannel,socialPlatform:salesChannel==="social"?socialPlatform:null,socialReference:salesChannel==="social"?socialReference?.trim()||null:null});}
  setDelivery(input:Pick<RegisterSnapshot,"fulfillmentMethod"|"shippingAddress"|"billingAddress"|"shippingCents">){if(this.getContractVersion()!==4||!Number.isSafeInteger(input.shippingCents)||input.shippingCents<0)return;this.changed(input.fulfillmentMethod==="pickup"?{fulfillmentMethod:"pickup",shippingAddress:null,billingAddress:null,shippingCents:0}:input);}
  setPaymentParts(paymentParts:readonly UiPaymentPart[],dueDate:string|null=this.snapshot.dueDate){if(this.getContractVersion()!==4)return;try{validatePaymentParts(paymentParts);}catch{return;}this.changed({paymentParts:paymentParts.map(x=>({...x})),autoSinglePayment:false,initialCollectionCents:paymentParts.reduce((sum,x)=>sum+x.amountCents,0),dueDate,paymentMethod:paymentParts.length===1?paymentParts[0].paymentMethod:null});}
  setLocation(locationId:string){if(!this.snapshot.bootstrap?.locations.some(x=>x.id===locationId))return;this.changed({locationId});}
  setCustomer(customerName:string,note:string){this.changed({customerName:customerName.trim(),note:note.trim()});}
  selectCustomer(customer:import("./client.ts").PosCustomer|null){if(customer?.archived)return;this.changed({customer,customerId:customer?.id??null,customerName:customer?.name??"",...(customer===null?{initialCollectionCents:null,dueDate:null}:{})});}
  setCreditTerms(initialCollectionCents:number|null,dueDate:string|null){if(initialCollectionCents!==null&&(!Number.isSafeInteger(initialCollectionCents)||initialCollectionCents<0))return;if(dueDate!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))return;this.changed({initialCollectionCents,dueDate});}
  setDiscount(discount:InStoreDiscount|null){if(discount&&!this.snapshot.bootstrap?.permissions.canDiscount)return;this.changed({discount});}
  setQuantity(variantId:string,quantity:number){if(!Number.isInteger(quantity)||quantity<0||quantity>9999)return;this.changed({cart:this.snapshot.cart.flatMap(row=>row.variantId!==variantId?[row]:quantity?[{...row,quantity}]:[])});}
  setUnitPrice(variantId:string,unitPriceOverrideCents:number|null){
    if(!this.isEditable()||!this.snapshot.bootstrap?.permissions.canEditPrice||unitPriceOverrideCents!==null&&(!Number.isSafeInteger(unitPriceOverrideCents)||unitPriceOverrideCents<1))return;
    this.changed({cart:this.snapshot.cart.map(row=>{if(row.variantId!==variantId)return row;const catalogUnitPriceCents=row.catalogUnitPriceCents??row.unitPriceCents!;
      if(unitPriceOverrideCents!==null&&!row.discountEligible&&unitPriceOverrideCents<catalogUnitPriceCents)return row;
      const override=unitPriceOverrideCents===catalogUnitPriceCents?null:unitPriceOverrideCents;
      return {...row,catalogUnitPriceCents,unitPriceOverrideCents:override,unitPriceCents:override??catalogUnitPriceCents};})});
  }
  setPaymentMethod(paymentMethod:"card"|"cash"|"bank_transfer"|null){
    if(paymentMethod!==null&&paymentMethod!=="card"&&paymentMethod!=="cash"&&!(this.api.contractVersion>=3&&paymentMethod==="bank_transfer"))return;
    if(this.isEditable()){if(this.getContractVersion()===4){this.changed({paymentMethod,paymentParts:paymentMethod?[{partId:this.snapshot.paymentParts.length===1?this.snapshot.paymentParts[0].partId:this.api.newId(),paymentMethod,amountCents:this.total()}]:[],autoSinglePayment:true,initialCollectionCents:null});}else this.changed({paymentMethod});return;}
    const s=this.snapshot;if(s.sale?.status==="payment_pending"&&s.sale.paymentMethod==null&&!s.recovery&&!s.conflict&&!s.busy)this.set({paymentMethod,error:null});
  }
  clearFeedback(){this.set({error:null,notice:null});}
  private add(product:InStoreProduct){if(!this.isEditable())return;const row=this.snapshot.cart.find(x=>x.variantId===product.variantId);if(product.pricingUnavailable||product.unitPriceCents===null)throw new Error("Ürünün güvenilir fiyatı alınamadı. Başka bir ürün seç veya yeniden dene.");if(product.stockTracking&&(row?.quantity??0)>=product.availableQuantity)throw new Error("Bu varyantta eklenebilecek satılabilir stok yok.");if(!row&&this.snapshot.cart.length>=100)throw new Error("Sepete en fazla 100 farklı varyant eklenebilir.");this.changed({cart:row?this.snapshot.cart.map(x=>x.variantId===product.variantId?{...product,quantity:x.quantity+1,...(this.api.contractVersion>=2?{catalogUnitPriceCents:product.unitPriceCents!,unitPriceOverrideCents:x.unitPriceOverrideCents??null,unitPriceCents:x.unitPriceOverrideCents??product.unitPriceCents}:{})}:x):[...this.snapshot.cart,{...product,quantity:1,...(this.api.contractVersion>=2?{catalogUnitPriceCents:product.unitPriceCents!,unitPriceOverrideCents:null}:{})}],notice:`${product.productName} eklendi.`});}
  async addProduct(product:InStoreProduct){return this.queue.run(async()=>{try{this.add(product);await this.flushInternal();}catch(error){this.fail(error);}});}
  async scan(barcode:string){return this.queue.run(async()=>{if(!this.isEditable())return;this.set({busy:"scan",error:null});try{const products=await this.api.searchProducts({locationId:this.snapshot.locationId,barcode:barcode.trim()});if(products.length!==1)throw new Error(products.length?"Bu barkod birden fazla varyanta ait. Doğru ürünü arayıp seç.":"Barkod bulunamadı. Ürün adı veya SKU ile ara.");this.set({busy:null});this.add(products[0]);await this.flushInternal();}catch(error){this.fail(error);}finally{if(this.snapshot.busy==="scan")this.set({busy:null});}});}
  async lookup(term:string){return this.queue.run(async()=>{
    const none={matched:false,products:[] as readonly InStoreProduct[]};if(!this.isEditable()||!term.trim())return none;
    this.set({busy:"scan",error:null});
    try{
      const exact=await this.api.searchProducts({locationId:this.snapshot.locationId,barcode:term.trim()});
      if(exact.length>1)throw new Error("Bu barkod birden fazla varyanta ait. Doğru varyantı arayıp seç.");
      if(exact.length===1){this.set({busy:null});this.add(exact[0]);await this.flushInternal();return{matched:true,products:[] as readonly InStoreProduct[]};}
      const products=await this.api.searchProducts({locationId:this.snapshot.locationId,query:term.trim()});this.set({busy:null});return{matched:false,products};
    }catch(error){this.fail(error);return none;}finally{if(this.snapshot.busy==="scan")this.set({busy:null});}
  });}
  private intent():InStoreSaleIntent{const version=this.getContractVersion();return {locationId:this.snapshot.locationId,items:this.snapshot.cart.map(({variantId,quantity,unitPriceOverrideCents})=>({variantId,quantity,...(version>=2?{unitPriceOverrideCents:unitPriceOverrideCents??null}:{})})),discount:this.snapshot.discount,customerName:this.snapshot.customerName||null,note:this.snapshot.note||null,...(version===4?{customerId:this.snapshot.customerId,dueDate:this.snapshot.dueDate,salesChannel:this.snapshot.salesChannel,socialPlatform:this.snapshot.socialPlatform,socialReference:this.snapshot.socialReference,fulfillmentMethod:this.snapshot.fulfillmentMethod,shippingAddress:this.snapshot.shippingAddress,billingAddress:this.snapshot.billingAddress,shippingCents:this.snapshot.shippingCents,paymentParts:this.snapshot.paymentParts.map(({partId,paymentMethod,amountCents})=>({partId,paymentMethod,amountCents}))}:version>=2?{paymentMethod:version===3&&this.snapshot.initialCollectionCents===0?null:this.snapshot.paymentMethod,...(version===3?{customerId:this.snapshot.customerId,initialCollectionCents:this.snapshot.initialCollectionCents,dueDate:this.snapshot.dueDate}:{})}:{})};}
  async flush(){clearTimeout(this.timer);return this.queue.run(()=>this.flushInternal());}
  private async flushInternal(){
    clearTimeout(this.timer);
    while(this.snapshot.dirty&&this.isEditable()){
      if(!this.snapshot.cart.length&&!this.snapshot.sale){this.set({dirty:false});return;}
      if(!this.snapshot.cart.length){await this.discardInternal();return;}
      const revision=this.revision,intent=this.intent(),sale=this.snapshot.sale;
      const saleId=sale?.id??this.newSaleId??(this.newSaleId=this.api.newId());
      this.set({busy:"save"});
      try{const result=await this.mutate(sale?"update":"create",saleId,sale?.version??0,0,()=>sale?this.api.updateSale(saleId,{expectedVersion:sale.version,intent},this.snapshot.recovery!.operationId,this.getContractVersion()):this.api.createSale({saleId,intent},this.snapshot.recovery!.operationId,this.getContractVersion()),revision);
        this.set({sale:result.sale,busy:null});if(this.revision===revision){this.hydrate(result.sale,false,true);}else this.set({dirty:true});
      }catch(error){this.fail(error);throw error;}
    }
  }
  private fail(error:unknown){this.set({busy:null,error:message(error)});}
  private async mutate(kind:RecoveryKind,saleId:string,expectedVersion:number,expectedTotalCents:number,request:()=>Promise<InStoreSaleResult>,revision=this.revision,held?:boolean,metadata:Partial<RecoveryMarker>={}):Promise<InStoreSaleResult>{
    const scopeKey=this.snapshot.bootstrap!.scopeKey;
    const marker:RecoveryMarker={scopeKey,kind,saleId,operationId:this.api.newId(),expectedVersion,expectedTotalCents,...(held===undefined?{}:{held}),...(this.getContractVersion()>=2?{contractVersion:this.getContractVersion() as 2|3|4,...(kind==="payment"&&this.getContractVersion()!==4?{paymentMethod:this.snapshot.sale?.paymentMethod==null?this.snapshot.paymentMethod:null}:{})}:{}),...metadata};
    this.set({recovery:marker,canReenterDraft:false,canAcceptRecovery:false});this.pendingRequest=request;this.pendingRevision=revision;
    try{writeRecoveryMarker(this.storage,marker);}catch{this.set({notice:"Tarayıcı işlem kurtarma anahtarını saklayamadı. Sonucu doğrulamadan bu sekmeyi kapatma."});}
    try{const result=await request();clearMarker(this.storage,scopeKey);this.set({recovery:null});this.pendingRequest=null;return result;}
    catch(error){const retainedPhysicalPart=marker.contractVersion===4&&["payment","return","reconcile"].includes(kind);if(!retainedPhysicalPart&&(!(error instanceof InStoreSalesUiError)||!error.unknownResult)){clearMarker(this.storage,scopeKey);this.set({recovery:null});this.pendingRequest=null;}
      if(error instanceof InStoreSalesUiError&&(error.code==="version_conflict"||kind==="create"&&error.code==="invalid_input")){
        try{const current=await this.api.getSale(saleId);this.set({conflict:current,notice:"Sepet başka bir işlemde değişti. Yerel değişikliklerin uygulanmadı. Güncel sepeti yükleyip tutarı kontrol et."});}catch{}
      }
      throw error;}
  }
  async prepare(){return this.queue.run(async()=>{
    if(!this.isEditable())return;try{
      if(this.getContractVersion()===2&&!this.snapshot.paymentMethod)throw new Error("Ödemeye geçmek için Kart veya Nakit seç.");
      const base=previewTotals(this.snapshot.cart.map(x=>({unitPriceCents:x.unitPriceCents??0,quantity:x.quantity,discountEligible:x.discountEligible})),this.snapshot.discount),totals={...base,totalCents:base.totalCents+this.snapshot.shippingCents};
      // Persisted parts include receipt facts; validate only their payment-plan inputs.
      if(this.getContractVersion()===4){this.validateV4Terms(this.snapshot.paymentParts.map(({partId,paymentMethod,amountCents})=>({partId,paymentMethod,amountCents})),this.snapshot.customer);if(this.snapshot.fulfillmentMethod==="shipping"&&(!this.snapshot.customerId||!this.snapshot.customer?.name.trim()||!this.snapshot.customer.phone?.trim()||!this.snapshot.shippingAddress?.recipientName.trim()||!this.snapshot.shippingAddress.line1.trim()||!this.snapshot.shippingAddress.city.trim()))throw new Error("Kargo için adı ve telefonu kayıtlı müşteri ve teslimat adresi gerekli.");}
      if(this.getContractVersion()===3){const collection=this.snapshot.initialCollectionCents??totals.totalCents;
        if(collection>totals.totalCents)throw new Error("Tahsilat satış toplamını aşamaz.");
        if(collection<totals.totalCents){if(!this.snapshot.bootstrap?.permissions.canSellOnCredit)throw new Error("Veresiye satış için yetkin bulunmuyor.");if(!this.snapshot.customerId||!this.snapshot.customer?.name.trim()||!this.snapshot.customer.phone?.trim())throw new Error("Veresiye için müşteri adı ve telefon kaydı gerekli. Bir müşteri seç.");}
        if(collection>0&&!this.snapshot.paymentMethod)throw new Error("Tahsilat için ödeme yöntemi seç.");
      }
      await this.flushInternal();const sale=this.snapshot.sale;if(!sale||!sale.items.length)return;
      if(totals.totalCents<1)throw new Error("Ödenecek tutar sıfır olamaz.");this.set({busy:"prepare",error:null});
      const result=await this.mutate("prepare",sale.id,sale.version,totals.totalCents,()=>this.api.prepareSale(sale.id,{expectedVersion:sale.version,expectedTotalCents:totals.totalCents},this.snapshot.recovery!.operationId,this.getContractVersion()));
      this.hydrate(result.sale,false,true);this.set({busy:null,priceChanged:result.priceChanged,notice:result.priceChanged?"Fiyatlar güncellendi. Yeni toplamı kontrol edip yeniden ödemeye geç.":null});
    }catch(error){this.fail(error);}
  });}
  private validateV4Terms(parts:readonly UiPaymentPart[],customer:import("./client.ts").PosCustomer|null){validatePaymentParts(parts);const collection=parts.reduce((sum,x)=>sum+x.amountCents,0);if(!Number.isSafeInteger(collection)||collection>this.total())throw new Error("Tahsilat satış toplamını aşamaz.");if(collection<this.total()){if(!this.snapshot.bootstrap?.permissions.canSellOnCredit||this.snapshot.bootstrap.permissions.creditSalesAvailable===false)throw new Error("Veresiye satış için yetkin bulunmuyor.");if(!customer?.id||!customer.name.trim()||!customer.phone?.trim())throw new Error("Veresiye için müşteri adı ve telefon kaydı gerekli. Bir müşteri seç.");}}
  async confirmPart(partId:string){return this.queue.run(async()=>{const s=this.snapshot,sale=s.sale;if(this.getContractVersion()!==4||!sale||sale.status!=="payment_pending"||sale.abortRequested||s.recovery||s.conflict||s.busy)return;const part=sale.paymentParts?.find(x=>x.partId===partId);if(!part||part.receivedAt||part.returnedAt||!sale.prepareOperationId)return;try{this.set({busy:"payment",error:null});const result=await this.mutate("payment",sale.id,sale.version,sale.totals.totalCents,()=>this.api.confirmPayment(sale.id,{expectedVersion:sale.version,prepareOperationId:sale.prepareOperationId!,partId,slipReference:null},this.snapshot.recovery!.operationId,4),this.revision,undefined,{partId,prepareOperationId:sale.prepareOperationId,partAmountCents:part.amountCents,partPaymentMethod:part.paymentMethod});this.hydrate(result.sale,false,true);this.set({busy:null});await this.refreshLists();}catch(error){this.fail(error);}});}
  async parkPending(){return this.queue.run(async()=>{const s=this.snapshot;if(this.getContractVersion()!==4||s.recovery||s.conflict||s.dirty||s.busy||!s.sale||!["payment_pending","payment_received"].includes(s.sale.status))return;try{this.set({busy:"recover",error:null});const sale=await this.api.getSale(s.sale.id),bootstrap=await this.api.bootstrap();if(bootstrap.scopeKey!==s.bootstrap?.scopeKey)throw new Error("Oturum değişti. Sayfayı yeniden aç.");if(!["payment_pending","payment_received"].includes(sale.status)){this.hydrate(sale,true);this.set({bootstrap,busy:null});return;}this.hydrate(null);this.set({bootstrap,busy:null,notice:"Tahsilatlar bekleyen satışta saklandı. Yeni satışa başlayabilirsin."});}catch(error){this.fail(error);}});}
  async revisePendingPayments(parts:readonly UiPaymentPart[],customer:import("./client.ts").PosCustomer|null,dueDate:string|null){return this.queue.run(async()=>{const s=this.snapshot,sale=s.sale;if(this.getContractVersion()!==4||!sale||!["payment_pending","payment_received"].includes(sale.status)||sale.abortRequested||s.recovery||s.conflict||s.busy)return;try{this.validateV4Terms(parts,customer);for(const received of sale.paymentParts??[]){if(received.receivedAt&&!received.returnedAt&&!parts.some(x=>x.partId===received.partId&&x.paymentMethod===received.paymentMethod&&x.amountCents===received.amountCents))throw new Error("Tahsil edilmiş parça değiştirilemez.");}const input={expectedVersion:sale.version,paymentParts:parts.map(x=>{const original=sale.paymentParts?.find(old=>old.partId===x.partId);return{...x,partId:original&&!original.receivedAt&&(original.amountCents!==x.amountCents||original.paymentMethod!==x.paymentMethod)?this.api.newId():x.partId};}),customerId:customer?.id??null,dueDate};this.set({busy:"revise",error:null});const result=await this.mutate("revise",sale.id,sale.version,sale.totals.totalCents,()=>this.api.revisePendingPayments(sale.id,input,this.snapshot.recovery!.operationId),this.revision,undefined,{paymentParts:input.paymentParts,customerId:input.customerId,dueDate});this.hydrate(result.sale,false,true);this.set({busy:null});await this.refreshLists();}catch(error){this.fail(error);}});}
  canReconcileObsoletePayment(){const s=this.snapshot,m=s.recovery,current=s.conflict??s.sale;return Boolean(m?.kind==="payment"&&m.contractVersion===4&&s.bootstrap?.permissions.canResolve&&current&&(current.prepareOperationId!==m.prepareOperationId||!current.paymentParts?.some(p=>p.partId===m.partId))&&!s.busy);}
  async reconcileObsoletePayment(){return this.queue.run(async()=>{if(!this.canReconcileObsoletePayment())return;const original=this.snapshot.recovery!;try{this.set({busy:"reconcile",error:null});if(await this.api.getOperation(original.operationId)){await this.recoverInternal(false);return;}const sale=await this.api.getSale(original.saleId);if(sale.prepareOperationId===original.prepareOperationId&&sale.paymentParts?.some(p=>p.partId===original.partId)){this.set({busy:null,error:"Özgün ödeme parçası hâlâ geçerli. Aynı işlemin durumunu kontrol et."});return;}const input={expectedVersion:sale.version,originalOperationId:original.operationId,prepareOperationId:original.prepareOperationId!,partId:original.partId!};const result=await this.mutate("reconcile",sale.id,sale.version,sale.totals.totalCents,()=>this.api.reconcileObsoletePayment(sale.id,input,this.snapshot.recovery!.operationId),this.revision,undefined,{originalOperationId:original.operationId,prepareOperationId:original.prepareOperationId,partId:original.partId,...(original.partAmountCents?{partAmountCents:original.partAmountCents}:{}),...(original.partPaymentMethod?{partPaymentMethod:original.partPaymentMethod}:{})});this.hydrate(result.sale,true);this.set({busy:null,notice:"Fiziksel iade uzlaştırması kaydedildi. Diğer tahsilatlar korundu."});await this.refreshLists();}catch(error){this.fail(error);}});}
  async beginPendingAbort(){return this.queue.run(async()=>{const s=this.snapshot,sale=s.sale;if(this.getContractVersion()!==4||!s.bootstrap?.permissions.canResolve||!sale||!["payment_pending","payment_received"].includes(sale.status)||s.recovery||s.conflict||s.busy)return;try{this.set({busy:"abort",error:null});const result=await this.mutate("abort",sale.id,sale.version,sale.totals.totalCents,()=>this.api.beginPendingAbort(sale.id,{expectedVersion:sale.version},this.snapshot.recovery!.operationId));this.hydrate(result.sale,false,true);this.set({busy:null});await this.refreshLists();}catch(error){this.fail(error);}});}
  async returnPendingPart(partId:string,reason:string){return this.queue.run(async()=>{const s=this.snapshot,sale=s.sale,part=sale?.paymentParts?.find(x=>x.partId===partId);if(this.getContractVersion()!==4||!s.bootstrap?.permissions.canResolve||!sale?.abortRequested||!part?.receivedAt||part.returnedAt||s.recovery||s.conflict||s.busy||!reason.trim())return;try{this.set({busy:"return",error:null});const result=await this.mutate("return",sale.id,sale.version,sale.totals.totalCents,()=>this.api.returnPendingPart(sale.id,{expectedVersion:sale.version,partId,reason:reason.trim()},this.snapshot.recovery!.operationId),this.revision,undefined,{partId,reason:reason.trim()});this.hydrate(result.sale,false,true);this.set({busy:null});await this.refreshLists();}catch(error){this.fail(error);}});}
  async finish(){return this.queue.run(async()=>{
    if(this.snapshot.recovery||this.snapshot.conflict||this.snapshot.dirty)return;let sale=this.snapshot.sale;if(!sale||!["payment_pending","payment_received"].includes(sale.status))return;
    try{this.set({error:null});if(this.getContractVersion()===4&&sale.abortRequested)return;if(this.getContractVersion()===4&&sale.status==="payment_pending"&&sale.paymentParts?.length)return;if(sale.status==="payment_pending"&&!(this.getContractVersion()>=3&&sale.initialCollectionCents===0)){
      if(this.getContractVersion()===2&&sale.paymentMethod==null&&!this.snapshot.paymentMethod)throw new Error("Tahsilatı kaydetmek için Kart veya Nakit seç.");
      this.set({busy:"payment"});const current=sale;const paymentMethod=current.paymentMethod==null?this.snapshot.paymentMethod:null;
      const result=await this.mutate("payment",current.id,current.version,current.totals.totalCents,()=>this.api.confirmPayment(current.id,{expectedVersion:current.version,slipReference:null,...(this.getContractVersion()>=2?{paymentMethod}:{})},this.snapshot.recovery!.operationId,this.getContractVersion()));
      this.hydrate(result.sale,false,true);sale=result.sale;
    }
    if(sale.status==="payment_received"||this.getContractVersion()>=3&&sale.status==="payment_pending"&&sale.initialCollectionCents===0){this.set({busy:"complete"});const current=sale;
      const result=await this.mutate("complete",current.id,current.version,current.totals.totalCents,()=>this.api.completeSale(current.id,{expectedVersion:current.version},this.snapshot.recovery!.operationId,this.getContractVersion()));this.hydrate(result.sale,false,true);
    }
    this.set({busy:null});if(this.snapshot.sale?.status==="completed")await this.refreshLists();
    }catch(error){this.fail(error);}
  });}
  async cancelUnpaid(){return this.queue.run(async()=>{const sale=this.snapshot.sale;if(!sale||sale.status!=="payment_pending"||this.snapshot.recovery)return;try{this.set({busy:"cancel",error:null});const result=await this.mutate("cancel",sale.id,sale.version,sale.totals.totalCents,()=>this.api.cancelSale(sale.id,{expectedVersion:sale.version,confirmUnpaid:true},this.snapshot.recovery!.operationId,this.getContractVersion()));this.hydrate(result.sale,false,true);this.set({busy:null});}catch(error){this.fail(error);}});}
  async discardSale(){clearTimeout(this.timer);return this.queue.run(()=>this.discardInternal());}
  private async discardInternal():Promise<boolean>{
    const s=this.snapshot;
    if(s.phase!=="ready"||!s.bootstrap?.permissions.canSell||s.recovery||s.conflict||s.sale&&s.sale.status!=="draft"||s.busy&&s.busy!=="save")return false;
    clearTimeout(this.timer);
    if(!s.sale){this.hydrate(null);this.set({error:null,notice:null});return true;}
    const sale=s.sale;
    try{
      this.set({busy:"discard",error:null});
      const result=await this.mutate("discard",sale.id,sale.version,sale.totals.totalCents,async()=>{
        const value=await this.api.discardSale(sale.id,{expectedVersion:sale.version,confirmUnpaid:true},this.snapshot.recovery!.operationId,this.getContractVersion());
        if(value.sale.status!=="cancelled"||value.sale.paymentReceivedAt!==null||value.sale.orderId!==null)throw new InStoreSalesUiError("unavailable",503,true);
        return value;
      });
      this.hydrate(null);this.set({busy:null,error:null,notice:"Satıştan vazgeçildi. Yeni ürün okutabilirsin."});
      await this.refreshLists();return true;
    }catch(error){this.fail(error);return false;}
  }
  async hold(){return this.queue.run(async()=>{if(!this.isEditable())return;try{await this.flushInternal();const sale=this.snapshot.sale;if(!sale||!sale.items.length)return;this.set({busy:"hold",error:null});const result=await this.mutate("hold",sale.id,sale.version,0,()=>this.api.holdSale(sale.id,{expectedVersion:sale.version,held:true},this.snapshot.recovery!.operationId,this.getContractVersion()),this.revision,true);if(result.sale.status!=="held")throw new Error("Sepet bekletilemedi.");this.hydrate(null);this.set({busy:null,notice:"Sepet bekletildi."});await this.refreshLists();}catch(error){this.fail(error);}});}
  async openSale(saleId:string){return this.queue.run(async()=>{
    if(this.snapshot.recovery||this.snapshot.conflict||!["draft","held","completed",undefined].includes(this.snapshot.sale?.status))return;
    try{if(this.snapshot.sale?.status!=="completed"&&this.snapshot.cart.length){await this.flushInternal();const current=this.snapshot.sale;if(current?.status==="draft"){this.set({busy:"hold"});const held=await this.mutate("hold",current.id,current.version,0,()=>this.api.holdSale(current.id,{expectedVersion:current.version,held:true},this.snapshot.recovery!.operationId,this.getContractVersion()),this.revision,true);this.hydrate(held.sale,false,true);}}
      this.set({busy:"recover",error:null});let sale=await this.api.getSale(saleId);
      const wasHeld=sale.status==="held";if(wasHeld){this.hydrate(sale,true);const current=sale;const result=await this.mutate("hold",sale.id,sale.version,0,()=>this.api.holdSale(current.id,{expectedVersion:current.version,held:false},this.snapshot.recovery!.operationId,this.getContractVersion()),this.revision,false);sale=result.sale;}
      this.hydrate(sale,true,wasHeld);this.set({busy:null});await this.refreshLists();
    }catch(error){this.fail(error);}
  });}
  async takeover(){return this.queue.run(async()=>{const sale=this.snapshot.sale;if(!sale||!this.snapshot.bootstrap?.permissions.canResolve||this.snapshot.recovery)return;try{this.set({busy:"takeover",error:null});const result=await this.mutate("takeover",sale.id,sale.version,0,()=>this.api.takeoverSale(sale.id,{expectedVersion:sale.version},this.snapshot.recovery!.operationId,this.getContractVersion()));this.hydrate(result.sale,false,true);this.set({busy:null});}catch(error){this.fail(error);}});}
  async recover(retry=true){return this.queue.run(()=>this.recoverInternal(retry));}
  private async authoritativeSale(saleId:string):Promise<InStoreSale|null>{
    try{return await this.api.getSale(saleId);}catch(error){if(error instanceof InStoreSalesUiError&&error.code==="not_found"&&error.status===404)return null;throw error;}
  }
  private async replayMetadata(marker:RecoveryMarker):Promise<InStoreSaleResult|null>{
    const contractVersion=marker.contractVersion??1;
    const version={expectedVersion:marker.expectedVersion};
    switch(marker.kind){
      case "reconcile":return this.api.reconcileObsoletePayment(marker.saleId,{...version,originalOperationId:marker.originalOperationId!,prepareOperationId:marker.prepareOperationId!,partId:marker.partId!},marker.operationId);
      case "revise":return this.api.revisePendingPayments(marker.saleId,{...version,paymentParts:marker.paymentParts!,customerId:marker.customerId!,dueDate:marker.dueDate!},marker.operationId);
      case "abort":return this.api.beginPendingAbort(marker.saleId,version,marker.operationId);
      case "return":return this.api.returnPendingPart(marker.saleId,{...version,partId:marker.partId!,reason:marker.reason!},marker.operationId);
      case "prepare":return this.api.prepareSale(marker.saleId,{...version,expectedTotalCents:marker.expectedTotalCents},marker.operationId,contractVersion);
      case "payment":return this.api.confirmPayment(marker.saleId,{...version,...(contractVersion===4?{prepareOperationId:marker.prepareOperationId!,partId:marker.partId!}:{}),slipReference:null,...(contractVersion>=2&&contractVersion<4?{paymentMethod:marker.paymentMethod??null}:{})},marker.operationId,contractVersion);
      case "complete":return this.api.completeSale(marker.saleId,version,marker.operationId,contractVersion);
      case "cancel":return this.api.cancelSale(marker.saleId,{...version,confirmUnpaid:true},marker.operationId,contractVersion);
      case "discard":return this.api.discardSale(marker.saleId,{...version,confirmUnpaid:true},marker.operationId,contractVersion);
      case "takeover":return this.api.takeoverSale(marker.saleId,version,marker.operationId,contractVersion);
      case "hold":return typeof marker.held==="boolean"?this.api.holdSale(marker.saleId,{...version,held:marker.held},marker.operationId,contractVersion):null;
      default:return null;
    }
  }
  private async recoverInternal(retry:boolean){
    const marker=this.snapshot.recovery;if(!marker)return;this.set({busy:"recover",error:null,canReenterDraft:false,canAcceptRecovery:false});
    try{
      let result=await this.api.getOperation(marker.operationId);
      if(!result){
        const sale=await this.authoritativeSale(marker.saleId);
        if(marker.kind==="payment"&&sale&&(marker.contractVersion===4?Boolean(sale.paymentParts?.some(x=>x.partId===marker.partId&&x.receivedAt)):["payment_received","completed"].includes(sale.status))||marker.kind==="complete"&&sale?.status==="completed"||marker.kind==="discard"&&sale?.status==="cancelled"&&sale.paymentReceivedAt===null&&sale.orderId===null)result={sale:sale!,replayed:true,priceChanged:false};
        else if(retry){
          // A missing create must not block its retained immutable command.
          if(this.pendingRequest)result=await this.pendingRequest();
          else if(sale)result=await this.replayMetadata(marker);
        }
        if(!result){
          // Reload has no product/customer intent. Only a verified unpaid draft (or
          // absent sale) may offer explicit reentry. Never reset a payment stage.
          const canReenterDraft=["create","update"].includes(marker.kind)&&!this.pendingRequest&&(!sale||sale.status==="draft");
          if(!this.pendingRequest)this.hydrate(sale,true);
          this.set({recovery:marker,busy:null,canReenterDraft,error:marker.kind==="discard"?"Sepetin kapatıldığı henüz doğrulanamadı. Aynı işlemin durumunu kontrol et.":canReenterDraft?"Son sepet değişikliğinin sonucu doğrulanamadı. Sunucudaki sepeti yükle veya aynı satış için ürünleri yeniden okut.":"İşlemin sonucu henüz doğrulanamadı. Fiziksel tahsilatı tekrar alma; aynı satışın durumunu kontrol et."});return;
        }
      }
      if(result.sale.id!==marker.saleId)throw new Error("İşlem başka bir satışa ait. Sonuç doğrulanamadı.");
      const current=await this.api.getSale(marker.saleId),operationSale=result.sale;
      const advancedIntent=Boolean(this.pendingRequest&&["create","update"].includes(marker.kind)&&this.revision!==this.pendingRevision);
      if(current.version>=result.sale.version)result={...result,sale:current,priceChanged:result.priceChanged&&current.version===result.sale.version};
      if(marker.kind==="discard"&&(result.sale.status!=="cancelled"||result.sale.paymentReceivedAt!==null||result.sale.orderId!==null))throw new InStoreSalesUiError("unavailable",503,true);
      clearMarker(this.storage,marker.scopeKey);this.pendingRequest=null;
      if(advancedIntent&&current.status==="draft"&&current.version===operationSale.version&&current.ownerMembershipId===operationSale.ownerMembershipId){
        this.newSaleId=null;this.set({sale:current,busy:null,recovery:null,dirty:true});await this.flushInternal();
      }else if(advancedIntent){this.set({busy:null,recovery:null,conflict:current,error:"Sepet başka bir işlemde değişti. Güncel sepeti yükleyip tutarı kontrol et."});}
      else{this.hydrate(marker.kind==="discard"?null:result.sale,true);this.set({busy:null,recovery:null,priceChanged:result.priceChanged});}
      await this.refreshLists();
    }catch(error){
      if(!["payment","complete","revise","abort","return","reconcile"].includes(marker.kind)&&error instanceof InStoreSalesUiError&&["version_conflict","invalid_transition","client_upgrade_required"].includes(error.code)){
        try{const current=await this.authoritativeSale(marker.saleId);
          if(current&&current.version>marker.expectedVersion&&["draft","held"].includes(current.status)){
            this.set({busy:null,conflict:current,canAcceptRecovery:true,error:"Önceki işlem güncel sepet sürümüne uygulanamadı. Güncel sepeti yükleyip ürünleri ve tutarı kontrol et."});return;
          }
        }catch{}
      }
      this.fail(error);
    }
  }
  async reenterDraft(){return this.queue.run(async()=>{
    const marker=this.snapshot.recovery;if(!marker||!this.snapshot.canReenterDraft||this.pendingRequest||!["create","update"].includes(marker.kind))return;
    this.set({busy:"recover",error:null});
    try{
      const operation=await this.api.getOperation(marker.operationId);
      if(operation){await this.recoverInternal(false);return;}
      const sale=await this.authoritativeSale(marker.saleId);
      if(sale&&sale.status!=="draft"){this.hydrate(sale,true);this.set({recovery:marker,busy:null,error:"Satış ödeme aşamasına geçmiş. POS slipini kontrol et; yeniden tahsilat yapma."});return;}
      this.hydrate(sale);this.set({recovery:null,busy:null,notice:sale?"Kaydedilmiş sepet yüklendi. Son değişikliklerini ve tutarı yeniden kontrol et.":"Bu satış için ürünleri yeniden okut."});
      if(sale)clearMarker(this.storage,marker.scopeKey);
      else this.newSaleId=marker.saleId; // Keep the stored anchor until a new exact write; a delayed create cannot make a second sale UUID.
      await this.refreshLists();
    }catch(error){this.fail(error);}
  });}
  async acceptRecoveryCurrentSale(){return this.queue.run(async()=>{
    const marker=this.snapshot.recovery;if(!marker||!this.snapshot.canAcceptRecovery||["payment","complete","revise","abort","return","reconcile"].includes(marker.kind))return;
    this.set({busy:"recover",error:null});
    try{
      if(await this.api.getOperation(marker.operationId)){await this.recoverInternal(false);return;}
      const current=await this.authoritativeSale(marker.saleId);
      if(!current||current.version<=marker.expectedVersion||!["draft","held"].includes(current.status)){
        if(current)this.hydrate(current,true);this.set({busy:null,recovery:marker,canAcceptRecovery:false,error:"Güncel durum yeniden kontrol edilmeli. Ödeme aşamasındaki satışı sıfırlama; POS slipini kontrol et."});return;
      }
      clearMarker(this.storage,marker.scopeKey);this.pendingRequest=null;this.hydrate(current);this.set({busy:null,recovery:null,error:null,notice:"Güncel sepet yüklendi. Önceki yerel değişiklikleri ve tutarı yeniden kontrol et."});await this.refreshLists();
    }catch(error){this.fail(error);}
  });}
  async refreshLists(){try{const bootstrap=await this.api.bootstrap();if(bootstrap.scopeKey!==this.snapshot.bootstrap?.scopeKey)throw new Error("Oturum değişti. Sayfayı yeniden aç.");this.set({bootstrap});}catch(error){this.set({notice:message(error)});}}
  async newSale(){if(this.snapshot.recovery||this.snapshot.dirty||this.snapshot.sale&&!["completed","cancelled"].includes(this.snapshot.sale.status))return;this.hydrate(null);this.set({error:null,notice:null});}
  acceptCurrentSale(){const current=this.snapshot.conflict;if(!current||this.snapshot.recovery||this.snapshot.busy)return;this.hydrate(current);this.set({error:null,notice:"Güncel sepet yüklendi. Satışa devam etmeden önce ürünleri ve tutarı kontrol et."});}
  dispose(){clearTimeout(this.timer);}
}
export function message(error:unknown){return error instanceof InStoreSalesUiError?error.message:error instanceof Error&&error.message&&!error.message.startsWith("in_store_")?error.message:"İşlem tamamlanamadı. Bilgilerin korunuyor; yeniden dene.";}
