import test from 'node:test';
import assert from 'node:assert/strict';
import { REGION_ROUTE, REGIONS, MAPS } from '../js/content/world-map.js';
import { createSave } from '../js/meta/save.js';
import { HubUI } from '../js/ui/hub.js';
import { statReading, lineValue, deltaText, linesHtml } from '../js/ui/gear-view.js';

test('S28 이후 지역은 같은 열 3연속 없이 좌우·관문 배치를 유지한다', () => {
  const late = Object.keys(REGION_ROUTE).filter(id => REGION_ROUTE[id][0] >= 8).sort((a,b) => REGION_ROUTE[a][0] - REGION_ROUTE[b][0]);
  assert.deepEqual(late.slice(0,8).map(id => REGION_ROUTE[id]), [[8,0],[9,1],[10,2],[11,1],[12,2],[13,0],[14,1],[15,2]]);
  for (let i=2;i<late.length;i++) assert.notEqual(new Set(late.slice(i-2,i+1).map(id => REGION_ROUTE[id][1])).size,1);
  for (const id of late) assert.equal(REGIONS.find(region => region.id === id).pos[0], {0:50,1:24,2:76}[REGION_ROUTE[id][1]]);
});

test('공격력·방어력·공속 표시와 증감은 같은 반올림값에서 계산한다', () => {
  assert.equal(statReading('attack',1.3),130);
  assert.equal(statReading('ac',3.6),4);
  assert.equal(statReading('attackRate',1.3),130);
  const line={key:'attackRate',label:'공격 속도',from:1.304,to:1.306,delta:.002,good:true,section:'derived',unit:'배율',prefix:'×'};
  assert.equal(lineValue(line,line.from),'130');
  assert.equal(lineValue(line,line.to),'131');
  assert.match(deltaText(line),/▲\+1/);
  assert.match(linesHtml({lines:[line]}),/공속[\s\S]*130 → <b>131<\/b>/);
  const hidden={...line,to:1.3044,delta:.0004};
  assert.doesNotMatch(linesHtml({lines:[hidden]}),/data-line=/);
});

test('후반 SVG 곡선이 새 노드의 중심 좌표를 연결한다', () => {
  const save=createSave({name:'지그재그',answers:[0,0,0,0,0],createdAt:1});
  for (const id of Object.keys(MAPS)) save.cleared[id]=true;
  const hub=Object.assign(Object.create(HubUI.prototype),{save,showInnPanel(_title,html){this.html=html;}});
  hub.showBoard();
  for (const [from,to] of [['necropolis','cinder'],['cinder','frost'],['frost','mire'],['mire','dunes'],['dunes','spore'],['spore','abyss'],['abyss','clockwork'],['clockwork','sky']]) {
    const [row1,col1]=REGION_ROUTE[from], [row2,col2]=REGION_ROUTE[to];
    const x1=col1 ? col1*100-50 : 100, x2=col2 ? col2*100-50 : 100;
    const y1=(row1-1)*160+128, y2=(row2-1)*160, mid=(y1+y2)/2;
    assert.ok(hub.html.includes(`data-route="${from}:${to}" d="M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}"`), `${from}:${to}`);
  }
});
