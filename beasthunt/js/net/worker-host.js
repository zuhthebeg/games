// Browser adapter. The caller owns lobby lifetime and terminates this worker.
export class WorkerHost {
  constructor(options,onPacket) {
    this.worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
    this.worker.onmessage=({data})=>{
      if(data.type==='state' || data.type==='event')onPacket(data.packet,data.type);
    };
    this.worker.postMessage({type:'init',options});
  }
  receive(from,packet,nowMs=performance.now()) {this.worker.postMessage({type:'receive',from,packet,nowMs});}
  close() {this.worker.terminate();}
}
