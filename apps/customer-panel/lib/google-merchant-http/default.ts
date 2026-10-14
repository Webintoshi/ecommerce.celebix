import 'server-only';
import {randomUUID} from 'node:crypto';
import {resolveDefaultServerPanelAccessRuntime} from '../server-panel-access/default.ts';
import {resolveServerGoogleMerchantRuntime} from '../server-google-merchant/runtime.ts';
import {createGoogleMerchantHttpHandlers} from './handler.ts';
export const googleMerchantHandlers=createGoogleMerchantHttpHandlers({resolveRuntime:async()=>resolveServerGoogleMerchantRuntime(await resolveDefaultServerPanelAccessRuntime()),now:()=>new Date(),requestId:randomUUID});
