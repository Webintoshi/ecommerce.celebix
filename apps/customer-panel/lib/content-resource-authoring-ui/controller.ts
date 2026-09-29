import{parseContentResourceAuthoringRequest,parseContentResourceGenerationView,type ContentResourceAuthoringRequest,type ContentResourceGenerationView,type MerchantContentField,type MerchantContentOrigins,type MerchantContentValues}from'@celebix/saas-contracts';

function stale():never{throw new Error('content_resource_apply_stale');}
/** Captured before dispatch and checked again before a preview can modify an unsaved form. */
export function captureContentResourceApplyContext(request:ContentResourceAuthoringRequest):string{return JSON.stringify(parseContentResourceAuthoringRequest(request));}
export function applyContentResourceDraft(input:Readonly<{context:string;currentRequest:ContentResourceAuthoringRequest;currentValues:MerchantContentValues;origins:MerchantContentOrigins;generation:ContentResourceGenerationView;selectedFields:readonly MerchantContentField[]}>):Readonly<{values:MerchantContentValues;origins:MerchantContentOrigins}>{
 const request=parseContentResourceAuthoringRequest(input.currentRequest),generation=parseContentResourceGenerationView(input.generation);
 if(captureContentResourceApplyContext(request)!==input.context||JSON.stringify(request.currentDraft)!==JSON.stringify(input.currentValues)||request.stage!=='draft'||generation.stage!=='draft'||generation.status!=='completed'||!generation.draft||generation.draft.sourceFingerprint!==generation.sourceFingerprint||JSON.stringify(generation.target)!==JSON.stringify(request.target))stale();
 if(!input.selectedFields.length||new Set(input.selectedFields).size!==input.selectedFields.length||input.selectedFields.some(field=>!request.fields.includes(field)||!Object.hasOwn(generation.draft!.values,field)))stale();
 const values={...input.currentValues},origins={...input.origins};
 for(const field of input.selectedFields){
  (values as unknown as Record<string,unknown>)[field]=generation.draft.values[field];
  origins[field]={generationId:generation.id,state:'ai'};
 }
 return Object.freeze({values:Object.freeze(values),origins:Object.freeze(origins)});
}
export function manualContentFieldEdit(origins:MerchantContentOrigins,field:MerchantContentField,value:string|null,generatedValue:string|null):MerchantContentOrigins{
 const existing=origins[field];
 if(!existing||!('generationId'in existing))return origins;
 return Object.freeze({...origins,[field]:Object.freeze({generationId:existing.generationId,state:value===generatedValue?'ai':'edited_ai'})});
}
