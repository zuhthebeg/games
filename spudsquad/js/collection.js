(function (root) {
  'use strict';
  // 도감(콜렉션): 웨이브 클리어마다 로컬 플레이어가 쓴 캐릭터·무기·아이템과 만난 적을 기록.
  // 순수 함수(empty/normalize/merge/record/progress)는 node 테스트용, sync는 브라우저 전용(로그인 유저만).
  const P = root.SPUD = root.SPUD || {};
  const D = P.data || (typeof require === 'function' ? require('./data.js') : null);
  const TRAIT = 'spudsquad', API = 'https://relay.cocy.io/api/user/traits', MAX = 2000;
  const TABS = { chars: 'chars', weapons: 'weapons', items: 'items', enemies: 'enemies' };
  const FIELD = { weapons: 'w', items: 'i', enemies: 'e' };
  const int = (n, max) => Math.max(0, Math.min(max, Math.floor(Number(n) || 0)));
  const ids = list => [...new Set((Array.isArray(list) ? list : [])
    .filter(v => typeof v === 'string' && v && v.length <= 40))];
  function empty() { return { v: 1, c: {}, w: [], i: [], e: [] }; }
  function normalize(raw) {
    const col = empty();
    if (!raw || typeof raw !== 'object') return col;
    for (const [id, row] of Object.entries(raw.c && typeof raw.c === 'object' ? raw.c : {})) {
      if (id.length <= 40) col.c[id] = { b: int(row?.b, 20), w: int(row?.w, 1e6) };
    }
    for (const k of ['w', 'i', 'e']) col[k] = ids(raw[k]);
    return col;
  }
  // 합집합·최대값 병합: 다른 기기 진행을 절대 잃지 않는다.
  function merge(a, b) {
    const x = normalize(a), y = normalize(b), out = empty();
    for (const id of new Set([...Object.keys(x.c), ...Object.keys(y.c)])) {
      out.c[id] = { b: Math.max(x.c[id]?.b || 0, y.c[id]?.b || 0),
        w: Math.max(x.c[id]?.w || 0, y.c[id]?.w || 0) };
    }
    for (const k of ['w', 'i', 'e']) out[k] = ids([...x[k], ...y[k]]);
    return out;
  }
  // run = { char, wave(클리어한 웨이브), weapons:[id], items:[id], win }
  function record(col, run) {
    const out = normalize(col);
    const wave = int(run?.wave, 20);
    if (!run?.char || !wave) return out;
    const row = out.c[run.char] || { b: 0, w: 0 };
    out.c[run.char] = { b: Math.max(row.b, wave), w: row.w + (run.win ? 1 : 0) };
    out.w = ids([...out.w, ...(run.weapons || []).map(v => Array.isArray(v) ? v[0] : v)]);
    out.i = ids([...out.i, ...(run.items || [])]);
    const met = Object.keys(D.enemies).filter(id => D.enemies[id].first <= wave &&
      (id !== 'boss_2' || run.win || wave >= 20));
    out.e = ids([...out.e, ...met]);
    return out;
  }
  function all() {
    return { v: 1, c: Object.fromEntries(Object.keys(D.chars).map(id => [id, { b: 20, w: 1 }])),
      w: Object.keys(D.weapons), i: Object.keys(D.items), e: Object.keys(D.enemies) };
  }
  function unlocked(col, tab, id) {
    if (!col) return false;
    return tab === 'chars' ? !!col.c?.[id] : !!col[FIELD[tab]]?.includes(id);
  }
  function progress(col) {
    const out = {};
    let n = 0, total = 0;
    for (const tab of Object.keys(TABS)) {
      const list = Object.keys(D[tab]);
      const got = list.filter(id => unlocked(col, tab, id)).length;
      out[tab] = { n: got, total: list.length };
      n += got; total += list.length;
    }
    out.all = { n, total };
    return out;
  }
  const size = col => JSON.stringify(col).length;
  // ?debug=1 → 탭 세션 동안 유지, ?debug=0 → 해제
  function debugFlag(search, store) {
    let q = null;
    try { q = new URLSearchParams(search || '').get('debug'); } catch {}
    try {
      if (q === '1') store?.setItem('spudsquad_debug', '1');
      else if (q === '0') store?.removeItem('spudsquad_debug');
      return q === '1' || (q !== '0' && store?.getItem('spudsquad_debug') === '1');
    } catch { return q === '1'; }
  }
  // 디버그 런은 보상·랭킹·도감 기록을 전부 막는다.
  function allowRewards(debugRun) { return !debugRun; }

  // ---- 네트워크 동기화(브라우저) ----
  const state = { key: null, current: empty(), timer: 0, listeners: [] };
  function auth() {
    let token = null;
    try { token = root.localStorage?.getItem('cocy_auth_token'); } catch {}
    const sw = typeof SharedWallet !== 'undefined' && SharedWallet; // const 전역이라 window.SharedWallet 아님
    if (!token || !sw || !sw.user || sw.user.isAnonymous || sw.isLoggedIn === false) return null;
    let sub = '';
    try {
      const body = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (body.isAnonymous) return null;
      sub = body.sub || body.userId || '';
    } catch {}
    const who = String(sub || sw.user.id || sw.user.userId || sw.user.nickname || 'user');
    return { token, key: 'spudsquad_collection_' + who.replace(/[^\w.-]/g, '_').slice(0, 64) };
  }
  function readLocal(key) {
    try { return normalize(JSON.parse(root.localStorage.getItem(key) || 'null')); } catch { return empty(); }
  }
  function writeLocal(key, col) { try { root.localStorage.setItem(key, JSON.stringify(col)); } catch {} }
  function bind(a) {
    if (state.key !== a.key) { state.key = a.key; state.current = readLocal(a.key); }
  }
  function notify() { for (const fn of state.listeners) { try { fn(state.current); } catch {} } }
  function post(keepalive = false) {
    clearTimeout(state.timer); state.timer = 0;
    const a = auth();
    if (!a || a.key !== state.key) return;
    if (size(state.current) > MAX) { console.warn('spudsquad collection too large to sync'); return; }
    try {
      fetch(API, { method: 'POST', keepalive, headers: { 'Content-Type': 'application/json',
        Authorization: 'Bearer ' + a.token }, body: JSON.stringify({ trait: TRAIT, value: state.current }) })
        .catch(() => {});
    } catch {}
  }
  function schedule() { clearTimeout(state.timer); state.timer = setTimeout(post, 1500); }
  const sync = {
    // 로그인 유저의 현재 도감(게스트는 null)
    get() { const a = auth(); if (!a) return null; bind(a); return state.current; },
    loggedIn() { return !!auth(); },
    async load() {
      const a = auth();
      if (!a) { notify(); return null; }
      bind(a);
      notify();
      try {
        const res = await fetch(API, { headers: { Authorization: 'Bearer ' + a.token }, cache: 'no-store' });
        if (res.ok) {
          const body = await res.json();
          const server = normalize(body?.traits?.[TRAIT]?.value);
          state.current = merge(state.current, server);
          writeLocal(a.key, state.current);
          if (size(state.current) !== size(server)) schedule();
        }
      } catch {} // 오프라인이면 로컬 캐시만
      notify();
      return state.current;
    },
    add(run) {
      const a = auth();
      if (!a) return false;
      bind(a);
      state.current = record(state.current, run);
      writeLocal(a.key, state.current);
      schedule();
      notify();
      return true;
    },
    flush() { if (state.timer) post(true); },
    onChange(fn) { state.listeners.push(fn); }
  };
  const api = { TRAIT, API, MAX, TABS, empty, normalize, merge, record, all, unlocked, progress, size,
    debugFlag, allowRewards, ...sync };
  P.collection = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
