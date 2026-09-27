function superviseOnboardingWorker({spawn,schedule=setTimeout,cancel=clearTimeout,log=console.error}) {
 let child,timer,stopped=false,failures=0;
 function retry(){if(stopped)return;log('onboarding_worker_degraded');timer=schedule(start,Math.min(30000,1000*2**Math.min(5,failures++)));}
 function start(){
  if(stopped)return;timer=undefined;let settled=false;
  const terminated=()=>{if(settled)return;settled=true;child=undefined;retry();};
  try{child=spawn();child.once('error',terminated);child.once('exit',terminated);}catch{terminated();}
 }
 start();
 return {stop(signal='SIGTERM'){stopped=true;if(timer!==undefined)cancel(timer);timer=undefined;child?.kill(signal);}};
}
module.exports={superviseOnboardingWorker};
