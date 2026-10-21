'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { parsePublicProduct, type PublicProduct, type PublicProductVariant, type PublicCart, type StorefrontCommercePolicy } from '@celebix/saas-contracts';
import { buildWhatsAppOrderMessage, whatsappOrderDestination, type WhatsAppOrderMessageLine } from '../lib/whatsapp-order-message.ts';
import { emitStorefrontCommerceEvent } from '../lib/analytics/events.ts';
import { useCommercePolicy } from './CommercePolicyProvider';

type Props = Readonly<{className?:string;disabled?:boolean}> & (Readonly<{product:PublicProduct;variant?:PublicProductVariant;quantity:number;cart?:never}> | Readonly<{cart:PublicCart;product?:never;variant?:never;quantity?:never}>);
type Destination = ReturnType<typeof whatsappOrderDestination>;
type RequestState = Readonly<{fingerprint:string;generation:number;pending:boolean;status:string;destination:Destination|null}>;

function requestFingerprint(props:Props, policy:StorefrontCommercePolicy):string {
  const target=props.product
    ? {kind:'product',id:props.product.id,slug:props.product.slug,title:props.product.title,currency:props.product.currency,available:props.product.available,priceCents:props.product.priceCents,pricesHidden:props.product.pricesHidden,variant:props.variant,quantity:props.quantity}
    : {kind:'cart',version:props.cart.version,currency:props.cart.currency,itemCount:props.cart.itemCount,pricesHidden:props.cart.pricesHidden,checkoutBlocker:props.cart.checkoutBlocker,items:props.cart.items.map(({productId,variantId,slug,title,variantTitle,quantity,unitPriceCents,lineTotalCents,available,pricesHidden})=>({productId,variantId,slug,title,variantTitle,quantity,unitPriceCents,lineTotalCents,available,pricesHidden}))};
  return JSON.stringify({policy,disabled:props.disabled===true,target});
}

function parseRequestLines(value:unknown, hidePrices:boolean):readonly WhatsAppOrderMessageLine[] {
  if(!Array.isArray(value)||value.length<1||value.length>100)throw new TypeError('whatsapp_request_lines_invalid');
  const keys=['title','variantTitle','slug','quantity','unitPriceCents','available'];
  const validText=(value:unknown,minimum:number,maximum:number):value is string=>typeof value==='string'&&value.length>=minimum&&value.length<=maximum&&value.trim()===value&&!/[\u0000-\u001f\u007f-\u009f]/u.test(value);
  return value.map((value:unknown)=>{
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new TypeError('whatsapp_request_lines_invalid');
    const row=value as Record<string,unknown>;
    if(Object.keys(row).length!==keys.length||keys.some(key=>!Object.hasOwn(row,key)))throw new TypeError('whatsapp_request_lines_invalid');
    if(!validText(row.title,1,200)||!validText(row.variantTitle,1,200)||!validText(row.slug,1,100)||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)||!Number.isSafeInteger(row.quantity)||(row.quantity as number)<1||(row.quantity as number)>9999||row.available!==true)throw new TypeError('whatsapp_request_lines_invalid');
    if(hidePrices?row.unitPriceCents!==null:typeof row.unitPriceCents!=='number'||!Number.isSafeInteger(row.unitPriceCents)||row.unitPriceCents<0||row.unitPriceCents>100_000_000_000)throw new TypeError('whatsapp_request_lines_invalid');
    return Object.freeze({title:row.title,variantTitle:row.variantTitle,slug:row.slug,quantity:row.quantity as number,unitPriceCents:row.unitPriceCents as number|null,available:true});
  });
}

export function WhatsAppOrderButton(props:Props) {
  const policy=useCommercePolicy();
  const fingerprint=requestFingerprint(props,policy);
  const generation=useRef(0),currentFingerprint=useRef(fingerprint);
  const activeRequest=useRef<Readonly<{fingerprint:string;generation:number;controller:AbortController}>|null>(null);
  const [state,setState]=useState<RequestState|null>(null);
  useLayoutEffect(()=>{
    currentFingerprint.current=fingerprint;
    generation.current+=1;
    return ()=>{generation.current+=1;activeRequest.current?.controller.abort();};
  },[fingerprint]);

  if (!policy.enabled) return null;
  const enabled=!props.disabled && (props.product ? props.product.available && Boolean(props.variant?.available) && props.quantity>=1 : props.cart.items.length>0);
  // Render from the current binding only. Old destinations disappear before effects run.
  const current=state?.fingerprint===fingerprint && state.generation===generation.current ? state : null;
  const pending=current?.pending===true;
  const fallback=enabled ? current?.destination : null;
  const status=current?.status??'';

  const prepare=async()=>{
    if(!enabled||pending||(activeRequest.current?.fingerprint===fingerprint && activeRequest.current.generation===generation.current))return;
    const binding={fingerprint,generation:++generation.current,controller:new AbortController()};
    activeRequest.current=binding;
    const isCurrent=()=>generation.current===binding.generation && currentFingerprint.current===binding.fingerprint;
    setState({fingerprint,generation:binding.generation,pending:true,status:'',destination:null});
    try {
      const input=props.product?{kind:'product',productId:props.product.id,variantId:props.variant!.id,quantity:props.quantity}:{kind:'cart'};
      const response=await fetch('/api/whatsapp-order/preview',{method:'POST',credentials:'same-origin',cache:'no-store',signal:binding.controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify(input)});
      if(!isCurrent())return;
      if(!response.ok)throw new Error('unavailable');
      const preview=await response.json() as {policy:StorefrontCommercePolicy;storeName:string;product?:unknown;cart?:unknown;requestLines?:unknown;variantId?:string;quantity?:number};
      if(!isCurrent())return;
      if(!preview.policy.enabled)throw new Error('disabled');
      const product=preview.product?parsePublicProduct(preview.product):undefined;
      const variant=product?.variants.find(item=>item.id===preview.variantId);
      if(props.product && (!product||product.id!==props.product.id||!variant||variant.id!==props.variant!.id||!variant.available||!product.available||preview.quantity!==props.quantity))throw new Error('stock_unavailable');
      const lines=props.product&&product&&variant?[{title:product.title,variantTitle:variant.title,slug:product.slug,quantity:preview.quantity!,unitPriceCents:variant.priceCents,available:variant.available}]:parseRequestLines(preview.requestLines,preview.policy.hidePrices);
      const message=buildWhatsAppOrderMessage({storeName:preview.storeName,origin:window.location.origin,intro:preview.policy.messageIntro,hidePrices:preview.policy.hidePrices,lines});
      const destination=whatsappOrderDestination(preview.policy.phone,message);
      // Keep normal links after the current server check; no popup or order mutation.
      if(isCurrent())setState({fingerprint,generation:binding.generation,pending:false,destination,status:destination.requiresCopy?'Mesaj uzun. Tamamını kopyalayıp WhatsApp sohbetine yapıştırın.':'Talebiniz hazır. WhatsApp üzerinden gönderebilirsiniz.'});
    }catch{
      if(isCurrent())setState({fingerprint,generation:binding.generation,pending:false,destination:null,status:'Ürün veya mağaza bilgisi güncellenmiş olabilir. Sayfayı yenileyip tekrar deneyin.'});
    }finally{
      if(activeRequest.current?.generation===binding.generation)activeRequest.current=null;
    }
  };
  const copy=()=>{
    if(!fallback||!current)return;
    const binding=current;
    const update=(message:string)=>{
      if(generation.current!==binding.generation||currentFingerprint.current!==binding.fingerprint)return;
      setState(previous=>previous?.generation===binding.generation?{...previous,status:message}:previous);
    };
    void navigator.clipboard.writeText(fallback.message).then(()=>update('Mesaj kopyalandı. WhatsApp sohbetine yapıştırabilirsiniz.')).catch(()=>update('Mesajı alandan seçip kopyalayabilirsiniz.'));
  };
  return <div className="whatsapp-order-action">
    <button className={props.className??'store-button store-button-secondary'} type="button" disabled={!enabled||pending} onClick={()=>void prepare()}>{pending?'Hazırlanıyor…':'WhatsApp ile sipariş ver'}</button>
    {props.product&&!props.variant?<small>Önce bir seçenek seçin.</small>:null}
    {fallback?<div>{fallback.requiresCopy?<><textarea readOnly value={fallback.message} aria-label="Sipariş talebi mesajının tamamı" onFocus={event=>event.currentTarget.select()}/><button type="button" onClick={copy}>Tam mesajı kopyala</button></>:null}<a className="store-button" href={fallback.url} target="_blank" rel="noopener noreferrer" onClick={() => emitStorefrontCommerceEvent({name:'whatsapp_click',data:{source:'whatsapp_order_request',...(props.product?{productId:props.product.id}:{})}})}>WhatsApp sohbetini aç</a></div>:null}
    <p role="status" aria-live="polite">{status}</p>
  </div>;
}
