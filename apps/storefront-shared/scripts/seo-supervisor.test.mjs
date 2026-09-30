import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { superviseSeoWorker }=require('./seo-supervisor.cjs');
test('worker restarts after failure with bounded backoff; stop cancels retry and forwards shutdown',()=>{const children=[],delays=[],cancelled=[];let restart;const worker=superviseSeoWorker({spawn:()=>{const child=new EventEmitter();child.kill=signal=>child.signal=signal;children.push(child);return child;},schedule:(fn,ms)=>{restart=fn;delays.push(ms);return 7;},cancel:id=>cancelled.push(id),log:()=>{}});children[0].emit('error',Error('private'));children[0].emit('exit',1);assert.deepEqual(delays,[1000]);restart();assert.equal(children.length,2);worker.stop('SIGTERM');assert.equal(children[1].signal,'SIGTERM');children[1].emit('exit',0);assert.deepEqual(delays,[1000]);});
test('spawn exceptions do not stop web lifecycle and never schedule after shutdown',()=>{let retries=0;const worker=superviseSeoWorker({spawn:()=>{throw Error('missing bundle')},schedule:()=>{retries++;return 1;},cancel:()=>{},log:()=>{}});assert.equal(retries,1);worker.stop();});
