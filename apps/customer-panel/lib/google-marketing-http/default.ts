import 'server-only';
import {randomUUID} from 'node:crypto';
import {resolveDefaultServerPanelAccessRuntime} from '../server-panel-access/default.ts';
import {resolveServerGoogleMarketingRuntime} from '../server-google-marketing/runtime.ts';
import {createGoogleMarketingHttpHandlers} from './handler.ts';
export const googleMarketingHandlers=createGoogleMarketingHttpHandlers({resolveRuntime:async()=>resolveServerGoogleMarketingRuntime(await resolveDefaultServerPanelAccessRuntime()),now:()=>new Date(),requestId:randomUUID});
