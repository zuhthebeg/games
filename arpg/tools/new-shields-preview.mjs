// Local offscreen art review only. Never points at a production world/save.
import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import {spawn} from 'node:child_process';import {writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url)),out=process.env.ARPG_NEW_SHIELDS_OUT||'/home/cocy/.openclaw/workspace/tmp/arpg-new-shields';
const server=spawn('python3',['-m','http.server','8973','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
try{const page=await browser.newPage();for(let i=0;i<30;i++){try{if((await fetch('http://127.0.0.1:8973/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}await page.goto('http://127.0.0.1:8973/');const result=await page.evaluate(async()=>{
 const {Application}=await import('/arpg/vendor/pixi-8.22.0.min.mjs'),{VisualProvider}=await import('/arpg/js/render/visual-provider.js'),{equipmentVisual}=await import('/arpg/js/render/paperdoll-state.js'),{createSave}=await import('/arpg/js/meta/save.js'),{SHIELDS}=await import('/arpg/js/content/shields.js'),{SHIELD_HAND_ANCHORS}=await import('/arpg/js/render/shield-hand-anchors.js');
 const app=new Application();await app.init({width:1152,height:512,background:0x22292b,antialias:true,autoStart:false});const provider=new VisualProvider(),rows=[];let maxBoneError=0;
 for(const type of Object.keys(SHIELDS))for(let kit=0;kit<3;kit++){
 const save=createSave({name:'fixture',weapon:kit===1?'focus':'blade',answers:[0,0,0,0,0],createdAt:1});if(kit===2)save.lineage='skeleton_knight';
 const e={id:1,kind:'player',weapon:kit===1?'focus':'blade',weaponForm:kit===1?'wand':'sword',offhand:'shield',shieldModel:{v:1,type},r:16,facing:0,hp:100,maxHp:100,dodge:{dashLeft:0},equipmentVisual:equipmentVisual(save)};
 const v=provider.createVisual(e);app.stage.addChild(v.container);
 for(let i=0;i<150;i++){v.update(e,{age:0,flash:0,hurt:0,deadAge:0},0);if(v.debug.mode==='paperdoll')break;await new Promise(r=>setTimeout(r,50));}
 if(v.debug.mode!=='paperdoll')throw Error(JSON.stringify(v.debug));
 for(let a=0;a<5;a++)for(let d=0;d<8;d++){
 const anim={age:0,flash:0,hurt:a===4?1:0,deadAge:0};e.facing=d*Math.PI/4;e.moving=a===1;e.act=a===2?{id:'slash',phase:'active',elapsed:8,def:{windupMs:150,lockMs:60,activeMs:100,recoveryMs:300}}:null;e.dodge={dashLeft:a===3?3:0,startedTick:a===3?2:null};
 v.update(e,anim,.08);v.update(e,anim,.08);v.container.position.set(72,105);app.renderer.render(app.stage);
 const debug=JSON.parse(JSON.stringify(v.debug)),p=debug.physicalShield,h=SHIELD_HAND_ANCHORS[kit===2?'skeleton':kit===1?'focus':'blade'][debug.state+'_'+debug.direction][debug.frame];
 const error=Math.hypot(p.handX-h[0]*debug.scale,p.handY-h[1]*debug.scale);maxBoneError=Math.max(maxBoneError,error);if(error>.02||p.shape!==SHIELDS[type].shape)throw Error('socket/shape mismatch '+type);
 rows.push({type,kit,a,d,debug,...(kit===0&&a===0?{image:app.renderer.extract.canvas({target:v.container}).toDataURL()}: {})});
 }
 v.destroy();
 }
 return {status:'PASS',count:rows.length,maxBoneError,rows};
 });await writeFile(out+'/capture.json',JSON.stringify(result));console.log(JSON.stringify({status:result.status,count:result.count,maxBoneError:result.maxBoneError}));
}finally{await browser.close();server.kill();}
