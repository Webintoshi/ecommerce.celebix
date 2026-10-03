import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultRestockAlertsConfig, normalizeRestockEmail, parseRestockAlertsConfig } from './index.ts';

test('stock alerts start disabled and immutable', () => { const config=createDefaultRestockAlertsConfig(); assert.equal(config.enabled,false); assert.equal(Object.isFrozen(config),true); });
test('merchant can enable one-time email alert with own wording',()=>{const config=parseRestockAlertsConfig({...createDefaultRestockAlertsConfig(),enabled:true,title:'Tekrar gelince haber ver',buttonLabel:'Bana bildir'});assert.equal(config.title,'Tekrar gelince haber ver');assert.equal(config.enabled,true);});
test('alerts reject unknown config fields and HTML or control copy',()=>{for(const value of [{...createDefaultRestockAlertsConfig(),guaranteed:true},{...createDefaultRestockAlertsConfig(),title:'<script>x</script>'},{...createDefaultRestockAlertsConfig(),buttonLabel:'a\nb'},{...createDefaultRestockAlertsConfig(),enabled:'true'}])assert.throws(()=>parseRestockAlertsConfig(value));});
test('normalize email safely without changing mailbox punctuation',()=>{assert.equal(normalizeRestockEmail(' User+Ring@EXAMPLE.COM '),'user+ring@example.com');for(const value of ['a@b','a@b.com\r\nBCC:x@y.com','a..b@x.com','@x.com','x@y.com?bcc=z@y.com'])assert.throws(()=>normalizeRestockEmail(value));});
