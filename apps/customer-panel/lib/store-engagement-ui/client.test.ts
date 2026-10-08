import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultStoreEngagementConfig } from '@celebix/saas-contracts';
import { createStoreEngagementApi } from './client.ts';
const id = '00000000-0000-4000-8000-000000000001', key = '00000000-0000-4000-8000-000000000002';
const input = {
    kind: 'popup' as const, name: 'Karşılama', enabled: true, config: createDefaultStoreEngagementConfig()
};
const campaign = {
    ...input, id, version: 1, updatedAt: '2026-10-04T10:00:00.000Z'
};
function memory() {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => {
            values.set(key, value);
        }, removeItem: (key: string) => {
            values.delete(key);
        }, values
    };
}
test('Uygula sends one canonical campaign and verifies the committed result', async () => {
    const requests: RequestInit[] = [];
    const client = createStoreEngagementApi({
        randomUUID: () => key, fetch: async (_url, init) => {
            requests.push(init!);
            return Response.json({
                campaign
            });
        }
    });
    assert.deepEqual(await client.save(input), campaign);
    assert.equal(requests.length, 1);
    assert.deepEqual(JSON.parse(requests[0]!.body as string), input);
    assert.equal(requests[0]!.credentials, 'same-origin');
    assert.equal(new Headers(requests[0]!.headers).get('idempotency-key'), key);
});
test('lost response restores the public campaign intent after reload with the same key; changed intent cannot write', async () => {
    const storage = memory();
    const bodies: string[] = [];
    const keys: string[] = [];
    const first = createStoreEngagementApi({
        scope: 'guzide', storage, randomUUID: () => key, fetch: async (_url, init) => {
            bodies.push(init!.body as string);
            keys.push(new Headers(init!.headers).get('idempotency-key')!);
            throw Error('lost');
        }
    });
    await assert.rejects(first.save(input), /tamamlanamadı/);
    const persisted = [...storage.values.values()].join('');
    assert.ok(persisted.includes(key));
    assert.ok(persisted.includes(input.name));
    const reloaded = createStoreEngagementApi({
        scope: 'guzide', storage, randomUUID: () => id, fetch: async (_url, init) => {
            bodies.push(init!.body as string);
            keys.push(new Headers(init!.headers).get('idempotency-key')!);
            return Response.json({
                campaign
            });
        }
    });
    await assert.rejects(reloaded.save({
        ...input, name: 'Başka'
    }), /Önceki/);
    assert.equal(bodies.length, 1);
    const restored=await reloaded.pendingIntent();assert.deepEqual(restored,input);
    assert.deepEqual(await reloaded.save(restored!), campaign);
    assert.equal(bodies[0], bodies[1]);
    assert.deepEqual(keys, [key, key]);
    assert.equal(storage.values.size, 0);
});

test('restored intent preserves original CAS and rejects a tampered payload before any write',async()=>{
 const storage=memory(),old={...input,campaignId:id,expectedVersion:6};
 const first=createStoreEngagementApi({scope:'guzide',storage,randomUUID:()=>key,fetch:async()=>{throw Error('lost');}});await assert.rejects(first.save(old));
 const reloaded=createStoreEngagementApi({scope:'guzide',storage});assert.deepEqual(await reloaded.pendingIntent(),old);
 const [storageKey,raw]=[...storage.values.entries()][0]!;const bad=JSON.parse(raw);bad.intent.expectedVersion=7;storage.setItem(storageKey,JSON.stringify(bad));let writes=0;
 const tampered=createStoreEngagementApi({scope:'guzide',storage,fetch:async()=>{writes++;return Response.json({campaign});}});await assert.rejects(tampered.pendingIntent());await assert.rejects(tampered.save(old));assert.equal(writes,0);assert.equal(storage.values.size,1);
});
test('malformed or unrelated success remains unresolved; GET never clears the fence', async () => {
    const storage = memory();
    const client = createStoreEngagementApi({
        scope: 'guzide', storage, randomUUID: () => key, fetch: async (_url, init) => init?.method === 'POST' ? Response.json({
            campaign: {
                ...campaign, name: 'Başka'
            }
        }) : Response.json({
            campaigns: [campaign]
        })
    });
    await assert.rejects(client.save(input));
    assert.deepEqual(await client.list(), [campaign]);
    assert.equal(client.hasUnresolved(), true);
    await assert.rejects(client.save({
        ...input, enabled: false
    }), /Önceki/);
});
test('storage failure blocks before dispatch and tenant namespaces stay separate', async () => {
    let calls = 0;
    const client = createStoreEngagementApi({
        scope: 'guzide', randomUUID: () => key, storage: {
            getItem: () => null, setItem: () => {
                throw Error('quota');
            }, removeItem: () => {
            }
        }, fetch: async () => {
            calls++;
            return Response.json({
                campaign
            });
        }
    });
    await assert.rejects(client.save(input));
    assert.equal(calls, 0);
    const storage = memory();
    const other = createStoreEngagementApi({
        scope: 'other-store', storage, randomUUID: () => key, fetch: async () => Response.json({
            campaign
        })
    });
    await other.save(input);
    assert.equal(other.hasUnresolved(), false);
});
test('list rejects duplicate campaigns and more than one cart capture singleton', async () => {
    const client = createStoreEngagementApi({
        fetch: async () => Response.json({
            campaigns: [campaign, campaign]
        })
    });
    await assert.rejects(client.list());
    const singleton = createStoreEngagementApi({
        fetch: async () => Response.json({
            campaigns: [{
                    ...campaign, kind: 'cart_capture'
                }, {
                    ...campaign, id: key, kind: 'cart_capture'
                }]
        })
    });
    await assert.rejects(singleton.list());
});

test('definitive native coupon rejection releases retry fence and reports an actionable error',async()=>{
 const keys:string[]=[];let attempts=0;const client=createStoreEngagementApi({randomUUID:()=>attempts? id:key,fetch:async(_url,init)=>{keys.push(new Headers(init!.headers).get('idempotency-key')!);return ++attempts===1?Response.json({code:'promotion_unavailable'},{status:409}):Response.json({campaign:{...campaign,enabled:false}});}});
 await assert.rejects(client.save(input),/kupon/);assert.equal(client.hasUnresolved(),false);await client.save({...input,enabled:false});assert.deepEqual(keys,[key,id]);
});

test('popup deletion persists exact CAS across lost response and reload, blocks saves and reuses one operation key', async () => {
    const storage = memory(), requests: {url:string;body:string;key:string}[] = [];
    const deletion = {campaignId:id,expectedVersion:4};
    const first = createStoreEngagementApi({scope:'guzide',storage,randomUUID:()=>key,fetch:async(url,init)=>{
        requests.push({url:String(url),body:init!.body as string,key:new Headers(init!.headers).get('idempotency-key')!});
        throw Error('lost response');
    }});
    await assert.rejects(first.deletePopup(deletion));
    const second=createStoreEngagementApi({scope:'guzide',storage,randomUUID:()=>id,fetch:async(url,init)=>{
        requests.push({url:String(url),body:init!.body as string,key:new Headers(init!.headers).get('idempotency-key')!});
        return Response.json({deletion:{campaignId:id,deleted:true}});
    }});
    assert.deepEqual(await second.pendingDeletion(),deletion);
    assert.equal(await second.pendingIntent(),null);
    await assert.rejects(second.save(input),/Önceki/);
    await assert.rejects(second.deletePopup({...deletion,expectedVersion:5}),/Önceki/);
    assert.equal(requests.length,1);
    assert.deepEqual(await second.deletePopup(deletion),{campaignId:id,deleted:true});
    assert.deepEqual(requests,[{url:'/api/store-engagement/campaigns/delete',body:JSON.stringify(deletion),key},{url:'/api/store-engagement/campaigns/delete',body:JSON.stringify(deletion),key}]);
    assert.equal(storage.values.size,0);
    assert.equal(second.hasUnresolved(),false);
});
test('delete cannot replace old unresolved save and wrong delete receipt never unlocks mutations',async()=>{
    const storage=memory();let calls=0;
    const old=createStoreEngagementApi({scope:'guzide',storage,randomUUID:()=>key,fetch:async()=>{calls++;throw Error('lost');}});
    await assert.rejects(old.save(input));
    const restored=createStoreEngagementApi({scope:'guzide',storage,fetch:async()=>{calls++;return Response.json({deletion:{campaignId:id,deleted:true}});}});
    await assert.rejects(restored.deletePopup({campaignId:id,expectedVersion:1}),/Önceki/);
    assert.deepEqual(await restored.pendingIntent(),input);assert.equal(await restored.pendingDeletion(),null);assert.equal(calls,1);
    const malformed=createStoreEngagementApi({randomUUID:()=>key,fetch:async()=>Response.json({deletion:{campaignId:key,deleted:true}})});
    await assert.rejects(malformed.deletePopup({campaignId:id,expectedVersion:1}));
    assert.equal(malformed.hasUnresolved(),true);
});
test('definitive delete conflict releases original fence and storage failure prevents dispatch',async()=>{
    const deletion={campaignId:id,expectedVersion:4};
    const conflict=createStoreEngagementApi({randomUUID:()=>key,fetch:async()=>Response.json({code:'version_conflict'},{status:409})});
    await assert.rejects(conflict.deletePopup(deletion),/başka bir oturumda/);assert.equal(conflict.hasUnresolved(),false);
    let calls=0;
    const broken=createStoreEngagementApi({scope:'guzide',randomUUID:()=>key,storage:{getItem:()=>null,setItem:()=>{throw Error('quota');},removeItem:()=>{}},fetch:async()=>{calls++;return Response.json({deletion:{campaignId:id,deleted:true}});}});
    await assert.rejects(broken.deletePopup(deletion));assert.equal(calls,0);
});
test('delete blocks duplicate dispatch while pending and rejects malformed or forged intent',async()=>{
    let finish!:()=>void,calls=0;
    const client=createStoreEngagementApi({randomUUID:()=>key,fetch:async()=>{calls++;await new Promise<void>(resolve=>{finish=resolve;});return Response.json({deletion:{campaignId:id,deleted:true}});}});
    const active=client.deletePopup({campaignId:id,expectedVersion:1});
    while(!finish)await new Promise(resolve=>setTimeout(resolve,0));
    await assert.rejects(client.deletePopup({campaignId:id,expectedVersion:1}),/Önceki/);
    finish();await active;assert.equal(calls,1);
    for(const intent of [{campaignId:id,expectedVersion:0},{campaignId:id,expectedVersion:1,storeId:id},{campaignId:'bad',expectedVersion:1}])await assert.rejects(client.deletePopup(intent as never));
    assert.equal(calls,1);
});

test('tampered deletion recovery fails closed and another store cannot read or clear it',async()=>{
 const storage=memory(),deletion={campaignId:id,expectedVersion:4};
 const first=createStoreEngagementApi({scope:'guzide',storage,randomUUID:()=>key,fetch:async()=>{throw Error('lost');}});
 await assert.rejects(first.deletePopup(deletion));
 const other=createStoreEngagementApi({scope:'other-store',storage,fetch:async()=>Response.json({campaigns:[]})});
 assert.equal(await other.pendingDeletion(),null);assert.equal(other.hasUnresolved(),false);await other.list();assert.equal(storage.values.size,1);
 const [storageKey,raw]=[...storage.values.entries()][0]!;const bad=JSON.parse(raw);bad.deletion.expectedVersion=5;storage.setItem(storageKey,JSON.stringify(bad));let writes=0;
 const tampered=createStoreEngagementApi({scope:'guzide',storage,fetch:async()=>{writes++;return Response.json({deletion:{campaignId:id,deleted:true}});}});
 await assert.rejects(tampered.pendingDeletion());await assert.rejects(tampered.deletePopup(deletion));assert.equal(writes,0);assert.equal(storage.values.size,1);
});
