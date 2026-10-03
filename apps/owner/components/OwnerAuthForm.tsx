'use client';
import {useState,type FormEvent} from 'react';
export function OwnerAuthForm() {
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [pending,setPending]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(pending)return;setPending(true);setError('');try{
  const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});const b=await r.json();if(!r.ok)throw new Error(b.error||'Giriş yapılamadı.');window.location.assign('/security');
 }catch(e){setError(e instanceof Error?e.message:'Bağlantı kurulamadı.');}finally{setPending(false);}}
 return <form onSubmit={submit} className="owner-auth-form"><label className="owner-auth-field"><span>E-posta</span><input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label className="owner-auth-field"><span>Şifre</span><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>{error&&<p role="alert" className="owner-auth-message is-error">{error}</p>}<button className="button button-primary owner-auth-submit" disabled={pending}>{pending?'Giriş yapılıyor…':'Devam et'}</button></form>;
}
