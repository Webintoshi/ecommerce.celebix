import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { resolveDefaultServerAdminHostAuthRuntime } from "../server-admin-host-auth/default.ts";
import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import {
  createTenantPanelLogoutCallbackHandler,
  createTenantPanelLogoutHandler,
} from "../tenant-panel-logout.ts";
import {
  createPanelActiveStoreHandler,
  createPanelSessionLogoutHandler,
  createPanelStoreSwitchHandoffHandler,
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

export const handleDefaultPanelStoreSwitch = Object.freeze(createPanelStoreSwitchHandoffHandler({
  resolveRuntime: resolveDefaultServerAdminHostAuthRuntime,
  operationId: randomUUID,
  randomBytes: (size) => new Uint8Array(randomBytes(size)),
  now: () => new Date(),
  maximumBodyBytes: 512,
}));

export const handleDefaultTenantPanelSessionLogout = Object.freeze(createTenantPanelLogoutHandler({
  resolveRuntime: resolveDefaultServerAdminHostAuthRuntime,
  now: () => new Date(),
  randomBytes: (size) => new Uint8Array(randomBytes(size)),
  maximumBodyBytes: 64,
}));

export const handleDefaultTenantPanelLogoutCallback = Object.freeze(createTenantPanelLogoutCallbackHandler({
  resolveRuntime: resolveDefaultServerAdminHostAuthRuntime,
  now: () => new Date(),
}));
