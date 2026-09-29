import 'server-only';
import {createHash} from 'node:crypto';
import {parseContentResourceAuthoringRequest,parseContentResearchSource,parseMerchantContentDocument,type ContentResourceAuthoringRequest,type MerchantContentDocument} from '@celebix/saas-contracts';

export type RetainedContentResearchSource=Readonly<{
 id:string;originalUrl:string;finalUrl:string;title:string;fetchedAt:string;contentSha256:string;extractedText:string;byteCount:number;
}>;
export type ContentResourceSnapshot=Readonly<{sourceFingerprint:string;input:Readonly<Record<string,unknown>>;sources:readonly RetainedContentResearchSource[]}>;
const bytes=(s:string)=>new TextEncoder().encode(s).byteLength;
function invalid():never{throw new TypeError('content_resource_snapshot_invalid');}

/** All merchant text, source pages, notes and voice remain untrusted data inside this packet. */
export function buildContentResourceSnapshot(raw:ContentResourceAuthoringRequest,rawDocument:MerchantContentDocument|null,rawSources:readonly RetainedContentResearchSource[]):ContentResourceSnapshot{
 const request=parseContentResourceAuthoringRequest(raw);
 const document=rawDocument===null?null:parseMerchantContentDocument(rawDocument);
 if(request.currentDraft.locale!==request.locale)invalid();
 if(request.target.recordId===null){if(document!==null)invalid();}
 else if(!document||document.id!==request.target.recordId||document.kind!==request.target.kind||document.version!==request.target.recordVersion||document.status==='archived')invalid();
 if(!Array.isArray(rawSources)||rawSources.length>3||Boolean(request.researchOperationId)!==(rawSources.length>0))invalid();
 const sources=rawSources.map(source=>{
  let selected;try{selected=parseContentResearchSource(source);}catch{invalid();}
  if(createHash('sha256').update(selected.extractedText,'utf8').digest('hex')!==selected.contentSha256)invalid();
  return selected;
 });
 if(new Set(sources.map(source=>source.id)).size!==sources.length||sources.reduce((sum,source)=>sum+bytes(source.extractedText),0)>32000)invalid();
 const input=Object.freeze({target:request.target,stage:request.stage,action:request.stage==='draft'?request.action:null,fields:request.stage==='draft'?request.fields:[],currentDraft:request.currentDraft,locale:request.locale,tone:request.tone,brandVoice:Object.hasOwn(request,'brandVoice')?request.brandVoice:null,length:request.length,note:request.note,topic:request.stage==='outline'?request.topic:null,purpose:request.stage==='outline'?request.purpose:null,reviewedOutline:request.stage==='draft'?request.reviewedOutline:null,outlineGenerationId:request.stage==='draft'?request.outlineGenerationId:null,selection:request.stage==='draft'?request.selection:null,researchOperationId:request.researchOperationId,sources});
 const json=JSON.stringify(input);
 if(bytes(json)>131072)invalid();
 return Object.freeze({sourceFingerprint:createHash('sha256').update(json).digest('hex'),input,sources:Object.freeze(sources)});
}
