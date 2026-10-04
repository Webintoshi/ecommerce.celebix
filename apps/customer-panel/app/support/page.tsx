'use client';
import {useEffect,useRef,useState} from 'react';
export default function SupportHandoff(){
 const handoff=useRef<Readonly<{handoff:string;browserBinding:string}>|null>(null),started=useRef(false),inFlight=useRef(false);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[retryable,setRetryable]=useState(false);
 async function redeem(){
  if(!handoff.current||inFlight.current)return;inFlight.current=true;setBusy(true);setError('');
  try{const response=await fetch('/api/support/redeem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(handoff.current)});if(!response.ok)throw Error();location.replace('/');}
  catch{setError('Destek oturumu açılamadı. Aynı bağlantıyı yeniden deneyebilir veya sahip panelinden yeni bir destek erişimi açabilirsin.');}
  finally{inFlight.current=false;setBusy(false);}
 }
 useEffect(()=>{if(started.current)return;started.current=true;const value=new URLSearchParams(location.hash.slice(1)).get('handoff');history.replaceState(null,'',location.pathname);if(!value||!(/^[a-f0-9]{64}$/).test(value)){setError('Destek bağlantısı geçersiz.');return;}const browserBinding=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');handoff.current=Object.freeze({handoff:value,browserBinding});setRetryable(true);void redeem();},[]);
 return <main style={{padding:32}}><h1 className="sr-only">Destek erişimi</h1><p role="status">{error||'Destek oturumu açılıyor…'}</p>{error&&<div style={{display:'flex',gap:16,alignItems:'center'}}>{retryable&&<button type="button" disabled={busy} onClick={()=>void redeem()}>Yeniden dene</button>}<a href="/login">Girişe dön</a></div>}</main>;
}
