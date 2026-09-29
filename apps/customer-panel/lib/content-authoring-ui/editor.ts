import {Extension,type Editor} from '@tiptap/core';
import {closeHistory} from '@tiptap/pm/history';
export type PendingContentOrigin=Readonly<{generationId:string;draftId:string}>;
export const ContentAuthoringOrigin=Extension.create({name:'contentAuthoringOrigin',addGlobalAttributes(){return [{types:['doc'],attributes:{contentAuthoringOrigin:{default:null,rendered:false}}}];}});
export function canApplyDescriptionDraft(editor:Editor,html:string,selection:Readonly<{from:number;to:number}>|null){
 if(editor.isDestroyed||!editor.isEditable)return false;
 const range=selection??{from:0,to:editor.state.doc.content.size};
 if(range.from<0||range.to>editor.state.doc.content.size||range.from>range.to)return false;
 return editor.can().insertContentAt(range,html);
}
export function applyDescriptionDraft(_editor:Editor,_html:string,_origin:PendingContentOrigin,_selection:Readonly<{from:number;to:number}>|null){const range=_selection??{from:0,to:_editor.state.doc.content.size};
 if(range.from<0||range.to>_editor.state.doc.content.size||range.from>range.to)return false;
 _editor.view.dispatch(closeHistory(_editor.state.tr));
 const applied=_editor.chain().command(({tr})=>{tr.setDocAttribute('contentAuthoringOrigin',_origin);return true;}).insertContentAt(range,_html).run();
 _editor.view.dispatch(closeHistory(_editor.state.tr));
 return applied;}
export function descriptionOrigin(editor:Editor):PendingContentOrigin|null{return editor.state.doc.attrs.contentAuthoringOrigin??null;}
export function captureDescriptionSelection(_editor:Editor):Readonly<{from:number;to:number;text:string}>|null{
 const {empty,$from,$to}=_editor.state.selection;
 if(empty || !$from.sameParent($to) || $from.parent.type.name !== 'paragraph' || !$from.parent.textContent.trim())return null;
 return {from:$from.before(),to:$from.after(),text:$from.parent.textContent};
}
