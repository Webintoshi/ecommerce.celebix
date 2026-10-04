import assert from "node:assert/strict";
import test from "node:test";
import { atomicNativeWrite, nativeStepId } from "./atomic-write.ts";
import type { PostgresClientLike } from "./pool.ts";

test("native save and effect share one commit and rollback together", async () => {
  for (const failEffect of [false,true]) {
    const queries:string[]=[];let released=0;
    const client={query:async(text:string)=>{queries.push(text);if(text==="effect"&&failEffect)throw Error("blocked");return {rows:[],rowCount:0,command:"",oid:0,fields:[]};},release:()=>{released++;}} as PostgresClientLike;
    const run=()=>atomicNativeWrite({pool:{connect:async()=>client},poolCheckoutMs:100,onUnknown:()=>{},recover:async()=>"recovered"},async pool=>{
      for(const phase of ["save","effect"]){const connection=await pool.connect();await connection.query("BEGIN ISOLATION LEVEL READ COMMITTED");await connection.query(phase);await connection.query("COMMIT");connection.release();}return "applied";
    });
    if(failEffect)await assert.rejects(run,/blocked/);else assert.equal(await run(),"applied");
    assert.deepEqual(queries, ["BEGIN ISOLATION LEVEL READ COMMITTED","save","effect",failEffect?"ROLLBACK":"COMMIT"]);assert.equal(released,1);
  }
});
test("uncertain final commit destroys connection and invokes recovery once without replaying effect",async()=>{
  const queries:string[]=[];const releases:unknown[]=[];let audits=0,recoveries=0;
  const client={query:async(text:string)=>{queries.push(text);if(text==="COMMIT")throw Error("socket");return {rows:[],rowCount:0,command:"",oid:0,fields:[]};},release:(value?:unknown)=>releases.push(value)} as PostgresClientLike;
  const result=await atomicNativeWrite({pool:{connect:async()=>client},poolCheckoutMs:100,onUnknown:()=>{audits++;},recover:async observed=>{recoveries++;assert.equal(observed,"applied");return "proven";}},async pool=>{await(await pool.connect()).query("effect");return "applied";});
  assert.equal(result,"proven");assert.deepEqual(queries,["BEGIN ISOLATION LEVEL READ COMMITTED","effect","COMMIT"]);assert.deepEqual(releases,[true]);assert.equal(audits,1);assert.equal(recoveries,1);
});
test("step identities are stable and separate from final key",()=>{const id="10000000-0000-4000-8000-000000000001";assert.equal(nativeStepId(id,"save"),nativeStepId(id,"save"));assert.notEqual(nativeStepId(id,"save"),nativeStepId(id,"preview"));assert.notEqual(nativeStepId(id,"save"),id);assert.match(nativeStepId(id,"save"),/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);});

test("inner rollback prevents a caught failure from committing and closes scoped recovery access", async () => {
  const queries: string[] = [];
  let retained: PostgresClientLike | undefined;
  const client = { query: async (text: string) => { queries.push(text); return { rows: [], rowCount: 0, command: "", oid: 0, fields: [] }; }, release() {} } as PostgresClientLike;
  await assert.rejects(atomicNativeWrite({ pool: { connect: async () => client }, poolCheckoutMs: 100, onUnknown() {}, recover: async () => "never" }, async pool => {
    retained = await pool.connect();
    await retained.query("save");
    await retained.query("ROLLBACK");
    await assert.rejects(retained.query("recover"), /atomic_transaction_aborted/);
    return "caught";
  }), /atomic_transaction_aborted/);
  assert.deepEqual(queries, ["BEGIN ISOLATION LEVEL READ COMMITTED", "save", "ROLLBACK"]);
  await assert.rejects(retained!.query("effect"), /atomic_connection_closed/);
});
