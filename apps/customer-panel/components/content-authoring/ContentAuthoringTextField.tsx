"use client";
import {useEffect,useRef,useState,type MutableRefObject} from 'react';
import {createTextOriginHistory,changeTextOrigin,moveTextOriginHistory,type TextOriginHistory} from '@/lib/content-authoring-ui/state';
import type {PendingContentOrigin} from '@/lib/content-authoring-ui/editor';
export type TextAuthoringController=Readonly<{apply(text:string,origin:PendingContentOrigin):void}>;
export function ContentAuthoringTextField({name,defaultValue='',initialOrigin=null,multiline=false,rows=3,maxLength,onValueChange,onOriginChange,controllers}:{name:string;defaultValue?:string;initialOrigin?:PendingContentOrigin|null;multiline?:boolean;rows?:number;maxLength:number;onValueChange?():void;onOriginChange(origin:PendingContentOrigin|null):void;controllers:MutableRefObject<Partial<Record<string,TextAuthoringController>>>}){
 const [history,setHistory]=useState(()=>createTextOriginHistory(defaultValue,initialOrigin));
 const live=useRef(history);live.current=history;
 const callbacks=useRef({onOriginChange,onValueChange});callbacks.current={onOriginChange,onValueChange};
 function update(next:TextOriginHistory){if(next===live.current)return;live.current=next;setHistory(next);callbacks.current.onOriginChange(next.entries[next.index].origin);callbacks.current.onValueChange?.();}
 useEffect(()=>{controllers.current[name]={apply:(text,origin)=>update(changeTextOrigin(live.current,text,origin))};return()=>{delete controllers.current[name];};},[controllers,name]);
 const props={name,maxLength,value:history.entries[history.index].text,onChange:(event:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>update(changeTextOrigin(live.current,event.currentTarget.value)),onKeyDown:(event:React.KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();update(moveTextOriginHistory(live.current,event.key.toLowerCase()==='y'||event.shiftKey?1:-1));}}};
 return <>{multiline?<textarea {...props} rows={rows}/>:<input {...props}/>}</>;
}
