const path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');
const {superviseSeoWorker}=require('./seo-supervisor.cjs');
const appRoot=path.resolve(__dirname,'..');
const next=require.resolve('next/dist/bin/next');
const portFlag=process.argv.findIndex(value=>value==='--port'||value==='-p');
const port=portFlag>=0?process.argv[portFlag+1]:process.env.PORT||'3450';
if(!/^\d{1,5}$/.test(port)||Number(port)<1||Number(port)>65535)throw Error('invalid_port');
const env={...process.env,PORT:port,HOSTNAME:'0.0.0.0'};
let supervisor;
if(env.CELEBIX_SEO_WORKER_ENABLED!=='false'){
  const worker=path.join(__dirname,'deliver-seo-events.mjs');
  const gate=spawnSync(process.execPath,[worker,'--check-runtime'],{cwd:appRoot,env,stdio:'ignore',timeout:10000});
  if(gate.status===0&&!gate.error)supervisor=superviseSeoWorker({spawn:()=>spawn(process.execPath,[worker],{cwd:appRoot,env,stdio:'inherit'})});
  else console.error('seo_worker_readiness_unavailable_degraded');
}
const web=spawn(process.execPath,[next,'start','--port',port],{cwd:appRoot,env,stdio:'inherit'});
let shuttingDown=false;
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{shuttingDown=true;supervisor?.stop(signal);web.kill(signal);});
web.once('error',()=>{supervisor?.stop();process.exitCode=1;});
web.once('exit',(code,signal)=>{supervisor?.stop();if(signal&&!shuttingDown)process.kill(process.pid,signal);else process.exit(code??0);});
