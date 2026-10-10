import 'server-only';
import {randomUUID} from 'node:crypto';
import {resolveDefaultServerPanelAccessRuntime} from '../server-panel-access/default.ts';
import {resolveServerLuckyWheelRuntime} from '../server-lucky-wheel/runtime.ts';
import {createLuckyWheelHandlers} from './handler.ts';
export const luckyWheelHandlers=createLuckyWheelHandlers({resolveRuntime:async()=>resolveServerLuckyWheelRuntime(await resolveDefaultServerPanelAccessRuntime()),now:()=>new Date(),requestId:randomUUID});
