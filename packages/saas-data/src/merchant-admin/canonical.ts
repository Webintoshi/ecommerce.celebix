import {createHash} from "node:crypto";
function stable(value:unknown):string{if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(stable).join(",")}]`;return`{${Object.entries(value as Record<string,unknown>).filter(([,nested])=>nested!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,nested])=>`${JSON.stringify(key)}:${stable(nested)}`).join(",")}}`}
export function merchantAdminFingerprint(kind:string,storeId:string,payload:unknown){return createHash("sha256").update(stable({kind,storeId,payload}),"utf8").digest("hex")}
