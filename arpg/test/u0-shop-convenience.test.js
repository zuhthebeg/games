import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave, SaveStore, SAVE_KEY, DEFAULT_AUTO_BUY, validateSave } from '../js/meta/save.js';
import { ITEMS, buy, moveConsumable, carriedWeight, capacity, shopPrice } from '../js/meta/items.js';
import { autoBuySupplies, supplyQuote, purchaseLedgerHtml } from '../js/ui/shop-view.js';
import { HubUI } from '../js/ui/hub.js';

const fresh = () => ({ ...createSave({ name:'U0 시험', answers:[0,0,0,0,0], createdAt:1 }), gold:10000 });
const hub = (save = fresh()) => {
  const h = Object.assign(Object.create(HubUI.prototype), { save, persist:()=>{}, sortieStage:'S2', devWeapon:'bow',
    root:{ querySelector:()=>({checked:true}) }, mountSheet(html){this.sheet=html;},
    showInnPanel(title,html,page){this.html=html;this.page=page;},
    closeSheet(){this.closed=true;}, launch(...args){this.launched=args;} });
  return h;
};

test('auto buy fills only carried deficits, leaves stash/over-target quantities and original save untouched', () => {
  const s=fresh();s.stash.stacks.potion=100;s.stacks.return_scroll=4;
  const before=structuredClone(s),r=autoBuySupplies(s);
  assert.equal(r.save.stacks.potion,20);assert.equal(r.save.stacks.mana_potion,1);assert.equal(r.save.stacks.return_scroll,4);
  assert.equal(r.spent,17*shopPrice(s,'potion'));assert.equal(r.message,`HP 물약 17 구매 · ${r.spent} G`);
  assert.deepEqual(r.save.stash,s.stash);assert.deepEqual(s,before);
  const again=autoBuySupplies(r.save);assert.equal(again.spent,0);assert.equal(again.message,'구매 0 · 0 G');
});

test('auto buy partial gold purchase reports deficits and honors the existing charisma discount', () => {
  const s=fresh();s.stacks={potion:0,mana_potion:0,return_scroll:0};s.stats.cha=8;
  s.gold=shopPrice(s,'potion')*12;
  const r=autoBuySupplies(s);
  assert.equal(r.save.stacks.potion,12);assert.equal(r.save.stacks.return_scroll,0);assert.equal(r.save.gold,0);
  assert.equal(r.spent,shopPrice(s,'potion')*12);assert.match(r.message,/HP 물약 12\/20/);assert.match(r.message,/귀환 주문서 0\/1/);assert.match(r.message,/골드 부족/);
});

test('auto buy weight-limited partial purchase can still fit a later lighter scroll', () => {
  const s=fresh();s.equipped.body=null;s.stacks={potion:979,mana_potion:0,return_scroll:0};
  s.autoBuy={potion:981,mana_potion:0,return_scroll:1};
  assert.equal(capacity(s)-carriedWeight(s),capacity(s)-105.9);
  const r=autoBuySupplies(s);assert.equal(r.save.stacks.potion,980);assert.equal(r.save.stacks.return_scroll,0);
  assert.match(r.message,/HP 물약 1\/2/);assert.match(r.message,/무게 부족/);assert.ok(carriedWeight(r.save)<=capacity(s));
  s.stacks.potion=978;s.stacks.return_scroll=9;s.autoBuy={potion:980,mana_potion:0,return_scroll:10};
  const mixed=autoBuySupplies(s);assert.equal(mixed.save.stacks.potion,979);assert.equal(mixed.save.stacks.return_scroll,10);
  assert.equal(carriedWeight(mixed.save),capacity(s));
});

test('auto buy supports targets above the manual 99-count stepper without inventing a purchase cap', () => {
  const s=fresh();s.autoBuy={potion:150,mana_potion:0,return_scroll:5};
  const r=autoBuySupplies(s);assert.equal(r.save.stacks.potion,150);assert.equal(r.save.stacks.return_scroll,5);
});

test('consumable weights are 0.1/0.01 kg, scroll purchases and withdrawals have no maxCarry', () => {
  assert.equal(ITEMS.potion.weight,.1);assert.equal(ITEMS.mana_potion.weight,.1);
  assert.equal(ITEMS.return_scroll.weight,.01);assert.equal(Object.hasOwn(ITEMS.return_scroll,'maxCarry'),false);
  const s=buy(fresh(),'return_scroll',10);assert.equal(s.stacks.return_scroll,11);
  s.stash.stacks.return_scroll=10;assert.equal(moveConsumable(s,'return_scroll',10,'bag').stacks.return_scroll,21);
  const tiny=fresh();tiny.equipped={weapon:null,body:null,head:null,hands:null,feet:null};tiny.stacks={potion:2};
  assert.equal(carriedWeight(tiny),.2);assert.match(purchaseLedgerHtml(supplyQuote(tiny,'return_scroll',85)),/>1.05 \/ 106 kg/);
});

test('old saves default autoBuy on load and accept more than two carried scrolls; invalid targets fail validation', () => {
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const s=fresh();delete s.autoBuy;s.stacks.return_scroll=20;
  storage.setItem(SAVE_KEY,JSON.stringify(s));const store=new SaveStore(storage);
  const loaded=store.load();assert.deepEqual(loaded.autoBuy,DEFAULT_AUTO_BUY);assert.equal(loaded.stacks.return_scroll,20);
  loaded.autoBuy.potion=23;store.save(loaded);assert.equal(store.load().autoBuy.potion,23);
  for(const autoBuy of [null,[],{potion:-1},{potion:1.5},{potion:'20'},{scrap:2},{potion:Infinity}]) assert.equal(validateSave({...s,autoBuy}),false);
  assert.equal(validateSave({...s,autoBuy:{potion:0}}),true);
});

test('zero carried HP potions intercept departure with only title and actions; shop and bypass work', () => {
  const h=hub();h.save.stacks.potion=0;h.save.stash.stacks.potion=20;
  h.action('launch',{});assert.equal(h.launched,undefined);assert.match(h.sheet,/물약 없음/);
  assert.match(h.sheet,/data-action="launch-without-potion"[^>]*>그냥 출정/);assert.match(h.sheet,/data-action="departure-shop"[^>]*>상점/);
  h.shopTab='sell';h.action('departure-shop',{});assert.equal(h.page,'shop');assert.equal(h.shopTab,'buy');
  h.action('launch-without-potion',{});assert.deepEqual(h.launched,['S2',true,'bow']);assert.equal(h.closed,true);
  const supplied=hub();supplied.action('launch',{});assert.deepEqual(supplied.launched,['S2',true,'bow']);assert.equal(supplied.sheet,undefined);
});

test('auto buy target steppers persist nonnegative quantities; auto-buy action fills carried supplies and renders one result', () => {
  const h=hub();h.action('auto-buy-settings',{});assert.match(h.sheet,/자동 구매 설정/);assert.match(h.sheet,/data-auto-buy-target="potion">20/);
  h.action('auto-buy-target',{id:'potion',step:'1'});assert.equal(h.save.autoBuy.potion,21);
  h.action('auto-buy-target',{id:'mana_potion',step:'-1'});assert.equal(h.save.autoBuy.mana_potion,0);
  h.action('auto-buy',{});assert.equal(h.save.stacks.potion,21);assert.match(h.html,/role="status"/);assert.match(h.html,/HP 물약 18 구매/);
});
