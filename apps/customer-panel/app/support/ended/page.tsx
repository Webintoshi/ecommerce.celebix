'use client';
import {useEffect,useState} from 'react';
export default function SupportEnded(){
 const [error,setError]=useState(false);
 async function clear(){setError(false);try{const response=await fetch('/api/support/end',{method:'POST'});if(!response.ok)throw Error();location.replace('/login');}catch{setError(true);}}
 useEffect(()=>{void clear();},[]);
 return <main style={{padding:32}}><h1>Destek oturumu sona erdi</h1><p role="status">{error?'Oturum temizlenemedi. Tekrar deneyin.':'Giriş ekranına dönülüyor…'}</p>{error&&<button type="button" onClick={()=>void clear()}>Tekrar dene</button>}</main>;
}
