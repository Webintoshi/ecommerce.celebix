import 'server-only';
import {randomUUID} from 'node:crypto';
import {resolveDefaultServerPanelAccessRuntime} from '../server-panel-access/default.ts';
import {resolveServerLoyaltyRuntime} from '../server-loyalty/runtime.ts';
import {createLoyaltyHttpHandler} from './handler.ts';
export const handleDefaultLoyaltyRequest=createLoyaltyHttpHandler({async resolveRuntime(){return resolveServerLoyaltyRuntime(await resolveDefaultServerPanelAccessRuntime());},now:()=>new Date(),requestId:randomUUID});
