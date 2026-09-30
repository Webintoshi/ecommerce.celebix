function superviseSeoWorker({spawn,schedule=setTimeout,cancel=clearTimeout,log=console.error}){
  let child,timer,stopped=false,failures=0;
  function start(){
    if(stopped)return;timer=undefined;let settled=false;
    const failed=()=>{if(settled)return;settled=true;child=undefined;if(stopped)return;log('seo_worker_degraded');timer=schedule(start,Math.min(30000,1000*2**Math.min(5,failures++)));};
    try{child=spawn();child.once('error',failed);child.once('exit',failed);}catch{failed();}
  }
  start();
  return {stop(signal='SIGTERM'){stopped=true;if(timer!==undefined)cancel(timer);timer=undefined;child?.kill(signal);}};
}
module.exports={superviseSeoWorker};
