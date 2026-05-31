// 2026 WC 한국 A조 결과 자동 수집 → worldcup/data.json 갱신 (GitHub Action 크론에서 실행)
// 데이터원: football-data.org v4 (무료, GH Secret FOOTBALL_DATA_KEY 필요). 키/데이터 없으면 기존 data.json 유지(no-op).
import { readFileSync, writeFileSync } from 'node:fs';

const KEY = process.env.FOOTBALL_DATA_KEY;
const OUT = new URL('../worldcup/data.json', import.meta.url);
const COMP = 'WC'; // FIFA World Cup competition code
// 영문명 → 한국어/국기 (한국 A조)
const MAP = {
  'Korea Republic': { ko: '대한민국', flag: '🇰🇷', kr: true },
  'South Korea':    { ko: '대한민국', flag: '🇰🇷', kr: true },
  'Mexico':         { ko: '멕시코',   flag: '🇲🇽' },
  'Czechia':        { ko: '체코',     flag: '🇨🇿' },
  'Czech Republic': { ko: '체코',     flag: '🇨🇿' },
  'South Africa':   { ko: '남아공',   flag: '🇿🇦' },
};
const OPP_ORDER = ['체코', '멕시코', '남아공']; // 페이지 일정 순서

function exit(msg) { console.log(msg); process.exit(0); }

// 대회 기간 밖이면 API 호출 안 함
const now = new Date();
if (now < new Date('2026-06-09T00:00:00Z') || now > new Date('2026-07-21T00:00:00Z')) exit('대회 기간 밖 — 스킵');
if (!KEY) exit('FOOTBALL_DATA_KEY 없음 — 스킵(기존 data.json 유지)');

const H = { headers: { 'X-Auth-Token': KEY } };
async function api(path) {
  const r = await fetch('https://api.football-data.org/v4' + path, H);
  if (!r.ok) throw new Error(path + ' → ' + r.status);
  return r.json();
}

try {
  // 1) 순위표 — 한국이 속한 그룹
  const st = await api(`/competitions/${COMP}/standings`);
  let krTable = null;
  for (const s of (st.standings || [])) {
    if (s.type !== 'TOTAL') continue;
    if ((s.table || []).some(row => MAP[row.team?.name]?.kr)) { krTable = s; break; }
  }
  if (!krTable) exit('한국 그룹 순위 못 찾음 — 스킵');
  const standings = krTable.table.map(row => {
    const m = MAP[row.team.name] || { ko: row.team.name, flag: '' };
    return { team: m.ko, flag: m.flag, kr: !!m.kr, mp: row.playedGames || 0, w: row.won || 0, d: row.draw || 0, l: row.lost || 0, gd: row.goalDifference || 0, pts: row.points || 0 };
  });

  // 2) 한국 경기 (조별리그)
  const mt = await api(`/competitions/${COMP}/matches?stage=GROUP_STAGE`);
  const isKR = t => MAP[t?.name]?.kr;
  const krMatches = (mt.matches || []).filter(m => isKR(m.homeTeam) || isKR(m.awayTeam));
  const byOpp = {};
  for (const m of krMatches) {
    const krHome = isKR(m.homeTeam);
    const oppName = krHome ? m.awayTeam?.name : m.homeTeam?.name;
    const oppKo = MAP[oppName]?.ko; if (!oppKo) continue;
    const fin = m.status === 'FINISHED', live = ['IN_PLAY', 'PAUSED'].includes(m.status);
    let krGoals = null, oppGoals = null;
    const ft = m.score?.fullTime || {};
    if ((fin || live) && ft.home != null) { krGoals = krHome ? ft.home : ft.away; oppGoals = krHome ? ft.away : ft.home; }
    byOpp[oppKo] = { opp: oppKo, status: fin ? 'finished' : (live ? 'live' : 'scheduled'), krGoals, oppGoals };
  }
  const matches = OPP_ORDER.map(o => byOpp[o] || { opp: o, status: 'scheduled', krGoals: null, oppGoals: null });

  const data = { updated: new Date().toISOString(), group: 'A', standings, matches };
  writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
  console.log('data.json 갱신 완료:', JSON.stringify(matches));
} catch (e) {
  console.error('수집 실패(기존 유지):', e.message);
  process.exit(0); // 실패해도 워크플로 성공 처리 — 기존 data.json 보존
}
