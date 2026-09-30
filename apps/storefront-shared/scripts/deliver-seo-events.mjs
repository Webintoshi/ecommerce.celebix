import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
function wait(milliseconds){return new Promise(resolve=>{const finish=()=>{clearTimeout(timer);for(const signal of ['SIGTERM','SIGINT'])process.removeListener(signal,finish);resolve();};const timer=setTimeout(finish,milliseconds);for(const signal of ['SIGTERM','SIGINT'])process.once(signal,finish);});}
async function main(){
  const {initializeSeoWorker}=require('../.seo-worker/runtime.cjs');
  const runtime=await initializeSeoWorker();
  if(process.argv.includes('--check-runtime')){await runtime.close();return;}
  let stop=false;for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{stop=true;});
  try{while(!stop){const started=Date.now();try{const counts=await runtime.tick();if(counts.claimed||counts.checked||counts.recordingErrors)console.info(JSON.stringify({event:'seo_worker_tick',...counts}));}catch{console.error('seo_worker_tick_failed');}if(stop)break;await wait(Math.max(1000,60000-(Date.now()-started)));}}
  finally{await runtime.close();}
}
main().catch(()=>{console.error('seo_worker_start_failed');process.exitCode=1;});
