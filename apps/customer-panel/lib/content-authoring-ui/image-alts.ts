export type AuthoringImage = Readonly<{id:string;url?:string;thumbnailUrl?:string;file?:File;altText:string;variantLabel?:string;version?:number}>;
export type AuthoringImageAlt = Readonly<{id:string;altText:string}>;
export type AuthoringMediaBridge = Readonly<{
 captureImages():readonly AuthoringImage[];
 canApplyImageAlts(results:readonly AuthoringImageAlt[],captured:readonly AuthoringImage[]):boolean;
 applyImageAlts(results:readonly AuthoringImageAlt[],captured:readonly AuthoringImage[],onApplied?:(image:AuthoringImage)=>void):boolean|Promise<boolean>;
}>;
export function imageSignature(images:readonly AuthoringImage[]) {return JSON.stringify(images.map(({id,url,thumbnailUrl,altText,version,file})=>({id,url,thumbnailUrl,altText,version,file:file?{name:file.name,size:file.size,lastModified:file.lastModified}:undefined})));}
export function selectedImageBatches(images:readonly AuthoringImage[],selectedIds:readonly string[]) {
 const selected=new Set(selectedIds);const values=images.filter(image=>selected.has(image.id));
 if(new Set(values.map(image=>image.id)).size!==values.length)throw new Error('invalid_images');
 return Array.from({length:Math.ceil(values.length/4)},(_,index)=>values.slice(index*4,index*4+4));
}
export async function createAuthoringThumbnail(source:File|string,signal?:AbortSignal):Promise<string> {
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 let blob:Blob;
 if(typeof source==='string'){const response=await fetch(source,{signal,credentials:source.startsWith('/api/content-ai/image-source/')?'same-origin':'omit'});if(!response.ok)throw new Error('image_unavailable');blob=await response.blob();}else blob=source;
 if(!['image/jpeg','image/png','image/webp'].includes(blob.type))throw new Error('invalid_image');
 const url=URL.createObjectURL(blob);
 try {
  const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const element=new Image();element.onload=()=>resolve(element);element.onerror=()=>reject(new Error('image_unavailable'));element.src=url;});
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const scale=Math.min(1,512/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const context=canvas.getContext('2d');if(!context)throw new Error('image_unavailable');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  for(const quality of [.8,.65,.5,.35]){const data=canvas.toDataURL('image/jpeg',quality);if(Math.ceil((data.length-data.indexOf(',')-1)*3/4)<=131072)return data;}
  throw new Error('image_too_large');
 }finally{URL.revokeObjectURL(url);}
}
