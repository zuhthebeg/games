// Renderer-only clock and lease: no world writes, RNG, timers, input or network.
export const LIFT = Object.freeze({stage:'M_MINE_CART',size:192,columns:8,count:32,fps:4,x:400,y:185,anchorX:.5,anchorY:.92});
export const liftFrame = (seconds,reduced=false) => reduced ? 0 : Math.floor(Math.max(0,seconds)*LIFT.fps)%LIFT.count;
export class MineLiftState {
  constructor(load,dispose,show) { this.load=load;this.dispose=dispose;this.show=show;this.generation=0;this.asset=null;this.seconds=0;this.active=false;this.failed=false;this.pending=null; }
  reset(stage) {
    const generation=++this.generation;this.active=stage===LIFT.stage;this.seconds=0;this.failed=false;this.show(null,0);
    if(this.asset){this.dispose(this.asset);this.asset=null;}
    if(!this.active){this.pending=null;return;}
    this.pending=Promise.resolve().then(()=>this.load()).then(asset=>{
      if(generation!==this.generation){this.dispose(asset);return;}
      this.asset=asset;this.show(asset,0);
    }).catch(()=>{if(generation===this.generation)this.failed=true;});
  }
  update(dt,reduced) { if(!this.active)return;this.seconds+=Math.max(0,dt);if(this.asset)this.show(this.asset,liftFrame(this.seconds,reduced)); }
}
