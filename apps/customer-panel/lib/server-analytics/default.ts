import "server-only";
import process from "node:process";
import { resolveDefaultCacheRuntime } from "@celebix/saas-cache";
import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { createUmamiClient } from "../umami-provider/client.ts";
import { parseUmamiPrivateApiConfig, UMAMI_PRIVATE_ENVIRONMENT_FIELDS } from "../umami-provider/config.ts";
import { resolveServerAnalyticsRuntime } from "./runtime.ts";
export async function resolveDefaultServerAnalyticsRuntime() {
  try {
    const access = await resolveDefaultServerPanelAccessRuntime();
    const environment = Object.fromEntries(UMAMI_PRIVATE_ENVIRONMENT_FIELDS.map((field) => [field, process.env[field]]));
    let umami = null;
    try {
      const config = await parseUmamiPrivateApiConfig(environment);
      if (config)
        umami = createUmamiClient(config, {
          fetch: (request) => fetch(request),
        });
    } catch {}
    return resolveServerAnalyticsRuntime(
      access,
      umami,
      resolveDefaultCacheRuntime().cache,
    );
  } catch {
    return null;
  }
}
