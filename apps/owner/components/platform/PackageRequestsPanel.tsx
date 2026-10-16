"use client";
import {useState} from 'react';
import {COMMERCIAL_PACKAGES} from '@celebix/saas-contracts';
import {assignPlanCommand} from './actions';
import {CommandDialog} from './CommandDialog';
import {usePlatformResource} from './resource';
import type {CommandSpec,Envelope,Plan,Store,StoreDetail} from './types';
import {Badge,Button,dateTime,Panel,ResourceStatus,Table} from './ui';
type PackageRequest={id:string;storeId:string;storeName:string;planId:string;createdAt:string;status:'pending'|'applied';storeVersion:number};
export function PackageRequestsPanel({plans}:{plans:Plan[]}){
 const requests=usePlatformResource<Envelope<PackageRequest>>('/api/platform/package-requests');
 const [command,setCommand]=useState<CommandSpec|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 async function loadStore(storeId:string):Promise<Store>{
  const response=await fetch(`/api/platform/stores/${encodeURIComponent(storeId)}`,{cache:'no-store',headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('Mağaza bilgileri alınamadı. Yeniden deneyin.');
  const result=await response.json()as StoreDetail;if(!result.available||!result.store||result.store.id!==storeId)throw Error('Mağaza bilgileri alınamadı. Yeniden deneyin.');return result.store;
 }
 async function review(row:PackageRequest){
  if(busy)return;setBusy(true);setError(null);
  try{const store=await loadStore(row.storeId);const spec=assignPlanCommand(store,plans);setCommand({...spec,initial:{planId:row.planId}});}catch(cause){setError(cause instanceof Error?cause.message:'Talep açılmadı.');}finally{setBusy(false);}
 }
 const rows=requests.data?.items??[];
 return <Panel title="Paket talepleri">
  <ResourceStatus resource={requests}/>
  {error&&<p role="alert">{error}</p>}
  {rows.length?<Table headings={['Mağaza','İstenen paket','Tarih','Durum','İşlem']}>{rows.map(row=><tr key={row.id}><td>{row.storeName}</td><td>{COMMERCIAL_PACKAGES.find(plan=>plan.id===row.planId)?.name??'Paket'}</td><td>{dateTime(row.createdAt)}</td><td>{row.status==='applied'?'Uygulandı':<Badge value="pending"/>}</td><td>{row.status==='pending'&&<Button disabled={busy||requests.stale||!plans.some(plan=>plan.id===row.planId)} onClick={()=>void review(row)}>İncele ve paket ata</Button>}</td></tr>)}</Table>:requests.data&&<p className="platform-muted">Henüz paket talebi yok.</p>}
  <p className="platform-muted">Paket ataması ödeme almaz. Hizmet bedeli ve tahsilat ayrı kaydedilir.</p>
  <CommandDialog command={command} onClose={()=>setCommand(null)} onCommitted={()=>void requests.refresh()} onRefresh={async()=>command?.resourceId?(await loadStore(command.resourceId)).version:undefined}/>
 </Panel>;
}
