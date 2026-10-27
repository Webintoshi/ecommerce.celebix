import{randomUUID}from'node:crypto';
import{resolveDefaultServerMediaRuntime}from'../../../../../../lib/server-media/default.ts';
import{createToshiImageSourceHttpHandler}from'../../../../../../lib/toshi-image-source-http/handler.ts';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=15;
export const GET=createToshiImageSourceHttpHandler({resolveRuntime:resolveDefaultServerMediaRuntime,now:()=>new Date(),requestId:randomUUID});
