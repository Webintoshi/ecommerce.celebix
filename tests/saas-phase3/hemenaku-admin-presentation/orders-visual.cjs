const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const out = path.resolve('docs/qa/mira-orders-v1');
const id='11111111-1111-4111-8111-111111111111', id2='22222222-2222-4222-8222-222222222222';
const a={id,orderNumber:'SF-20260908-VERY-LONG-CANONICAL-ORDER-000001',source:'storefront',customerName:'Kontrollü QA — Uzun Müşteri İsmi ve Soyadı',customerEmail:'fixture@example.test',currency:'TRY',totalCents:14990,status:'confirmed',paymentStatus:'completed',itemCount:1,createdAt:'2026-09-08T09:30:00.000Z',updatedAt:'2026-09-08T09:30:00.000Z',version:4};
const b={...a,id:id2,orderNumber:'MAN-20260908-000002',customerName:'Kontrollü QA İptal',status:'cancelled',paymentStatus:'pending'};
const detail=o=>({...o,subtotalCents:13990,shippingCents:1000,discountCents:0,shippingAddress:{recipientName:o.customerName,line1:'Kontrollü test adresi',city:'Test',country:'TR'},items:[{id:'33333333-3333-4333-8333-333333333333',position:0,productName:'QA görselsiz ürün',variantName:'Standart / M',sku:'QA-M',unitPriceCents:13990,quantity:1,discountCents:0,lineTotalCents:13990}],events:[],notes:[]});

const base=process.env.ORDERS_QA_URL||'http://127.0.0.1:3487';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);
 const errors=[],bad=[],calls=[];let delayedA=false,releaseA;
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text())});
 page.on('response',r=>{if(r.status()>=400)bad.push([r.status(),r.url()])});
 await page.route('**/api/orders**',async route=>{
  const u=new URL(route.request().url());calls.push(u.pathname+u.search);
  assert.equal(route.request().method(),'GET');
  if(delayedA && u.pathname==='/api/orders/'+id) await new Promise(r=>releaseA=r);
  let body;
  if(u.pathname==='/api/orders'){
   const status=u.searchParams.get('status'),search=u.searchParams.get('search');
   body={items:[a,b].filter(o=>(!status||o.status===status)&&(!search||o.orderNumber.includes(search)))};
  } else if(u.pathname.endsWith('/shipping/shipments'))body={shipment:null};
  else if(u.pathname.endsWith('/neighbors'))body=u.pathname.includes(id2)?{previous:{id,orderNumber:a.orderNumber}}:{next:{id:id2,orderNumber:b.orderNumber}};
  else if(u.pathname.endsWith('/notifications'))body={items:[]};
  else body=detail(u.pathname.endsWith(id2)?b:a);
  await route.fulfill({json:body});
 });
 await page.goto(base+'/orders');await page.getByRole('button',{name:a.orderNumber+' hızlı incele'}).first().waitFor();
 const listCalls=calls.length;assert.equal(calls.filter(c=>/^\/api\/orders\//.test(c)).length,0,'no eager details');
 for(const [w,h] of [[1440,1000],[1024,900],[390,844]]){
  await page.setViewportSize({width:w,height:h});await page.screenshot({path:path.join(out,'orders-list-'+w+'.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
  if (w === 390) assert.ok((await page.getByRole('link',{name:a.orderNumber,exact:true}).locator('visible=true').first().boundingBox()).y < 700,'mobile order is visible without traversing all filters');
  const trigger=page.getByRole('button',{name:a.orderNumber+' hızlı incele'}).locator('visible=true').first();
  await trigger.click();const dialog=page.getByRole('dialog');await dialog.getByText('QA görselsiz ürün',{exact:true}).waitFor();
  await page.screenshot({path:path.join(out,'orders-inspect-'+w+'.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
  for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.equal(await dialog.evaluate(d=>d.contains(document.activeElement)),true);}
  await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);
  assert.equal(await trigger.evaluate(e=>document.activeElement===e),true);
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('combobox',{name:/Ödeme durumu/}).selectOption('completed');
 assert.equal(await page.getByRole('table').locator('tbody tr').count(),1);
 await page.getByRole('combobox',{name:/Ödeme durumu/}).selectOption('all');
 await page.getByRole('combobox',{name:/Teslimat durumu/}).selectOption('not_applicable');
 assert.equal(await page.getByRole('table').locator('tbody tr').count(),1);
 await page.getByRole('combobox',{name:/Teslimat durumu/}).selectOption('all');
 await page.getByText('Sütunlar',{exact:true}).click();await page.getByLabel('Kanal sütununu göster').check();
 assert.equal(await page.getByRole('columnheader',{name:'Kanal',exact:true}).count(),1);
 await page.getByText('Sütunlar',{exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'CSV Dışa Aktar'}).click();
 const file=await download;const stream=await file.createReadStream();let csv='';for await(const chunk of stream)csv+=chunk;
 assert.ok(csv.includes(a.orderNumber));assert.ok(csv.includes('149.90'));
 await page.getByRole('textbox',{name:/Sipariş ara/}).fill('MAN-');
 await page.getByRole('button',{name:'Ara',exact:true}).click();
 await page.getByRole('table').getByRole('link',{name:b.orderNumber,exact:true}).waitFor();
 assert.equal(await page.getByRole('table').locator('tbody tr').count(),1);
 await page.getByRole('textbox',{name:/Sipariş ara/}).fill('');
 await page.getByRole('button',{name:'Ara',exact:true}).click();
 await page.getByRole('table').getByRole('link',{name:a.orderNumber,exact:true}).waitFor();
 await page.getByRole('combobox',{name:/Sıralama/}).selectOption('highest');
 await page.getByRole('table').getByRole('link',{name:a.orderNumber,exact:true}).waitFor();
 assert.ok(calls.some(c=>c.includes('sort=highest')));
 // A is deliberately delayed; the selected B must survive A's late completion.
 delayedA=true;
 await page.getByRole('button',{name:a.orderNumber+' hızlı incele'}).first().click();
 await page.getByRole('button',{name:'Sonraki siparişi incele'}).click();
 await page.getByRole('dialog').getByRole('heading',{level:1}).filter({hasText:b.orderNumber}).waitFor();
 if(releaseA)releaseA();delayedA=false;
 await page.waitForTimeout(150);
 assert.equal(await page.getByRole('dialog').locator('h1').textContent(),'#'+b.orderNumber);
 await page.keyboard.press('Escape');
 assert.equal(await page.getByRole('combobox',{name:/Sıralama/}).inputValue(),'highest');
 await page.goto(base+'/orders/'+id);
 await page.getByText('QA görselsiz ürün',{exact:true}).waitFor();
 for(const [w,h] of [[1440,1000],[1024,900],[390,844]]){
  await page.setViewportSize({width:w,height:h});
  await page.screenshot({path:path.join(out,'order-detail-'+w+'.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('link',{name:'Yazdır',exact:true}).click();
 await page.waitForURL('**/print');
 await page.getByText('QA görselsiz ürün',{exact:true}).waitFor();assert.ok(page.url().endsWith('/print'));
 await page.goBack();await page.getByText('QA görselsiz ürün',{exact:true}).waitFor();
 await page.getByRole('link',{name:'Sonraki',exact:true}).click();
 await page.getByRole('heading',{level:1}).filter({hasText:b.orderNumber}).waitFor();
 assert.equal(await page.getByRole('option',{name:'Hazırlanıyor',exact:true}).count(),0);
 await page.getByRole('link',{name:'Önceki',exact:true}).click();
 await page.getByRole('heading',{level:1}).filter({hasText:a.orderNumber}).waitFor();
 assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
 console.log(JSON.stringify({fixtureOnly:true,viewports:3,screenshots:9,overflow:0,console:errors,unexpectedResponses:bad,calls},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
