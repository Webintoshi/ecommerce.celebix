import "server-only";

import { randomUUID } from "node:crypto";

import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import {
  createPanelActiveStoreHandler,
  createPanelSessionLogoutHandler,
} from "./handler.ts";

export const handleDefaultPanelActiveStore = Object.freeze(createPanelActiveStoreHandler({
  resolveRuntime: resolveDefaultServerPanelAccessRuntime,
  operationId: randomUUID,
  now: () => new Date(),
}));

export const handleDefaultPanelSessionLogout = Object.freeze(createPanelSessionLogoutHandler({
  resolveRuntime: resolveDefaultServerPanelAccessRuntime,
  now: () => new Date(),
}));
