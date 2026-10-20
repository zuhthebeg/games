// Versioned equipment presentation, not a guest combat capability. Host resolves
// all guard/speed/ward properties from its validated equipped definition.
export const SHIELDS = Object.freeze({
  buckler: Object.freeze({shape:'round',width:.72,height:.67,block:.55,speed:.03,attack:.02}),
  kite_shield: Object.freeze({shape:'teardrop',width:.95,height:1.18,block:.72}),
  tower_shield: Object.freeze({shape:'tower',width:1.16,height:1.37,block:.80,speed:-.08}),
  bone_shield: Object.freeze({shape:'bone',width:1.02,height:1.10,block:.73,undeadWard:.08}),
});
export const validShieldModel = model => !!model && model.v === 1 && Object.hasOwn(SHIELDS,model.type);
export const shieldSpec = model => validShieldModel(model) ? SHIELDS[model.type] : null;
