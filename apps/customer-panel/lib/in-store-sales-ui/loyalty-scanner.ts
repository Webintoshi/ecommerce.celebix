export function approvalTokenFromScan(value:string):string|null{
 const token=value.trim().replace(/^celebix-loyalty:/u,'');return /^[a-f0-9]{64}$/u.test(token)?token:null;
}
export async function startLoyaltyScanner(video:HTMLVideoElement,onToken:(token:string)=>void):Promise<()=>void>{
 const {BrowserQRCodeReader}=await import('@zxing/library'),reader=new BrowserQRCodeReader(300);
 let stopped=false;const stop=()=>{stopped=true;reader.reset();};
 try{await reader.decodeFromVideoDevice(null,video,result=>{const token=result?approvalTokenFromScan(result.getText()):null;if(token&&!stopped){stop();onToken(token);}});}catch(error){stop();throw error;}
 return stop;
}
