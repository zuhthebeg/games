import {Application} from '../vendor/pixi-8.22.0.min.mjs';
import {createWorld,addPlayer,startStage,step} from './sim/world.js';
import {TICK_MS} from './sim/core.js';
import {InputLayer} from './input.js';
import {ArenaRenderer} from './render/renderer.js';
import {HUD} from './ui/hud.js';
let world=null,running=false,hidden=document.hidden,accumulator=0,lastTime=performance.now();
// Read-only live proxy, including nested arrays/objects. Debuggers cannot alter the sim.
const proxies=new WeakMap();
function readonly(value){
  if(!value||typeof value!=='object')return value;
  if(!proxies.has(value))proxies.set(value,new Proxy(value,{get(target,key){return readonly(Reflect.get(target,key));},set(){throw new TypeError('read-only simulation');},deleteProperty(){throw new TypeError('read-only simulation');},defineProperty(){throw new TypeError('read-only simulation');},getOwnPropertyDescriptor(target,key){const d=Reflect.getOwnPropertyDescriptor(target,key);if(d?.configurable&&'value'in d)d.value=readonly(d.value);return d;},preventExtensions(){throw new TypeError('read-only simulation');},setPrototypeOf(){throw new TypeError('read-only simulation');}}));
  return proxies.get(value);
}
Object.defineProperty(window,'__arpg',{value:Object.freeze({get world(){return readonly(world);}})});
try {
  const app=new Application();
  await app.init({resizeTo:window,autoDensity:true,resolution:Math.min(devicePixelRatio||1,2),preference:'webgl',background:0x0b1010,antialias:false,autoStart:false});
  document.querySelector('#surface').appendChild(app.canvas);
  const renderer=new ArenaRenderer(app);
  const input=new InputLayer(document.querySelector('#surface'),document.querySelector('#actions'),(x,y,v)=>renderer.aim(x,y,v));
  const hud=new HUD((weapon,stage,reduced)=>{
    input.reset();world=createWorld({seed:11,arena:{w:1400,h:860}});addPlayer(world,{pid:'local',weapon});startStage(world,stage);
    renderer.reset(world,reduced);hud.begin(world);running=true;accumulator=0;lastTime=performance.now();
  },()=>{running=false;input.reset();hud.showMenu();});
  const inputs={local:null};hud.ready();
  document.addEventListener('visibilitychange',()=>{hidden=document.hidden;accumulator=0;lastTime=performance.now();input.reset();hud.pause(hidden&&running);});
  function frame(now){
    const elapsed=Math.min(250,Math.max(0,now-lastTime));lastTime=now;
    if(!hidden&&world){
      if(running){
        accumulator+=elapsed;let count=0;
        while(accumulator>=TICK_MS&&count<5){
          renderer.snapshot(world);inputs.local=input.consume();const events=step(world,inputs);
          renderer.events(world,events);hud.events(events);accumulator-=TICK_MS;count++;
          if(world.round.state!=='running'){running=false;input.reset();accumulator=0;hud.end(world);break;}
        }
        if(count===5&&accumulator>=TICK_MS)accumulator%=TICK_MS;
      }
      renderer.render(world,running?accumulator/TICK_MS:1,elapsed/1000);if(running)hud.update(world,elapsed/1000);
    }
    if(!hidden)app.render();requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} catch(error){document.querySelector('#boot-error').textContent=`렌더러 초기화 실패: ${error.message}`;console.error(error);}
