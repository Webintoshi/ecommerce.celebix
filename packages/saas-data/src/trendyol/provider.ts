/** Current Turkish Product V2 / Order V2 transport. No legacy public-schema adapter dependency. */
export type TrendyolCredential = Readonly<{sellerId:string;apiKey:string;apiSecret:string}>;
export type TrendyolProviderErrorCode = 'invalid_input'|'provider_unavailable'|'provider_timeout'|'provider_limit'|'needs_reconnect'|'provider_denied'|'provider_rejected'|'provider_conflict'|'provider_outcome_unknown'|'order_evidence_invalid';
export class TrendyolProviderError extends Error {
  readonly code:TrendyolProviderErrorCode;
  readonly retryAfterSeconds?:number;
  readonly httpStatus?:number;
  constructor(code:TrendyolProviderErrorCode,retryAfterSeconds?:number,httpStatus?:number) {
    super(code);this.name='TrendyolProviderError';this.code=code;
    if(retryAfterSeconds!==undefined&&Number.isFinite(retryAfterSeconds))this.retryAfterSeconds=Math.max(1,Math.min(86400,Math.ceil(retryAfterSeconds)));
    if(httpStatus!==undefined&&Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599)this.httpStatus=httpStatus;
  }
}
export function trendyolProviderErrorCode(error:unknown):TrendyolProviderErrorCode {
  return error instanceof TrendyolProviderError?error.code:'provider_unavailable';
}
export type TrendyolOrderLine = Readonly<{lineId:string;barcode:string;sku:string|null;title:string;quantity:number;unitPriceCents:number;discountCents:number;totalCents:number;status:string;unitIds:string[]}>;
export type TrendyolOrderPackage = Readonly<{
  packageId:string;externalOrderId:string;orderNumber:string;modifiedAt:string;orderedAt:string;status:string;currency:'TRY';
  customer:Readonly<{name:string;email:string;phone:string|null}>;shippingAddress:Record<string,unknown>;
  tracking:Readonly<{code:string|null;url:string|null;carrier:string|null}>;
  totalCents:number;shippingCents:number;discountCents:number;lines:TrendyolOrderLine[];
}>;
export type TrendyolProviderOption = Readonly<{id:number|string;name:string;parentId?:number;required?:boolean;allowCustom?:boolean;varianter?:boolean;slicer?:boolean;allowMultipleAttributeValues?:boolean;values?:ReadonlyArray<Readonly<{id:number;name:string}>>}>;
export type TrendyolProviderOptions = Readonly<{timeoutMs?:number;maxBytes?:number;stage?:boolean}>;
type Json = Record<string,unknown>;
type Code = TrendyolProviderErrorCode;
const MAX_CENTS=999_999_999_999;
const MAX_WINDOW_MS=14*24*60*60*1000;
const STATUS=new Set(['Created','Picking','Invoiced','Shipped','Cancelled','Delivered','UnDelivered','Returned','AtCollectionPoint','UnPacked','UnSupplied','Awaiting','Verified']);
function fail(code:Code='provider_unavailable'):never {throw new TrendyolProviderError(code);}
function record(value:unknown,code:Code='provider_unavailable'):Json {
  if(!value||typeof value!=='object'||Array.isArray(value))fail(code);
  return value as Json;
}
function list(value:unknown,max=1000,code:Code='provider_unavailable'):unknown[] {
  if(!Array.isArray(value)||value.length>max)fail(code);
  return value;
}
function text(value:unknown,max=256,code:Code='provider_unavailable',empty=false):string {
  if(typeof value!=='string'||value.length>max||(!empty&&!value.trim())||/[\u0000-\u001f\u007f]/u.test(value))fail(code);
  return value;
}
function description(value:unknown):string {
  if(typeof value!=='string'||!value.trim()||value.length>30000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))fail('invalid_input');
  return value;
}
function integer(value:unknown,min=0,max=Number.MAX_SAFE_INTEGER,code:Code='provider_unavailable'):number {
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)fail(code);
  return value;
}
function identifier(value:unknown,code:Code='invalid_input'):string {
  if(typeof value==='number')return String(integer(value,1,Number.MAX_SAFE_INTEGER,code));
  const raw=text(value,20,code);if(!/^[1-9]\d{0,19}$/.test(raw))fail(code);return raw;
}
function token(value:unknown,max=256,code:Code='invalid_input'):string {
  const raw=text(value,max,code);if(/[\s/?#\\]/u.test(raw))fail(code);return raw;
}
function barcode(value:unknown,code:Code='invalid_input'):string {
  const raw=text(value,40,code);if(!/^[\p{L}\p{N}._-]+$/u.test(raw))fail(code);return raw;
}
function money(value:unknown,code:Code='order_evidence_invalid'):number {
  if(typeof value==='string') {
    if(!/^\d+(?:\.\d{1,2})?$/.test(value))fail(code);
    const [whole,fraction='']=value.split('.');
    const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
    return integer(cents,0,MAX_CENTS,code);
  }
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)fail(code);
  const scaled=value*100,rounded=Math.round(scaled);
  if(Math.abs(scaled-rounded)>0.00001)fail(code);
  return integer(rounded,0,MAX_CENTS,code);
}
function sum(values:readonly number[],code:Code='order_evidence_invalid'):number {
  return values.reduce((total,value)=>integer(total+value,0,MAX_CENTS,code),0);
}
function timestamp(value:unknown,code:Code='order_evidence_invalid'):string {
  const ms=typeof value==='string'&&/^\d{13}$/.test(value)?Number(value):value;
  const n=integer(ms,1,8_640_000_000_000_000,code);return new Date(n).toISOString();
}
function isoMillis(value:unknown):number {
  const raw=text(value,40,'invalid_input');
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw))fail('invalid_input');
  const ms=Date.parse(raw);return integer(ms,1,8_640_000_000_000_000,'invalid_input');
}
function https(value:unknown,code:Code='invalid_input'):string {
  const raw=text(value,2048,code);let u:URL;try{u=new URL(raw);}catch{fail(code);}
  if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port||!u.hostname.includes('.')||u.hostname==='localhost'||/^(?:127\.|10\.|192\.168\.|169\.254\.|\[)/.test(u.hostname))fail(code);
  return raw;
}
function optionalText(value:unknown,max:number,code:Code='order_evidence_invalid'):string|null {
  return value===undefined||value===null||value===''?null:text(value,max,code);
}
function status(value:unknown):string {
  const raw=text(value,40,'order_evidence_invalid');
  if(!STATUS.has(raw))fail('order_evidence_invalid');return raw;
}
function credentialHeaders(credential:TrendyolCredential):Record<string,string> {
  const seller=identifier(credential.sellerId);
  const key=text(credential.apiKey,512,'invalid_input'),secret=text(credential.apiSecret,512,'invalid_input');
  if(/[:\s]/u.test(key)||/\s/u.test(secret))fail('invalid_input');
  return {authorization:`Basic ${Buffer.from(`${key}:${secret}`,'utf8').toString('base64')}`,'user-agent':`${seller} - Celebix`,accept:'application/json'};
}
function exactKeys(value:Json,allowed:readonly string[]):void {
  if(Object.keys(value).some(key=>!allowed.includes(key)))fail('invalid_input');
}
function safeAddress(raw:unknown):Json {
  const source=record(raw,'order_evidence_invalid'),out:Json={};
  const fields=['id','firstName','lastName','company','address1','address2','city','cityCode','district','districtId','countyId','countyName','shortAddress','stateName','postalCode','countryCode','neighborhoodId','neighborhood','phone','fullAddress','fullName','latitude','longitude'];
  for(const key of fields)if(source[key]!==undefined){const v=source[key];if(v===null)out[key]=null;else if(typeof v==='string')out[key]=text(v,4000,'order_evidence_invalid',true);else if(typeof v==='number')out[key]=integer(v,0,Number.MAX_SAFE_INTEGER,'order_evidence_invalid');else fail('order_evidence_invalid');}
  if(source.addressLines!==undefined){const lines=record(source.addressLines,'order_evidence_invalid');out.addressLines=Object.fromEntries(['addressLine1','addressLine2'].filter(key=>lines[key]!==undefined).map(key=>[key,text(lines[key],4000,'order_evidence_invalid',true)]));}
  return out;
}

/** Unit identities come only from provider lineItemId evidence; never synthesize them from quantity. */
export function normalizeTrendyolOrderPackage(payload:unknown,expectedSellerId:string):TrendyolOrderPackage {
  const code:Code='order_evidence_invalid',p=record(payload,code);
  if(p.supplierId!==undefined&&identifier(p.supplierId,code)!==identifier(expectedSellerId,code))fail(code);
  const packageId=identifier(p.shipmentPackageId,code),orderNumber=text(p.orderNumber,100,code);
  if(p.currencyCode!=='TRY')fail(code);
  const selectedStatus=status(p.shipmentPackageStatus??p.status);
  if(p.status!==undefined&&status(p.status)!==selectedStatus)fail(code);
  const seenLines=new Set<string>(),seenUnits=new Set<string>();
  const lines=list(p.lines,1000,code).map(raw=>{
    const l=record(raw,code),lineId=identifier(l.lineId,code);
    if(seenLines.has(lineId))fail(code);seenLines.add(lineId);
    const quantity=integer(l.quantity,1,20000,code),unitPriceCents=money(l.lineUnitPrice);
    const discountPerUnit=l.lineTotalDiscount===undefined?null:money(l.lineTotalDiscount);
    const details=l.discountDetails===undefined||l.discountDetails===null?[]:list(l.discountDetails,20000,code);
    const unitIds:string[]=[],unitPrices:number[]=[],unitDiscounts:number[]=[];
    for(const entry of details){
      const item=record(entry,code),id=token(typeof item.lineItemId==='number'?identifier(item.lineItemId,code):item.lineItemId,128,code);
      if(seenUnits.has(id))fail(code);seenUnits.add(id);unitIds.push(id);
      unitPrices.push(money(item.lineItemPrice));
      if(item.lineItemSellerDiscount===undefined||item.lineItemTyDiscount===undefined)fail(code);
      unitDiscounts.push(sum([money(item.lineItemSellerDiscount),money(item.lineItemTyDiscount)]));
    }
    if(details.length&&details.length!==quantity)fail(code);
    const totalCents=details.length?sum(unitPrices):integer(unitPriceCents*quantity,0,MAX_CENTS,code);
    // Average fields may round at one cent; exact per-unit evidence is authoritative.
    if(details.length&&Math.abs(totalCents-unitPriceCents*quantity)>quantity)fail(code);
    let discountCents:number;
    if(details.length){discountCents=sum(unitDiscounts);if(discountPerUnit!==null&&Math.abs(discountCents-discountPerUnit*quantity)>quantity)fail(code);}
    else if(discountPerUnit!==null)discountCents=integer(discountPerUnit*quantity,0,MAX_CENTS,code);
    else fail(code);
    if(l.lineGrossAmount!==undefined&&Math.abs(money(l.lineGrossAmount)*quantity-totalCents-discountCents)>quantity)fail(code);
    return {lineId,barcode:barcode(l.barcode,code),sku:optionalText(l.stockCode,100),title:text(l.productName,1000,code),quantity,unitPriceCents,discountCents,totalCents,status:l.orderLineItemStatusName===undefined?selectedStatus:status(l.orderLineItemStatusName),unitIds};
  });
  if(!lines.length)fail(code);
  const totalCents=money(p.packageTotalPrice),lineDiscounts=sum(lines.map(line=>line.discountCents));
  const discountCents=p.packageTotalDiscount===undefined||p.packageTotalDiscount===null?lineDiscounts:money(p.packageTotalDiscount);
  if(sum(lines.map(line=>line.totalCents))!==totalCents||sum(lines.map(line=>line.discountCents))!==discountCents)fail(code);
  if(p.packageGrossAmount!==undefined&&money(p.packageGrossAmount)!==totalCents+discountCents)fail(code);
  const address=safeAddress(p.shipmentAddress);
  const first=optionalText(p.customerFirstName,100)??optionalText(address.firstName,100)??'',last=optionalText(p.customerLastName,100)??optionalText(address.lastName,100)??'';
  let trackingUrl:string|null=null;
  if(p.cargoTrackingLink){try{trackingUrl=https(p.cargoTrackingLink,code);}catch{trackingUrl=null;}}
  const trackingValue=p.cargoTrackingNumber??p.cargoSenderNumber;
  const trackingCode=trackingValue===undefined||trackingValue===null||trackingValue===''?null:typeof trackingValue==='number'?identifier(trackingValue,code):text(trackingValue,200,code);
  return {packageId,externalOrderId:orderNumber,orderNumber,modifiedAt:timestamp(p.lastModifiedDate),orderedAt:timestamp(p.orderDate),status:selectedStatus,currency:'TRY',
    customer:{name:[first,last].filter(Boolean).join(' ')||optionalText(address.fullName,200)||'',email:optionalText(p.customerEmail,320)??'',phone:optionalText(address.phone,100)},shippingAddress:address,
    tracking:{code:trackingCode,url:trackingUrl,carrier:optionalText(p.cargoProviderName,200)},totalCents,shippingCents:0,discountCents,lines};
}

/** No automatic retries: the durable worker decides whether a rejected or uncertain action may be replayed. */
export class TrendyolProvider {
  private readonly transport:typeof fetch;
  private readonly origin:string;
  private readonly timeoutMs:number;
  private readonly maxBytes:number;
  constructor(transport:typeof fetch=fetch,options:TrendyolProviderOptions={}) {
    this.transport=transport;this.origin=options.stage===true?'https://stageapigw.trendyol.com':'https://apigw.trendyol.com';
    this.timeoutMs=integer(options.timeoutMs??15000,1,120000,'invalid_input');
    this.maxBytes=integer(options.maxBytes??4_194_304,1024,8_388_608,'invalid_input');
  }
  private sellerPath(credential:TrendyolCredential,domain:'product'|'inventory'|'order'|'webhook'):string {
    return `/integration/${domain}/sellers/${identifier(credential.sellerId)}`;
  }
  private async request(credential:TrendyolCredential,path:string,method:'GET'|'POST'|'PUT'|'DELETE'='GET',body?:unknown,responseMode:'json'|'empty'='json'):Promise<unknown> {
    if(!/^\/integration\/(?:product|inventory|order|webhook|sellers)\//.test(path)||/[\u0000-\u0020\u007f\\]/u.test(path))fail('invalid_input');
    const headers=credentialHeaders(credential),controller=new AbortController();
    let encoded:string|undefined;
    if(body!==undefined){encoded=JSON.stringify(body);if(Buffer.byteLength(encoded)>4_194_304)fail('invalid_input');headers['content-type']='application/json';}
    let timedOut=false,timer:ReturnType<typeof setTimeout>|undefined;
    const unknownOutcome=method!=='GET';
    const execute=async()=>{
      const response=await this.transport(`${this.origin}${path}`,{method,headers,...(encoded===undefined?{}:{body:encoded}),signal:controller.signal,redirect:'error',cache:'no-store'});
      if(!response.ok){
        await response.body?.cancel().catch(()=>undefined);
        const rawRetry=response.headers.get('retry-after');
        const retry=rawRetry===null?undefined:/^\d+$/.test(rawRetry)?Number(rawRetry):Math.max(1,Math.ceil((Date.parse(rawRetry)-Date.now())/1000));
        const code:Code=response.status===401?'needs_reconnect':response.status===403?'provider_denied':response.status===429?'provider_limit':response.status===409?'provider_conflict':response.status>=500?(unknownOutcome?'provider_outcome_unknown':'provider_unavailable'):'provider_rejected';
        throw new TrendyolProviderError(code,retry,response.status);
      }
      if(Number(response.headers.get('content-length')??0)>this.maxBytes){await response.body?.cancel().catch(()=>undefined);fail(unknownOutcome?'provider_outcome_unknown':'provider_limit');}
      const chunks:Uint8Array[]=[];let length=0;
      if(response.body){const reader=response.body.getReader();try{for(;;){const item=await reader.read();if(item.done)break;length+=item.value.byteLength;if(length>this.maxBytes){await reader.cancel();fail(unknownOutcome?'provider_outcome_unknown':'provider_limit');}chunks.push(item.value);}}finally{reader.releaseLock();}}
      if(!length||responseMode==='empty')return {};
      try{return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;}catch{fail(unknownOutcome?'provider_outcome_unknown':'provider_unavailable');}
    };
    try{
      return await Promise.race([execute(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{timedOut=true;controller.abort();reject(new TrendyolProviderError(unknownOutcome?'provider_outcome_unknown':'provider_timeout'));},this.timeoutMs);})]);
    }catch(error){if(error instanceof TrendyolProviderError)throw error;fail(unknownOutcome?'provider_outcome_unknown':timedOut?'provider_timeout':'provider_unavailable');}
    finally{if(timer)clearTimeout(timer);}
  }
  async testConnection(credential:TrendyolCredential):Promise<void> {
    const response=record(await this.request(credential,`${this.sellerPath(credential,'product')}/products/approved?size=1`));
    list(response.content,1);
  }
  async options(credential:TrendyolCredential,input:Readonly<{kind:'categories'|'brands'|'attributes'|'cargo';categoryId?:number;search?:string}>):Promise<Readonly<{items:TrendyolProviderOption[]}>> {
    const search=input.search===undefined?'':text(input.search,100,'invalid_input',true).trim();
    if(input.kind==='cargo') {
      const raw=list(await this.request(credential,'/integration/product/lookup/cargo-providers'),100);
      return {items:raw.map(value=>{const item=record(value);return {id:token(item.code,50,'provider_unavailable'),name:text(item.name,200)};}).filter(item=>!search||item.name.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr')))};
    }
    if(input.kind==='brands') {
      const raw=await this.request(credential,search?`/integration/product/brands/by-name?name=${encodeURIComponent(search)}`:'/integration/product/brands?page=0&size=1000');
      const entries=list(search?raw:record(raw).brands,1000);
      return {items:entries.map(value=>{const item=record(value);return {id:integer(item.id,1),name:text(item.name,200)};})};
    }
    if(input.kind==='categories') {
      const response=await this.request(credential,`/integration/product/product-categories${search?`?name=${encodeURIComponent(search)}`:''}`);
      const roots=list(Array.isArray(response)?response:record(response).categories,10000),items:TrendyolProviderOption[]=[];let visited=0;
      const walk=(raw:unknown,parentId?:number,depth=0)=>{
        if(depth>20||++visited>20000)fail('provider_limit');const node=record(raw),id=integer(node.id,1),name=text(node.name,200);
        const children=node.subCategories===false||node.subCategories===undefined?[]:list(node.subCategories,10000);
        const parent=node.parentId===undefined||node.parentId===null?parentId:integer(node.parentId,1);
        if(children.length)for(const child of children)walk(child,id,depth+1);else items.push({id,name,...(parent===undefined?{}:{parentId:parent})});
      };
      for(const root of roots)walk(root);return {items};
    }
    if(input.kind!=='attributes')fail('invalid_input');
    const categoryId=integer(input.categoryId,1,Number.MAX_SAFE_INTEGER,'invalid_input');
    const response=record(await this.request(credential,`/integration/product/categories/${categoryId}/attributes`));
    if(integer(response.id,1)!==categoryId)fail();
    const items:TrendyolProviderOption[]=[];
    for(const raw of list(response.categoryAttributes,100)){
      const item=record(raw),attribute=record(item.attribute),id=integer(attribute.id,1),name=text(attribute.name,200);
      if(typeof item.required!=='boolean'||typeof item.allowCustom!=='boolean')fail();
      const values:{id:number;name:string}[]=[];
      if(!item.allowCustom){
        const result=record(await this.request(credential,`/integration/product/categories/${categoryId}/attributes/${id}/values?size=1000&page=0`));
        if(result.totalPages!==undefined&&integer(result.totalPages,0)>1)fail('provider_limit');
        for(const v of list(result.content,1000)){const value=record(v);values.push({id:integer(value.attributeValueId,1),name:text(value.attributeValue,200)});}
      }
      items.push({id,name,required:item.required,allowCustom:item.allowCustom,varianter:item.varianter===true,slicer:item.slicer===true,allowMultipleAttributeValues:item.allowMultipleAttributeValues===true,values});
    }
    return {items};
  }
  private batchIdentity(response:unknown):{batchId:string} {
    return {batchId:token(record(response,'provider_outcome_unknown').batchRequestId,200,'provider_outcome_unknown')};
  }
  async submitInventory(credential:TrendyolCredential,items:readonly Readonly<{barcode:string;quantity:number;salePriceCents?:number}>[]):Promise<{batchId:string}> {
    const seen=new Set<string>();
    const selected=list(items,1000,'invalid_input').map(raw=>{
      const item=record(raw,'invalid_input'),code=barcode(item.barcode);if(seen.has(code))fail('invalid_input');seen.add(code);
      const quantity=integer(item.quantity,0,20000,'invalid_input');
      if(item.salePriceCents===undefined)return {barcode:code,quantity};
      const price=integer(item.salePriceCents,0,MAX_CENTS,'invalid_input')/100;
      return {barcode:code,quantity,salePrice:price,listPrice:price};
    });
    if(!selected.length)fail('invalid_input');
    return this.batchIdentity(await this.request(credential,`${this.sellerPath(credential,'inventory')}/products/price-and-inventory`,'POST',{items:selected}));
  }
  async batch(credential:TrendyolCredential,batchId:string):Promise<{complete:boolean;items:{barcode:string;status:'success'|'failed'|'pending';errors:string[]}[]}> {
    const id=token(batchId,200),response=record(await this.request(credential,`${this.sellerPath(credential,'product')}/products/batch-requests/${encodeURIComponent(id)}`));
    if(response.batchRequestId!==id||response.status!==undefined&&!['IN_PROGRESS','COMPLETED'].includes(String(response.status)))fail();
    const items=list(response.items,1000).map(raw=>{
      const item=record(raw),request=record(item.requestItem),product=request.product===undefined?{}:record(request.product);
      const code=barcode(request.barcode??product.barcode,'provider_unavailable');
      if(!['SUCCESS','FAILED','IN_PROGRESS'].includes(String(item.status)))fail();
      const reasons=item.failureReasons===undefined?[]:list(item.failureReasons,100);
      const selected:'success'|'failed'|'pending'=item.status==='SUCCESS'?'success':item.status==='FAILED'?'failed':'pending';
      if(selected==='success'&&reasons.length)fail();
      return {barcode:code,status:selected,errors:selected==='failed'?['provider_item_rejected']:[]};
    });
    if(!items.length||new Set(items.map(item=>item.barcode)).size!==items.length)fail();
    if(response.itemCount!==undefined&&integer(response.itemCount,1,1000)!==items.length)fail();
    return {complete:response.status!=='IN_PROGRESS'&&items.every(item=>item.status!=='pending'),items};
  }
  /** Reference shape is attributeValueIds/attributeValue. Real seller stage acceptance remains required. */
  async createProducts(credential:TrendyolCredential,items:readonly Record<string,unknown>[]):Promise<{batchId:string}> {
    const seen=new Set<string>();
    const selected=list(items,1000,'invalid_input').map(raw=>{
      const item=record(raw,'invalid_input');exactKeys(item,['barcode','title','description','productMainId','brandId','categoryId','quantity','stockCode','vatRate','listPrice','salePrice','dimensionalWeight','images','attributes','origin','lotNumber','shipmentAddressId','returningAddressId','deliveryOption','cargoProviders']);
      const code=barcode(item.barcode);if(seen.has(code))fail('invalid_input');seen.add(code);
      const sale=money(item.salePrice,'invalid_input'),listPrice=money(item.listPrice,'invalid_input');if(listPrice<sale)fail('invalid_input');
      if(![0,1,10,20].includes(integer(item.vatRate,0,20,'invalid_input')))fail('invalid_input');
      const images=list(item.images,8,'invalid_input').map(rawImage=>{const image=record(rawImage,'invalid_input');exactKeys(image,['url']);return {url:https(image.url)};});if(!images.length)fail('invalid_input');
      const attrs=new Set<number>();
      const attributes=list(item.attributes,100,'invalid_input').map(rawAttribute=>{
        const attribute=record(rawAttribute,'invalid_input');exactKeys(attribute,['attributeId','attributeValueIds','attributeValue','attributeValueId','customAttributeValue']);
        const attributeId=integer(attribute.attributeId,1,Number.MAX_SAFE_INTEGER,'invalid_input');if(attrs.has(attributeId))fail('invalid_input');attrs.add(attributeId);
        const ids=attribute.attributeValueIds??(attribute.attributeValueId===undefined?undefined:[attribute.attributeValueId]);
        const custom=attribute.attributeValue??attribute.customAttributeValue;
        if((ids===undefined)===(custom===undefined)||attribute.attributeValueIds!==undefined&&attribute.attributeValueId!==undefined||attribute.attributeValue!==undefined&&attribute.customAttributeValue!==undefined)fail('invalid_input');
        if(ids!==undefined){const values=list(ids,100,'invalid_input').map(id=>integer(id,1,Number.MAX_SAFE_INTEGER,'invalid_input'));if(!values.length||new Set(values).size!==values.length)fail('invalid_input');return {attributeId,attributeValueIds:values};}
        return {attributeId,attributeValue:text(custom,attributeId===47?50:300,'invalid_input')};
      });if(!attributes.length)fail('invalid_input');
      const result:Json={barcode:code,title:text(item.title,100,'invalid_input'),description:description(item.description),productMainId:text(item.productMainId,40,'invalid_input'),brandId:integer(item.brandId,1,Number.MAX_SAFE_INTEGER,'invalid_input'),categoryId:integer(item.categoryId,1,Number.MAX_SAFE_INTEGER,'invalid_input'),quantity:integer(item.quantity,0,20000,'invalid_input'),vatRate:item.vatRate,listPrice:listPrice/100,salePrice:sale/100,images,attributes};
      if(item.stockCode!==undefined)result.stockCode=text(item.stockCode,100,'invalid_input');
      if(item.origin!==undefined){if(typeof item.origin!=='string'||!/^[A-Z]{2}$/.test(item.origin))fail('invalid_input');result.origin=item.origin;}
      if(item.dimensionalWeight!==undefined){if(typeof item.dimensionalWeight!=='number'||!Number.isFinite(item.dimensionalWeight)||item.dimensionalWeight<0||item.dimensionalWeight>10000)fail('invalid_input');result.dimensionalWeight=item.dimensionalWeight;}
      if(item.lotNumber!==undefined)result.lotNumber=text(item.lotNumber,100,'invalid_input');
      for(const key of ['shipmentAddressId','returningAddressId'])if(item[key]!==undefined)result[key]=integer(item[key],1,Number.MAX_SAFE_INTEGER,'invalid_input');
      if(item.deliveryOption!==undefined){const option=record(item.deliveryOption,'invalid_input');exactKeys(option,['deliveryDuration']);result.deliveryOption={deliveryDuration:integer(option.deliveryDuration,0,365,'invalid_input')};}
      if(item.cargoProviders!==undefined)result.cargoProviders=list(item.cargoProviders,10,'invalid_input').map(code=>token(code,50));
      return result;
    });
    if(!selected.length)fail('invalid_input');
    return this.batchIdentity(await this.request(credential,`${this.sellerPath(credential,'product')}/v2/products`,'POST',{items:selected}));
  }
  async product(credential:TrendyolCredential,value:string):Promise<{barcode:string;approved:boolean;archived:boolean;listingId:string|null;contentId:string|null}> {
    const code=barcode(value),response=record(await this.request(credential,`${this.sellerPath(credential,'product')}/product/${encodeURIComponent(code)}`));
    if(response.barcode!==code||typeof response.approved!=='boolean'||typeof response.archived!=='boolean')fail();
    const listingId=response.listingId===undefined||response.listingId===null?null:token(response.listingId,200,'provider_unavailable');
    const contentId=response.contentId===undefined||response.contentId===null?null:identifier(response.contentId,'provider_unavailable');
    if(response.approved&&(!listingId||!contentId))fail();
    return {barcode:code,approved:response.approved,archived:response.archived,listingId,contentId};
  }
  async productOrNull(credential:TrendyolCredential,value:string):Promise<Awaited<ReturnType<TrendyolProvider['product']>>|null> {
    try{return await this.product(credential,value);}
    catch(error){if(error instanceof TrendyolProviderError&&error.httpStatus===404)return null;throw error;}
  }
  async getInventory(credential:TrendyolCredential,barcodes:readonly string[]):Promise<{items:{barcode:string;quantity:number;salePriceCents:number}[]}> {
    const codes=list(barcodes,50,'invalid_input').map(value=>barcode(value)),wanted=new Set(codes);
    if(!codes.length||wanted.size!==codes.length)fail('invalid_input');
    const items:{barcode:string;quantity:number;salePriceCents:number}[]=[],seen=new Set<string>();let expectedPages:number|undefined;
    for(let page=0;page<50;page++){
      const query=new URLSearchParams({size:'100',page:String(page)});for(const code of codes)query.append('barcodes',code);
      const response=record(await this.request(credential,`${this.sellerPath(credential,'product')}/products/approved/inventory-and-price?${query}`));
      const pages=integer(response.totalPages,0,49);if(expectedPages!==undefined&&pages!==expectedPages)fail();expectedPages=pages;
      if(response.page!==undefined&&integer(response.page,0,49)!==page)fail();
      const content=list(response.content,100);if(page<pages-1&&!content.length)fail();
      for(const raw of content)for(const rawVariant of list(record(raw).variants,1000)){
        const variant=record(rawVariant),code=barcode(variant.barcode,'provider_unavailable');if(!wanted.has(code))continue;
        if(seen.has(code))fail();seen.add(code);
        items.push({barcode:code,quantity:integer(variant.quantity,0,20000),salePriceCents:money(variant.salePrice,'provider_unavailable')});
      }
      if(page>=pages-1)return {items};
    }
    fail('provider_limit');
  }
  async orderStream(credential:TrendyolCredential,input:Readonly<{start:string;end:string;cursor:string|null}>):Promise<{packages:TrendyolOrderPackage[];nextCursor:string|null;hasMore:boolean}> {
    const start=isoMillis(input.start),end=isoMillis(input.end);if(end<=start||end-start>MAX_WINDOW_MS)fail('invalid_input');
    const cursor=input.cursor===null?null:text(input.cursor,8192,'invalid_input');
    const query=new URLSearchParams({lastModifiedStartDate:String(start),lastModifiedEndDate:String(end),size:'200'});if(cursor!==null)query.set('nextCursor',cursor);
    const response=record(await this.request(credential,`${this.sellerPath(credential,'order')}/orders/stream?${query}`));
    if(typeof response.hasMore!=='boolean')fail();
    const next=response.nextCursor===undefined||response.nextCursor===null||response.nextCursor===''?null:text(response.nextCursor,8192);
    if(response.hasMore&&(!next||next===cursor))fail();
    const packages=list(response.content,200).map(raw=>normalizeTrendyolOrderPackage(raw,credential.sellerId));
    if(new Set(packages.map(p=>p.packageId)).size!==packages.length)fail('order_evidence_invalid');
    return {packages,nextCursor:response.hasMore?next:null,hasMore:response.hasMore};
  }
  /** A complete logical-order snapshot is required; never return a truncated snapshot as success. */
  async getOrder(credential:TrendyolCredential,orderNumber:string):Promise<{packages:TrendyolOrderPackage[]}> {
    const number=text(orderNumber,100,'invalid_input'),packages:TrendyolOrderPackage[]=[],seen=new Set<string>();let expectedPages:number|undefined,expectedTotal:number|undefined;
    for(let page=0;page<50;page++){
      const query=new URLSearchParams({orderNumber:number,size:'200',page:String(page)});
      const response=record(await this.request(credential,`${this.sellerPath(credential,'order')}/v2/orders?${query}`));
      const pages=integer(response.totalPages,1,49,'order_evidence_invalid');if(expectedPages!==undefined&&pages!==expectedPages)fail('order_evidence_invalid');expectedPages=pages;
      if(response.page!==undefined&&integer(response.page,0,49)!==page)fail('order_evidence_invalid');
      if(response.totalElements!==undefined){const count=integer(response.totalElements,0,10000);if(expectedTotal!==undefined&&count!==expectedTotal)fail('order_evidence_invalid');expectedTotal=count;}
      const content=list(response.content,200);if(page<pages-1&&!content.length)fail('order_evidence_invalid');
      for(const raw of content){const item=normalizeTrendyolOrderPackage(raw,credential.sellerId);if(item.orderNumber!==number||seen.has(item.packageId))fail('order_evidence_invalid');seen.add(item.packageId);packages.push(item);}
      if(page>=pages-1){if(!packages.length||expectedTotal!==undefined&&packages.length!==expectedTotal)fail('order_evidence_invalid');return {packages};}
    }
    fail('provider_limit');
  }
  async registerWebhook(credential:TrendyolCredential,input:Readonly<{url:string;secret:string}>):Promise<void> {
    const url=https(input.url),secret=text(input.secret,512,'invalid_input');if(/trendyol|dolap|localhost/i.test(url)||secret.length<24)fail('invalid_input');
    const path=`${this.sellerPath(credential,'webhook')}/webhooks`;
    const hooks=list(await this.request(credential,path),15).map(raw=>record(raw));
    const matching=hooks.filter(hook=>hook.url===url);if(matching.length>1)fail('provider_conflict');
    const body={url,authenticationType:'API_KEY',apiKey:secret,subscribedStatuses:[]};
    if(matching.length){
      const hook=matching[0],id=token(hook.id,128,'provider_unavailable');
      // Provider does not reveal the registered key. Reinstall this owned key using an idempotent PUT.
      await this.request(credential,`${path}/${encodeURIComponent(id)}`,'PUT',body,'empty');
      if(hook.status==='PASSIVE')await this.request(credential,`${path}/${encodeURIComponent(id)}/activate`,'PUT',undefined,'empty');
      return;
    }
    if(hooks.length>=15)fail('provider_limit');
    const response=record(await this.request(credential,path,'POST',body));token(response.id,128,'provider_unavailable');
  }
  async sendInvoice(credential:TrendyolCredential,input:Readonly<{packageId:string;url:string;number:string;issuedAt:string}>):Promise<void> {
    const number=text(input.number,16,'invalid_input');if(!/^[A-Za-z0-9]{3}20[2-9][0-9]\d{9}$/.test(number))fail('invalid_input');
    const packageId=identifier(input.packageId),numeric=Number(packageId);integer(numeric,1,Number.MAX_SAFE_INTEGER,'invalid_input');
    await this.request(credential,`/integration/sellers/${identifier(credential.sellerId)}/seller-invoice-links`,'POST',{invoiceLink:https(input.url),shipmentPackageId:numeric,invoiceDateTime:isoMillis(input.issuedAt),invoiceNumber:number},'empty');
  }
  async updatePackage(credential:TrendyolCredential,input:Readonly<{packageId:string;status:'Picking'|'Invoiced';lines:readonly Readonly<{lineId:string;quantity:number}>[];invoiceNumber?:string}>):Promise<void> {
    if(!['Picking','Invoiced'].includes(input.status))fail('invalid_input');
    const selected=list(input.lines,1000,'invalid_input').map(raw=>{const line=record(raw,'invalid_input'),id=Number(identifier(line.lineId));return {lineId:integer(id,1,Number.MAX_SAFE_INTEGER,'invalid_input'),quantity:integer(line.quantity,1,20000,'invalid_input')};});
    if(!selected.length||new Set(selected.map(line=>line.lineId)).size!==selected.length)fail('invalid_input');
    const params:Json={};if(input.invoiceNumber!==undefined){if(input.status!=='Invoiced')fail('invalid_input');params.invoiceNumber=text(input.invoiceNumber,100,'invalid_input');}
    await this.request(credential,`${this.sellerPath(credential,'order')}/shipment-packages/${identifier(input.packageId)}`,'PUT',{lines:selected,params,status:input.status},'empty');
  }
  async approveClaim(credential:TrendyolCredential,input:Readonly<{claimId:string;itemIds:readonly string[]}>):Promise<void> {
    const items=list(input.itemIds,1000,'invalid_input').map(value=>token(value,128));if(!items.length||new Set(items).size!==items.length)fail('invalid_input');
    await this.request(credential,`${this.sellerPath(credential,'order')}/claims/${encodeURIComponent(token(input.claimId,128))}/items/approve`,'PUT',{claimLineItemIdList:items,params:{}},'empty');
  }
}
