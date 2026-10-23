import {parseProductTaxChoice,addProductTaxToNet,resolveProductTax,type ProductTaxChoice} from '@celebix/saas-contracts';
export type PriceEntryBasis='included'|'excluded';
export function taxFromChoice(value:string):ProductTaxChoice|null{
 if(value===''||value==='inherit')return null;
 if(value==='exempt')return parseProductTaxChoice({treatment:'exempt',rateBps:null});
 let rateBps:number;
 if(value.startsWith('custom:')){const rate=value.slice(7);if(!/^\d{1,3}(?:[,.]\d{1,2})?$/.test(rate))throw new TypeError('product_tax_invalid');const [whole,fraction='']=rate.replace(',','.').split('.');rateBps=Number(whole)*100+Number(fraction.padEnd(2,'0'));}
 else{if(!/^(?:0|[1-9]\d*)$/.test(value))throw new TypeError('product_tax_invalid');rateBps=Number(value);}
 return parseProductTaxChoice({treatment:'taxable',rateBps});
}
export function taxChoice(value:ProductTaxChoice|null|undefined):string{return value==null?'':value.treatment==='exempt'?'exempt':String(value.rateBps);}
export function taxRateInput(rateBps:number):string{return `${Math.floor(rateBps/100)}${rateBps%100?','+String(rateBps%100).padStart(2,'0').replace(/0$/,''):''}`;}
export function taxLabel(value:ProductTaxChoice|null):string{return value===null?'KDV belirtilmedi':value.treatment==='exempt'?'KDV muaf':`KDV %${taxRateInput(value.rateBps)}`;}
export function effectiveTax(product:ProductTaxChoice|null,variant:ProductTaxChoice|null):ProductTaxChoice|null{return resolveProductTax(product,variant);}
export function sellingPriceCents(value:number,basis:PriceEntryBasis,tax:ProductTaxChoice|null):number|null{
 if(!Number.isSafeInteger(value)||value<0)return null;
 if(basis==='included')return value;
 if(basis!=='excluded'||tax===null)return null;
 try{return addProductTaxToNet(value,tax);}catch{return null;}
}
export function safeTaxChoice(value:string):ProductTaxChoice|null{try{return taxFromChoice(value);}catch{return null;}}

export function effectiveTaxForChoice(product:ProductTaxChoice|null,value:string):ProductTaxChoice|null{try{return effectiveTax(product,taxFromChoice(value));}catch{return null;}}
