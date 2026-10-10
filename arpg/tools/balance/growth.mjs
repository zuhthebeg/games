import {writeFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';
import {preset,simulate,summarize} from './botsim.mjs';import {deriveMods} from '../../js/meta/stats.js';
const out=process.argv[2];if(!out)throw new Error('growth.mjs output.json');
const stats=[],bots=[];
for(const level of [1,5,10,20,30])for(const weapon of ['blade','bow','focus'])for(const policy of ['balanced','agile']) {
 const save=preset('S1',{level,weapon,stats:policy}),mods=deriveMods(save);
 stats.push({level,weapon,policy,allocated:save.stats,mods});
}
for(const level of [5,10,20,30])for(const weapon of ['blade','focus'])for(const stage of ['S4','S6']) {
 const runs=Array.from({length:100},(_,i)=>simulate({stage,level,weapon,seed:i+1}));
 const summary=summarize(runs);bots.push({stage,level,weapon,gear:'T2 fine+0, no affix',...summary,runs});
 console.error(stage,level,weapon,'clear',summary.clearRate,'min',summary.meanClearMinutes,'potions',summary.potions);
}
writeFileSync(out,JSON.stringify({sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),n:100,seeds:'1..100',stats,bots},null,2)+'\n');
