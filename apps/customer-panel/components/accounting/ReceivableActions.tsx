"use client";
import {useEffect,useId,useRef,useState,type KeyboardEvent} from "react";
import {ChevronDown,Wallet} from "lucide-react";
import workspace from "./ReceivablesWorkspace.module.css";

type Action={label:string;onSelect:()=>void};
export function ReceivableActions({label,showCollection,collectionDisabled,onCollect,actions}:{label:string;showCollection:boolean;collectionDisabled:boolean;onCollect:()=>void;actions:readonly Action[]}) {
  const id=useId(),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
  const [expanded,setExpanded]=useState(false),[position,setPosition]=useState({left:0,top:0});
  useEffect(()=>{
    if(!expanded)return;
    const close=(event:Event)=>{if(event.type==="scroll"&&event.target instanceof Node&&menu.current?.contains(event.target))return;menu.current?.hidePopover();};
    window.addEventListener("resize",close);window.addEventListener("scroll",close,true);
    return()=>{window.removeEventListener("resize",close);window.removeEventListener("scroll",close,true);};
  },[expanded]);
  function select(action:Action){menu.current?.hidePopover?.();trigger.current?.focus();action.onSelect();}
  function keyDown(event:KeyboardEvent<HTMLDivElement>){
    if(event.key==="Escape"){event.preventDefault();event.stopPropagation();menu.current?.hidePopover();trigger.current?.focus();return;}
    if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
    const controls=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));if(!controls.length)return;
    event.preventDefault();const current=controls.indexOf(document.activeElement as HTMLButtonElement);
    const index=event.key==="Home"?0:event.key==="End"?controls.length-1:event.key==="ArrowDown"?(current+1)%controls.length:(current-1+controls.length)%controls.length;controls[index]?.focus();
  }
  return <div className={workspace.rowActions}>
    {showCollection?<button type="button" className={workspace.paymentButton} aria-label="Alınan ödemeyi kaydet" disabled={collectionDisabled} onClick={onCollect}><Wallet aria-hidden="true"/>Ödeme kaydet</button>:null}
    <button ref={trigger} type="button" className={workspace.moreButton} aria-label={`${label} için diğer işlemler`} aria-controls={id} aria-expanded={expanded} popoverTarget={id} onClick={event=>{const rect=event.currentTarget.getBoundingClientRect();setPosition({left:Math.max(16,Math.min(rect.right-264,window.innerWidth-280)),top:Math.max(16,Math.min(rect.bottom+8,window.innerHeight-336))});}}>İşlemler<ChevronDown aria-hidden="true"/></button>
    <div ref={menu} id={id} popover="auto" role="group" aria-label={`${label} işlemleri`} className={workspace.rowMenu} style={position} onKeyDown={keyDown} onToggle={event=>{const open=(event.nativeEvent as ToggleEvent).newState==="open";setExpanded(open);if(open)menu.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();}}>
      {actions.map(action=><button type="button" key={action.label} onClick={()=>select(action)}>{action.label}</button>)}
    </div>
  </div>;
}
