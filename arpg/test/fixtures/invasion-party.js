import {CoopSession} from '../../js/net/session.js';
import {createMemoryTransport} from '../../js/net/loopback.js';
import {createSave} from '../../js/meta/save.js';
import {createSkeletonSave} from '../../js/meta/character-creation.js';
import {buildRoundMods} from '../../js/meta/run.js';
import {emptyInput} from '../../js/sim/world.js';
export function pair({invasion=true,guestConsent=true,guestRole='invader',guestLineage='skeleton_knight'}={}){
 const saves={host:createSave({name:'Host',answers:[0,0,0,0,0],createdAt:1}),guest:guestLineage==='human'?createSave({name:'Guest',answers:[0,0,0,0,0],createdAt:2}):createSkeletonSave({lineage:guestLineage,name:'Guest',answers:[0,0,0,0,0],createdAt:2})};
 for(const [id,save] of Object.entries(saves)){save.cleared.S1=true;save.activeInvasion='fixture-token-'+id;}
 const network=createMemoryTransport(),s={};
 for(const uid of ['host','guest']){const save=saves[uid];const transport=network.connect(uid,(from,p)=>p.t==='action'?s[uid].action(p.action):s[uid].rt(from,p));s[uid]=new CoopSession({uid,host:'host',players:['host','guest'],config:{stageId:'S2',threat:1,seed:9,...(invasion?{invasion:true}:{})},profile:{name:save.name,level:save.level,weapon:'blade',mods:buildRoundMods(save),threats:{S2:1},lineage:save.lineage||'human',invasionConsent:uid==='host'||guestConsent,role:uid==='host'?'hunter':guestRole,rewardSave:save},...transport});}
 s.guest.update(34,emptyInput());return{s,saves};
}
