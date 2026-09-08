const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const out = path.resolve('docs/qa/mira-orders-v1');
const id='11111111-1111-4111-8111-111111111111', id2='22222222-2222-4222-8222-222222222222';
const a={id,orderNumber:'SF-20260908-VERY-LONG-CANONICAL-ORDER-000001',source:'storefront',customerName:'Kontrollü QA — Uzun Müşteri İsmi ve Soyadı',customerEmail:'fixture@example.test',currency:'TRY',totalCents:14990,status:'confirmed',paymentStatus:'completed',itemCount:1,createdAt:'2026-09-08T09:30:00.000Z',updatedAt:'2026-09-08T09:30:00.000Z',version:4};
const b={...a,id:id2,orderNumber:'MAN-20260908-000002',customerName:'Kontrollü QA İptal',status:'cancelled',paymentStatus:'pending'};
const detail=o=>({...o,subtotalCents:13990,shippingCents:1000,discountCents:0,shippingAddress:{recipientName:o.customerName,line1:'Kontrollü test adresi',city:'Test',country:'TR'},items:[{id:'33333333-3333-4333-8333-333333333333',position:0,productName:'QA görselsiz ürün',variantName:'Standart / M',sku:'QA-M',unitPriceCents:13990,quantity:1,discountCents:0,lineTotalCents:13990}],events:[],notes:[]});

const test = require('node:test');
const base = process.env.ORDERS_QA_URL || 'http://127.0.0.1:3487';
async function setup(t, mutate, withoutNavigation = false) {
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.setDefaultTimeout(8000);
 page.setDefaultNavigationTimeout(12000);
 if (withoutNavigation) await page.addInitScript(() => Object.defineProperty(window, 'navigation', {value:undefined}));
 await page.route('**/api/orders**',async route=>{
  const u=new URL(route.request().url());
  if (u.pathname.endsWith('/shipping/shipments')) return route.fulfill({json:{shipment:null}});
  if(route.request().method()!=='GET' && mutate) return mutate(route);
  let body=u.pathname==='/api/orders'?{items:[a,b]}:u.pathname.endsWith('/neighbors')?{next:{id:id2,orderNumber:b.orderNumber}}:u.pathname.endsWith('/notifications')?{items:[]}:detail(u.pathname.endsWith(id2)?b:a);
  await route.fulfill({json:body});
 });
 await page.goto(base+'/orders');
 await page.getByRole('link',{name:a.orderNumber,exact:true}).first().click();
 await page.getByRole('textbox',{name:'Yeni dahili not'}).waitFor();
 return page;
}
test('browser Back with stay preserves all unsaved note input', async t=>{
 const page=await setup(t);
 await page.getByRole('textbox',{name:'Yeni dahili not'}).fill('Kaydedilmemiş taslak');
 let prompts=0;
 page.on('dialog',async dialog=>{prompts++;await dialog.dismiss();});
 await page.goBack().catch(()=>{});
 await page.waitForTimeout(350);
 assert.equal(new URL(page.url()).pathname,'/orders/'+id);
 assert.equal(await page.getByRole('textbox',{name:'Yeni dahili not'}).inputValue(),'Kaydedilmemiş taslak');
 assert.equal(prompts,1);
});
test('shipping success only cleans the exact submitted draft', async t=>{
 let release; const pending=new Promise(r=>release=r);
 const page=await setup(t,async route=>{await pending;await route.fulfill({json:{id,status:'confirmed',paymentStatus:'completed',version:5,updatedAt:a.updatedAt,replayed:false}});});
 await page.getByText('Manuel kargo bilgisi',{exact:true}).click();
 const input=page.locator('input[name="line1"]');
 await input.fill('Gönderilen adres');
 const request=page.waitForRequest(r=>r.method()==='PATCH' && r.url().endsWith('/shipping'));
 await input.locator('xpath=ancestor::form').getByRole('button',{name:/Kaydet|Güncelle/i}).click();
 const sent=await request; assert.equal(sent.postDataJSON().shippingAddress.line1,'Gönderilen adres');
 await input.fill('Sonradan yazılan adres'); release();
 await page.getByText('Gönderilen kargo bilgileri kaydedildi. Sonraki düzenlemeleriniz henüz kaydedilmedi.',{exact:true}).waitFor();
 assert.equal(await input.inputValue(),'Sonradan yazılan adres');
 let prompts=0;page.on('dialog',async d=>{prompts++;await d.dismiss();});
 await page.getByRole('link',{name:'Sipariş listesine dön',exact:true}).click();
 assert.equal(prompts,1);assert.equal(await input.inputValue(),'Sonradan yazılan adres');
});
for (const [status,code] of [[409,'version_conflict'],[503,'unavailable']]) test('failed note save retains draft: '+code,async t=>{
 const page=await setup(t,route=>route.fulfill({status,json:{code}}));
 const input=page.getByRole('textbox',{name:'Yeni dahili not'});
 await input.fill('Hata sonrasında korunacak not');
 await page.getByRole('button',{name:'Not ekle',exact:true}).click();
 await page.getByRole('button',{name:'Not ekle',exact:true}).waitFor();
 if (status === 409) await page.getByText('Başka bir güncelleme algılandı; en güncel veriler yeniden yüklendi. Değişiklikleriniz gönderilmedi.',{exact:true}).waitFor();
 assert.equal(await input.inputValue(),'Hata sonrasında korunacak not');
 let prompts=0;page.on('dialog',async d=>{prompts++;await d.dismiss();});
 await page.getByRole('link',{name:'Sipariş listesine dön',exact:true}).click();assert.equal(prompts,1);
});
test('unchanged successful note save clears only its saved input',async t=>{
 const page=await setup(t,route=>route.fulfill({json:{id,status:'confirmed',paymentStatus:'completed',version:5,updatedAt:a.updatedAt,replayed:false}}));
 const input=page.getByRole('textbox',{name:'Yeni dahili not'});await input.fill('Kaydedilecek not');
 await page.getByRole('button',{name:'Not ekle',exact:true}).click();
 await page.getByRole('button',{name:'Not ekle',exact:true}).waitFor();
 assert.equal(await input.inputValue(),'');
 let prompts=0;page.on('dialog',async d=>{prompts++;await d.dismiss();});
 await page.getByRole('link',{name:'Sipariş listesine dön',exact:true}).click();
 await page.waitForURL(base+'/orders');assert.equal(prompts,0);
});
test('successful older note save does not erase edits typed while pending', async t=>{
 let release;
 const pending=new Promise(resolve=>release=resolve);
 const page=await setup(t,async route=>{await pending;await route.fulfill({json:{id,status:'confirmed',paymentStatus:'completed',version:5,updatedAt:a.updatedAt,replayed:false}});});
 const input=page.getByRole('textbox',{name:'Yeni dahili not'});
 await input.fill('Gönderilen taslak');
 const request=page.waitForRequest(r=>r.method()==='POST' && r.url().endsWith('/notes'));
 await page.getByRole('button',{name:'Not ekle',exact:true}).click();
 const sent=await request;
 assert.equal(sent.postDataJSON().body,'Gönderilen taslak');
 await input.fill('İstek sürerken yeni düzenleme');
 release();
 await page.getByRole('button',{name:'Not ekle',exact:true}).waitFor();
 assert.equal(await input.inputValue(),'İstek sürerken yeni düzenleme');
 let prompts=0;page.on('dialog',async d=>{prompts++;await d.dismiss();});
 await page.getByRole('link',{name:'Sipariş listesine dön',exact:true}).click();
 assert.equal(prompts,1);
 assert.equal(await input.inputValue(),'İstek sürerken yeni düzenleme');
});
test('Back then Forward restores draft when navigation cannot be cancelled', async t=>{
 const page=await setup(t,undefined,true);
 const input=page.getByRole('textbox',{name:'Yeni dahili not'});
 await input.fill('Geçmiş gezinmesinde korunacak taslak');
 await page.goBack();
 assert.equal(new URL(page.url()).pathname,'/orders');
 await page.goForward();
 await input.waitFor();
 assert.equal(await input.inputValue(),'Geçmiş gezinmesinde korunacak taslak');
});
test('returning during a pending save cannot submit the same note twice and reconciles completion',async t=>{
 let release;const pending=new Promise(r=>release=r);let mutations=0;
 const page=await setup(t,async route=>{mutations++;await pending;await route.fulfill({json:{id,status:'confirmed',paymentStatus:'completed',version:5,updatedAt:a.updatedAt,replayed:false}});},true);
 const input=page.getByRole('textbox',{name:'Yeni dahili not'});await input.fill('Tek kez kaydedilecek not');
 const sent=page.waitForRequest(r=>r.method()==='POST'&&r.url().endsWith('/notes'));
 await page.getByRole('button',{name:'Not ekle',exact:true}).click();await sent;
 await page.goBack();await page.goForward();await input.waitFor();
 assert.equal(await input.inputValue(),'Tek kez kaydedilecek not');
 assert.equal(await input.locator('xpath=ancestor::form').getByRole('button').isDisabled(),true);
 release();await page.getByRole('button',{name:'Not ekle',exact:true}).waitFor();
 assert.equal(await input.inputValue(),'');assert.equal(mutations,1);
});
