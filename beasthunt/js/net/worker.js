// World simulation lives here, not on the hidden document's throttled timers.
import {HostSession} from './host.js';
const STEP_MS=1000/60;
let session=null,timer=null,next=0;
self.onmessage=({data})=>{
  if(data.type==='init') {
    if(timer!==null)clearInterval(timer);
    session=new HostSession({...data.options,transport:{
      sendState:packet=>self.postMessage({type:'state',packet}),
      sendEvent:packet=>self.postMessage({type:'event',packet})
    }});
    session.initial();next=performance.now()+STEP_MS;
    timer=setInterval(()=>{
      const now=performance.now();let steps=0;
      // Preserve all ticks across ordinary scheduler jitter. The cap only bounds
      // one callback's CPU use; remaining debt is processed on the next wake.
      while(now>=next && steps++<120){session.tick();next+=STEP_MS;}
    },4);
    self.postMessage({type:'ready'});
  } else if(data.type==='receive') {
    session?.receive(data.from,data.packet,data.nowMs);
   } else if(data.type==='roster') {
    if(session)for(const p of session.sim.players)if(!data.ids.includes(p.id)){session.owners.delete(p.id);p.state='dead';p.hp=0;}
  } else if(data.type==='snapshot') {
    self.postMessage({type:'snapshot',request:data.request,snapshot:session?.sim.snapshot(),metrics:session?{accepted:session.claims.accepted,rejected:session.claims.rejected,reasons:session.claims.reasons,schemaDetails:session.claims.schemaDetails}:null});
  } else if(data.type==='stop') {
    if(timer!==null)clearInterval(timer);timer=null;session=null;
  }
};
