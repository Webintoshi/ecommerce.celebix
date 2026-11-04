import {BarcodeFormat,EncodeHintType,QRCodeWriter} from '@zxing/library';

export function loyaltyApprovalQr(token:string){
 if(!/^[a-f0-9]{64}$/u.test(token))throw new Error('invalid_approval');
 const matrix=new QRCodeWriter().encode(`celebix-loyalty:${token}`,BarcodeFormat.QR_CODE,264,264,new Map([[EncodeHintType.MARGIN,4]]));
 let path='';for(let y=0;y<matrix.getHeight();y++)for(let x=0;x<matrix.getWidth();x++)if(matrix.get(x,y))path+=`M${x} ${y}h1v1h-1z`;
 return {path,size:matrix.getWidth()};
}
