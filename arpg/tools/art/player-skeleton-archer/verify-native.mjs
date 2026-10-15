// Bounded standalone native Chromium decode/trim/scale fixture; no game or screenshots.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',({'.html':'text/html','.mjs':'text/javascript','.json':'application/json','.webp':'image/webp','.png':'image/png'})[path.extname(p)]||'application/octet-stream');res.end(fs.readFileSync(p));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:800,height:600},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/tools/art/player-skeleton-archer/preview.html`);
 await page.waitForFunction(()=>window.archerPreview?.ready,{},{timeout:30000});
 const result=await page.evaluate(async()=>{
  const p=window.archerPreview;p.fixture();const check=(ok,msg)=>{if(!ok)throw Error(msg);};
  check(Object.keys(p.textures).length===464,'all 464 textures');check(Object.keys(p.groups).length===48,'48 animation groups');
  const sheets=[];
  for(const {sheet,data,texture} of p.sheets){const s=texture.source;check(s.resolution===.5&&sheet.resolution===.5,'actual Pixi resolution .5');check(s.pixelWidth===data.meta.size.w&&s.pixelHeight===data.meta.size.h,'native decoded sheet pixel dimensions');sheets.push({pixelWidth:s.pixelWidth,pixelHeight:s.pixelHeight,resolution:s.resolution,logicalWidth:s.width,logicalHeight:s.height});}
  for(const [name,t] of Object.entries(p.textures)){check(t.orig.width===256&&t.orig.height===256,'logical orig '+name);check(t.trim.x>=0&&t.trim.y>=0&&t.trim.right<=256&&t.trim.bottom<=256,'trim bounds '+name);check(t.defaultAnchor.x===p.descriptor.anchor.x&&t.defaultAnchor.y===p.descriptor.anchor.y,'anchor '+name);}
  const t=p.sprite.texture,physical=p.sheets.find(s=>s.sheet.textures.attack_E_006).data.frames.attack_E_006;
  check(t.frame.width===physical.frame.w*2&&t.trim.x===physical.spriteSourceSize.x*2,'fixture physical/logical trim');
  const image=new Image();image.src='./final/fixture-physical128.png';await image.decode();const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const expected=ctx.getImageData(0,0,128,128).data;
  const gl=p.app.canvas.getContext('webgl2')||p.app.canvas.getContext('webgl');check(!!gl,'actual WebGL context');
  // The default WebGL drawing buffer is not preserved across the async decode.
  p.app.renderer.render(p.app.stage);
  const pixels=new Uint8Array(128*128*4);gl.readPixels(0,0,128,128,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  let mismatch=0,maxError=0,opaque=0,minX=128,minY=128,maxX=-1,maxY=-1;
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){const a=pixels[((127-y)*128+x)*4+3],b=expected[(y*128+x)*4+3],err=Math.abs(a-b);if(err)mismatch++;maxError=Math.max(maxError,err);if(a){opaque++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
  check(mismatch===0,'native reconstructed source alpha must be exact: '+mismatch+' max '+maxError);check(opaque>0,'not blank');
  check(minX===physical.spriteSourceSize.x&&minY===physical.spriteSourceSize.y&&maxX+1===physical.spriteSourceSize.x+physical.frame.w&&maxY+1===physical.spriteSourceSize.y+physical.frame.h,'native any-alpha trim bounds');
  const b=p.sprite.getBounds();return {status:'PASS',mode:'installed native Linux Chromium, actual shipped Pixi 8.22.0 + WebGL SwiftShader; not physical phone/GPU performance',browser:navigator.userAgent,textures:464,groups:48,sheets,fixture:'attack_E_006',canvas:[p.app.canvas.width,p.app.canvas.height],spriteBounds:{x:b.x,y:b.y,width:b.width,height:b.height},anchor:{x:p.sprite.anchor.x,y:p.sprite.anchor.y},nativeAlphaExact:true,alphaMismatchPixels:mismatch,maxAlphaError:maxError,anyAlphaBounds:[minX,minY,maxX+1,maxY+1],opaquePixels:opaque,screenshots:0,gameRuntimeLoaded:false,storageTouched:false};
 });
 if(errors.length)throw Error(errors.join('\n'));
 result.pageErrors=errors;result.bindings={};
 for(const dir of [here,path.join(root,'assets/sprites/player-skeleton-archer')])for(const n of fs.readdirSync(dir))if(fs.statSync(path.join(dir,n)).isFile()&&n!=='native-validation.json'&&['.mjs','.html','.webp','.json'].includes(path.extname(n)))result.bindings[path.relative(root,path.join(dir,n))]=sha(path.join(dir,n));
 result.bindings['vendor/pixi-8.22.0.min.mjs']=sha(path.join(root,'vendor/pixi-8.22.0.min.mjs'));result.bindings['tools/art/player-skeleton-archer/final/fixture-physical128.png']=sha(path.join(here,'final/fixture-physical128.png'));
 fs.writeFileSync(path.join(here,'native-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
