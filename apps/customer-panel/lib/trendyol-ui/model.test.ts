import assert from 'node:assert/strict';
import test from 'node:test';

test('money and commission form values become integer units without floating point drift',async()=>{
 const {decimalUnits}=await import('./model.ts');
 for(const [value,want] of [['17',1700],['17,25',1725],['90.01',9001],['0',0],['100.10',10010]] as const)assert.equal(decimalUnits(value),want);
 for(const value of ['1e3','-1','17.255','','NaN','1.000,00','9007199254740992'])assert.equal(decimalUnits(value),null,value);
});
