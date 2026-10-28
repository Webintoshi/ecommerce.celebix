'use client';
import {useEffect,useRef,useState} from 'react';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const send=(url:string,init:RequestInit)=>fetch(url,init),newId=()=>crypto.randomUUID();
type Props=Readonly<{storeId:string;kind:'package'|'tool'|'toshi_credit';offerId:string;term:'monthly'|'annual'|'once';label?:string;disabled?:boolean;autoStart?:boolean;className?:string;fetcher?:typeof send;createOperationId?:()=>string}>;
export function PlatformCheckoutButton({storeId,kind,offerId,term,label='Güvenli ödemeye geç',disabled=false,autoStart=false,className='button button-primary',fetcher=send,createOperationId=newId}:Props){
 const working=useRef(false),autoStarted=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[expired,setExpired]=useState(false);
 async function start(){
  if(working.current||disabled)return;working.current=true;setBusy(true);setError('');setExpired(false);
  try{
   if(!UUID.test(storeId))throw Error();
   const key=`celebix-platform-checkout:v1:${window.location.hostname}:${storeId}:${kind}:${offerId}:${term}`;
   const saved=window.sessionStorage.getItem(key),operationId=saved??createOperationId();if(!UUID.test(operationId))throw Error();
   window.sessionStorage.setItem(key,operationId);
   const response=await fetcher('/api/platform-checkout',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Idempotency-Key':operationId},body:JSON.stringify({kind,offerId,term,operationId})});
   if(response.status===409&&/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??'')){
    const failure=await response.json()as Record<string,unknown>;
    if(failure&&typeof failure==='object'&&!Array.isArray(failure)&&Object.keys(failure).length===1&&failure.code==='checkout_expired'){
     if(window.sessionStorage.getItem(key)!==operationId)throw Error();
     window.sessionStorage.removeItem(key);if(window.sessionStorage.getItem(key)!==null)throw Error();
     setExpired(true);setError('Satın alma bağlantısının süresi doldu. Yeni bir satın alma oluşturarak devam edin.');return;
    }
   }
   if(!response.ok)throw Error();
   const result=await response.json()as Record<string,unknown>;
   if(!result||typeof result!=='object'||Array.isArray(result)||Object.keys(result).length!==3||Object.keys(result).some(k=>!['orderId','handoff','checkoutUrl'].includes(k))||typeof result.orderId!=='string'||!UUID.test(result.orderId)||typeof result.handoff!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(result.handoff)||result.checkoutUrl!=='https://celebix.net/api/platform-checkout/handoff')throw Error();
   const form=document.createElement('form');form.method='POST';form.action=result.checkoutUrl;form.hidden=true;
   for(const[name,value]of [['orderId',result.orderId],['handoff',result.handoff]]){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);}
   // Keep the form attached while its browser navigation is being scheduled.
   document.body.append(form);try{form.submit();}catch(failure){form.remove();throw failure;}
  }catch{setError('Ödeme sayfası açılamadı. Aynı işlemi yeniden deneyin.');}
  finally{working.current=false;setBusy(false);}
 }
 useEffect(()=>{
  if(autoStart&&!disabled&&!autoStarted.current&&kind==='toshi_credit'&&offerId==='toshi-test-1'&&term==='once'){
   autoStarted.current=true;void start();
  }
 },[autoStart,disabled,kind,offerId,term]);
 return <div><button type="button" className={className} disabled={disabled||busy} onClick={()=>void start()}>{busy?'Ödeme hazırlanıyor…':expired?'Yeni satın alma oluştur':error?'Aynı işlemi yeniden dene':label}</button>{error?<p role="alert">{error}</p>:null}</div>;
}
