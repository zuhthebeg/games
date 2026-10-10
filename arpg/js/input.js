// Edges survive key-up and pointer-up until consume() at the next fixed tick.
export class InputLayer {
  constructor(surface, actions, aimVector) {
    this.keys = new Set(); this.pointers = new Map(); this.edges = {};
    this.buttons = new Map(); this.joy = null; this.jx = 0; this.jy = 0;
    this.mouseX = 0; this.mouseY = 0; this.mouseAim = false; this.mouseAttack = false; this.aimVector = aimVector;
    this.pad = document.querySelector('#joystick');
    this.value = {mx:0,my:0,aimX:0,aimY:0,attack:false,skillEdge:false,dodgeEdge:false,potionEdge:false,scrollEdge:false};
    const edgeKeys = {Space:'dodgeEdge',ShiftLeft:'dodgeEdge',ShiftRight:'dodgeEdge',KeyK:'skillEdge',KeyQ:'potionEdge',KeyR:'scrollEdge'};
    const allowed = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','KeyJ',...Object.keys(edgeKeys)]);
    window.addEventListener('keydown', e => {
      if (!allowed.has(e.code) || e.target.closest('select,input,form')) return;
      e.preventDefault(); if (!this.keys.has(e.code) && edgeKeys[e.code]) this.latch(edgeKeys[e.code]);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => this.reset());
    for (const button of actions.querySelectorAll('[data-input]')) {
      const action = button.dataset.input; this.buttons.set(action, button);
      button.addEventListener('pointerdown', e => {
        if (button.disabled) return; e.preventDefault(); button.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, action); button.classList.add('held');
        if (action !== 'attack') this.latch(action);
      });
      // Keyboard activation of the native DOM button, not a duplicate pointer click.
      button.addEventListener('click', e => { if (e.detail === 0) this.latch(action === 'attack' ? 'attackTap' : action); });
    }
    surface.addEventListener('pointerdown', e => {
      e.preventDefault(); surface.setPointerCapture(e.pointerId);
      if (e.pointerType === 'mouse') {
        this.mouseX=e.clientX; this.mouseY=e.clientY;
        // Mouse chord handling lives in mousedown: pointerdown only fires
        // for the first mouse button, so it cannot detect RMB while LMB is held.
      } else if (e.clientX < innerWidth * .5 && !this.joy) {
        this.joy={id:e.pointerId,x:e.clientX,y:e.clientY};
        this.pad.hidden=false; this.pad.style.left=`${e.clientX}px`;this.pad.style.top=`${e.clientY}px`;
      }
    });
    surface.addEventListener('mousedown', e => {
      e.preventDefault();this.mouseX=e.clientX;this.mouseY=e.clientY;
      if(e.button===0){this.mouseAttack=true;this.mouseAim=true;}
      if(e.button===2)this.latch('skillEdge');
    });
    window.addEventListener('mouseup',e=>{if(e.button===0){this.mouseAttack=false;this.mouseAim=false;}});
    window.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse') { this.mouseX=e.clientX;this.mouseY=e.clientY; }
      if (this.joy?.id !== e.pointerId) return;
      const dx=e.clientX-this.joy.x,dy=e.clientY-this.joy.y,d=Math.hypot(dx,dy),f=Math.min(1,42/(d||1));
      this.jx=dx*f/42;this.jy=dy*f/42;this.pad.firstElementChild.style.transform=`translate(${dx*f}px,${dy*f}px)`;
    });
    const release = e => {
      const a=this.pointers.get(e.pointerId);this.pointers.delete(e.pointerId);
      if (a && ![...this.pointers.values()].includes(a)) this.buttons.get(a)?.classList.remove('held');
      if (e.type==='pointercancel' && e.pointerType==='mouse') {this.mouseAttack=false;this.mouseAim=false;}
      if (this.joy?.id === e.pointerId) {this.joy=null;this.jx=this.jy=0;this.pad.hidden=true;}
    };
    window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);
    for (const type of ['contextmenu','dragstart','selectstart']) document.addEventListener(type,e=>e.preventDefault());
    document.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
  }
  latch(action) { this.edges[action]=true; }
  reset() {this.keys.clear();this.pointers.clear();this.edges={};this.joy=null;this.jx=this.jy=0;this.mouseAim=false;this.mouseAttack=false;this.pad.hidden=true;for(const b of this.buttons.values())b.classList.remove('held');}
  consume() {
    const v=this.value,k=this.keys;
    v.mx=(k.has('KeyD')||k.has('ArrowRight')?1:0)-(k.has('KeyA')||k.has('ArrowLeft')?1:0)+this.jx;
    v.my=(k.has('KeyS')||k.has('ArrowDown')?1:0)-(k.has('KeyW')||k.has('ArrowUp')?1:0)+this.jy;
    v.aimX=v.aimY=0;
    let held=this.mouseAttack;for(const a of this.pointers.values())if(a==='attack')held=true;
    v.attack=k.has('KeyJ')||held||!!this.edges.attackTap;
    if(this.mouseAim)this.aimVector(this.mouseX,this.mouseY,v);
    for(const a of ['skillEdge','dodgeEdge','potionEdge','scrollEdge'])v[a]=!!this.edges[a];
    for(const a in this.edges)this.edges[a]=false;
    return v;
  }
}
