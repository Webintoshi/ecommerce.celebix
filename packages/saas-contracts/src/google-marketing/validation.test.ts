import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGoogleMarketingSelection, parsePublicGoogleMarketingProjection } from './index.ts';
test('Google public projection rejects credentials and arbitrary snippets',()=>{
 assert.throws(()=>parsePublicGoogleMarketingProjection({gtmContainerId:'GTM-ABC123',ads:null,verificationToken:null,accessToken:'private'}));
 assert.throws(()=>parsePublicGoogleMarketingProjection({gtmContainerId:'<script>',ads:null,verificationToken:null}));
 assert.deepEqual(parsePublicGoogleMarketingProjection({gtmContainerId:'GTM-ABC123',ads:{tagId:'AW-123456',conversionLabel:'abc_xyz-1'},verificationToken:'verification_test'}),{gtmContainerId:'GTM-ABC123',ads:{tagId:'AW-123456',conversionLabel:'abc_xyz-1'},verificationToken:'verification_test'});
});
test('selection accepts bounded identifiers but rejects executable content and account id masquerading as Ads destination',()=>{
 assert.throws(()=>parseGoogleMarketingSelection({accountId:'123',resourceId:'456',resourceName:'Purchase',tagId:'123'}));
 assert.throws(()=>parseGoogleMarketingSelection({accountId:'123',resourceId:'456',resourceName:'Purchase',conversionLabel:'<script>'}));
 assert.equal(parseGoogleMarketingSelection({accountId:'123',resourceId:'456',resourceName:'Purchase',tagId:'AW-123456',conversionLabel:'validLabel'}).tagId,'AW-123456');
});
