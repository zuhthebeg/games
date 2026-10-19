import {readFileSync,writeFileSync} from 'node:fs';
import {shapeHitsCircle,segmentCircleEntry} from '../js/sim/core.js';
export function summarize(report){return report.rows.map(row=>{
 const events=row.hostJournal.flatMap(t=>t.events.map(e=>({...e,at:t.at,tick:t.tick})));
 const m2=[];
 for(const tr of row.trials){const frames=row.renders[tr.role].filter(f=>f.at>=tr.mark&&f.at<tr.mark+900),who=frames[0]?.entities.find(e=>e.pid===tr.from),basic=tr.id;const next=row.trials.filter(t=>t.from===tr.from&&t.mark>tr.mark).sort((a,b)=>a.mark-b.mark)[0]?.mark??tr.mark+1600;
 const start=events.find(e=>e.type==='act'&&e.id===who?.id&&e.at>=tr.mark&&e.at<next&&e.ability===basic);
 const visible=new Map();
 for(let i=0;i<frames.length;i++){const f=frames[i],p=f.entities.find(e=>e.pid===tr.from),act=p?.act;if(!p)continue;
 for(const target of f.entities.filter(e=>e.team!==p.team&&!e.dead&&!e.spawnLeft)){
 let contact=false;
 if(act&&act.id===basic&&act.phase==='active'){
 const def=act.def,shape=def.shape||(def.dash?{type:'circle',radius:p.r+def.dash.bodyPad,offset:0}:null);
 if(shape)contact=shapeHitsCircle(shape,def.anchored?act.ox:p.x,def.anchored?act.oy:p.y,act.facing,target.x,target.y,target.r);
 }
 for(const pr of f.projectiles||[])if(pr.ownerId===p.id&&pr.abilityId===basic){const old=frames[i-1]?.projectiles.find(q=>q.id===pr.id)??pr;if((segmentCircleEntry(old.x,old.y,pr.x,pr.y,target.x,target.y,target.r+pr.r)!==null||segmentCircleEntry(pr.x,pr.y,pr.x+pr.vx/30,pr.y+pr.vy/30,target.x,target.y,target.r+pr.r)!==null))contact=true;}
 if(contact&&!visible.has(target.id)){const old=frames[Math.max(0,i-2)].entities.find(t=>t.id===target.id);visible.set(target.id,{target:target.id,moving:!!old&&Math.hypot(old.x-target.x,old.y-target.y)>.5});}
 }}
 for(const v of visible.values())m2.push({...v,role:tr.role,skill:tr.skill,ability:basic,hit:!!start&&events.some(e=>e.type==='hit'&&e.src===who.id&&e.dst===v.target&&e.ability===basic&&e.at>=start.at&&e.at<(events.find(a=>a.type==='act'&&a.id===who.id&&a.at>start.at)?.at??next))});
 }
 const mean=xs=>xs.length?Math.round(xs.reduce((a,b)=>a+b,0)/xs.length*10)/10:null;
 return {width:row.width,rtt:row.injectedRtt,kit:row.kit,actualRtt:row.network.rtt,bufferDelay:row.network.delay,m1:{basic:mean(row.trials.filter(t=>t.role==='guest'&&!t.skill&&t.m1!==null).map(t=>t.m1)),skill:mean(row.trials.filter(t=>t.role==='guest'&&t.skill&&t.m1!==null).map(t=>t.m1))},m2,guestContacts:m2.filter(t=>t.role==='guest').length,guestHits:m2.filter(t=>t.role==='guest'&&t.hit).length};
 });}
if(process.argv[2]){const summary=summarize(JSON.parse(readFileSync(process.argv[2])));console.log(JSON.stringify(summary,null,2));if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(summary,null,2)+'\n');}
