'use client';
import {useEffect,useState} from 'react';
export default function OwnerSetupPending(){
 const [ready,setReady]=useState(false);
 useEffect(()=>{let active=true;const check=async()=>{try{const response=await fetch('/api/auth/security',{cache:'no-store'});if(active&&response.ok){setReady(true);window.location.replace('/security');}}catch{}};void check();const timer=setInterval(()=>void check(),3000);return()=>{active=false;clearInterval(timer);};},[]);
 return <main className="login-page"><section className="login-card"><h1>Sahip girişi hazırlanıyor</h1><p role="status">{ready?'Güvenlik adımına geçiliyor…':'Kimlik ve sahip yetkisi kontrol ediliyor. Bu ekran hazır olduğunda güvenlik kurulumuna geçecek.'}</p><a className="button" href="/security">Tekrar kontrol et</a></section></main>;
}
