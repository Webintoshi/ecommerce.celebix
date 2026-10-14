import assert from 'node:assert/strict';
import test from 'node:test';
import {EventEmitter} from 'node:events';
import {request as httpsRequest,type RequestOptions} from 'node:https';
import {createMerchantHomepageRedirectProof} from './redirect-proof.ts';

function fixture(status=301,location='https://store.example.com/',addresses=[{address:'8.8.8.8',family:4}]){
 let requests=0,options:RequestOptions|undefined;
 const request=((url:URL,opts:RequestOptions,callback:(res:EventEmitter&{statusCode:number;headers:{location:string};destroy():void})=>void)=>{
  requests++;options=opts;assert.equal(url.href,'https://www.store.example.com/');
  const req=new EventEmitter()as EventEmitter&{end():void;destroy(error?:Error):void};
  req.end=()=>{callback(Object.assign(new EventEmitter(),{statusCode:status,headers:{location},destroy(){}}));};
  req.destroy=error=>{if(error)req.emit('error',error);req.emit('close');};
  return req;
 })as unknown as typeof httpsRequest;
 return {proof:createMerchantHomepageRedirectProof({lookup:async()=>addresses,request}),requests:()=>requests,options:()=>options};
}

test('homepage redirect proof pins public DNS and requires TLS with no credentials or redirect following',async()=>{
 for(const status of [301,308]){
  const f=fixture(status);assert.equal(await f.proof(new URL('https://www.store.example.com'),'store.example.com'),true);
  const options=f.options()!;assert.equal(options.method,'HEAD');assert.equal(options.rejectUnauthorized,true);assert.equal(options.servername,'www.store.example.com');assert.equal(options.agent,false);
  assert.equal(options.headers&&'authorization' in options.headers,false);
  (options.lookup as Function)('www.store.example.com',{},(error:Error|null,address:string,family:number)=>{assert.equal(error,null);assert.equal(address,'8.8.8.8');assert.equal(family,4);});
  assert.equal(f.requests(),1);
 }
});

test('homepage proof refuses private or mixed DNS before any connection',async()=>{
 for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','100.64.0.1','192.168.1.1','203.0.113.1','::1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::1','::ffff:127.0.0.1']){
  const f=fixture(301,'https://store.example.com/',[{address:'8.8.8.8',family:4},{address,family:address.includes(':')?6:4}]);
  assert.equal(await f.proof(new URL('https://www.store.example.com/'),'store.example.com'),false,address);assert.equal(f.requests(),0);
 }
 const wrongFamily=fixture(301,'https://store.example.com/',[{address:'8.8.8.8',family:6}]);
 assert.equal(await wrongFamily.proof(new URL('https://www.store.example.com/'),'store.example.com'),false);assert.equal(wrongFamily.requests(),0);
});

test('homepage proof rejects temporary redirects chains different hosts and unsafe locations',async()=>{
 for(const [status,location]of [[200,'https://store.example.com/'],[302,'https://store.example.com/'],[307,'https://store.example.com/'],[301,'https://other.example.com/'],[301,'http://store.example.com/'],[301,'https://user@store.example.com/'],[301,'https://store.example.com/path'],[301,'https://store.example.com/?x=1'],[301,'https://store.example.com/#x'],[301,'https://store.example.com:444/'],[301,'https://www.store.example.com/']]as const){
  const f=fixture(status,location);assert.equal(await f.proof(new URL('https://www.store.example.com/'),'store.example.com'),false);assert.equal(f.requests(),1);
 }
 for(const url of ['https://foreign.example.com/','https://www.www.store.example.com/','https://www.store.example.com/path','http://www.store.example.com/']){
  const f=fixture();assert.equal(await f.proof(new URL(url),'store.example.com'),false);assert.equal(f.requests(),0);
 }
});

test('unresponsive DNS fails closed within the shared five second deadline',async()=>{
 const proof=createMerchantHomepageRedirectProof({lookup:()=>new Promise(()=>undefined),request:()=>assert.fail('unresolved DNS must not connect')});
 const started=Date.now();assert.equal(await proof(new URL('https://www.store.example.com/'),'store.example.com'),false);
 assert.ok(Date.now()-started<6000);
});
