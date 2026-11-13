import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire('/home/cocy/.openclaw/workspace/')('playwright');const base=process.argv[2]||'http://127.0.0.1:8792/beasthunt/';
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{for(const blocked of [false,true]){
 const c=await b.newContext({viewport:{width:390,height:780}});const requests=[],errors=[];
 await c.route('**/*',r=>{const u=r.request().url();if(blocked&&u.endsWith('.ogg'))return r.fulfill({status:404,body:'not found'});return new URL(u).origin===new URL(base).origin?r.continue():r.abort();});
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.url().endsWith('.ogg'))requests.push(r.url());});
 await p.goto(base);await p.waitForFunction(()=>window.__bh);assert.equal(requests.length,0,'zero audio requests initial page');
 await p.click('[data-w="gs"]');await p.waitForTimeout(300);
 const r=await p.evaluate(async blocked=>{const a=await import('bh/audio');await a.preloadGS();return {hit:a.sfx('gs_hit',{variant:0}),slam:a.sfx('gs_slam',{variant:0})};},blocked);
 assert.equal(r.hit,blocked?'fallback':'sample');assert.equal(r.slam,blocked?'fallback':'sample');assert.equal(requests.length,30);
 await p.goto(base+'sfx-test.html');await p.waitForSelector('#sounds section');assert.equal(await p.locator('#sounds section').count(),15);await p.click('#prepare');await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('완료'));assert.equal(errors.length,0,errors.join(';'));await c.close();console.log('PASS initial audio=0, '+(blocked?'404 synthetic fallback':'30 decoded samples')+', listener page');
}}finally{await b.close();}
