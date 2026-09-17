// Production client components in an isolated in-memory browser bundle. No live network.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
const require=createRequire(import.meta.url), root=path.resolve(import.meta.dirname,'../../..'), panel=path.join(root,'apps/customer-panel');
const {chromium}=require(process.env.INVITATION_PLAYWRIGHT_MODULE??'playwright');
const modules=[], ids=new Map(); let css='';
function bundle(file) {
  if(ids.has(file)) return ids.get(file);
  const id=modules.length;ids.set(file,id);modules.push('');
  let source;
  if(file==='shell') source=`const React=require('react'); exports.PanelPageShell=({children})=>React.createElement('main',null,children); exports.PanelPageHeader=({title,description})=>React.createElement('header',null,React.createElement('h1',null,title),React.createElement('p',null,description));`;
  else if(file==='navigation') source=`exports.useRouter=()=>({push:()=>{},refresh:()=>{}});`;
  else if(file.endsWith('.css')) { const raw=readFileSync(file,'utf8');css+=raw;source=`module.exports=${JSON.stringify(Object.fromEntries([...raw.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map(x=>[x[1],x[1]])))}`; }
  else { const raw=readFileSync(file,'utf8');source=/\.tsx?$/.test(file)?ts.transpileModule(raw,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText:raw; }
  source=source.replace(/process\.env\.NODE_ENV/g,'"production"').replace(/require\(["']([^"']+)["']\)/g,(_,specifier)=>{
    let next;
    if(specifier==='@/components/panel/PanelPageShell') next='shell';
    else if(specifier==='next/navigation') next='navigation';
    else if(specifier.startsWith('@/')) next=path.join(panel,specifier.slice(2));
    else if(specifier.startsWith('.')) next=path.resolve(path.dirname(file),specifier);
    else next=createRequire(file==='shell'||file==='navigation'?path.join(panel,'package.json'):file).resolve(specifier);
    if(!['shell','navigation'].includes(next)&&!existsSync(next)) next=['.ts','.tsx','.js'].map(s=>next+s).find(existsSync)??next;
    return `require(${bundle(next)})`;
  });
  modules[id]=`function(require,module,exports){${source}\n}`;return id;
}
const React=bundle(require.resolve('react')), Client=bundle(require.resolve('react-dom/client'));
const Console=bundle(path.join(panel,'components/store-admin-invitations/StoreAdminInvitationsConsole.tsx'));
const Source=bundle(path.join(panel,'components/store-admin-invitations/StoreAdminInvitationSource.tsx'));
const script=`const modules=[${modules.join(',')}],cache={};function require(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](require,m,m.exports);return m.exports;}const React=require(${React});const query=new URLSearchParams(location.search);require(${Client}).createRoot(document.getElementById('root')).render(React.createElement(query.has('source')?require(${Source}).StoreAdminInvitationSource:require(${Console}).StoreAdminInvitationsConsole,{canManage:!query.has('admin'),...(query.get('source')==='edit'?{recordId:'10000000-0000-4000-8000-000000000001'}:{})}));`;
const browser=await chromium.launch({executablePath:process.env.INVITATION_CHROME_EXECUTABLE,headless:true});
const id='10000000-0000-4000-8000-000000000001', origin='https://invitations.example.test', now=new Date().toISOString(), expiry=new Date(Date.now()+86400000).toISOString();
const record={id,kind:'administrator_invite',name:'Test Recipient',config:{email:'recipient@example.test',role:'admin',expiresAt:expiry},status:'active',version:1,createdAt:now,updatedAt:now};
const item={id,sourceRecordId:id,email:'recipient@example.test',displayName:'Test Recipient',role:'admin',status:'pending',deliveryStatus:'queued',expiresAt:expiry,createdAt:now,updatedAt:now,version:1,generation:1};
const evidence=[];
try {
  for(const width of [1280,390,320]) {
    const context=await browser.newContext({viewport:{width,height:800}}), errors=[],mutations=[],saves=[];
    let mode='unsent', failOnce=true;
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url()); if(url.origin!==origin){errors.push('unexpected network');return route.abort();}
      const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
      if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invitation management fixture</title><style>body{margin:0;font:16px system-ui;background:#f7faf7}${css}</style><div id="root"></div><script>${script.replaceAll('</script','<\/script')}</script></html>`});
      if(url.pathname==='/api/merchant-admin/records/administrator_invite'&&req.method()==='GET')return json({items:[record]});
      if(url.pathname.endsWith(`/administrator_invite/${id}`))return json(record);
      if(url.pathname==='/api/merchant-admin/records/administrator_invite'&&req.method()==='POST'){saves.push({body:req.postDataJSON(),key:req.headers()['idempotency-key']});if(saves.length===2)return route.abort('failed');return json({code:'version_conflict'},409);}
      if(url.pathname==='/api/store-admin-invitations'){if(mode==='unknown')return json({code:'unavailable'},503);return json({schemaVersion:4,kind:'invitation_listed',items:mode==='converted'?[item]:[],hasMore:false});}
      if(url.pathname==='/api/store-admin-invitations/send'){mutations.push(req.postDataJSON());assert.equal(req.headers()['x-invitation-csrf'],'1');if(failOnce){failOnce=false;return route.abort('failed');}mode='converted';return json({schemaVersion:4,kind:'invitation_mutated',item,replayed:true});}
      if(url.pathname==='/favicon.ico')return route.fulfill({status:204});
      errors.push(`unexpected path ${url.pathname}`);return route.abort();
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);assert.equal(await page.title(),'Invitation management fixture');await page.getByText('Henüz gönderilmedi').waitFor();
    assert.equal(mutations.length,0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.getByRole('button',{name:'Gönder',exact:true}).focus();assert.equal(await page.getByRole('button',{name:'Gönder',exact:true}).evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Enter');
    await page.getByText('İşlem sonucu belirsiz. Aynı işlemi tekrar kontrol edin.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Aynı işlemi tekrar kontrol et'}).click();await page.getByText('Kabul bekliyor').waitFor();assert.equal(mutations.length,2);assert.deepEqual(mutations[0],mutations[1]);assert.equal(saves.length,0);
    await page.screenshot({path:`/tmp/celebix-invitations-management-${width}.png`});
    mode='unknown';await page.reload();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('button',{name:'Gönder',exact:true}).count(),0);assert.equal(await page.getByText('Henüz gönderilmedi').count(),0);
    mode='converted';await page.goto(`${origin}/?source=edit`);await page.getByText('Gönderilmiş davetin kişi, rol ve bitiş bilgileri değiştirilemez.').waitFor();assert.equal(await page.locator('form').count(),0);
    await page.goto(`${origin}/?source=new`);await page.getByRole('button',{name:'Kaydet (göndermez)'}).waitFor();await page.locator('[name=name]').fill('Preserved Recipient');await page.locator('[name=email]').fill('recipient@example.test');await page.locator('[name=role]').selectOption('admin');await page.locator('[name=expiresAt]').fill('2026-12-01T12:00');assert.equal(await page.locator('[name=role] option[value=store_owner]').count(),0);
    await page.getByRole('button',{name:'Kaydet (göndermez)'}).click();await page.getByRole('alert').waitFor();assert.equal(await page.locator('[name=name]').inputValue(),'Preserved Recipient');assert.equal(await page.locator('[name=email]').inputValue(),'recipient@example.test');assert.equal(saves.length,1);assert.equal(mutations.length,2);
    await page.getByRole('button',{name:'Kaydet (göndermez)'}).click();await page.getByRole('button',{name:'Aynı kaydı tekrar kontrol et'}).waitFor();assert.equal(await page.locator('[name=email]').isDisabled(),true);await page.getByRole('button',{name:'Aynı kaydı tekrar kontrol et'}).click();await page.getByRole('button',{name:'Kaydet (göndermez)'}).waitFor();assert.equal(saves.length,3);assert.deepEqual(saves[1],saves[2]);assert.equal(mutations.length,2);
    await page.goto(`${origin}/?admin`);await page.getByRole('alert').waitFor();assert.equal(await page.locator('button,table').count(),0);assert.deepEqual(errors,[]);
    evidence.push({width,stableRetry:true,stableSourceSaveRetry:true,unknownNotUnsent:true,readonlyConverted:true,saveOnly:true,inputPreserved:true,keyboard:true,overflow:false,pageErrors:errors});await context.close();
  }
  console.log(JSON.stringify({fixtureOnly:true,network:'fully intercepted',shell:'minimal fixture shell; real invitation console/source/editor/client',evidence},null,2));
} finally {await browser.close();}
