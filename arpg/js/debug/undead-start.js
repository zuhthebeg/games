import { createKnightSession } from '../solo/undead-session.js';
import { createSkeletonSave } from '../meta/character-creation.js';
export { terminalPresentation } from '../solo/undead-session.js';
export const UNDEAD_LABEL = '언데드 · 해골 기사 · 저장 안 됨';
export function createUndeadSession(provider) {
  const session = createKnightSession(provider, createSkeletonSave({ lineage: 'skeleton_knight', name: '디버그 기사', answers: [0, 0, 0, 0, 0], createdAt: 0 }));
  session.persistent = false;
  return session;
}
