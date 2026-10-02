const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
test('production automatically starts the shared search worker and stops it on shutdown', () => {
  const children=[];
  const fixture=new EventEmitter(); Object.assign(fixture,{argv:['node','start-production.cjs'],execPath:process.execPath,env:{CELEBIX_SEO_WORKER_ENABLED:'false',CELEBIX_SEARCH_WORKER_ENABLED:'true'},exit:()=>{},kill:()=>{},pid:1000});
  const load=name=>name==='node:child_process'?{spawn:(_,args)=>{const child=new EventEmitter();child.signals=[];child.kill=signal=>child.signals.push(signal);children.push({args,child});return child;},spawnSync:()=>({status:0})}:require(name);
  load.resolve=()=>'/next/bin/next';
  vm.runInNewContext(readFileSync(path.join(__dirname,'start-production.cjs'),'utf8'),{require:load,__dirname,process:fixture,console:{error:()=>{}}});
  const worker=children.find(entry=>entry.args.some(value=>value.endsWith('deliver-search-events.mjs')));
  fixture.emit('SIGTERM');for(const entry of children)entry.child.emit('exit',0);
  assert.ok(worker,'enabled shared deployments must automatically launch search synchronization');
  assert.deepEqual(worker.child.signals,['SIGTERM']);
});
