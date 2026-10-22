"use client";

import {useState} from 'react';
import type {StoreToolPurchase} from '@celebix/saas-contracts';
import {CommandDialog} from './CommandDialog';
import {usePlatformResource} from './resource';
import {settleToolPurchaseCommand} from './tool-purchases';
import type {CommandSpec,Envelope} from './types';
import {Button,dateTime,Empty,label,money,Panel,ResourceStatus,Table} from './ui';

export function ToolPurchasesPanel({storeId=''}:Readonly<{storeId?:string}>){
 const [status,setStatus]=useState<'pending'|'settled'>('pending');
 const query=new URLSearchParams({status,...storeId?{storeId}:{}});
 const requests=usePlatformResource<Envelope<StoreToolPurchase>>(`/api/platform/tool-purchases?${query}`);
 const [command,setCommand]=useState<CommandSpec|null>(null);
 const rows=requests.data?.items??[];
 return <Panel title="Araç satın alma talepleri">
  <p className="platform-panel-note">Araçlar mağazaya bağlı, tek seferlik satın alınır. Talep oluşturmak ödeme veya aktivasyon değildir. Gerçek tahsilatı doğruladığınızda haklar açılır; paket değişse de korunur.</p>
  <div className="platform-toolbar"><label className="platform-field"><span>Satın alma durumu</span><select value={status} onChange={event=>setStatus(event.target.value as 'pending'|'settled')}><option value="pending">Tahsilat bekleyen</option><option value="settled">Tahsilatı doğrulanan</option></select></label></div>
  <ResourceStatus resource={requests}/>
  {rows.length?<Table headings={['Mağaza / araç','Talep tarihi','KDV hariç','KDV','Tahsil edilecek toplam','Durum / işlem']}>{rows.map(row=><tr key={row.id}>
   <td><strong>{row.storeName}</strong><small className="platform-cell-note">{row.offerName}</small><small className="platform-cell-note">Tek seferlik · yıllık yenileme yok</small></td>
   <td>{dateTime(row.createdAt)}</td><td>{money(row.netCents)}</td><td>{money(row.vatCents)}<small className="platform-cell-note">%{row.vatBps/100}</small></td><td><strong>{money(row.totalCents)}</strong></td>
   <td>{row.status==='pending'?<Button disabled={requests.loading||requests.stale} onClick={()=>setCommand(settleToolPurchaseCommand(row))}>Tahsilatı doğrula ve aç</Button>:<><strong>Tahsilat doğrulandı</strong><small className="platform-cell-note">{dateTime(row.settledAt)}</small><small className="platform-cell-note">{label(row.receipt?.method)} · {row.receipt?.reference}</small></>}</td>
  </tr>)}</Table>:requests.data&&<Empty title={status==='pending'?'Bekleyen araç talebi yok':'Doğrulanmış araç tahsilatı yok'}>{status==='pending'?'Mağazadan oluşturulan satın alma talepleri burada görünür.':'Tamamlanan tahsilatlar ve açılan araç hakları burada görünür.'}</Empty>}
  <CommandDialog command={command} onClose={()=>setCommand(null)} onCommitted={()=>void requests.refresh()} onRefresh={async()=>{const fresh=await requests.refresh();return fresh?.items?.find(row=>row.id===command?.resourceId&&row.status==='pending')?.version;}}/>
 </Panel>;
}
