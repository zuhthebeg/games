// Run the original full regression unchanged except for the explicit art fallback query.
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const path=new URL(`.p5b-fallback-${process.pid}.mjs`,import.meta.url);
const source=(await readFile(new URL('browser-smoke.mjs',import.meta.url),'utf8'))
  .replaceAll('${httpPort}/arpg/?','${httpPort}/arpg/?paperdoll=0&')
  .replaceAll('${httpPort}/arpg/`','${httpPort}/arpg/?paperdoll=0`');
try {
  await writeFile(path,source);
  const code=await new Promise(resolve=>{
    const child=spawn(process.execPath,[path.pathname],{stdio:'inherit',env:{...process.env,ARPG_CDP_PORT:process.env.ARPG_CDP_PORT || '19118',ARPG_HTTP_PORT:process.env.ARPG_HTTP_PORT || '8744'}});child.once('exit',resolve);
  });
  process.exitCode=code || 0;
} finally {await unlink(path);}
