import test from 'node:test';
import assert from 'node:assert/strict';
import * as route from './route.ts';

test('registered callback rejects an invitation state without configured, bound invitation transport',async()=>{
 const response=await route.GET(new Request('https://panel.celebix.site/auth/callback?state=inv_'+ 'a'.repeat(43)+'&code=code',{headers:{host:'panel.celebix.site'}}));
 assert.equal(response.status,403);assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('normal GET and POST callback mounts retain the existing disabled-mode gate',async()=>{
 for(const [method,handler] of [['GET',route.GET],['POST',route.POST]] as const){
  const response=await handler(new Request('https://panel.celebix.site/auth/callback?state=normal_state&code=code',{method,headers:{host:'panel.celebix.site'}}));
  assert.equal(response.status,method==='GET'?503:405);assert.equal(response.headers.has('set-cookie'),false);assert.equal(response.headers.has('location'),false);
 }
});
