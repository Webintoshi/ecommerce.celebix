import "server-only";
import { randomUUID } from "node:crypto";
import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerCatalogAdminRuntime } from "../server-catalog-admin/runtime.ts";
import { createCatalogCollectionsHttpHandlers } from "./handler.ts";
const handlers=createCatalogCollectionsHttpHandlers({resolveRuntime:async()=>resolveServerCatalogAdminRuntime(await resolveDefaultServerPanelAccessRuntime()),now:()=>new Date(),requestId:randomUUID});
type Context=Readonly<{params:Promise<Readonly<{collectionId:string}>>}>;
export const handleCatalogCollectionsList=handlers.list;
export const handleCatalogCollectionSave=handlers.save;
export const handleCatalogCollectionMembers=handlers.members;
export async function handleCatalogCollectionDetail(request:Request,context:Context){return handlers.detail(request,(await context.params).collectionId);}
export async function handleCatalogCollectionArchive(request:Request,context:Context){return handlers.archive(request,(await context.params).collectionId);}
export async function handleCatalogCollectionRestore(request:Request,context:Context){return handlers.restore(request,(await context.params).collectionId);}
