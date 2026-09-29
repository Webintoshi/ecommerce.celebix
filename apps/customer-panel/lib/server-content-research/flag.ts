const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function contentResearchEnabled(storeId:string,env:Readonly<Record<string,string|undefined>>=process.env):boolean{
 return env.CONTENT_RESEARCH_ENABLED==='true'||(env.CONTENT_RESEARCH_ENABLED_STORE_IDS??'').split(',').map(value=>value.trim()).filter(value=>UUID.test(value)).includes(storeId);
}
