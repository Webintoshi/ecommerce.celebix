import assert from 'node:assert/strict';
import test from 'node:test';
import {BinaryBitmap,HybridBinarizer,RGBLuminanceSource,QRCodeReader} from '@zxing/library';
import {loyaltyApprovalQr} from './loyalty-qr.ts';
test('the locally generated QR preserves the full approval entropy and roundtrips through the scanner',()=>{
 const token='abcdef0123456789'.repeat(4),{path,size}=loyaltyApprovalQr(token),pixels=new Int32Array(size*size).fill(0xffffff);
 for(const point of path.matchAll(/M(\d+) (\d+)h1v1h-1z/gu))pixels[Number(point[2])*size+Number(point[1])]=0;
 assert.equal(new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,size,size)))).getText(),`celebix-loyalty:${token}`);
 assert.throws(()=>loyaltyApprovalQr('1234'));
});
