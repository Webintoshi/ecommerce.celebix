"use client";
import {useEffect,useState} from "react";
import type {RegistrationAuthorityScope} from "../../lib/onboarding-jobs/types.ts";
import {nextStatusPollDelay,parseOnboardingStatusDto,STATUS_MESSAGES} from "../../lib/self-serve-status/presentation.ts";
import type {OnboardingStatusDto} from "../../lib/self-serve-status/types.ts";
export function OnboardingStatus({scope}:{scope:RegistrationAuthorityScope}) {
 const [status,setStatus]=useState<OnboardingStatusDto>();
 const [error,setError]=useState<"expired"|"unavailable">();
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  let disposed=false;let timer:ReturnType<typeof setTimeout>|undefined;let active:AbortController|undefined;
  let last:OnboardingStatusDto|undefined;let terminal=false;
  const poll=async()=>{
   if(disposed||document.hidden||terminal||active)return;
   active=new AbortController();
   try{
    const response=await fetch("/api/self-serve/status",{credentials:"same-origin",cache:"no-store",redirect:"error",signal:active.signal});
    if(disposed)return;
    if(response.status===401){terminal=true;last=undefined;setStatus(undefined);setError("expired");}
    else if(response.status===200){const parsed=parseOnboardingStatusDto(await response.json(),scope);if(disposed)return;last=parsed;terminal=last.pollAfterMs===0;setStatus(last);setError(undefined);}
    else {last=undefined;setStatus(undefined);setError("unavailable");}
   }catch{if(!disposed){last=undefined;setStatus(undefined);setError("unavailable");}}
   finally{active=undefined;if(!disposed&&!terminal){const delay=nextStatusPollDelay(last,document.hidden);if(delay)timer=setTimeout(poll,delay);}}
  };
  const visible=()=>{if(timer)clearTimeout(timer);if(document.hidden)active?.abort();else void poll();};
  document.addEventListener("visibilitychange",visible);void poll();
  return()=>{disposed=true;if(timer)clearTimeout(timer);active?.abort();document.removeEventListener("visibilitychange",visible);};
 },[scope,refresh]);
 return <main className="self-serve-public-page self-serve-register-page">
  <section className="self-serve-register-form-wrap" aria-labelledby="onboarding-status-title">
   <h1 id="onboarding-status-title">Mağaza kayıt durumu</h1>
   <p role="status" aria-live="polite">{error==="expired"?"Durum bağlantınızın süresi doldu. Mevcut hesabınızla giriş yapın veya destekle iletişime geçin.":error==="unavailable"?"Kayıt durumu şu anda kontrol edilemiyor.":status?STATUS_MESSAGES[status.stage]:"Kayıt durumu kontrol ediliyor."}</p>
   {status?.stage==="ready"&&<><a href={status.loginUrl}>Panele giriş yap</a> <a href={status.storefrontUrl}>Mağazayı aç</a></>}
   {status?.stage==="expired"&&<a href="/kayit">Kayda yeniden başla</a>}
   {error==="expired"&&<a href={`${scope.panelOrigin}/login`}>Mevcut hesabımla giriş yap</a>}
   {(error||status?.stage==="attention_required"||status?.stage==="failed")&&<button type="button" onClick={()=>setRefresh(value=>value+1)}>Durumu tekrar kontrol et</button>}
  </section>
 </main>;
}
