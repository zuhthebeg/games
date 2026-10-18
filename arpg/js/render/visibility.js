// Invisible pawns stay in the sim/collision snapshot, but only their owner may
// draw a ghost. Filter every attached visual/name/marker before renderer pools.
export function presentationWorld(world) {
  const owner=world.entities[0]?.id;
  const hidden=new Set(world.entities.filter(e=>e.id!==owner && e.invisibleUntil>world.tick).map(e=>e.id));
  if (!hidden.size) return world;
  return {...world,entities:world.entities.filter(e=>!hidden.has(e.id)),
    ...(world.telegraphs ? {telegraphs:world.telegraphs.filter(t=>!hidden.has(t.id))} : {})};
}
