'use client';
import {useEffect,useMemo,useState} from 'react';
import {createLuckyWheelApi} from '@/lib/lucky-wheel-ui/client';
import {readLuckyWheelManagedPromotions,type LuckyWheelManagedPromotion} from '../../lib/lucky-wheel-ui/managed-promotions';
export function useLuckyWheelPromotionSources(enabled=true){
 const api=useMemo(()=>createLuckyWheelApi(),[]),[sources,setSources]=useState<ReadonlyMap<string,LuckyWheelManagedPromotion>>(new Map()),[phase,setPhase]=useState<'loading'|'loaded'|'error'>(enabled?'loading':'loaded'),[revision,setRevision]=useState(0);
 useEffect(()=>{if(!enabled)return;let active=true;setPhase('loading');readLuckyWheelManagedPromotions(api).then(rows=>{if(active){setSources(rows);setPhase('loaded')}}).catch(()=>{if(active)setPhase('error')});return()=>{active=false}},[api,enabled,revision]);
 return {sources,phase,retry:()=>setRevision(v=>v+1)};
}
export function LuckyWheelPromotionSource({source}:{source:LuckyWheelManagedPromotion}){
 return <small>Kaynak: Şans Çarkı · <a href={source.deleted?'/discounts/lucky-wheel':`/discounts/lucky-wheel/${source.campaignId}/edit`}>{source.campaignName}</a>{source.deleted?' (silindi)':''} · {source.issued} dağıtıldı · {source.used} kullanıldı</small>;
}
