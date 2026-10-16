// Race uncooperative body/decode promises too; a late bitmap still needs closing.
export function abortable(promise, signal, disposeLate) {
  if (!signal) return promise;
  return new Promise((resolve,reject)=>{
    let done=false;
    const abort=()=>{if(done)return;done=true;signal.removeEventListener('abort',abort);reject(signal.reason || new Error('Paperdoll superseded'));};
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(promise).then(value=>{
      if(done){disposeLate?.(value);return;}done=true;signal.removeEventListener('abort',abort);resolve(value);
    },error=>{if(done)return;done=true;signal.removeEventListener('abort',abort);reject(error);});
    if(signal.aborted)abort();
  });
}
export async function loadResponse(url,signal) {
  signal?.throwIfAborted();
  const response=await abortable(fetch(url,{signal}),signal);
  if(!response.ok)throw new Error(`Composition HTTP ${response.status}`);
  return response;
}
export async function loadJSON(url,signal){return abortable((await loadResponse(url,signal)).json(),signal);}
export async function loadBlob(url,signal){return abortable((await loadResponse(url,signal)).blob(),signal);}
export function decodeBitmap(blob,signal,options){signal?.throwIfAborted();return abortable(createImageBitmap(blob,options),signal,b=>b.close());}
