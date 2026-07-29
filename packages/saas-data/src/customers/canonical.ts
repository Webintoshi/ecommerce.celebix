import { createHash } from "node:crypto";
function stable(v:unknown):string{if(v===null||typeof v!=="object")return JSON.stringify(v);if(Array.isArray(v))return `[${v.map(stable).join(",")}]`;return `{${Object.entries(v as Record<string,unknown>).filter(([,n])=>n!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,n])=>`${JSON.stringify(k)}:${stable(n)}`).join(",")}}`}
export function customerFingerprint(kind:string,storeId:string,payload:unknown){return createHash("sha256").update(stable({kind,storeId,payload}),"utf8").digest("hex")}
