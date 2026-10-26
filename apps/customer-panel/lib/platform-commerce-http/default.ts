import 'server-only';
import {randomUUID} from 'node:crypto';
import {resolveDefaultServerPanelAccessRuntime} from '../server-panel-access/default.ts';
import {resolveServerPlatformCommerceRuntime} from '../server-platform-commerce/runtime.ts';
import {createPlatformCheckoutHttpHandler} from './handler.ts';
export const handleDefaultPlatformCheckout=createPlatformCheckoutHttpHandler({resolveRuntime:async()=>resolveServerPlatformCommerceRuntime(await resolveDefaultServerPanelAccessRuntime()),now:()=>new Date(),requestId:randomUUID,enabled:()=>process.env.CELEBIX_PLATFORM_COMMERCE_ENABLED==='true'});
