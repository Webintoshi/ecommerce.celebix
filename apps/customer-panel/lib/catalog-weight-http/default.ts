import "server-only";
import {randomUUID} from "node:crypto";
import {resolveDefaultServerPanelAccessRuntime} from "../server-panel-access/default.ts";
import {resolveServerCatalogWeightRuntime} from "../server-catalog-weight/runtime.ts";
import {createCatalogWeightHttpHandler} from "./handler.ts";
export const handleCatalogWeightRequest=createCatalogWeightHttpHandler({resolveRuntime:async()=>resolveServerCatalogWeightRuntime(await resolveDefaultServerPanelAccessRuntime()),now:()=>new Date(),requestId:randomUUID});
