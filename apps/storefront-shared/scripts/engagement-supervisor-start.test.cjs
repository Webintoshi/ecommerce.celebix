const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
function fixture(configured) {
 const children=[];
 const proc=new EventEmitter(); Object.assign(proc,{argv:['node','start-production.cjs'],execPath:process.execPath,env:{CELEBIX_SEO_WORKER_ENABLED:'false',...(configured?{CELEBIX_STOREFRONT_ACCOUNT_EMAIL_MODE:'platform_resend',CELEBIX_STOREFRONT_ACCOUNT_RESEND_API_KEY:'re_test'}:{})},exit(){},kill(){},pid:1000});
 const load=name=>name==='node:child_process'?{spawn:(_,args)=>{const child=new EventEmitter();child.signals=[];child.kill=s=>child.signals.push(s);children.push({args,child});return child;},spawnSync:()=>({status:0})}:require(name);
 load.resolve=()=>'/next/bin/next';
 vm.runInNewContext(readFileSync(path.join(__dirname,'start-production.cjs'),'utf8'),{require:load,__dirname,process:proc,console:{error(){}}});
 return {children,proc};
}
test('existing platform email configuration automatically starts shared engagement worker and stops on SIGTERM',()=>{
 const {children,proc}=fixture(true); const worker=children.find(e=>e.args.some(a=>a.endsWith('deliver-engagement-events.mjs')));
 proc.emit('SIGTERM'); for(const e of children)e.child.emit('exit',0);
 assert.ok(worker); assert.deepEqual(worker.child.signals,['SIGTERM']);
});
test('unconfigured deployments do not create an engagement child',()=>{
 const {children,proc}=fixture(false); proc.emit('SIGTERM'); for(const e of children)e.child.emit('exit',0);
 assert.ok(!children.some(e=>e.args.some(a=>a.endsWith('deliver-engagement-events.mjs'))));
});
