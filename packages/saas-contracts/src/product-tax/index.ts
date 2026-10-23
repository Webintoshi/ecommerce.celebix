export type ProductTaxChoice=Readonly<{treatment:'taxable';rateBps:number}>|Readonly<{treatment:'exempt';rateBps:null}>;
export type ProductTaxVariantRead=Readonly<{variantId:string;variantVersion:number;tax:ProductTaxChoice|null;effectiveTax:ProductTaxChoice|null;taxSource:'variant'|'product'|'unknown'}>;
export type ProductTaxRead=Readonly<{productId:string;productVersion:number;tax:ProductTaxChoice|null;variants:readonly ProductTaxVariantRead[]}>;
export type ProductTaxBreakdown=Readonly<{grossCents:number;baseCents:number;taxCents:number}>;

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function invalid():never{throw new TypeError('product_tax_contract_invalid');}
function record(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)||Object.getOwnPropertySymbols(value).length)invalid();
 const descriptors=Object.getOwnPropertyDescriptors(value);
 if(Object.keys(descriptors).length!==keys.length||keys.some(key=>!Object.hasOwn(descriptors,key)))invalid();
 const result:Record<string,unknown>={};
 for(const [key,descriptor]of Object.entries(descriptors)){if(!('value'in descriptor)||!descriptor.enumerable)invalid();result[key]=descriptor.value;}
 return result;
}
function integer(value:unknown,min=0,max=Number.MAX_SAFE_INTEGER):number{if(!Number.isSafeInteger(value)||(value as number)<min||(value as number)>max)invalid();return value as number;}
function uuid(value:unknown):string{if(typeof value!=='string'||!UUID.test(value))invalid();return value;}
export function parseProductTaxChoice(value:unknown):ProductTaxChoice{
 const parsed=record(value,['treatment','rateBps']);
 if(parsed.treatment==='taxable')return Object.freeze({treatment:'taxable',rateBps:integer(parsed.rateBps,0,10000)});
 if(parsed.treatment==='exempt'&&parsed.rateBps===null)return Object.freeze({treatment:'exempt',rateBps:null});
 invalid();
}
export function resolveProductTax(productTax:ProductTaxChoice|null,variantTax:ProductTaxChoice|null):ProductTaxChoice|null{
 const product=productTax===null?null:parseProductTaxChoice(productTax),variant=variantTax===null?null:parseProductTaxChoice(variantTax);
 return variant??product;
}
function same(left:ProductTaxChoice|null,right:ProductTaxChoice|null):boolean{return left===null||right===null?left===right:left.treatment===right.treatment&&left.rateBps===right.rateBps;}
export function parseProductTaxRead(value:unknown):ProductTaxRead{
 const parsed=record(value,['productId','productVersion','tax','variants']),tax=parsed.tax===null?null:parseProductTaxChoice(parsed.tax);
 if(!Array.isArray(parsed.variants)||Object.getPrototypeOf(parsed.variants)!==Array.prototype||parsed.variants.length>1000||Object.getOwnPropertySymbols(parsed.variants).length)invalid();
 const descriptors=Object.getOwnPropertyDescriptors(parsed.variants);
 if(Object.keys(descriptors).length!==parsed.variants.length+1)invalid();
 const seen=new Set<string>(),variants:ProductTaxVariantRead[]=[];
 for(let index=0;index<parsed.variants.length;index++){
  const descriptor=descriptors[String(index)];if(!descriptor||!('value'in descriptor)||!descriptor.enumerable)invalid();
  const item=record(descriptor.value,['variantId','variantVersion','tax','effectiveTax','taxSource']),variantId=uuid(item.variantId);
  if(seen.has(variantId))invalid();seen.add(variantId);
  const variantTax=item.tax===null?null:parseProductTaxChoice(item.tax),effectiveTax=item.effectiveTax===null?null:parseProductTaxChoice(item.effectiveTax),taxSource=variantTax!==null?'variant':tax!==null?'product':'unknown';
  if(item.taxSource!==taxSource||!same(effectiveTax,variantTax??tax))invalid();
  variants.push(Object.freeze({variantId,variantVersion:integer(item.variantVersion,1),tax:variantTax,effectiveTax,taxSource}));
 }
 return Object.freeze({productId:uuid(parsed.productId),productVersion:integer(parsed.productVersion,1),tax,variants:Object.freeze(variants)});
}
function rate(choice:ProductTaxChoice):bigint{const tax=parseProductTaxChoice(choice);return tax.treatment==='taxable'?BigInt(tax.rateBps):0n;}
function safe(value:bigint):number{if(value>BigInt(Number.MAX_SAFE_INTEGER))invalid();return Number(value);}
/** Split an existing inclusive price without changing the amount the customer pays. */
export function splitProductTaxGross(grossCents:number,tax:ProductTaxChoice):ProductTaxBreakdown{
 const gross=BigInt(integer(grossCents)),bps=rate(tax),denominator=10000n+bps,taxCents=(gross*bps+denominator/2n)/denominator;
 return Object.freeze({grossCents,baseCents:safe(gross-taxCents),taxCents:safe(taxCents)});
}
/** UI convenience for explicit tax-exclusive entry; persisted catalog prices remain inclusive. */
export function addProductTaxToNet(baseCents:number,tax:ProductTaxChoice):number{
 const base=BigInt(integer(baseCents)),taxCents=(base*rate(tax)+5000n)/10000n;return safe(base+taxCents);
}
