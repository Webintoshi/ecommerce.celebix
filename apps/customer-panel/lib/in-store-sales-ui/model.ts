import { calculateInStoreTotals, type InStoreBootstrap, type InStoreDiscount, type InStoreProduct, type InStoreSale, type InStoreSaleIntent, type InStoreSaleResult, type InStoreSaleTotals } from "@celebix/saas-contracts";
import { InStoreSalesUiError, type InStoreSalesUiClient } from "./client.ts";

export function parseMinorUnits(input:string):number|null {
  const text=input.trim().replace(",",".");if(!/^\d+(?:\.\d{1,2})?$/.test(text))return null;
  const [whole,decimal=""]=text.split(".");const value=BigInt(whole)*100n+BigInt(decimal.padEnd(2,"0"));
  return value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
}
export const previewTotals=calculateInStoreTotals;
export function createSerialQueue(){let tail:Promise<unknown>=Promise.resolve();return Object.freeze({run<T>(task:()=>Promise<T>):Promise<T>{const next=tail.then(task);tail=next.catch(()=>undefined);return next;}});}
export type RecoveryKind="create"|"update"|"hold"|"prepare"|"payment"|"complete"|"cancel"|"takeover";
export type RecoveryMarker=Readonly<{scopeKey:string;kind:RecoveryKind;saleId:string;operationId:string;expectedVersion:number;expectedTotalCents:number}>;
export type RecoveryStorage=Pick<Storage,"getItem"|"setItem"|"removeItem">;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const markerKey=(scope:string)=>`celebix-in-store-operation:${scope}`;
export function readRecoveryMarker(storage:RecoveryStorage|undefined,scopeKey:string):RecoveryMarker|null {
  try{const value=JSON.parse(storage?.getItem(markerKey(scopeKey))??"null") as RecoveryMarker|null;if(!value||Object.keys(value).sort().join(",")!=="expectedTotalCents,expectedVersion,kind,operationId,saleId,scopeKey"||value.scopeKey!==scopeKey||!["create","update","hold","prepare","payment","complete","cancel","takeover"].includes(value.kind)||!UUID.test(value.saleId)||!UUID.test(value.operationId)||!Number.isSafeInteger(value.expectedVersion)||value.expectedVersion<0||!Number.isSafeInteger(value.expectedTotalCents)||value.expectedTotalCents<0)return null;return Object.freeze(value);}catch{return null;}
}
export function writeRecoveryMarker(storage:RecoveryStorage|undefined,marker:RecoveryMarker):void { storage?.setItem(markerKey(marker.scopeKey),JSON.stringify(marker)); }
function clearMarker(storage:RecoveryStorage|undefined,scope:string){try{storage?.removeItem(markerKey(scope));}catch{}}
export type RegisterCartLine=Readonly<InStoreProduct&{quantity:number}>;
export type RegisterBusy="scan"|"save"|"prepare"|"payment"|"complete"|"hold"|"cancel"|"recover"|"takeover"|null;
export type RegisterSnapshot=Readonly<{
  phase:"loading"|"ready"|"error";bootstrap:InStoreBootstrap|null;sale:InStoreSale|null;cart:readonly RegisterCartLine[];
  locationId:string;discount:InStoreDiscount|null;customerName:string;note:string;dirty:boolean;busy:RegisterBusy;
  error:string|null;notice:string|null;priceChanged:boolean;recovery:RecoveryMarker|null;conflict:InStoreSale|null;
}>;
const initial=():RegisterSnapshot=>({phase:"loading",bootstrap:null,sale:null,cart:[],locationId:"",discount:null,customerName:"",note:"",dirty:false,busy:null,error:null,notice:null,priceChanged:false,recovery:null,conflict:null});
export class InStoreRegisterController {
  private snapshot=initial();private listeners=new Set<()=>void>();private queue=createSerialQueue();private revision=0;
  private timer:ReturnType<typeof setTimeout>|undefined;private pendingRequest:(()=>Promise<InStoreSaleResult>)|null=null;
  private pendingRevision=0;private newSaleId:string|null=null;private storage:RecoveryStorage|undefined;private initialization:Promise<void>|null=null;
  constructor(private api:InStoreSalesUiClient,private storageProvider:()=>RecoveryStorage|undefined=()=>undefined){}
  getSnapshot=()=>this.snapshot;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private set(patch:Partial<RegisterSnapshot>){this.snapshot=Object.freeze({...this.snapshot,...patch});this.listeners.forEach(listener=>listener());}
  isEditable(){const s=this.snapshot;return s.phase==="ready"&&Boolean(s.bootstrap?.permissions.canSell)&&!s.conflict&&(!s.recovery||s.busy==="save")&&(!s.sale||s.sale.status==="draft")&&!["prepare","payment","complete","hold","cancel","takeover","recover"].includes(s.busy??"");}
  private hydrate(sale:InStoreSale|null){
    this.newSaleId=null;this.revision++;
    this.set({sale,cart:sale?.items.map(line=>({...line,pricingUnavailable:false,availableQuantity:9999,stockTracking:false}))??[],locationId:sale?.locationId??this.snapshot.locationId,discount:sale?.discount??null,customerName:sale?.customerName??"",note:sale?.note??"",dirty:false,priceChanged:false,conflict:null});
  }
  initialize(){
    if(this.initialization)return this.initialization;
    this.initialization=this.initializeInternal().finally(()=>{this.initialization=null;});return this.initialization;
  }
  private async initializeInternal(){
    this.set({phase:"loading",error:null});
    try{const bootstrap=await this.api.bootstrap();try{this.storage=this.storageProvider();}catch{this.storage=undefined;}
      this.set({bootstrap,phase:"ready",locationId:bootstrap.locations.find(x=>x.isDefault)?.id??bootstrap.locations[0]?.id??""});this.hydrate(bootstrap.activeDraft);
      const marker=readRecoveryMarker(this.storage,bootstrap.scopeKey);if(marker){this.set({recovery:marker});await this.recover(false);}
    }catch(error){this.set({phase:"error",error:message(error),busy:null});}
  }
  private changed(patch:Partial<RegisterSnapshot>){if(!this.isEditable())return;this.revision++;this.set({...patch,dirty:true,error:null,notice:null,priceChanged:false});clearTimeout(this.timer);this.timer=setTimeout(()=>{void this.flush().catch(()=>undefined);},350);}
  setLocation(locationId:string){if(!this.snapshot.bootstrap?.locations.some(x=>x.id===locationId))return;this.changed({locationId});}
  setCustomer(customerName:string,note:string){this.changed({customerName:customerName.trim(),note:note.trim()});}
  setDiscount(discount:InStoreDiscount|null){if(discount&&!this.snapshot.bootstrap?.permissions.canDiscount)return;this.changed({discount});}
  setQuantity(variantId:string,quantity:number){if(!Number.isInteger(quantity)||quantity<0||quantity>9999)return;this.changed({cart:this.snapshot.cart.flatMap(row=>row.variantId!==variantId?[row]:quantity?[{...row,quantity}]:[])});}
  clearFeedback(){this.set({error:null,notice:null});}
  private add(product:InStoreProduct){if(!this.isEditable())return;const row=this.snapshot.cart.find(x=>x.variantId===product.variantId);if(product.pricingUnavailable||product.unitPriceCents===null)throw new Error("Ürünün güvenilir fiyatı alınamadı. Başka bir ürün seç veya yeniden dene.");if(product.stockTracking&&(row?.quantity??0)>=product.availableQuantity)throw new Error("Bu varyantta eklenebilecek satılabilir stok yok.");if(!row&&this.snapshot.cart.length>=100)throw new Error("Sepete en fazla 100 farklı varyant eklenebilir.");this.changed({cart:row?this.snapshot.cart.map(x=>x.variantId===product.variantId?{...product,quantity:x.quantity+1}:x):[...this.snapshot.cart,{...product,quantity:1}],notice:`${product.productName} eklendi.`});}
  async addProduct(product:InStoreProduct){return this.queue.run(async()=>{try{this.add(product);await this.flushInternal();}catch(error){this.fail(error);}});}
  async scan(barcode:string){return this.queue.run(async()=>{if(!this.isEditable())return;this.set({busy:"scan",error:null});try{const products=await this.api.searchProducts({locationId:this.snapshot.locationId,barcode:barcode.trim()});if(products.length!==1)throw new Error(products.length?"Bu barkod birden fazla varyanta ait. Doğru ürünü arayıp seç.":"Barkod bulunamadı. Ürün adı veya SKU ile ara.");this.set({busy:null});this.add(products[0]);await this.flushInternal();}catch(error){this.fail(error);}finally{if(this.snapshot.busy==="scan")this.set({busy:null});}});}
  private intent():InStoreSaleIntent{return {locationId:this.snapshot.locationId,items:this.snapshot.cart.map(({variantId,quantity})=>({variantId,quantity})),discount:this.snapshot.discount,customerName:this.snapshot.customerName||null,note:this.snapshot.note||null};}
  async flush(){clearTimeout(this.timer);return this.queue.run(()=>this.flushInternal());}
  private async flushInternal(){
    clearTimeout(this.timer);
    while(this.snapshot.dirty&&this.isEditable()){
      if(!this.snapshot.cart.length&&!this.snapshot.sale){this.set({dirty:false});return;}
      const revision=this.revision,intent=this.intent(),sale=this.snapshot.sale;
      const saleId=sale?.id??this.newSaleId??(this.newSaleId=this.api.newId());
      this.set({busy:"save"});
      try{const result=await this.mutate(sale?"update":"create",saleId,sale?.version??0,0,()=>sale?this.api.updateSale(saleId,{expectedVersion:sale.version,intent},this.snapshot.recovery!.operationId):this.api.createSale({saleId,intent},this.snapshot.recovery!.operationId),revision);
        this.set({sale:result.sale,busy:null});if(this.revision===revision){this.hydrate(result.sale);}else this.set({dirty:true});
      }catch(error){this.fail(error);throw error;}
    }
  }
  private fail(error:unknown){this.set({busy:null,error:message(error)});}
  private async mutate(kind:RecoveryKind,saleId:string,expectedVersion:number,expectedTotalCents:number,request:()=>Promise<InStoreSaleResult>,revision=this.revision):Promise<InStoreSaleResult>{
    const scopeKey=this.snapshot.bootstrap!.scopeKey;
    const marker:RecoveryMarker={scopeKey,kind,saleId,operationId:this.api.newId(),expectedVersion,expectedTotalCents};
    this.set({recovery:marker});this.pendingRequest=request;this.pendingRevision=revision;
    try{writeRecoveryMarker(this.storage,marker);}catch{this.set({notice:"Tarayıcı işlem kurtarma anahtarını saklayamadı. Sonucu doğrulamadan bu sekmeyi kapatma."});}
    try{const result=await request();clearMarker(this.storage,scopeKey);this.set({recovery:null});this.pendingRequest=null;return result;}
    catch(error){if(!(error instanceof InStoreSalesUiError)||!error.unknownResult){clearMarker(this.storage,scopeKey);this.set({recovery:null});this.pendingRequest=null;}
      if(error instanceof InStoreSalesUiError&&error.code==="version_conflict"){
        try{const current=await this.api.getSale(saleId);this.set({conflict:current,notice:"Sepet başka bir işlemde değişti. Yerel değişikliklerin uygulanmadı. Güncel sepeti yükleyip tutarı kontrol et."});}catch{}
      }
      throw error;}
  }
  async prepare(){return this.queue.run(async()=>{
    if(!this.isEditable())return;try{
      const totals=previewTotals(this.snapshot.cart.map(x=>({unitPriceCents:x.unitPriceCents??0,quantity:x.quantity,discountEligible:x.discountEligible})),this.snapshot.discount);
      await this.flushInternal();const sale=this.snapshot.sale;if(!sale||!sale.items.length)return;
      if(totals.totalCents<1)throw new Error("Ödenecek tutar sıfır olamaz.");this.set({busy:"prepare",error:null});
      const result=await this.mutate("prepare",sale.id,sale.version,totals.totalCents,()=>this.api.prepareSale(sale.id,{expectedVersion:sale.version,expectedTotalCents:totals.totalCents},this.snapshot.recovery!.operationId));
      this.hydrate(result.sale);this.set({busy:null,priceChanged:result.priceChanged,notice:result.priceChanged?"Fiyatlar güncellendi. Yeni toplamı kontrol edip yeniden ödemeye geç.":null});
    }catch(error){this.fail(error);}
  });}
  async finish(){return this.queue.run(async()=>{
    if(this.snapshot.recovery||this.snapshot.conflict||this.snapshot.dirty)return;let sale=this.snapshot.sale;if(!sale||!["payment_pending","payment_received"].includes(sale.status))return;
    try{this.set({error:null});if(sale.status==="payment_pending"){
      this.set({busy:"payment"});const current=sale;
      const result=await this.mutate("payment",current.id,current.version,current.totals.totalCents,()=>this.api.confirmPayment(current.id,{expectedVersion:current.version,slipReference:null},this.snapshot.recovery!.operationId));
      this.hydrate(result.sale);sale=result.sale;
    }
    if(sale.status==="payment_received"){this.set({busy:"complete"});const current=sale;
      const result=await this.mutate("complete",current.id,current.version,current.totals.totalCents,()=>this.api.completeSale(current.id,{expectedVersion:current.version},this.snapshot.recovery!.operationId));this.hydrate(result.sale);
    }
    this.set({busy:null});if(this.snapshot.sale?.status==="completed")await this.refreshLists();
    }catch(error){this.fail(error);}
  });}
  async cancelUnpaid(){return this.queue.run(async()=>{const sale=this.snapshot.sale;if(!sale||sale.status!=="payment_pending"||this.snapshot.recovery)return;try{this.set({busy:"cancel",error:null});const result=await this.mutate("cancel",sale.id,sale.version,sale.totals.totalCents,()=>this.api.cancelSale(sale.id,{expectedVersion:sale.version,confirmUnpaid:true},this.snapshot.recovery!.operationId));this.hydrate(result.sale);this.set({busy:null});}catch(error){this.fail(error);}});}
  async hold(){return this.queue.run(async()=>{if(!this.isEditable())return;try{await this.flushInternal();const sale=this.snapshot.sale;if(!sale||!sale.items.length)return;this.set({busy:"hold",error:null});const result=await this.mutate("hold",sale.id,sale.version,0,()=>this.api.holdSale(sale.id,{expectedVersion:sale.version,held:true},this.snapshot.recovery!.operationId));if(result.sale.status!=="held")throw new Error("Sepet bekletilemedi.");this.hydrate(null);this.set({busy:null,notice:"Sepet bekletildi."});await this.refreshLists();}catch(error){this.fail(error);}});}
  async openSale(saleId:string){return this.queue.run(async()=>{
    if(this.snapshot.recovery||this.snapshot.conflict||!["draft","held","completed",undefined].includes(this.snapshot.sale?.status))return;
    try{if(this.snapshot.sale?.status!=="completed"&&this.snapshot.cart.length){await this.flushInternal();const current=this.snapshot.sale;if(current?.status==="draft"){this.set({busy:"hold"});const held=await this.mutate("hold",current.id,current.version,0,()=>this.api.holdSale(current.id,{expectedVersion:current.version,held:true},this.snapshot.recovery!.operationId));this.hydrate(held.sale);}}
      this.set({busy:"recover",error:null});let sale=await this.api.getSale(saleId);
      if(sale.status==="held"){const current=sale;const result=await this.mutate("hold",sale.id,sale.version,0,()=>this.api.holdSale(current.id,{expectedVersion:current.version,held:false},this.snapshot.recovery!.operationId));sale=result.sale;}
      this.hydrate(sale);this.set({busy:null});await this.refreshLists();
    }catch(error){this.fail(error);}
  });}
  async takeover(){return this.queue.run(async()=>{const sale=this.snapshot.sale;if(!sale||!this.snapshot.bootstrap?.permissions.canResolve||this.snapshot.recovery)return;try{this.set({busy:"takeover",error:null});const result=await this.mutate("takeover",sale.id,sale.version,0,()=>this.api.takeoverSale(sale.id,{expectedVersion:sale.version},this.snapshot.recovery!.operationId));this.hydrate(result.sale);this.set({busy:null});}catch(error){this.fail(error);}});}
  async recover(retry=true){return this.queue.run(async()=>{
    const marker=this.snapshot.recovery;if(!marker)return;this.set({busy:"recover",error:null});
    try{let result=await this.api.getOperation(marker.operationId);
      if(!result){const sale=await this.api.getSale(marker.saleId);
        if(marker.kind==="payment"&&["payment_received","completed"].includes(sale.status)||marker.kind==="complete"&&sale.status==="completed")result={sale,replayed:true,priceChanged:false};
        else if(retry){
          if(this.pendingRequest)result=await this.pendingRequest();
          else if(marker.kind==="payment"&&sale.status==="payment_pending")result=await this.api.confirmPayment(sale.id,{expectedVersion:marker.expectedVersion,slipReference:null},marker.operationId);
          else if(marker.kind==="complete"&&sale.status==="payment_received")result=await this.api.completeSale(sale.id,{expectedVersion:marker.expectedVersion},marker.operationId);
        }
        if(!result){this.hydrate(sale);this.set({recovery:marker,busy:null,error:"İşlemin sonucu henüz doğrulanamadı. Fiziksel tahsilatı tekrar alma; aynı satışın durumunu kontrol et."});return;}
      }
      if(result.sale.id!==marker.saleId)throw new Error("İşlem başka bir satışa ait. Sonuç doğrulanamadı.");
      // An operation journal is historical. A later durable payment/completion must win.
      const current=await this.api.getSale(marker.saleId),operationSale=result.sale;
      const advancedIntent=Boolean(this.pendingRequest&&["create","update"].includes(marker.kind)&&this.revision!==this.pendingRevision);
      if(current.version>=result.sale.version)result={...result,sale:current,priceChanged:result.priceChanged&&current.version===result.sale.version};
      clearMarker(this.storage,marker.scopeKey);this.pendingRequest=null;
      if(advancedIntent&&current.status==="draft"&&current.version===operationSale.version&&current.ownerMembershipId===operationSale.ownerMembershipId){
        // Only a known response to this actor's exact write may advance the local intent.
        this.newSaleId=null;this.set({sale:current,busy:null,recovery:null,dirty:true});await this.flushInternal();
      }else if(advancedIntent){this.set({busy:null,recovery:null,conflict:current,error:"Sepet başka bir işlemde değişti. Güncel sepeti yükleyip tutarı kontrol et."});}
      else{this.hydrate(result.sale);this.set({busy:null,recovery:null,priceChanged:result.priceChanged});}
      await this.refreshLists();
    }catch(error){this.fail(error);}
  });}
  async refreshLists(){try{const bootstrap=await this.api.bootstrap();if(bootstrap.scopeKey!==this.snapshot.bootstrap?.scopeKey)throw new Error("Oturum değişti. Sayfayı yeniden aç.");this.set({bootstrap});}catch(error){this.set({notice:message(error)});}}
  async newSale(){if(this.snapshot.recovery||this.snapshot.dirty||this.snapshot.sale&&!["completed","cancelled"].includes(this.snapshot.sale.status))return;this.hydrate(null);this.set({error:null,notice:null});}
  acceptCurrentSale(){const current=this.snapshot.conflict;if(!current||this.snapshot.recovery||this.snapshot.busy)return;this.hydrate(current);this.set({error:null,notice:"Güncel sepet yüklendi. Satışa devam etmeden önce ürünleri ve tutarı kontrol et."});}
  dispose(){clearTimeout(this.timer);}
}
export function message(error:unknown){return error instanceof InStoreSalesUiError?error.message:error instanceof Error&&error.message&&!error.message.startsWith("in_store_")?error.message:"İşlem tamamlanamadı. Bilgilerin korunuyor; yeniden dene.";}
