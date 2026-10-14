export async function register(){
 if(process.env.NEXT_RUNTIME==='nodejs'&&process.env.NEXT_PHASE!=='phase-production-build'&&process.env.CELEBIX_GOOGLE_MERCHANT_WORKER_ENABLED==='true'){
  const {startGoogleMerchantWorker}=await import('./lib/server-google-merchant/supervisor');startGoogleMerchantWorker();
 }
}
