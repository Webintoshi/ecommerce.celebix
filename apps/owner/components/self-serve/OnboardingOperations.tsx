'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import type {OperationsData} from '../../lib/onboarding-operations/service.ts';
import {operationLabel} from '../../lib/onboarding-operations/presentation.ts';
export function OnboardingOperations({data}:{data:OperationsData}){
 const router=useRouter();const [busy,setBusy]=useState<string|null>(null);const [message,setMessage]=useState('');
 async function retry(job:OperationsData['jobs'][number]){
  if(busy)return;setBusy(job.jobId);setMessage('');
  try{
   const response=await fetch('/api/internal/onboarding/operations',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-celebix-csrf':'onboarding-operations-v1'},body:JSON.stringify({jobId:job.jobId,expectedVersion:job.version})});
   const result=await response.json();
   if(response.status===202&&result.kind==='queued'){setMessage('İş yeniden deneme sırasına alındı.');router.refresh();}
   else if(response.status===409){setMessage(result.kind==='busy'?'Bu iş şu anda çalışıyor. Tamamlanmasını bekleyin.':'İşin durumu değişti. Liste güncellendi.');router.refresh();}
   else setMessage('İş yeniden sıraya alınamadı. Biraz sonra tekrar deneyin.');
  }catch{setMessage('Bağlantı kurulamadı. Biraz sonra tekrar deneyin.');}finally{setBusy(null);}
 }
 return <>
  <div className="metric-row">
   <div className="metric-box"><div className="metric-box-label">Bekleyen</div><div className="metric-box-value">{data.counts.pending}</div></div>
   <div className="metric-box"><div className="metric-box-label">Hazır</div><div className="metric-box-value">{data.counts.ready}</div></div>
   <div className="metric-box"><div className="metric-box-label">İnceleme bekleyen</div><div className="metric-box-value">{data.counts.attentionRequired}</div></div>
  </div>
  <div className="card"><div className="section-head"><div><div className="card-title">Otomatik kontrol</div><p className="section-copy">{data.workerState==='healthy'?'Arka plan kontrolleri çalışıyor.':'Arka plan kontrolünden güncel sinyal alınamıyor.'} En eski bekleyen iş: {Math.floor(data.oldestAgeSeconds/60)} dakika.</p></div><button className="btn" type="button" onClick={()=>router.refresh()}>Yenile</button></div></div>
  <p role="status" aria-live="polite">{message}</p>
  {data.jobs.length===0?<div className="card">Henüz kurulum işi yok.</div>:data.jobs.map(job=>{const text=operationLabel(job);return <section className="card" key={job.jobId} aria-label={`Kurulum ${job.jobId}`}>
   <div className="section-head"><div><div className="card-title">{text.status}{text.severity?` · ${text.severity}`:''}</div><p className="section-copy">{text.detail} · {text.age} · {job.retryCount} deneme</p><p className="section-copy">İş: {job.jobId}</p><p className="section-copy">Sonraki kontrol: {new Date(job.nextDueAt).toLocaleString('tr-TR')} · Son güncelleme: {new Date(job.updatedAt).toLocaleString('tr-TR')}</p></div>
    {job.canRetry?<button className="btn btn-primary" type="button" disabled={busy!==null} onClick={()=>void retry(job)}>{busy===job.jobId?'Sıraya alınıyor…':'Yeniden dene'}</button>:null}
   </div>
  </section>;})}
 </>;
}
