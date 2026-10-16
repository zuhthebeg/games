import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../css/game.css',import.meta.url),'utf8'),theme=source.split('/* Skeleton / permanent DK only.')[1];
const luminance=h=>{const c=h.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c.reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
test('every graveyard CSS rule is semantic body scoped; no geometry/art or human selector changes',()=>{
 for(const block of theme.slice(theme.indexOf('*/')+2).split('}').filter(s=>s.trim()))assert.match(block.trim(),/^body\[data-theme="graveyard"\]/);
 assert.doesNotMatch(theme,/url\(|width:|height:|position:|font-size:|display:/);
});
test('known normal-text contrast >=4.5, HP/MP explicit labelled fill semantics and visible border',()=>{
 const pairs=[['e1e9de','111713'],['b5c5b7','1b241f'],['111713','b7cba2'],['f4f6ed','527735'],['f4f6ed','426431'],['f4f6ed','46344f'],['f4f6ed','211b29'],['c3dfa7','1b241f'],['d5bfdf','1b241f']];
 for(const [text,bg] of pairs)assert.ok(contrast(text,bg)>=4.5,`${text}/${bg}: ${contrast(text,bg)}`);
 assert.ok(contrast('839687','0c110f')>=3);assert.ok(luminance('46344f')<luminance('527735'));
 console.log('known contrast ratios',pairs.map(([a,b])=>({text:a,background:b,ratio:contrast(a,b)})));
 const hud=readFileSync(new URL('../js/ui/hud.js',import.meta.url),'utf8');assert.match(hud,/this.graveyard \? 'HP '/);assert.match(hud,/this.graveyard \? 'MP '/);
});
test('selection, failed selection and cancelled creation clear stale skeleton theme before human',async()=>{
 const {HubUI}=await import('../js/ui/hub.js');const original=globalThis.document;
 const root={dataset:{},classList:{toggle(){}},querySelector:s=>s==='input'?{focus(){}}:null,querySelectorAll:()=>[],contains:()=>false};
 globalThis.document={body:{dataset:{}},querySelector:()=>({hidden:false})};
 try{
  const h=Object.assign(Object.create(HubUI.prototype),{root,save:{lineage:'skeleton_knight'},onOverlay(){},initialCharacters:{human(){throw Error('read failure');},read:()=>null}});
  h.show('','inn',{shell:true});assert.equal(document.body.dataset.theme,'graveyard');
  h.showCharacterChoice();assert.equal(document.body.dataset.theme,undefined);
  assert.throws(()=>h.action('choose-human',{}),/read failure/);assert.equal(document.body.dataset.theme,undefined);
  h.action('choose-skeleton',{});assert.equal(document.body.dataset.theme,undefined);h.showCharacterChoice();assert.equal(document.body.dataset.theme,undefined);
  h.save={lineage:'human'};h.show('','inn',{shell:true});assert.equal(document.body.dataset.theme,undefined);
 }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});
