import { Application, Assets, Spritesheet, Sprite } from '../../../vendor/pixi-8.22.0.min.mjs';
const root=new URL('../../../assets/sprites/player-death-knight/',import.meta.url);
const descriptor=await (await fetch(new URL('kit-descriptor.json',root))).json();
const textures={},sheets=[],groups={};
for(const filename of descriptor.sheets){
 const data=await (await fetch(new URL(filename,root))).json();
 const texture=await Assets.load(new URL(data.meta.image,root).href);
 const sheet=new Spritesheet(texture,data);await sheet.parse();sheets.push({sheet,data,texture});
 Object.assign(textures,sheet.textures);
 for(const [name,names] of Object.entries(data.animations)){if(groups[name])throw new Error('Fragmented group '+name);groups[name]=names;}
}
for(const names of Object.values(groups)) names.sort();
const app=new Application();await app.init({width:128,height:128,resolution:1,antialias:false,backgroundAlpha:0,preference:'webgl'});
document.querySelector('#stage').append(app.canvas);
const sprite=new Sprite(textures.attack_E_006);sprite.scale.set(.5);sprite.anchor.set(descriptor.anchor.x,descriptor.anchor.y);sprite.position.set(descriptor.anchor.x*128,descriptor.anchor.y*128);app.stage.addChild(sprite);
const state=document.querySelector('#state'),dir=document.querySelector('#direction'),slider=document.querySelector('#frame'),status=document.querySelector('#status');
for(const name of descriptor.animations)state.add(new Option(name,name));
for(const name of ['E','SE','S','SW','W','NW','N','NE'])dir.add(new Option(name,name));
state.value='attack';dir.value='E';let playing=true,elapsed=0,index=6;
function draw(){const names=groups[state.value+'_'+dir.value];index=Math.min(index,names.length-1);sprite.texture=textures[names[index]];slider.max=names.length-1;slider.value=index;status.value=`${index+1}/${names.length} · ${names[index]}`;app.renderer.render(app.stage);}
state.onchange=dir.onchange=()=>{index=0;elapsed=0;draw();};slider.oninput=()=>{playing=false;index=+slider.value;draw();};document.querySelector('#play').onclick=()=>{playing=!playing;document.querySelector('#play').textContent=playing?'Pause':'Play';};
app.ticker.add(t=>{if(!playing)return;elapsed+=t.deltaMS;const names=groups[state.value+'_'+dir.value],step=state.value==='dodge'?200/names.length:1000/descriptor.fps;if(elapsed>=step){elapsed%=step;index=(state.value==='idle'||state.value==='run')?(index+1)%names.length:Math.min(index+1,names.length-1);draw();}});draw();
window.deathknightPreview={app,sprite,textures,sheets,groups,descriptor,ready:true,fixture(){playing=false;state.value='attack';dir.value='E';index=6;draw();}};
