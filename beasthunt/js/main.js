import { Coop } from './net/coop.js?v=20261112r4b';
// Beast Hunt — hub UI, save data, preview scene, glue.
import * as THREE from 'three';
import { MONSTERS, QUESTS, ATK, ARMOR, TIERS, UPG, WTYPES } from 'bh/data';
import { Hunt } from 'bh/game';
import { Input } from 'bh/input';
import { buildMonster, buildHunter, BIOMES } from 'bh/models';
import { initAudio, sfx, setMuted, isMuted } from 'bh/audio';
import { t, getLang, nextLang, matName, LANG_LABEL } from 'bh/i18n';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'beasthunt_save_v1';
const fresh = () => ({ v: 1, shards: 0, mats: {}, w: { gs: 1, db: 1, bow: 1 }, armor: 1, weapon: 'gs', clears: {} });
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && s.v === 1 && s.w && WTYPES[s.weapon]) {
      // Preserve the save key and migrate the legacy currency field once.
      const migrated = Object.assign(fresh(), s);
      migrated.shards = Number.isFinite(s.shards) ? s.shards : (Number.isFinite(s.z) ? s.z : 0);
      delete migrated.z;
      localStorage.setItem(SAVE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch (_) { /* fall through */ }
  return fresh();
}
const save = load();
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) { /* ignore */ } };
const fmtT = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

const canvas = $('cv'), stage = $('stage');
const coarse = matchMedia('(pointer:coarse)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
renderer.shadowMap.enabled = !coarse && !/[?&]lowfx=1/.test(location.search); renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const input = new Input(canvas, $('touch'));

let coop = null;
let hunt = null, sel = QUESTS[0].id, tab = 'quest', preview = null;
const unlocked = (q) => !q.need || !!save.clears[q.need];
{ const open = QUESTS.filter(unlocked); sel = open[open.length - 1].id; }

// ---------- preview scene (hub backdrop) ----------
function makePreview() {
  const q = QUESTS.find((x) => x.id === sel), d = MONSTERS[q.mon], B = BIOMES[d.biome];
  if (preview) preview.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  const scene = new THREE.Scene(); scene.background = new THREE.Color(B.sky).multiplyScalar(.55); scene.fog = new THREE.Fog(scene.background, 20, 60);
  scene.add(new THREE.HemisphereLight(B.amb[0], B.amb[1], 1.1));
  const sun = new THREE.DirectionalLight(B.sun, 2.2); sun.position.set(8, 14, 10); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x88aaff, .9); rim.position.set(-10, 6, -10); scene.add(rim);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, .6, 28), new THREE.MeshStandardMaterial({ color: B.g[0], flatShading: true, roughness: 1 })); disc.position.y = -.3; scene.add(disc);
  const G = buildMonster(q.mon); scene.add(G.root);
  const H = buildHunter(save.weapon, save.w[save.weapon], save.armor); H.root.position.set(4.6, 0, 4.2); H.root.rotation.y = -2.2; H.armR.rotation.x = -.5; scene.add(H.root);
  const cam = new THREE.PerspectiveCamera(42, 1, .2, 200);
  preview = { scene, cam, G, d, t: 0 }; resize();
}
function framePreview(dt) {
  const p = preview; p.t += dt; const a = p.t * .22 + .9, wide = stage.clientWidth > stage.clientHeight * 1.15, r = (wide ? 15 : 21) * p.d.scale;
  p.cam.position.set(Math.sin(a) * r, 5.2, Math.cos(a) * r); p.cam.lookAt(0, wide ? 2.2 : 3.4, 0);
  if (wide) p.cam.setViewOffset(stage.clientWidth, stage.clientHeight, -stage.clientWidth * .2, 0, stage.clientWidth, stage.clientHeight); else p.cam.clearViewOffset();
  p.G.tail.forEach((s, i) => { s.rotation.y = Math.sin(p.t * 1.5 + i * .6) * .14; });
  p.G.head.rotation.x = Math.sin(p.t * .9) * .1; p.G.body.position.y = p.d.dims.h + Math.sin(p.t * 1.6) * .04; p.G.jaw.rotation.x = .1 + Math.max(0, Math.sin(p.t * .5)) * .25;
  renderer.render(p.scene, p.cam);
}

// ---------- hub ----------
const need = (cost) => Object.entries(cost).map(([k, n]) => ({ k, n, have: save.mats[k] || 0 }));
const canPay = (u, kind) => save.shards >= u.shards && need(u[kind]).every((x) => x.have >= x.n);
function renderHub() {
  document.documentElement.lang = getLang() === 'zh-TW' ? 'zh-Hant' : getLang();
  $('sub').textContent = t('sub'); $('shards').textContent = save.shards.toLocaleString() + ' ' + t('currency');
  $('langBtn').textContent = LANG_LABEL[getLang()]; $('muteBtn').textContent = isMuted() ? '🔇' : '🔊';
  $('tabQuest').textContent = t('tab_quest'); $('tabForge').textContent = t('tab_forge');
  $('tabQuest').classList.toggle('on', tab === 'quest'); $('tabForge').classList.toggle('on', tab === 'forge');
  $('panelQuest').hidden = tab !== 'quest'; $('panelForge').hidden = tab !== 'forge';
  $('depart').textContent = t('depart'); $('coop').textContent = t('coop');
  // quests
  $('quests').innerHTML = QUESTS.map((q) => {
    const open = unlocked(q), c = save.clears[q.id];
    return `<button class="q ${q.id === sel ? 'sel' : ''} ${open ? '' : 'lock'} b-${MONSTERS[q.mon].biome}" data-q="${q.id}" ${open ? '' : 'disabled'}>
      <span class="qr">${'★'.repeat(QUESTS.indexOf(q) % 3 + 1)} ${t('rank' + q.hr)}</span>
      <span class="qn">${open ? t('q_hunt') + ' · ' + t('mon_' + q.mon) : t('locked')}</span>
      <span class="qm">${t('reward')}: ${q.shards} ${t('currency')}${c ? ' · ' + t('best') + ': ' + fmtT(c.best) : ''}</span></button>`;
  }).join('');
  // loadout
  $('loadout').innerHTML = Object.keys(WTYPES).map((k) => `<button class="wp ${save.weapon === k ? 'sel' : ''}" data-w="${k}"><b>${t('w_' + k)}</b><span>${t(TIERS[save.w[k] - 1])} · ${t('atk')}: ${ATK[save.w[k] - 1]}</span></button>`).join('')
    + `<div class="wp ar"><b>${t('armor')}</b><span>${t(TIERS[save.armor - 1])} · ${t('def')}: ${ARMOR[save.armor - 1].def}</span></div>`;
  // forge
  const row = (key, name, tier, kind, stat) => {
    const u = UPG[tier], costHtml = u ? need(u[kind]).map((x) => `<span class="${x.have >= x.n ? 'ok' : 'no'}">${matName(x.k)}: ${x.have}/${x.n}</span>`).join('') + `<span class="${save.shards >= u.shards ? 'ok' : 'no'}">${u.shards} ${t('currency')}</span>` : '';
    return `<div class="fr"><div class="fh"><b>${name}</b><span class="tier t${tier}">${t(TIERS[tier - 1])}${u ? ' → ' + t(TIERS[tier]) : ''}</span></div>
      <div class="fs">${stat}</div><div class="fc">${costHtml}</div>
      ${u ? `<button class="up" data-up="${key}" ${canPay(u, kind) ? '' : 'disabled'}>${t('upgrade')}</button>` : `<span class="mx">${t('max')}</span>`}</div>`;
  };
  $('forge').innerHTML = Object.keys(WTYPES).map((k) => { const tr = save.w[k]; return row(k, t('w_' + k), tr, 'w', `${t('atk')}: ${ATK[tr - 1]}${tr < 5 ? ' → ' + ATK[tr] : ''}`); }).join('')
    + row('armor', t('armor'), save.armor, 'a', `${t('def')}: ${ARMOR[save.armor - 1].def}${save.armor < 5 ? ' → ' + ARMOR[save.armor].def : ''} · ${t('hp')}: ${100 + ARMOR[save.armor - 1].hp}${save.armor < 5 ? ' → ' + (100 + ARMOR[save.armor].hp) : ''}`);
  const inv = Object.entries(save.mats).filter(([, n]) => n > 0);
  $('inv').innerHTML = `<h4>${t('mats')}</h4>` + (inv.length ? inv.map(([k, n]) => `<span class="mt">${matName(k)}: ${n}</span>`).join('') : `<span class="mt">${t('none')}</span>`);
  // controls
  const C = input.isTouch
    ? [['c_move', t('k_stick')], ['c_sprint', t('k_stickfar')], ['c_cam', t('k_drag')], ['c_atk', '⚔'], ['c_heavy', '✦'], ['c_roll', '➤'], ['c_potion', '✚'], ['c_lock', '◎']]
    : [['c_move', 'WASD'], ['c_cam', t('k_mouse')], ['c_atk', t('k_lmb') + ' / J'], ['c_heavy', t('k_rmb') + ' / K'], ['c_roll', 'Space'], ['c_sprint', 'Shift'], ['c_potion', 'E'], ['c_lock', 'Q']];
  $('controls').innerHTML = C.map(([k, v]) => `<span>${t(k)}: <b>${v}</b></span>`).join('');
  $('resBack').textContent = t('back'); $('pauseTitle').textContent = t('paused'); $('resume').textContent = t('resume'); $('abandon').textContent = t('abandon');
}
$('hub').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return; initAudio();
  if (b.dataset.q) { sel = b.dataset.q; sfx('ui'); makePreview(); renderHub(); }
  else if (b.dataset.w) { save.weapon = b.dataset.w; persist(); sfx('ui'); makePreview(); renderHub(); }
  else if (b.dataset.up) {
    const key = b.dataset.up, isA = key === 'armor', tier = isA ? save.armor : save.w[key], u = UPG[tier], kind = isA ? 'a' : 'w';
    if (!u || !canPay(u, kind)) return;
    save.shards -= u.shards; for (const [k, n] of Object.entries(u[kind])) save.mats[k] -= n;
    if (isA) save.armor++; else save.w[key]++;
    persist(); sfx('forge'); makePreview(); renderHub();
  }
});
$('tabQuest').onclick = () => { tab = 'quest'; sfx('ui'); renderHub(); };
$('tabForge').onclick = () => { tab = 'forge'; sfx('ui'); renderHub(); };
$('langBtn').onclick = () => { nextLang(); renderHub(); };
$('muteBtn').onclick = () => { setMuted(!isMuted()); renderHub(); };
$('depart').onclick = () => startHunt(sel);
$('coop').onclick = () => { if (coop) return; coop = new Coop({save, quest:()=>sel, start:startHunt, leave:()=>{coop=null;endHunt();}}); };

// ---------- hunt HUD ----------
const ui = {
  el: { hp: $('hpFill'), hpHeal: $('hpHeal'), st: $('stFill'), mon: $('monFill'), timer: $('timer'), potions: $('potions'), carts: $('carts'), rage: $('rage'), lock: $('lockBtn'), charge: $('charge'), chargeFill: $('chargeFill') },
  setMon(mon, hr) { $('monName').textContent = t('mon_' + mon) + (hr ? ' · ' + t('rank1') : ''); $('rage').textContent = t('rage'); },
  toast(key, kind) { const e = $('toast'); e.textContent = t(key); e.className = ''; void e.offsetWidth; e.className = 'show ' + (kind || ''); },
  dmg(ndc, n, cls) {
    if (ndc.z > 1) return; const s = document.createElement('span'); s.className = 'dn ' + cls; s.textContent = n;
    s.style.left = ((ndc.x * .5 + .5) * stage.clientWidth + (Math.random() - .5) * 26) + 'px'; s.style.top = ((-ndc.y * .5 + .5) * stage.clientHeight) + 'px';
    $('dmg').appendChild(s); setTimeout(() => s.remove(), 720);
  },
  flash() { const e = $('flash'); e.className = ''; void e.offsetWidth; e.className = 'on'; },
  pause() { setPaused(true); },
};
function setPaused(p) {
  if (!hunt || hunt.over) return; $('pauseTitle').textContent=t(hunt.session?'menu':'paused'); hunt.paused = p; $('pause').hidden = !p; input.enabled = !p; input.clear(); hunt.sim?.clearInputs(); hunt.ticker?.reset();
  if (p && document.pointerLockElement) document.exitPointerLock();
}
$('resume').onclick = () => setPaused(false);
$('abandon').onclick = () => { $('pause').hidden = true; if(hunt?.session){coop?.close();return;} endHunt(); };
$('pauseBtn').onclick = () => setPaused(true);
$('lockBtn').onclick = () => hunt && hunt.toggleLock();
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && hunt && !hunt.over && !input.isTouch && hunt.hadLock) setPaused(true); if (document.pointerLockElement && hunt) hunt.hadLock = true; });

function clearCombatUI() {
  $('toast').className = ''; $('toast').textContent = ''; $('dmg').replaceChildren(); $('flash').className = '';
}
function startHunt(qid, session = null) {
  const q = QUESTS.find((x) => x.id === qid); if (!q || (!session && !unlocked(q))) return;
  initAudio(); sfx('ui'); clearCombatUI();
  hunt = new Hunt(renderer, q, save, ui, input, onHuntEnd, session);
  $('hub').hidden = true; $('hud').hidden = false; $('touch').hidden = !input.isTouch; $('result').hidden = true; $('pause').hidden = true;
  document.body.classList.add('hunting'); input.clear(); input.enabled = true; resize();
  if (window.gtag) window.gtag('event', 'bh_quest_start', { quest: q.id, weapon: save.weapon });
}
const rewarded = new Set();
function onHuntEnd(res) {
  if (hunt?.session) { const id=coop.plan.id; if(rewarded.has(id) || sessionStorage.getItem("bh_reward:"+id))return; rewarded.add(id);sessionStorage.setItem("bh_reward:"+id,"1"); }
  input.enabled = false; if (document.pointerLockElement) document.exitPointerLock();
  const q = res.quest; let rec = false;
  if (res.win) {
    save.shards += q.shards; for (const [k, n] of Object.entries(res.loot)) save.mats[k] = (save.mats[k] || 0) + n;
    const c = save.clears[q.id] || (save.clears[q.id] = { n: 0, best: 1e9 }); c.n++; if (res.time < c.best) { c.best = res.time; rec = true; }
    persist();
    try { if (typeof SharedWallet !== 'undefined' && SharedWallet._initialized) {
      // Result card owns reward feedback; suppress this call's duplicate debug toast only.
      const toast = SharedWallet._debugToast;
      try { SharedWallet._debugToast = () => {}; SharedWallet.addGold(q.gold); }
      finally { SharedWallet._debugToast = toast; }
    } } catch (_) { /* wallet optional */ }
  }
  if (window.gtag) window.gtag('event', 'bh_quest_end', { quest: q.id, win: res.win ? 1 : 0, time: Math.round(res.time) });
  $('resTitle').textContent = t(res.win ? 'res_win' : 'res_fail'); $('result').className = 'overlay ' + (res.win ? 'win' : 'fail');
  const rows = [[t('time'), fmtT(res.time) + (rec ? ' · ' + t('record') : '')], [t('faints'), res.carts]];
  if (res.win) { rows.push([t('reward'), q.shards + ' ' + t('currency')], [t('gold'), '+' + q.gold]); }
  $('resRows').innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  $('resLoot').innerHTML = res.win ? `<h4>${t('loot')}</h4>` + Object.entries(res.loot).map(([k, n]) => `<span class="mt">${matName(k)}: ${n}</span>`).join('') : '';
  $('resBack').textContent=t(hunt?.session?'back_lobby':'back');
  $('result').hidden = false; $('touch').hidden = true;
}
function endHunt() {
  clearCombatUI();
  if (hunt) { hunt.dispose(); hunt = null; }
  input.enabled = false; input.clear(); document.body.classList.remove('hunting');
  $('hud').hidden = true; $('touch').hidden = true; $('result').hidden = true; $('hub').hidden = false;
  const open = QUESTS.filter(unlocked); if (!open.find((q) => q.id === sel)) sel = open[open.length - 1].id;
  makePreview(); renderHub();
}
$('resBack').onclick = () => { sfx('ui'); const wasCoop=!!hunt?.session; endHunt(); if(wasCoop)coop?.waiting(); };

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false);
  if (hunt) hunt.resize(w, h); if (preview) { preview.cam.aspect = w / h; preview.cam.updateProjectionMatrix(); }
}
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));

let last = performance.now();
function loop(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  try { if (hunt) hunt.frame(dt); else if (preview) framePreview(dt); } catch (err) { console.error('[beasthunt]', err); }
  requestAnimationFrame(loop);
}
makePreview(); renderHub(); requestAnimationFrame(loop);
window.__bh = { get hunt() { return hunt; }, save, start: startHunt, end: endHunt, input, get coop() { return coop; }, step(dt, n = 1) { if (!hunt) return; hunt.skipRender = true; for (let i = 0; i < n; i++) hunt.frame(dt); hunt.skipRender = false; } };

if (new URLSearchParams(location.search).has("room") || sessionStorage.getItem("bh_room")) $("coop").click();
