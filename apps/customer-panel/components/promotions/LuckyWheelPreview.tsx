'use client';
import {useState} from 'react';
import type {LuckyWheelConfig} from '@celebix/saas-contracts';
import styles from './lucky-wheel-studio.module.css';
function contrast(color:string){if(!/^#[a-f\d]{6}$/i.test(color))return 'var(--cp-text-primary)';const c=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722>.179?'#000000':'#ffffff'}
export function LuckyWheelPreview({config,labels}:{config:LuckyWheelConfig;labels:readonly string[]}){
 const [rotation,setRotation]=useState(0);const n=config.prizes.length;
 return <div className={styles.preview} style={{background:config.appearance.background}} data-wheel-preview aria-label="Şans çarkı önizlemesi">
  <div className={styles.wheelFrame}><span className={styles.pointer} style={{borderTopColor:config.appearance.accent}} aria-hidden="true"/>
  <svg viewBox="0 0 320 320" role="img" aria-label={labels.join(', ')} style={{transform:`rotate(${rotation}deg)`}}>
   <circle cx="160" cy="160" r="153" fill={config.appearance.accent}/>
   {config.prizes.map((p,i)=>{
    const step=360/n,start=-90+i*step,end=start+step,middle=start+step/2;
    const round=(value:number)=>Number(value.toFixed(3));
    const point=(degrees:number,radius=144)=>[round(160+radius*Math.cos(degrees*Math.PI/180)),round(160+radius*Math.sin(degrees*Math.PI/180))];
    const [x1,y1]=point(start),[x2,y2]=point(end),[tx,ty]=point(middle,94),color=i%2?config.appearance.sliceB:config.appearance.sliceA,label=labels[i]??'İndirim seçin';
    return <g key={p.id}><path d={`M160 160 L${x1} ${y1} A144 144 0 0 1 ${x2} ${y2} Z`} fill={color} stroke={config.appearance.background} strokeWidth="1.5"/><text transform={`translate(${tx} ${ty}) rotate(${round(middle+90)})`} textAnchor="middle" dominantBaseline="middle" fill={contrast(color)} fontSize={label.length>18?11:13} fontWeight="750">{label}</text></g>
   })}
   <circle cx="160" cy="160" r="35" fill={config.appearance.background} stroke={config.appearance.accent} strokeWidth="5"/>
   <text x="160" y="163" textAnchor="middle" dominantBaseline="middle" fill={contrast(config.appearance.background)} fontSize="15" fontWeight="750">Çevir</text>
  </svg></div>
  <h3 style={{color:contrast(config.appearance.background)}}>{config.heading||'Başlık'}</h3><p style={{color:contrast(config.appearance.background)}}>{config.body}</p>
  <div className={styles.previewInput}>Önce {config.collectMode==='email'?'e-posta':config.collectMode==='phone'?'telefon':'e-posta veya telefon'}</div>
  <small style={{color:contrast(config.appearance.background)}}>□ {config.marketingOptInLabel}</small><button type="button" onClick={()=>setRotation(r=>r+720+180/n)}>Önizlemede çevir</button><small style={{color:contrast(config.appearance.background)}}>Önizleme kupon veya katılım kaydı oluşturmaz.</small>
 </div>;
}
