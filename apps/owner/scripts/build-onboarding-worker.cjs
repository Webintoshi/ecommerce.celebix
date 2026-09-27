const path=require('node:path');
const {webpack}=require('next/dist/compiled/webpack/webpack');
const root=path.resolve(__dirname,'..');
webpack({mode:'production',target:'node20',entry:path.join(root,'lib/onboarding-jobs/default.ts'),
 output:{path:path.join(root,'.onboarding-worker'),filename:'runtime.cjs',library:{type:'commonjs2'},clean:true},
 optimization:{minimize:false},devtool:false,
 resolve:{extensions:['.ts','.js','.json'],conditionNames:['node','require','default']},
 module:{rules:[{test:/\.ts$/,exclude:/node_modules/,use:path.join(__dirname,'onboarding-typescript-loader.cjs')}]},
 externals:[({request},callback)=>{if(request&&!request.startsWith('.')&&!path.isAbsolute(request)&&!request.startsWith('@celebix/'))return callback(null,'commonjs '+request);callback();}],
},(error,stats)=>{if(error||stats.hasErrors()){console.error('onboarding_worker_build_failed');if(stats)console.error(stats.toString({all:false,errors:true}));process.exitCode=1;}else console.info('onboarding_worker_build_ready_node20');});
