import {STAGES,WEAPONS,ABILITIES,PLAYER_BASE} from '../content/combat.js';
import {ticks} from '../sim/core.js';
const $=s=>document.querySelector(s);
const names={goblin_slash:'고블린의 베기',goblin_hop:'고블린의 도약',sling_stone:'투석병의 돌팔매',boar_charge:'멧돼지 돌진',boar_gore:'멧돼지의 엄니',chief_cleave:'대장의 가르기',chief_charge:'대장의 돌진',chief_slam:'대장의 내려찍기'};
const monsters={goblin_grunt:'고블린',goblin_slinger:'고블린 투석병',iron_boar:'철갑 멧돼지',goblin_chief:'고블린 대장'};
export class HUD {
  constructor(start,menu){
    this.start=start;this.menu=menu;this.stage='S1';this.weapon='blade';this.noticeLeft=0;
    this.nodes={};for(const id of ['hp-fill','hp-text','mp-fill','mp-text','stage-name','objective','potion','scroll','skill','dodge','attack','notice'])this.nodes[id]=$(`#${id}`);
    $('#start-form').addEventListener('submit',e=>{e.preventDefault();start($('#weapon').value,$('#stage').value,$('#reduced-fx').checked);$('#start').blur();});
    $('#back').addEventListener('click',()=>menu());
    $('#next').addEventListener('click',()=>{const order=['S1','S2','S3','S3E'];const next=order[order.indexOf(this.stage)+1];if(next)start(this.weapon,next,$('#reduced-fx').checked);});
  }
  ready(){$('#start').disabled=false;$('#start').textContent='시작';}
  begin(world){this.stage=world.round.stageId;this.weapon=world.entities[0].weapon;$('#menu').hidden=true;$('#result').hidden=true;$('#hud').hidden=false;$('#pause').hidden=true;this.nodes.notice.textContent='';this.noticeLeft=0;this.nodes['stage-name'].textContent=`${this.stage} · ${STAGES[this.stage].name}`;}
  showMenu(){$('#hud').hidden=true;$('#result').hidden=true;$('#menu').hidden=false;$('#pause').hidden=true;$('#start').focus();}
  pause(hidden){$('#pause').hidden=!hidden;}
  events(events){const messages={channelStart:'귀환 중 · 이동·공격 불가, 회피로 취소',channelBroken:'피격으로 귀환이 중단되었습니다',channelCancel:'회피로 귀환을 취소했습니다',perfectDodge:'완벽 회피'};for(const e of events)if(messages[e.type]){this.nodes.notice.textContent=messages[e.type];this.noticeLeft=2;}}
  update(world,dt){
    const p=world.entities[0],n=this.nodes;
    n['hp-fill'].style.transform=`scaleX(${p.hp/p.maxHp})`;n['mp-fill'].style.transform=`scaleX(${p.mp/p.maxMp})`;
    this.text(n['hp-text'],`HP ${p.hp} / ${p.maxHp}`);this.text(n['mp-text'],`MP ${Math.floor(p.mp)} / ${p.maxMp}`);
    let alive=0;for(const e of world.entities)if(e.kind==='monster'&&!e.dead)alive++;
    this.text(n.objective,world.round.goal==='timer'?`${Math.max(0,Math.ceil((world.round.timerTicks-world.round.t)/30))}초 · 연습 표적 ${alive}`:`남은 적 ${alive+world.round.pending.length} · 대기 ${world.round.pending.length}`);
    const sec=t=>(t/30).toFixed(1)+'초';
    this.text(n.potion.lastElementChild,`${p.potions}개${p.potionCd>0?' · '+sec(p.potionCd):''}`);
    this.text(n.scroll.lastElementChild,p.channel>0?sec(p.channel):`${p.scrolls}개${p.scrollRetry>0?' · '+sec(p.scrollRetry):''}`);
    n.scroll.style.setProperty('--progress',`${p.channel>0?(1-p.channel/ticks(PLAYER_BASE.scroll.channelMs))*100:0}%`);
    const skill=WEAPONS[p.weapon].skill,cd=p.cds[skill]||0,skillAct=p.act?.id===skill;
    this.text(n.skill.lastElementChild,cd>0?sec(cd):skillAct?'사용 중':p.mp<(ABILITIES[skill].manaCost||0)?'MP 부족':'준비');
    n.skill.style.setProperty('--progress',`${cd/ticks(ABILITIES[skill].cooldownMs)*100}%`);
    this.text(n.dodge.lastElementChild,p.dodge.cdLeft>0?sec(p.dodge.cdLeft):'준비');n.dodge.className=p.dodge.cdLeft>0?'cooling':'ready';
    // Never disable a held attack: pointer-up must always reach the input layer.
    n.potion.disabled=p.potions===0||p.potionCd>0||p.hp===p.maxHp;
    n.scroll.disabled=p.scrolls===0||p.scrollRetry>0||p.channel>0||!!p.act;
    n.skill.disabled=cd>0||skillAct||p.channel>0||p.mp<(ABILITIES[skill].manaCost||0);
    if(this.noticeLeft>0){this.noticeLeft-=dt;if(this.noticeLeft<=0)n.notice.textContent='';}
  }
  text(node,value){if(node.textContent!==value)node.textContent=value;}
  end(world){
    const state=world.round.state,p=world.entities[0];$('#result').hidden=false;$('#hud').hidden=true;
    $('#result-title').textContent={clear:'여정 완료',returned:'귀환 성공',failed:'여정 실패'}[state];
    const c=p.deathCause;
    $('#cause').textContent=state==='failed'&&c?`왜 죽었나: ${monsters[c.by]||c.by} — ${names[c.ability]||c.ability}. 회피 가능했던 공격 · 붉은 위험 영역에서 벗어나거나 타격 전에 회피하세요.`:state==='returned'?'주문서의 빛이 당신을 여관으로 이끌었습니다.':'다음 길로 나아갈 준비가 되었습니다.';
    $('#next').hidden=state!=='clear'||this.stage==='S3E';(state==='clear'&&this.stage!=='S3E'?$('#next'):$('#back')).focus();
  }
}
