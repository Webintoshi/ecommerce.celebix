'use client';
import {useEffect,useRef,useState} from 'react';
import {parseLoyaltyAdminPayload,type LoyaltyCustomerReward,type LoyaltyPosApproval} from '@celebix/saas-contracts';
import type {InStoreRegisterController,RegisterSnapshot} from '../../lib/in-store-sales-ui/model.ts';
import {posLoyaltyCommand,type PosLoyaltyAttempt} from '../../lib/in-store-sales-ui/pos-loyalty.ts';
import {approvalTokenFromScan,startLoyaltyScanner} from '../../lib/in-store-sales-ui/loyalty-scanner.ts';
import styles from './pos-loyalty.module.css';

function readAttempt(key:string):PosLoyaltyAttempt|null{try{const raw:unknown=JSON.parse(sessionStorage.getItem(key)??'null');if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;const x=raw as Record<string,unknown>;if(Object.keys(x).sort().join(',')!=='action,operationId,payload'||!['approve-pos','prepare-pos-reward'].includes(String(x.action))||typeof x.operationId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(x.operationId))return null;const action=x.action as PosLoyaltyAttempt['action'];return{action,operationId:x.operationId,payload:parseLoyaltyAdminPayload(action,x.payload)};}catch{return null;}}
function label(reward:LoyaltyCustomerReward){return reward.reward.kind==='gift'?`${reward.reward.quantity} hediye ürün`:reward.reward.kind==='discount'?`${new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(reward.reward.amountMinor/100)} indirim`:'Ücretsiz kargo';}
export function PosLoyalty({controller,state}:Readonly<{controller:InStoreRegisterController;state:RegisterSnapshot}>){
 const [token,setToken]=useState(''),[approval,setApproval]=useState<LoyaltyPosApproval|null>(null),[error,setError]=useState(''),[working,setWorking]=useState(false),[pending,setPending]=useState(false);
 const attempt=useRef<PosLoyaltyAttempt|null>(null),scope=state.bootstrap?.scopeKey??'',sale=state.sale,key=`celebix:pos-loyalty:${scope}:${sale?.id??''}`;
 const [scanning,setScanning]=useState(false),video=useRef<HTMLVideoElement>(null);
 useEffect(()=>{if(!scanning||!video.current)return;let current=true,stop:(()=>void)|undefined;void startLoyaltyScanner(video.current,scanned=>{if(current&&sale){setScanning(false);setToken(scanned);void run('approve-pos',{token:scanned,saleId:sale.id});}}).then(close=>{if(current)stop=close;else close();}).catch(()=>{if(current){setScanning(false);setError('Kamera açılamadı. Kamera iznini kontrol edin veya müşterinin kopyaladığı kodu yapıştırın.');}});return()=>{current=false;stop?.();};},[scanning,key]);
 useEffect(()=>{attempt.current=readAttempt(key);setPending(attempt.current!==null);setApproval(null);setError('');if(attempt.current)controller.holdLoyaltyRecovery();},[key,controller]);
 if(!state.bootstrap?.permissions.canManageLoyalty||!sale||!['draft','held'].includes(sale.status))return null;
 async function run(action:PosLoyaltyAttempt['action'],payload:PosLoyaltyAttempt['payload']){
  if(working)return;setWorking(true);setError('');
  try{
   const result=await controller.runLoyaltyCommand(async current=>{
    const recovering=attempt.current!==null;
    if(!attempt.current){const selected=action==='prepare-pos-reward'?{...payload,saleId:current.id,expectedVersion:current.version}:{...payload,saleId:current.id};attempt.current={action,operationId:crypto.randomUUID(),payload:parseLoyaltyAdminPayload(action,selected)};sessionStorage.setItem(key,JSON.stringify(attempt.current));}
    const original=attempt.current;return {action:original.action,value:await posLoyaltyCommand(original,recovering)};
   });
   if(result.action==='approve-pos')setApproval(result.value as LoyaltyPosApproval);
   sessionStorage.removeItem(key);attempt.current=null;setPending(false);setToken('');
  }catch(caught){const uncertain=caught!==null&&typeof caught==='object'&&'uncertain'in caught&&caught.uncertain===true;setPending(uncertain);if(!uncertain){attempt.current=null;sessionStorage.removeItem(key);}setError(caught instanceof Error?caught.message:'Sadakat işlemi tamamlanamadı.');}
  finally{setWorking(false);}
 }
 return <details className={styles.panel} open={pending||sale.loyalty!==undefined||approval!==null}><summary>Sadakat ödülü{sale.loyalty?<span>{sale.loyalty.label}</span>:null}</summary><div className={styles.content}>
  {error?<p role="alert" className={styles.error}>{error}</p>:null}
  {pending?<><p>Önceki işlemin sonucu doğrulanıyor. Yeni işlem başlatmadan aynı kaydı kontrol edin.</p><button className={styles.primary} type="button" disabled={working} onClick={()=>{const prior=attempt.current;if(prior)void run(prior.action,prior.payload);}}>{working?'Kontrol ediliyor…':'İşlemi kontrol et'}</button></>:<>
   {!approval?<><p>Müşteriniz Hesabım → Sadakat ödüllerim → Kasada kullan bölümünden QR kodunu açabilir.</p><button className={styles.secondary} type="button" disabled={working||state.busy!==null} onClick={()=>setScanning(value=>!value)}>{scanning?'Kamerayı kapat':'QR kodunu kamerayla okut'}</button>{scanning?<video ref={video} muted playsInline aria-label="Sadakat QR kodu kamerası" style={{width:'100%',maxWidth:360,borderRadius:8}}/>:null}<form onSubmit={event=>{event.preventDefault();const parsed=approvalTokenFromScan(token);if(parsed)void run('approve-pos',{token:parsed,saleId:sale.id});}}><label>Veya kopyalanmış müşteri onay kodu<input value={token} onChange={event=>setToken(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={96} disabled={working||state.busy!==null}/></label><button className={styles.primary} type="submit" disabled={working||state.busy!==null||!approvalTokenFromScan(token)}>{working?'Doğrulanıyor…':'Müşteriyi doğrula'}</button></form></>:<><p className={styles.verified}>Müşterinin sadakat hesabı bu satış için doğrulandı.</p>{approval.availableRewards.filter(x=>x.status==='available').map(reward=><div className={styles.reward} key={reward.id}><div><strong>{label(reward)}</strong><small>{reward.programName}</small></div><button className={styles.secondary} type="button" disabled={working||state.busy!==null} onClick={()=>void run('prepare-pos-reward',{saleId:sale.id,rewardId:reward.id,expectedVersion:sale.version})}>Ödülü uygula</button></div>)}{!approval.availableRewards.some(x=>x.status==='available')?<p>Henüz kullanılabilir ödül yok. Bu satış uygun koşullarda hedefe eklenir.</p>:null}</>}
   {sale.loyalty?<><p>Ödül indirimi toplamda gösterilir. Kasaya yalnız müşteriden alınan gerçek tutar kaydedilir.</p><button className={styles.secondary} type="button" disabled={working||state.busy!==null} onClick={()=>void run('prepare-pos-reward',{saleId:sale.id,rewardId:null,expectedVersion:sale.version})}>Ödülü kaldır</button></>:null}
  </>}
 </div></details>;
}
