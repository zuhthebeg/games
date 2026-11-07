import { createSaveRepository } from './save/repository.js';
import { ARENA } from './sim/arena.js';
import { addPlayer, createWorld } from './sim/world.js';
import { InputLayer } from './core/input.js';
import { FixedStepLoop } from './core/loop.js';
import { ArenaRenderer } from './render/renderer.js';

const $ = (selector) => document.querySelector(selector);
const titleScreen = $('#title-screen');
const gameScreen = $('#game-screen');
const createForm = $('#create-form');
const characterCard = $('#character-card');
const pauseMenu = $('#pause-menu');
let saves;
let character;
let world;
let renderer;
let input;
let loop;
let kills = 0;

async function refreshTitle() {
  character = (await saves.listCharacters()).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
  $('#save-warning').hidden = saves.persistent;
  $('#save-warning').textContent = saves.persistent
    ? ''
    : '이 환경에서는 저장이 브라우저 메모리에만 남습니다. 브라우저를 닫으면 기록이 사라질 수 있어요.';
  createForm.hidden = Boolean(character);
  characterCard.hidden = !character;
  if (character) {
    $('#character-name').textContent = character.name;
    $('#character-level').textContent = `기사 · Lv.${character.level} · 경험치 ${character.xp}`;
    $('#hud-name').textContent = character.name;
  }
}

function showTitle() {
  gameScreen.hidden = true;
  titleScreen.hidden = false;
  pauseMenu.hidden = true;
  loop?.stop();
  input?.destroy();
  renderer?.destroy();
  loop = input = renderer = null;
  refreshTitle();
}

async function startArena() {
  titleScreen.hidden = true;
  gameScreen.hidden = false;
  kills = 0;
  $('#kill-count').textContent = '0';
  $('#toast').textContent = '';
  world = createWorld({ seed: crypto.getRandomValues(new Uint32Array(1))[0], arena: ARENA });
  addPlayer(world, { playerId: character.id, characterKind: 'knight' });
  input = new InputLayer({ canvas: $('#scene'), controls: $('#controls') });
  renderer = new ArenaRenderer($('#scene'));
  await renderer.ready;
  $('#toast').textContent = `시험의 방 · 자산 ${(renderer.getLoadedBytes() / 1024 / 1024).toFixed(2)} MB`;
  let seenEventId = world.nextEventId - 1;
  loop = new FixedStepLoop({
    world,
    playerId: character.id,
    input,
    render: (previous, current, alpha) => renderer?.render(previous, current, alpha),
    onTick: (current) => {
      for (const event of current.events) {
        if (event.eventId <= seenEventId) continue;
        seenEventId = event.eventId;
        if (event.type === 'death' && event.killerId === current.players[0]) kills += 1;
      }
      $('#kill-count').textContent = String(kills);
      const hero = current.entities.find((entity) => entity.kind === 'player');
      if (hero) {
        $('#hud-hp').textContent = `HP ${hero.hp} / ${hero.maxHp}`;
        $('#hp-fill').style.width = `${hero.hp / hero.maxHp * 100}%`;
      }
    },
  });
  loop.start();
}

async function leaveArena() {
  loop?.pause();
  try {
    character = await saves.loadCharacter(character.id);
    await saves.commit({
      characterId: character.id,
      baseRev: character.rev,
      ops: [{ type: 'gainXp', amount: Math.max(3, kills * 2) }],
    });
  } catch (error) {
    console.error('Save failed', error);
    $('#toast').textContent = '저장하지 못했습니다. 다시 시도해 주세요.';
    return;
  }
  showTitle();
}

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = new FormData(createForm).get('name');
  const id = crypto.randomUUID();
  await saves.commit({ characterId: id, baseRev: 0, ops: [{ type: 'createCharacter', name, kind: 'knight' }] });
  await refreshTitle();
});
$('#start-button').addEventListener('click', () => startArena().catch((error) => {
  console.error(error);
  $('#toast').textContent = '시험의 방을 열지 못했습니다.';
}));
$('#pause-button').addEventListener('click', () => {
  loop?.pause();
  pauseMenu.hidden = false;
});
$('#continue-button').addEventListener('click', () => {
  pauseMenu.hidden = true;
  loop?.resume();
});
$('#leave-button').addEventListener('click', leaveArena);
window.addEventListener('keydown', (event) => {
  if (!loop || (event.code !== 'Escape' && event.code !== 'KeyR')) return;
  if (pauseMenu.hidden) {
    loop.pause();
    pauseMenu.hidden = false;
  } else {
    pauseMenu.hidden = true;
    loop.resume();
  }
});

saves = await createSaveRepository();
await refreshTitle();
