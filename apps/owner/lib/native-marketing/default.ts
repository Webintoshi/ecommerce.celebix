import { parseNativeMarketingConfig, resolveNativeMarketingWorkerMode } from "./config.ts";
import { initializeNativeMarketingProductionRuntime } from "./production.ts";
export async function startDefaultNativeMarketingProductionWorker(): Promise<Readonly<{ stop(): Promise<void> }>> {
  if(resolveNativeMarketingWorkerMode(process.env)==="disabled")return Object.freeze({async stop(){}});
  const runtime=await initializeNativeMarketingProductionRuntime(parseNativeMarketingConfig(process.env));
  let stopped=false,timer:ReturnType<typeof setTimeout>|undefined,active:Promise<void>|undefined;
  const run=async()=>{try{await runtime.runOnce();}catch{console.error("native_marketing_worker_run_failed");}if(!stopped)timer=setTimeout(()=>{active=run();},5_000);};
  active=run();
  return Object.freeze({async stop(){stopped=true;if(timer)clearTimeout(timer);await active;await runtime.close();}});
}
