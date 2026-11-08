import assert from 'node:assert/strict';
import test from 'node:test';
import { createTutorialState, shouldRenderTutorialCard, transitionTutorial } from '../js/ui/tutorial.js';

test('tutorial follows combat telegraph and hub guidance steps', () => {
  let state = createTutorialState();
  assert.equal(state.step, 'board');
  state = transitionTutorial(state, { type: 'beginCombat' });
  for (const type of ['movement', 'attack', 'telegraph', 'dodge', 'skill', 'loot', 'stageComplete', 'board', 'blacksmith', 'equipment']) {
    state = transitionTutorial(state, { type });
  }
  assert.equal(state.active, false);
  assert.equal(state.completed, true);
  assert.equal(state.combatComplete, true);
});

test('tutorial can be skipped and replayed from the beginning', () => {
  let state = transitionTutorial(createTutorialState(), { type: 'skip' });
  assert.equal(state.skipped, true);
  assert.equal(state.active, false);
  state = transitionTutorial(state, { type: 'replay' });
  assert.equal(state.step, 'board');
  assert.equal(state.active, true);
  assert.equal(state.skipped, false);
});

test('hub-only tutorial steps never render in a stage', () => {
  for (const step of ['board', 'blacksmith', 'equipment']) {
    const state = createTutorialState({ step });
    assert.equal(shouldRenderTutorialCard('stage', state), false);
    assert.equal(shouldRenderTutorialCard('hub', state), true);
  }
  assert.equal(shouldRenderTutorialCard('stage', createTutorialState({ step: 'movement' })), true);
});

test('the first hub board selection starts combat guidance without consuming the post-stage board step', () => {
  let state = createTutorialState();
  state = transitionTutorial(state, { type: 'board' });
  assert.equal(state.step, 'board');
  state = transitionTutorial(state, { type: 'beginCombat' });
  assert.equal(state.step, 'movement');
  state = transitionTutorial(state, { type: 'stageComplete' });
  state = transitionTutorial(state, { type: 'board' });
  assert.equal(state.step, 'blacksmith');
});

test('perfect dodge tutorial hint is persisted once even after tutorial completion', () => {
  const completed = createTutorialState({
    step: 'done',
    completed: true,
    combatComplete: true,
  });
  const shown = transitionTutorial(completed, { type: 'perfectDodge' });
  assert.equal(shown.perfectDodgeHintShown, true);
  assert.equal(shown.completed, true);
  assert.equal(transitionTutorial(shown, { type: 'perfectDodge' }), shown);
});
