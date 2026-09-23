const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const hintContext = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'hint.js'), 'utf8'), hintContext);
const hint = hintContext.GostopHint;
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const card = (id, m, role = 'pi') => ({id, m, role, gwang: role === 'gwang', ssangpi: false, godori: false, tti: role === 'tti' ? 'hong' : null, file: 'private.svg'});
function game() { return {turn:0, over:false, acting:false, _dealing:false, table:[card('t',2,'gwang')], players:[{hand:[card('a',2,'tti'),card('b',4)],cap:[card('mine',8,'yul')]},{hand:[card('SECRET',9)],cap:[card('theirs',3)]}], deck:[card('DECK_SECRET',11)], go:1}; }
const score = cap => ({total:cap.length});

test('serializes only own hand candidates and public cards with exact contract keys', () => {
  const g = game(); const request = hint.getHintRequest(g, score, false);
  assert.deepEqual(JSON.parse(JSON.stringify(request)), {state:{table:[{id:'t',m:2,role:'gwang',gwang:true,ssangpi:false,godori:false,tti:null}],captured:[{id:'mine',m:8,role:'yul',gwang:false,ssangpi:false,godori:false,tti:null}],opponentCaptured:[{id:'theirs',m:3,role:'pi',gwang:false,ssangpi:false,godori:false,tti:null}],score:1,opponentScore:1,go:1,deckCount:1},candidates:[{id:'a',m:2,role:'tti',gwang:false,ssangpi:false,godori:false,tti:'hong',matches:['t']},{id:'b',m:4,role:'pi',gwang:false,ssangpi:false,godori:false,tti:null,matches:[]}]});
  assert.doesNotMatch(JSON.stringify(request), /SECRET|private\.svg|hand|deck\":/);
});
test('only solo human idle turn with a hand offers hint', () => {
  const g=game(); assert.equal(hint.canHint(g,false),true);
  for (const patch of [{turn:1},{over:true},{acting:true},{_dealing:true},{players:[{hand:[],cap:[]},g.players[1]]}]) assert.equal(hint.canHint({...g,...patch},false),false);
  assert.equal(hint.canHint(g,true),false);
  assert.equal(hint.getHintRequest(g,score,true),null);
});
test('fingerprint and epoch invalidate stale responses even for repeated identical cards', () => {
  const g=game(), stamp=hint.hintFingerprint(g,score,4);
  assert.equal(hint.isCurrentHint(stamp,g,score,4,false),true);
  assert.equal(hint.isCurrentHint(stamp,g,score,5,false),false);
  assert.equal(hint.isCurrentHint(stamp,{...g,turn:1},score,4,false),false);
  assert.equal(hint.isCurrentHint(stamp,{...g,players:[{...g.players[0],hand:[card('b',4)]},g.players[1]]},score,4,false),false);
  assert.equal(hint.isCurrentHint(stamp,g,score,4,true),false);
});
test('accepts only a candidate still present in hand', () => {
  const g=game(), request=hint.getHintRequest(g,score,false);
  assert.equal(hint.validHintCard({cardId:'a',reason:'2월 짝'},request,g),'a');
  assert.equal(hint.validHintCard({cardId:'SECRET'},request,g),null);
  assert.equal(hint.validHintCard({cardId:'a'},request,{...g,players:[{hand:[],cap:[]},g.players[1]]}),null);
  assert.equal(hint.validHintCard({cardId:'a',reason:42},request,g),null);
});
test('page exposes manual solo button, uses existing auth JWT and inert response rendering', () => {
  assert.match(html, /id="hintButton"[^>]*onclick="requestGostopHint\(\)"/);
  assert.match(html, /src="hint\.js/);
  assert.match(html, /localStorage\.getItem\('cocy_auth_token'\)/);
  assert.match(html, /btn\.style\.display=eligible\?'':'none'/);
  assert.match(html, /const HINT_PILOT = new URLSearchParams\(location\.search\)\.has\('layaHintPilot'\)/);
  assert.match(html, /const eligible=HINT_PILOT && solo/);
  assert.match(html, /GostopHint\.isCurrentHint/);
  assert.match(html, /GostopHint\.validHintCard/);
  assert.match(html, /hintReason'\)\.textContent/);
  assert.doesNotMatch(html, /LAYA_API_TOKEN|laya[_-]token|hintCardId\s*&&\s*playSelected\(/i);
});
