import {execFileSync} from 'node:child_process';
const uri=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
export async function frozenSim(ref){const data=execFileSync('git',['show',ref+':beasthunt/js/data.js'],{encoding:'utf8'});let sim=execFileSync('git',['show',ref+':beasthunt/js/sim.js'],{encoding:'utf8'});const path=sim.split("from './data.js")[1].split("'")[0];sim=sim.replace('./data.js'+path,uri(data));return import(uri(sim));}
