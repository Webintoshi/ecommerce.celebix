export class BodyTooLarge extends Error {constructor(){super('body_too_large');}}
export async function readBoundedBody(request:Request,limit:number):Promise<Uint8Array<ArrayBuffer>>{
 const declared=request.headers.get('content-length');if(declared&&/^\d+$/.test(declared)&&Number(declared)>limit)throw new BodyTooLarge();
 if(!request.body)return new Uint8Array();
 const reader=request.body.getReader();const chunks:Uint8Array[]=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw new BodyTooLarge();}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
