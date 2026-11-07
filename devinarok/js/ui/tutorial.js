export const TUTORIAL_COPY = Object.freeze({
  movement: { title: '움직여 보기', message: '화면 왼쪽 조이스틱이나 방향키로 이동해 보세요.' },
  attack: { title: '공격하기', message: '공격 버튼이나 J 키로 적을 공격하세요.' },
  dodge: { title: '위험 표시 살피기', message: '적이 공격을 예고하면 위험 표시를 보고 회피하세요.' },
  dodgeTelegraph: { title: '위험 표시를 피하세요', message: '조이스틱과 회피 버튼, 또는 방향키와 K 키로 표시 밖으로 벗어나세요.' },
  skill: { title: '기술 사용하기', message: '기술 버튼이나 1 키로 계열 기술을 사용해 보세요.' },
  loot: { title: '전리품 줍기', message: '적이 떨어뜨린 전리품 가까이 다가가 자동으로 주우세요.' },
  board: { title: '출정 게시판', message: '게시판에서 다음 여정을 골라 출정할 수 있어요.' },
  blacksmith: { title: '대장간', message: '대장간에서 장비를 강화할 수 있어요.' },
  equipment: { title: '장비함', message: '장비함을 열고 더 좋은 장비를 착용해 보세요.' },
});

export function createTutorialState(saved = {}) {
  const step = saved.step ?? 'board';
  return {
    step,
    skipped: Boolean(saved.skipped),
    completed: Boolean(saved.completed),
    combatComplete: Boolean(saved.combatComplete),
    active: !saved.skipped && !saved.completed && step !== 'done',
  };
}

export function resolveTutorialSortie(stageId, state) {
  const beginCombat = Boolean(state?.active && state.step === 'board' && !state.combatComplete);
  return { stageId: beginCombat ? 'C1' : stageId, beginCombat };
}

export function transitionTutorial(state, event) {
  if (!state.active && event.type !== 'replay') return state;
  let step = state.step;
  let skipped = state.skipped;
  let completed = state.completed;
  let combatComplete = state.combatComplete;
  if (event.type === 'replay') {
    step = 'board';
    skipped = false;
    completed = false;
    combatComplete = false;
  } else if (event.type === 'skip') {
    step = 'done';
    skipped = true;
  } else if (event.type === 'beginCombat' && step === 'board' && !combatComplete) step = 'movement';
  else if (event.type === 'movement' && step === 'movement') step = 'attack';
  else if (event.type === 'attack' && step === 'attack') step = 'dodge';
  else if (event.type === 'telegraph' && step === 'dodge') step = 'dodgeTelegraph';
  else if (event.type === 'dodge' && step === 'dodgeTelegraph') step = 'skill';
  else if (event.type === 'skill' && step === 'skill') step = 'loot';
  else if (event.type === 'loot' && step === 'loot') {
    step = 'awaitHub';
    combatComplete = true;
  } else if (event.type === 'stageComplete' && !completed) {
    step = 'board';
    combatComplete = true;
  } else if (event.type === 'board' && step === 'board' && combatComplete) step = 'blacksmith';
  else if (event.type === 'blacksmith' && step === 'blacksmith') step = 'equipment';
  else if (event.type === 'equipment' && step === 'equipment') {
    step = 'done';
    completed = true;
  }
  return {
    step,
    skipped,
    completed,
    combatComplete,
    active: !skipped && !completed && step !== 'done',
  };
}
