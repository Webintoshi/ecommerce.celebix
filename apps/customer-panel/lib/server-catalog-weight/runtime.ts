import type { CatalogWeightRepository } from "@celebix/saas-data";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

type ApprovedAccess=ServerPanelAccessRuntime&Readonly<{readiness:Readonly<{mode:"approved_staging"}>;panelOrigin:string}>;
export type ServerCatalogWeightRuntime=Readonly<{access:ApprovedAccess;catalogWeight:CatalogWeightRepository}>;
const repositories=new WeakMap<ServerPanelAccessRuntime,CatalogWeightRepository>();
function invalid():never{throw new Error("server_catalog_weight_runtime_invalid");}
function facade(repository:CatalogWeightRepository):CatalogWeightRepository{
  if(!repository||typeof repository.get!=="function"||typeof repository.save!=="function")invalid();
  return Object.freeze({get:repository.get.bind(repository),save:repository.save.bind(repository)});
}
export function registerServerCatalogWeightRepository(access:ServerPanelAccessRuntime,repository:CatalogWeightRepository):void{
  if(!access||access.readiness.mode!=="approved_staging"||access.panelOrigin===null||repositories.has(access))invalid();
  repositories.set(access,facade(repository));
}
export function resolveServerCatalogWeightRuntime(access:ServerPanelAccessRuntime):ServerCatalogWeightRuntime|null{
  if(!access||access.readiness.mode!=="approved_staging"||access.panelOrigin===null)return null;
  const catalogWeight=repositories.get(access);
  return catalogWeight?Object.freeze({access:access as ApprovedAccess,catalogWeight}):null;
}
