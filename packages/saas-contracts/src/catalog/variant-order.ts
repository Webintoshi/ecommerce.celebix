export type CatalogVariantOrder = Readonly<{ productId: string; version: number; orderedVariantIds: readonly string[] }>;
export type CatalogVariantOrderIntent = Readonly<{ expectedVersion: number; orderedVariantIds: readonly string[] }>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function invalid():never {throw new TypeError("catalog_variant_order_invalid");}
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(value===null||typeof value!=="object"||Array.isArray(value))return invalid();
 const record=value as Record<string,unknown>;
 if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)return invalid();
 if(Object.keys(record).sort().join(",")!==[...keys].sort().join(","))return invalid();return record;
}
function ids(value:unknown):readonly string[]{
 if(!Array.isArray(value)||value.length>100||value.some(id=>typeof id!=="string"||!UUID.test(id))||new Set(value).size!==value.length)return invalid();
 return Object.freeze([...value]);
}
function version(value:unknown):number {if(!Number.isSafeInteger(value)||(value as number)<0||(value as number)>=Number.MAX_SAFE_INTEGER)return invalid();return value as number;}
export function parseCatalogVariantOrder(value:unknown):CatalogVariantOrder {
 const row=object(value,["productId","version","orderedVariantIds"]);if(typeof row.productId!=="string"||!UUID.test(row.productId))return invalid();
 return Object.freeze({productId:row.productId,version:version(row.version),orderedVariantIds:ids(row.orderedVariantIds)});
}
export function parseCatalogVariantOrderIntent(value:unknown):CatalogVariantOrderIntent {
 const row=object(value,["expectedVersion","orderedVariantIds"]);
 return Object.freeze({expectedVersion:version(row.expectedVersion),orderedVariantIds:ids(row.orderedVariantIds)});
}
