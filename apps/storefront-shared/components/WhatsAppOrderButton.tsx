'use client';
import { useState } from 'react';
import { parsePublicCart, parsePublicProduct, type PublicProduct, type PublicProductVariant, type PublicCart, type StorefrontCommercePolicy } from '@celebix/saas-contracts';
import { buildWhatsAppOrderMessage, whatsappOrderDestination } from '../lib/whatsapp-order-message.ts';
import { emitStorefrontCommerceEvent } from '../lib/analytics/events.ts';
import { useCommercePolicy } from './CommercePolicyProvider';
type Props = Readonly<{className?:string;disabled?:boolean}> & (Readonly<{product:PublicProduct;variant?:PublicProductVariant;quantity:number;cart?:never}> | Readonly<{cart:PublicCart;product?:never;variant?:never;quantity?:never}>);
export function WhatsAppOrderButton(props:Props) {
  const policy=useCommercePolicy();const [pending,setPending]=useState(false);const [status,setStatus]=useState('');const [fallback,setFallback]=useState<ReturnType<typeof whatsappOrderDestination>|null>(null);
  if (!policy.enabled) return null;
  const enabled=!props.disabled && (props.product ? props.product.available && Boolean(props.variant?.available) && props.quantity>=1 : props.cart.items.length>0 && props.cart.items.every(line=>line.available));
  const prepare=async()=>{if(!enabled||pending)return;setPending(true);setStatus('');setFallback(null);
    try {
      const input=props.product?{kind:'product',productId:props.product.id,variantId:props.variant!.id,quantity:props.quantity}:{kind:'cart'};
      const response=await fetch('/api/whatsapp-order/preview',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
      if(!response.ok)throw new Error('unavailable');
      const preview=await response.json() as {policy:StorefrontCommercePolicy;storeName:string;product?:unknown;cart?:unknown;variantId?:string;quantity?:number};
      if(!preview.policy.enabled)throw new Error('disabled');
      const product=preview.product?parsePublicProduct(preview.product):undefined;const cart=preview.cart?parsePublicCart(preview.cart):undefined;
      const variant=product?.variants.find(item=>item.id===preview.variantId);
      if(product&&(!variant||!variant.available||!product.available||preview.quantity!==props.quantity))throw new Error('stock_unavailable');
      const lines=product&&variant?[{title:product.title,variantTitle:variant.title,slug:product.slug,quantity:preview.quantity!,unitPriceCents:variant.priceCents,available:variant.available}]:cart?.items;
      if(!lines)throw new Error('unavailable');
      const message=buildWhatsAppOrderMessage({storeName:preview.storeName,origin:window.location.origin,intro:preview.policy.messageIntro,hidePrices:preview.policy.hidePrices,lines});
      const destination=whatsappOrderDestination(preview.policy.phone,message);
      // A normal link remains available after the async stock/policy check; no popup blocker or simulated order.
      setFallback(destination);setStatus(destination.requiresCopy?'Mesaj uzun. Tamamını kopyalayıp WhatsApp sohbetine yapıştırın.':'Talebiniz hazır. WhatsApp üzerinden gönderebilirsiniz.');
    }catch{setStatus('Ürün veya mağaza bilgisi güncellenmiş olabilir. Sayfayı yenileyip tekrar deneyin.');}finally{setPending(false);}
  };
  return <div className="whatsapp-order-action"><button className={props.className??'store-button store-button-secondary'} type="button" disabled={!enabled||pending} onClick={()=>void prepare()}>{pending?'Hazırlanıyor…':'WhatsApp ile sipariş ver'}</button>{props.product&&!props.variant?<small>Önce bir seçenek seçin.</small>:null}{fallback?<div>{fallback.requiresCopy?<><textarea readOnly value={fallback.message} aria-label="Sipariş talebi mesajının tamamı" onFocus={event=>event.currentTarget.select()}/><button type="button" onClick={()=>void navigator.clipboard.writeText(fallback.message).then(()=>setStatus('Mesaj kopyalandı. WhatsApp sohbetine yapıştırabilirsiniz.')).catch(()=>setStatus('Mesajı alandan seçip kopyalayabilirsiniz.'))}>Tam mesajı kopyala</button></>:null}<a className="store-button" href={fallback.url} target="_blank" rel="noopener noreferrer" onClick={() => emitStorefrontCommerceEvent({name:"whatsapp_click",data:{source:"whatsapp_order_request",...(props.product ? {productId:props.product.id} : {})}})}>WhatsApp sohbetini aç</a></div>:null}<p role="status" aria-live="polite">{status}</p></div>;
}
