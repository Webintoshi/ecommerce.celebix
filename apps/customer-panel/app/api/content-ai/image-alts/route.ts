import { randomUUID } from 'node:crypto';
import { resolveDefaultServerPanelAccessRuntime } from '../../../../lib/server-panel-access/default.ts';
import { resolveServerToshiImageAltRuntime } from '../../../../lib/server-toshi-image-alts/runtime.ts';
import { createToshiImageAltHttpHandler } from '../../../../lib/toshi-image-alt-http/handler.ts';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const POST = createToshiImageAltHttpHandler({ resolveRuntime: async () => resolveServerToshiImageAltRuntime(await resolveDefaultServerPanelAccessRuntime()), now: () => new Date(), requestId: randomUUID });
