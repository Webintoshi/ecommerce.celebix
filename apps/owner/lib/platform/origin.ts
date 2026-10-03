export function ownerPublicOrigin(request:Request):string|null {
 const configured=process.env.CELEBIX_OWNER_ORIGIN?.trim();
 if(configured){try{const url=new URL(configured);if(url.protocol==='https:'&&url.pathname==='/'&&!url.username&&!url.password&&!url.search&&!url.hash)return url.origin;}catch{}return null;}
 if(process.env.NODE_ENV!=='production'){const url=new URL(request.url);if(['localhost','127.0.0.1','owner.test'].includes(url.hostname))return url.origin;}
 return null;
}
export function ownerSameOrigin(request:Request):boolean {const expected=ownerPublicOrigin(request);return expected!==null&&request.headers.get('origin')===expected;}
