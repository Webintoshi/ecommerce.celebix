'use client';
import {useEffect,useState} from 'react';
import type {SupportSidecar} from '@/lib/platform-support/policy';
export function SupportBanner({support}:{support:SupportSidecar}){
 const [remaining,setRemaining]=useState(()=>Math.max(0,Date.parse(support.expiresAt)-Date.now()));const [error,setError]=useState('');
 useEffect(()=>{const timer=setInterval(()=>{const value=Math.max(0,Date.parse(support.expiresAt)-Date.now());setRemaining(value);if(value===0)location.replace('/login');},1000);return()=>clearInterval(timer);},[support.expiresAt]);
 async function end(){setError('');try{const response=await fetch('/api/support/end',{method:'POST'});if(!response.ok)throw Error();location.replace('/login');}catch{setError('Oturum sonlandırılamadı. Tekrar deneyin.');}}
 return <aside role="status" aria-label="Aktif destek oturumu" style={{position:'sticky',top:0,zIndex:60,background:'#fff2e5',color:'#472610',padding:'10px 20px',display:'flex',gap:16,alignItems:'center',flexWrap:'wrap',borderBottom:'1px solid #edc59d'}}><strong>Platform destek oturumu</strong><span>{support.operatorLabel}</span><span aria-label="Kalan süre">{Math.floor(remaining/60000)}:{String(Math.floor(remaining/1000)%60).padStart(2,'0')}</span><button type="button" onClick={end} style={{marginLeft:'auto',cursor:'pointer'}}>Desteği bitir</button>{error&&<span role="alert">{error}</span>}</aside>;
}
