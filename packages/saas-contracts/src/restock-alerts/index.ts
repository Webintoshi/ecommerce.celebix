export type RestockAlertsConfig = Readonly<{schemaVersion:1;enabled:boolean;title:string;buttonLabel:string}>;
const CONTROL=/[<>\u0000-\u001f\u007f-\u009f]/u;
export function createDefaultRestockAlertsConfig(): RestockAlertsConfig { return Object.freeze({schemaVersion:1,enabled:false,title:'Stok gelince haber ver',buttonLabel:'Bana haber ver'}); }
export function parseRestockAlertsConfig(value:unknown): RestockAlertsConfig {
  if (!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))) throw Error('invalid_restock_config');
  const row=value as Record<string,unknown>;
  if(Object.keys(row).sort().join(',')!=='buttonLabel,enabled,schemaVersion,title'||row.schemaVersion!==1||typeof row.enabled!=='boolean')throw Error('invalid_restock_config');
  for(const [key,maximum] of [['title',80],['buttonLabel',32]] as const){const item=row[key];if(typeof item!=='string'||item!==item.trim()||![...item].length||[...item].length>maximum||CONTROL.test(item))throw Error('invalid_restock_config');}
  return Object.freeze({schemaVersion:1,enabled:row.enabled,title:row.title as string,buttonLabel:row.buttonLabel as string});
}
export function normalizeRestockEmail(value:string):string {
  if(typeof value!=='string'||CONTROL.test(value))throw Error('invalid_restock_email');
  const email=value.trim().toLowerCase();
  if(email.length>254||email.split('@')[0]!.length>64||! /^[A-Za-z0-9!#$%&'*+/=^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/u.test(email))throw Error('invalid_restock_email');
  return email;
}
