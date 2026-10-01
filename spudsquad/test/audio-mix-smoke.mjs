// Real Chromium decoder + offline WebAudio graph. No subjective listening/screenshot.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const {chromium}=await import('/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs');
const blobs={};for(const key of ['smg','pistol','shotgun','bow'])blobs[key]=(await readFile(fileURLToPath(new URL('../assets/audio/sfx_'+key+'.mp3',import.meta.url)))).toString('base64');
const browser=await chromium.launch({headless:true,executablePath:'/home/cocy/bin/chromium',args:['--no-sandbox','--disable-gpu']});
try {
  const page=await browser.newPage();
  const result=await page.evaluate(async blobs=>{
    const report={};
    for(const limited of [false,true]) {
      const ctx=new OfflineAudioContext(1,48000,24000), gain=ctx.createGain();gain.gain.value=1;gain.connect(ctx.destination);
      let bus=gain;
      if(limited){bus=ctx.createDynamicsCompressor();bus.threshold.value=-6;bus.knee.value=6;bus.ratio.value=12;bus.attack.value=.003;bus.release.value=.08;bus.connect(gain);}
      const buffers={};for(const [k,base64] of Object.entries(blobs))buffers[k]=await ctx.decodeAudioData(Uint8Array.from(atob(base64),c=>c.charCodeAt(0)).buffer);
      // Conservative maximum of 3 firearm + 2 bow voices; cut tails as voice stealing does.
      for(let t=0;t<1;t+=.18)for(const [key,count,level] of [['shotgun',3,.55],['bow',2,.65]])for(let n=0;n<count;n++){
        const src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=buffers[key];g.gain.value=.8*level;src.connect(g);g.connect(bus);src.start(t);src.stop(Math.min(t+.18,2));
      }
      const audio=(await ctx.startRendering()).getChannelData(0);let peak=0,power=0;for(const v of audio){peak=Math.max(peak,Math.abs(v));power+=v*v;}
      report[limited?'scopedCompressedMix':'uncompressedMix']={peak,rms:Math.sqrt(power/audio.length)};
      report.decodedDurations=Object.fromEntries(Object.entries(buffers).map(([k,b])=>[k,b.duration]));
    }
    return report;
  },blobs);
  assert.ok(result.scopedCompressedMix.peak<1,'no clipping under maximal bounded gun/bow stress');
  assert.ok(result.scopedCompressedMix.peak<result.uncompressedMix.peak,'scoped dynamics actually attenuate summed peak');
  assert.ok(result.scopedCompressedMix.rms>0,'actual sound is non-silent');
  assert.ok(result.decodedDurations.smg<.12);console.log(JSON.stringify({passed:true,subjectiveListening:false,stressMasterVolume:1,...result},null,2));
} finally {await browser.close();}
