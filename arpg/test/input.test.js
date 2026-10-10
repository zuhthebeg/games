import test from 'node:test';
import assert from 'node:assert/strict';
import {InputLayer} from '../js/input.js';
class Element extends EventTarget {
  constructor(action){super();this.dataset={input:action};this.hidden=true;this.disabled=false;this.style={};this.classList={add(){},remove(){}};this.firstElementChild={style:{}};}
  setPointerCapture(){}
}
function fire(target,type,props={}){const e=new Event(type,{cancelable:true});Object.assign(e,props);target.dispatchEvent(e);}
function fixture(){
  globalThis.window=new EventTarget();window.closest=()=>null;globalThis.document=new Element();globalThis.innerWidth=390;
  const pad=new Element(),surface=new Element(),buttons=['attack','dodgeEdge','skillEdge','potionEdge','scrollEdge'].map(a=>new Element(a));
  document.querySelector=()=>pad;const actions={querySelectorAll:()=>buttons};
  const input=new InputLayer(surface,actions,(_x,_y,v)=>{v.aimX=10;v.aimY=20;});
  return {input,surface,buttons};
}
test('input: short key/button taps persist until consumed once',()=>{
  const {input,buttons}=fixture();
  for(const [code,edge] of [['Space','dodgeEdge'],['KeyK','skillEdge'],['KeyQ','potionEdge'],['KeyR','scrollEdge']]){
    fire(window,'keydown',{code});fire(window,'keyup',{code});
    assert.equal(input.consume()[edge],true);assert.equal(input.consume()[edge],false);
  }
  fire(buttons[2],'pointerdown',{pointerId:7});fire(window,'pointerup',{pointerId:7});
  assert.equal(input.consume().skillEdge,true);assert.equal(input.consume().skillEdge,false);
});
test('input: mouse chords, attack hold, touch auto-aim and reset',()=>{
  const {input,surface,buttons}=fixture();
  fire(surface,'mousedown',{button:0,clientX:100,clientY:200});
  fire(surface,'mousedown',{button:2,clientX:100,clientY:200});
  let v=input.consume();assert.equal(v.attack,true);assert.equal(v.skillEdge,true);assert.equal(v.aimX,10);
  fire(window,'mouseup',{button:2});assert.equal(input.consume().attack,true);
  fire(window,'mouseup',{button:0});assert.equal(input.consume().attack,false);
  fire(buttons[0],'pointerdown',{pointerId:8});v=input.consume();assert.equal(v.attack,true);assert.equal(v.aimX,0);assert.equal(v.aimY,0);
  fire(window,'pointercancel',{pointerId:8});assert.equal(input.consume().attack,false);
  input.latch('dodgeEdge');input.reset();assert.equal(input.consume().dodgeEdge,false);
});
