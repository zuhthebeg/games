import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const pages=['','ko/','en/','ja/','es/','pt/','tw/','id/'];
for(const locale of pages){
  const html=readFileSync(new URL('../'+locale+'index.html',import.meta.url),'utf8');
  const result=html.match(/<section id="s-result"[\s\S]*?<\/section>/)[0];
  test((locale||'root')+' keeps sharing directly after score with adjacent social panels',()=>{
    assert.match(result,/id="r-score">[^<]*<\/div>\s*<div id="r-sharing">/);
    const sharing=result.match(/<div id="r-sharing">([\s\S]*?)\n      <\/div>/)?.[1];
    assert.ok(sharing,'one in-flow bundle for sharing and conditional social panels');
    const ids=[...sharing.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
    assert.deepEqual(ids,['r-share-actions','btn-share','btn-threads','btn-x','btn-save','r-duetcta','r-groupcta','r-duet','r-group']);
    for(const id of ['r-duetcta','r-groupcta','r-duet','r-group'])assert.match(sharing,new RegExp('id="'+id+'" class="hidden"'));
    assert.ok(result.indexOf('id="r-sharing"')<result.indexOf('id="r-rank"'));
    assert.ok(result.indexOf('id="btn-retry"')>result.indexOf('id="r-req"'));
  });
  test((locale||'root')+' uses initially closed native secondary blocks and preserves result controls',()=>{
    for(const id of ['r-fantrack','r-setlist','r-req']){
      assert.match(result,new RegExp('<details id="'+id+'" class="result-secondary hidden"></details>'));
    }
    const expected=['r-score','r-judge','r-sub','r-rank','r-duet','r-group','r-poolhint','mode-unit-result','mode-badge-result','btn-pool','r-gaxis','r-report','r-addtake','r-rankline','r-daily','r-fantrack','r-setlist','r-duetcta','r-groupcta','r-req','btn-share','btn-threads','btn-x','btn-save','btn-retry','btn-more','r-tip'];
    for(const id of expected)assert.equal([...result.matchAll(new RegExp('id="'+id+'"','g'))].length,1,id+' preserved exactly once');
  });
}
