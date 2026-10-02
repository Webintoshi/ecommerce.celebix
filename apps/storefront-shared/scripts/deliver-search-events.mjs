import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
async function main(){
  const {initializeCatalogSearchWorker}=require('../.search-worker/runtime.cjs');
  const runtime=await initializeCatalogSearchWorker();
  if(process.argv.includes('--check-runtime')){await runtime.close();return;}
  let stop=false, wake;
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{stop=true;wake?.();});
  try{
    while(!stop){
      let delay=5000;
      try{const counts=await runtime.tick();if(counts.claimed){console.info(JSON.stringify({event:'catalog_search_worker_tick',...counts}));if(counts.acknowledged)delay=250;}}catch{console.error('catalog_search_worker_tick_failed');}
      if(stop)break;
      await new Promise(resolve=>{const timer=setTimeout(resolve,delay);wake=()=>{clearTimeout(timer);resolve();};});wake=undefined;
    }
  }finally{await runtime.close();}
}
main().catch(()=>{console.error('catalog_search_worker_start_failed');process.exitCode=1;});
