import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createCelebixAdminPasswordLogin,emitCelebixAdminPasswordAmr} from '../infrastructure/logto/admin-password-proof.mjs';

export const ADMIN_LOGTO_VENDOR_FILES=Object.freeze({
 core:{path:'/etc/logto/packages/core/build/main-Z4BG2XWW.js',sha256:'77441c2d030d064343cfb22aa61b0e0ed45bff8fb33a1d4ce2beed6a8f1c752c'},
 code:{path:'/etc/logto/node_modules/.pnpm/oidc-provider@https+++codeload.github.com+logto-io+node-oidc-provider+tar.gz+5570006785b44e0f125ee4cb6bf540338721b1f3/node_modules/oidc-provider/lib/actions/grants/authorization_code.js',sha256:'81bf51df78746b728e43392e697edddc4779069ea6c1412610c5b9de08d47717'},
});
const hash=text=>createHash('sha256').update(text).digest('hex');
function once(text,before,after){if(text.split(before).length!==2)throw Error('logto_admin_proof_predecessor_changed');return text.replace(before,after);}
export function patchAdminLogtoSources(input){
 if(hash(input.core)!==ADMIN_LOGTO_VENDOR_FILES.core.sha256||hash(input.code)!==ADMIN_LOGTO_VENDOR_FILES.code.sha256)throw Error('logto_admin_proof_vendor_changed');
 const before='    const redirectTo = await provider.interactionResult(this.ctx.req, this.ctx.res, {\n      login: { accountId: user.id },\n      // Persist the interaction status to the OIDC session after interaction submission';
 const after='    const celebixAdminLogin = await createCelebixAdminPasswordLogin({user,params:this.ctx.interactionDetails.params,now:Date.now(),interactionEvent:this.interactionEvent,records:this.verificationRecordsArray});\n    const redirectTo = await provider.interactionResult(this.ctx.req, this.ctx.res, {\n      login: celebixAdminLogin,\n      // Persist the interaction status to the OIDC session after interaction submission';
 const core=`// Celebix scoped immutable admin-password proof; exact Logto 1.41.0 predecessor.\n${createCelebixAdminPasswordLogin.toString()}\n${once(input.core,before,after)}`;
 const code=`// Celebix scoped immutable code AMR, explicitly signed after normal claim filtering.\n${emitCelebixAdminPasswordAmr.toString()}\n${once(input.code,"    token.set('nonce', code.nonce);","    emitCelebixAdminPasswordAmr({clientId:ctx.oidc.client.clientId,audience:at.aud,scope:at.scope,codeAmr:code.amr,token});\n    token.set('nonce', code.nonce);")}`;
 return {core,code,sha256:{core:hash(core),code:hash(code)}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==2)throw Error('logto_admin_proof_arguments_invalid');
 const input=Object.fromEntries(Object.entries(ADMIN_LOGTO_VENDOR_FILES).map(([name,file])=>[name,readFileSync(file.path,'utf8')]));
 const output=patchAdminLogtoSources(input);
 for(const [name,file] of Object.entries(ADMIN_LOGTO_VENDOR_FILES))writeFileSync(file.path,output[name]);
 process.stdout.write(JSON.stringify({version:'1.41.0',scopedClientId:'1n93icpphr11h4fmrup9w',patchedSourceHashes:output.sha256})+'\n');
}
