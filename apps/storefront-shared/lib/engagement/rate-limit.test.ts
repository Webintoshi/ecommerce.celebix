import assert from 'node:assert/strict';
import test from 'node:test';
import { createContactRequestLimiter } from './rate-limit.ts';
test('contact burst guard is host scoped and expires without storing raw client identity',()=>{let now=1;const limit=createContactRequestLimiter(()=>now),headers=new Headers({'cf-connecting-ip':'192.0.2.1'});for(let i=0;i<60;i++)assert.equal(limit('one.example',headers),true);assert.equal(limit('one.example',headers),false);assert.equal(limit('two.example',headers),true);now+=60_000;assert.equal(limit('one.example',headers),true);});
