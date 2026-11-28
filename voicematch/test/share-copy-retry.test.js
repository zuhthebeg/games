import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('async function shareOrCopy(');
assert.ok(start>=0);
const source=html.slice(start,html.indexOf('\n}',start)+2);
const COPIED='복사 완료';
const BASE='회신하기 · Fixture Friend';

function deferred(){
  let resolve,reject;
  const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail;});
  return {promise,resolve,reject};
}

function fixture(){
  const buttons={reply:{textContent:BASE},invite:{textContent:'초대하기'}};
  const copies=[],legacyTexts=[];
  let write=async()=>{},activeTextarea=null;
  const navigator={clipboard:{writeText(text){copies.push(text);return write(text);}}};
  const document={
    createElement:()=>({style:{},select(){},remove(){activeTextarea=null;}}),
    body:{appendChild(ta){activeTextarea=ta;}},
    execCommand(){legacyTexts.push(activeTextarea.value);return false;},
  };
  const context=vm.createContext({navigator,document,$:id=>buttons[id],t:key=>{
    assert.equal(key,'duetCopied');return COPIED;
  }});
  vm.runInContext(source,context);
  return {buttons,navigator,copies,legacyTexts,write(fn){write=fn;},
    get textarea(){return activeTextarea;},
    run:(text='link',id='reply',current)=>context.shareOrCopy(text,id,current),
  };
}

test('retry: success, total failure, then success on the same button',async()=>{
  const f=fixture(),b=f.buttons.reply;
  await f.run();assert.equal(b.textContent,COPIED);
  f.write(async()=>{throw new Error('clipboard denied');});
  const retry=f.run('failed');assert.equal(b.textContent,BASE);
  await retry;assert.equal(b.textContent,BASE);assert.deepEqual(f.legacyTexts,['failed']);
  assert.equal(f.textarea,null);
  f.write(async()=>{});await f.run();assert.equal(b.textContent,COPIED);
});

test('retry: pending and successful native sharing are not copy confirmation',async()=>{
  const f=fixture();await f.run('previous');
  const native=deferred();f.navigator.share=()=>native.promise;
  const p=f.run('native');assert.equal(f.buttons.reply.textContent,BASE);
  native.resolve();await p;assert.equal(f.buttons.reply.textContent,BASE);
  assert.deepEqual(f.copies,['previous']);
});

test('retry: earlier clipboard success cannot label a newer failed attempt',async()=>{
  const f=fixture(),old=deferred();f.write(()=>old.promise);
  const p=f.run('older');
  f.write(async()=>{throw new Error('clipboard denied');});await f.run('newer');
  old.resolve();await p;
  assert.equal(f.buttons.reply.textContent,BASE);
});

test('retry: earlier clipboard rejection cannot fall back after a newer copy',async()=>{
  const f=fixture(),old=deferred();f.write(()=>old.promise);
  const p=f.run('older');f.write(async()=>{});await f.run('newer');
  old.reject(new Error('clipboard denied'));await p;
  assert.deepEqual(f.legacyTexts,[]);
  assert.equal(f.buttons.reply.textContent,COPIED);
});

test('retry: superseded native cancellation cannot initiate a stale copy',async()=>{
  const f=fixture(),old=deferred();f.navigator.share=()=>old.promise;
  const p=f.run('older');delete f.navigator.share;await f.run('newer');
  old.reject({name:'AbortError'});await p;
  assert.deepEqual(f.copies,['newer']);
  assert.equal(f.buttons.reply.textContent,COPIED);
});

test('retry: independent buttons retain their own label and pending copy',async()=>{
  const f=fixture(),a=deferred();f.write(()=>a.promise);
  const p=f.run('reply');f.write(async()=>{});await f.run('invite','invite');
  a.resolve();await p;
  assert.equal(f.buttons.reply.textContent,COPIED);
  assert.equal(f.buttons.invite.textContent,COPIED);
  f.write(async()=>{throw new Error('clipboard denied');});await f.run('invite','invite');
  assert.equal(f.buttons.reply.textContent,COPIED);
  assert.equal(f.buttons.invite.textContent,'초대하기');
});

test('retry: replacement button captures its own label, not the previous node label',async()=>{
  const f=fixture(),old=deferred(),previous=f.buttons.reply;await f.run();
  f.write(()=>old.promise);const p=f.run('older');
  const replacement={textContent:'회신하기 · New Friend'};f.buttons.reply=replacement;
  f.write(async()=>{});await f.run('newer');
  old.resolve();await p;assert.equal(previous.textContent,BASE);
  assert.equal(replacement.textContent,COPIED);
  f.write(async()=>{throw new Error('clipboard denied');});await f.run('newer retry');
  assert.equal(replacement.textContent,'회신하기 · New Friend');
});

test('retry: invalid ownership cannot reset a label or disturb a valid pending attempt',async()=>{
  const f=fixture(),valid=deferred();await f.run();
  await f.run('invalid','reply',()=>false);assert.equal(f.buttons.reply.textContent,COPIED);
  f.write(()=>valid.promise);const p=f.run('valid');
  await f.run('invalid again','reply',()=>false);valid.resolve();await p;
  assert.equal(f.buttons.reply.textContent,COPIED);
  assert.deepEqual(f.copies,['link','valid']);
});
