// Display-only hooks; actual HP changes and exactly-once delivery belong to the host sim.
export function healingFeedback(renderer, event) {
  if (['shield', 'shieldBreak', 'freeze', 'freezeBreak', 'burn'].includes(event.type)) {
    const color = event.type === 'burn' ? 0xf8a75e : event.type.startsWith('freeze') ? 0xb5f0ff : 0xa8dafa;
    renderer.effect(event.x, event.y, 28, color, .3);
    renderer.number({shield:'보호막',shieldBreak:event.remaining > 0 ? '방어' : '보호막 파괴',freeze:'빙결',freezeBreak:'빙결 파괴',burn:'화상'}[event.type], event.x, event.y, color);
    return true;
  }
  if (event.type === 'turnUndead') {
    // Pillar/runes/motes are owned by the fixed HolyVfx pool.
    if (event.success && !renderer.reduced) renderer.holyWashLeft = .16;
    const target = renderer.views?.get(event.dst);
    if (target && event.success) target.holyLeft = 1.2;
    renderer.number(event.success ? '정화' : '저항', event.x, event.y, event.success ? 0xf5df9b : 0x9ca6b0);
    return true;
  }
  if (event.type === 'healCast') {
    renderer.effect(event.x, event.y, event.radius, 0x79dca0, .4);
    return true;
  }
  if (event.type === 'heal') {
    renderer.number(`+${Math.max(1, Math.round(event.heal))}`, event.x, event.y, 0x79dca0);
    return true;
  }
  return false;
}
